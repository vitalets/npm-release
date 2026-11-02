import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { testVersionTransitions } from '../../test/helpers/version-transitions.ts';
import {
  createNavigationPage,
  createSummaryPicker,
  createLabeledPicker,
  createLoggingExtension,
  createReleaseForm,
  treePage,
  flushAsyncWork,
  loadPreviewApi,
} from './helpers.ts';

const headOid = 'a'.repeat(40);
const tagOid = 'b'.repeat(40);

const preview = loadPreviewApi();

test('extension scans workflows after navigation from another GitHub page', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../src/manifest.json', import.meta.url), 'utf8'));
  assert.ok(manifest.content_scripts[0].matches.includes('https://github.com/*'));

  const page = createNavigationPage('/owner/repo');
  await flushAsyncWork();
  assert.equal(page.scans(), 0);

  page.location.pathname = '/owner/repo/actions/workflows/release.yml';
  page.mutate();
  page.mutate();
  await flushAsyncWork();
  assert.equal(page.scans(), 1);
  assert.equal(page.formsInspected(), 2);

  page.location.pathname = '/owner/repo/issues';
  page.mutate();
  await flushAsyncWork();
  assert.equal(page.scans(), 1);

  page.location.pathname = '/owner/repo/actions/workflows/another.yml';
  page.mutate();
  await flushAsyncWork();
  assert.equal(page.scans(), 2);
  assert.equal(page.formsInspected(), 4);
});

describe('Extension version preview', () => {
  testVersionTransitions(preview.calculateNextVersion, /Select version: (minor or major|major)/);

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

  test('reads the selected ref from the shared workflow dispatch container', () => {
    const dispatch = createSummaryPicker('main');

    assert.deepEqual({ ...preview.selectedRef(dispatch) }, { name: 'main', type: 'heads' });
  });

  test('reads branches from the label-associated picker', () => {
    const dispatch = createLabeledPicker(' foo/bar ', '.octicon-git-branch');
    assert.deepEqual({ ...preview.selectedRef(dispatch) }, { name: 'foo/bar', type: 'heads' });
  });

  test('reads tags from the label-associated picker', () => {
    const dispatch = createLabeledPicker(' foo/bar ', '.octicon-tag');
    assert.deepEqual({ ...preview.selectedRef(dispatch) }, { name: 'foo/bar', type: 'tags' });
  });
});

describe('Package version loading', () => {
  test('returns the fetched package version', async () => {
    const success = preview.createPackageVersionLoader(async () =>
      Response.json({ version: '2.3.4' }),
    );
    assert.deepEqual({ ...await success('/package.json') }, { status: 'success', version: '2.3.4' });
  });

  test('reports a failed package fetch', async () => {
    const failure = preview.createPackageVersionLoader(async () => new Response('', { status: 404 }));
    assert.deepEqual({ ...await failure('/missing.json') }, { status: 'error', message: 'HTTP 404' });
  });

  test('ignores a stale branch response', async () => {
    const resolvers: Array<(response: Response) => void> = [];
    const loader = preview.createPackageVersionLoader(
      () => new Promise<Response>((resolve) => resolvers.push(resolve)),
    );

    const first = loader('/first/package.json');
    const second = loader('/second/package.json');
    resolvers[1](Response.json({ version: '2.0.0' }));
    assert.deepEqual({ ...await second }, { status: 'success', version: '2.0.0' });
    resolvers[0](Response.json({ version: '1.0.0' }));
    assert.deepEqual({ ...await first }, { status: 'stale' });
  });
});

test('extension logging defaults off and can be toggled', async () => {
  const { load, messages, setLogging } = createLoggingExtension('1.2.3');

  await load('/package.json');
  assert.equal(messages.length, 0);

  setLogging(true);
  await load('/package.json');
  assert.ok(messages.length > 0);

  setLogging(false);
  messages.length = 0;
  await load('/package.json');
  assert.equal(messages.length, 0);
});

