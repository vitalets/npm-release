import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, test } from 'node:test';
import { versionTables } from '../../test/fixtures/version-transitions.mts';

interface PreviewApi {
  calculateNextVersion(current: string, channel: string, version: string): string;
  createPackageVersionLoader(
    fetchImplementation: typeof fetch,
  ): (url: string) => Promise<
    | { status: 'success'; version: string }
    | { status: 'stale' }
    | { status: 'error'; message: string }
  >;
  hasExpectedVersionOperations(values: string[]): boolean;
}

const context = { AbortController } as { __npmReleasePreview?: PreviewApi };
runInNewContext(readFileSync(new URL('../src/content.js', import.meta.url), 'utf8'), context);
const preview = context.__npmReleasePreview;
assert.ok(preview);

describe('Extension version preview', () => {
  for (const table of versionTables) {
    for (const [channel, operation, expectedVersion] of table.transitions) {
      test(`${table.currentVersion} + ${channel} ${operation}`, () => {
        if (expectedVersion === null) {
          assert.throws(
            () => preview.calculateNextVersion(table.currentVersion, channel, operation),
            /lower operations are not permitted/,
          );
        } else {
          assert.equal(
            preview.calculateNextVersion(table.currentVersion, channel, operation),
            expectedVersion,
          );
        }
      });
    }
  }

  test('uses the first version choice token', () => {
    assert.equal(preview.calculateNextVersion('1.2.3', 'stable', 'minor next feature'), '1.3.0');
  });

  test('supports dotted prerelease channels', () => {
    assert.equal(preview.calculateNextVersion('1.2.3-beta.2.4', 'beta.2', 'patch'), '1.2.3-beta.2.5');
  });
});

describe('Extension form detection', () => {
  test('accepts the three release operations', () => {
    assert.equal(preview.hasExpectedVersionOperations(['patch', 'minor', 'major']), true);
  });

  test('accepts explanatory labels', () => {
    assert.equal(
      preview.hasExpectedVersionOperations(['patch fixes', 'minor features', 'major breaking']),
      true,
    );
  });

  test('rejects missing or unexpected operations', () => {
    assert.equal(preview.hasExpectedVersionOperations(['patch', 'minor']), false);
    assert.equal(
      preview.hasExpectedVersionOperations(['patch', 'minor', 'major', 'prerelease']),
      false,
    );
  });
});

describe('Package version loading', () => {
  test('returns package versions and reports fetch errors', async () => {
    const success = preview.createPackageVersionLoader(async () =>
      Response.json({ version: '2.3.4' }),
    );
    assert.equal(JSON.stringify(await success('/package.json')), '{"status":"success","version":"2.3.4"}');

    const failure = preview.createPackageVersionLoader(async () => new Response('', { status: 404 }));
    assert.equal(
      JSON.stringify(await failure('/missing.json')),
      '{"status":"error","message":"HTTP 404"}',
    );
  });

  test('ignores a stale branch response', async () => {
    const resolvers: Array<(response: Response) => void> = [];
    const loader = preview.createPackageVersionLoader(
      () => new Promise<Response>((resolve) => resolvers.push(resolve)),
    );

    const first = loader('/first/package.json');
    const second = loader('/second/package.json');
    resolvers[1](Response.json({ version: '2.0.0' }));
    assert.equal(
      JSON.stringify(await second),
      '{"status":"success","version":"2.0.0"}',
    );
    resolvers[0](Response.json({ version: '1.0.0' }));
    assert.equal(JSON.stringify(await first), '{"status":"stale"}');
  });
});
