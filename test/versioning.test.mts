import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { npmVersionOperation } from '../src/versioning.mts';
import { versionTables } from './fixtures/version-transitions.mts';

describe('Version transitions', () => {
  for (const versionTable of versionTables) {
    describe(versionTable.name ?? versionTable.currentVersion, () => {
      for (const [channel, version, expectedVersion] of versionTable.transitions) {
        test(`${channel} ${version} ${expectedVersion ? `produces ${expectedVersion}` : 'is prohibited'}`, () => {
          if (expectedVersion === null) {
            assert.throws(
              () => npmVersionOperation(versionTable.currentVersion, channel, version),
              /lower operations are not permitted/,
            );
            return;
          }

          verifyPackageVersion(versionTable.currentVersion, channel, version, expectedVersion);
        });
      }
    });
  }
});

describe('Input validation', () => {
  const invalidCases = [
    {
      name: 'rejects an empty channel',
      channel: '',
      version: 'patch',
      error: 'Select a release channel',
    },
    {
      name: 'rejects an unknown version operation',
      channel: 'stable',
      version: 'promote-next',
      error: 'Unknown version operation: promote-next',
    },
    {
      name: 'rejects an empty version operation',
      channel: 'stable',
      version: '',
      error: 'Unknown version operation: ',
    },
  ];

  for (const invalidCase of invalidCases) {
    test(invalidCase.name, () => {
      assert.throws(
        () => npmVersionOperation('1.2.3', invalidCase.channel, invalidCase.version),
        { message: invalidCase.error },
      );
    });
  }
});

function verifyPackageVersion(
  currentVersion: string,
  channel: string,
  version: string,
  expectedVersion: string,
): void {
  const directory = mkdtempSync(join(tmpdir(), 'npm-release-version-'));

  try {
    const packagePath = join(directory, 'package.json');
    writeFileSync(packagePath, JSON.stringify({ name: 'version-test', version: currentVersion }));

    const operation = npmVersionOperation(currentVersion, channel, version);
    const args = ['version', operation, '--no-git-tag-version'];
    if (channel !== 'stable') args.push(`--preid=${channel}`);
    execFileSync('npm', args, { cwd: directory, stdio: 'pipe' });

    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    assert.equal(packageJson.version, expectedVersion);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