describe('Release commit check', () => {
  test('warns when the selected ref matches the release tag', async () => {
    await assertCommitComparison(headOid, headOid, 'same');
  });

  test('allows a ref that differs from the release tag', async () => {
    await assertCommitComparison(headOid, tagOid, 'different');
  });

  test('reports unavailable commit information as unknown', async () => {
    await assertUnknownCommit(async () => new Response('', { status: 404 }));
    await assertUnknownCommit(async () => new Response('<html>Sign in</html>'));
    await assertUnknownCommit(async () => new Response(treePage('foo')));
    await assertUnknownCommit(async () => { throw new Error('Network error'); });
  });

  test('passes cancellation to both requests', async () => {
    const controller = new AbortController();
    let calls = 0;
    await preview.checkReleaseCommit(async (_url, options) => {
      calls++;
      assert.equal(options?.signal, controller.signal);
      return new Response(treePage(headOid));
    }, { head: '/head', tag: '/tag' }, controller.signal);
    assert.equal(calls, 2);
  });

  test('reads both GitHub tree payload layouts and ignores unrelated scripts', () => {
    assert.equal(preview.commitFromPage(`<script type="application/json">{}</script>${treePage(headOid)}`), headOid);
    assert.equal(preview.commitFromPage(`<script type="application/json">${JSON.stringify({ payload: { refInfo: { currentOid: headOid } } })}</script>`), headOid);
    assert.throws(() => preview.commitFromPage('<html></html>'), /metadata unavailable/);
  });

  test('accepts route JSON and repository-page metadata', () => {
    assertCommitMetadata('codeViewTreeRoute', headOid);
    assertCommitMetadata('codeViewRepoRoute', headOid);
    assert.equal(preview.commitFromPage(JSON.stringify({ refInfo: { currentOid: headOid } })), headOid);
  });

  test('branch links escape special characters and preserve slashes', () => {
    const links = preview.releaseLinks(
      { owner: 'owner', repository: 'repo' }, { type: 'heads', name: 'foo/a#b' }, '1.2.3-beta.0',
    );
    assert.deepEqual({ ...links }, {
      head: '/owner/repo/tree/refs/heads/foo/a%23b',
      changelog: '/owner/repo/blob/refs/heads/foo/a%23b/CHANGELOG.md#unreleased',
      tag: '/owner/repo/tree/refs/tags/v1.2.3-beta.0',
      compare: '/owner/repo/compare/v1.2.3-beta.0...refs/heads/foo/a%23b',
    });
  });

  test('tag links escape special characters and preserve slashes', () => {
    const links = preview.releaseLinks(
      { owner: 'owner', repository: 'repo' }, { type: 'tags', name: 'foo/a#b' }, '1.2.3-beta.0',
    );
    assert.deepEqual({ ...links }, {
      head: '/owner/repo/tree/refs/tags/foo/a%23b',
      changelog: '/owner/repo/blob/refs/tags/foo/a%23b/CHANGELOG.md#unreleased',
      tag: '/owner/repo/tree/refs/tags/v1.2.3-beta.0',
      compare: '/owner/repo/compare/v1.2.3-beta.0...refs/tags/foo/a%23b',
    });
  });
});

test('falls back to an explicit identical-ref comparison when metadata is missing', async () => {
  const html = '<h3 class="mb-1">There isn’t anything to compare.</h3><strong>main</strong> are identical.';
  assert.equal(preview.identicalComparison(html), true);
  assert.equal(preview.identicalComparison('<h3>There isn’t anything to compare.</h3>'), false);
  assert.equal(preview.identicalComparison('0 files changed'), false);
  const pages: Record<string, string> = {
    '/head': '<html>No metadata</html>',
    '/tag': '<html>No metadata</html>',
    '/compare': html,
  };
  const result = await preview.checkReleaseCommit(async url => new Response(pages[String(url)]),
    { head: '/head', tag: '/tag', compare: '/compare' });
  assert.equal(result.status, 'same');
  const unknown = await preview.checkReleaseCommit(async () => new Response('0 files changed'),
    { head: '/head', tag: '/tag', compare: '/compare' });
  assert.equal(unknown.status, 'unknown');
});

test('lower-operation errors explain the prerelease line and valid choices', () => {
  assert.throws(() => preview.calculateNextVersion('1.2.0-next.2', 'stable', 'patch'), /minor pre-release.*Select version: minor or major/);
  assert.throws(() => preview.calculateNextVersion('10.0.0-next.2', 'stable', 'patch'), /major pre-release.*Select version: major/);
  assert.throws(() => preview.calculateNextVersion('10.0.0-next.2', 'stable', 'minor'), /major pre-release.*Select version: major/);
  assert.throws(() => preview.calculateNextVersion('1.2.0-next.2', 'next', 'patch'), /minor pre-release.*Select version: minor or major/);
  assert.throws(() => preview.calculateNextVersion('10.0.0-next.2', 'next', 'patch'), /major pre-release.*Select version: major/);
  assert.throws(() => preview.calculateNextVersion('10.0.0-next.2', 'next', 'minor'), /major pre-release.*Select version: major/);
});

test('commit results are visible only for a valid release selection', async () => {
  const { commits, links, selectChannel, selectVersion } = await createReleaseForm('0.4.0-next.4', 'minor', headOid);
  assert.equal(commits.hidden, true);
  assert.equal(links.hidden, true);

  // A valid selection reveals the completed commit check.
  selectChannel('next');
  assert.equal(commits.hidden, false);
  assert.equal(links.hidden, false);

  // A lower operation hides the result again.
  selectVersion('patch');
  assert.equal(commits.hidden, true);
  assert.equal(links.hidden, true);

  selectVersion('minor');
  assert.equal(commits.hidden, false);
  selectChannel('');
  assert.equal(commits.hidden, true);
  assert.equal(links.hidden, true);
});

async function assertCommitComparison(head: string, tag: string, expected: string) {
  const pages: Record<string, string> = { '/head': treePage(head), '/tag': treePage(tag) };
  const result = await preview.checkReleaseCommit(async (url, options) => {
    assert.equal(options?.credentials, 'same-origin');
    assert.equal(options?.cache, 'no-store');
    assert.equal(new Headers(options?.headers).get('Accept'), 'text/html');
    return new Response(pages[String(url)]);
  }, { head: '/head', tag: '/tag' });
  assert.equal(result.status, expected);
}

async function assertUnknownCommit(fetcher: typeof fetch) {
  const result = await preview.checkReleaseCommit(fetcher, { head: '/head', tag: '/tag' });
  assert.equal(result.status, 'unknown');
}

function assertCommitMetadata(route: string, oid: string) {
  const data = { payload: { [route]: { refInfo: { currentOid: oid } } } };
  assert.equal(preview.commitFromPage(JSON.stringify(data)), oid);
  assert.equal(preview.commitFromPage(`<script type='application/json'>${JSON.stringify(data)}</script>`), oid);
}
