import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, test } from 'node:test';
import { versionTables } from '../../test/fixtures/version-transitions.mts';

interface PreviewApi {
  releaseLinks(repository: { owner: string; repository: string }, ref: { name: string; type: string }, version?: string): { head: string; tag: string; changelog: string; compare: string };
  commitFromPage(html: string): string;
  identicalComparison(html: string): boolean;
  checkReleaseCommit(fetchImplementation: typeof fetch, links: { head: string; tag: string; compare?: string }, signal?: AbortSignal): Promise<{ status: string; message?: string }>;

  calculateNextVersion(current: string, channel: string, version: string): string;
  createPackageVersionLoader(
    fetchImplementation: typeof fetch,
  ): (url: string) => Promise<
    | { status: 'success'; version: string }
    | { status: 'stale' }
    | { status: 'error'; message: string }
  >;
  hasExpectedVersionOperations(values: string[]): boolean;
  selectedRef(root: {
    querySelectorAll(selector: string): unknown[];
    querySelector(selector: string):
      | undefined
      | {
          querySelector(selector: string): { textContent?: string } | undefined;
          textContent?: string;
        };
  }): { name: string; type: string } | undefined;
}

const context = { AbortController } as { __npmReleasePreview?: PreviewApi };
runInNewContext(readFileSync(new URL('../src/content.js', import.meta.url), 'utf8'), context);
const preview = context.__npmReleasePreview;
assert.ok(preview);

test('extension scans workflows after navigation from another GitHub page', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../src/manifest.json', import.meta.url), 'utf8'));
  assert.ok(manifest.content_scripts[0].matches.includes('https://github.com/*'));

  let onMutation: () => void = () => assert.fail('Observer was not installed');
  let scans = 0;
  let formsInspected = 0;
  const location = { pathname: '/owner/repo', href: 'https://github.com/owner/repo' };
  const sandbox = {
    location,
    queueMicrotask,
    HTMLSelectElement: class {},
    document: {
      readyState: 'complete',
      documentElement: {},
      querySelector() { return null; },
      querySelectorAll() {
        scans += 1;
        return [{
          querySelector() {
            formsInspected += 1;
            return null;
          },
        }];
      },
    },
    MutationObserver: class {
      constructor(callback: () => void) { onMutation = callback; }
      observe() {}
    },
  };
  runInNewContext(readFileSync(new URL('../src/content.js', import.meta.url), 'utf8'), sandbox);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(scans, 0);

  location.pathname = '/owner/repo/actions/workflows/release.yml';
  onMutation();
  onMutation();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(scans, 1);
  assert.equal(formsInspected, 2);

  location.pathname = '/owner/repo/issues';
  onMutation();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(scans, 1);

  location.pathname = '/owner/repo/actions/workflows/another.yml';
  onMutation();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(scans, 2);
  assert.equal(formsInspected, 4);
});

describe('Extension version preview', () => {
  for (const table of versionTables) {
    for (const [channel, operation, expectedVersion] of table.transitions) {
      test(`${table.currentVersion} + ${channel} ${operation}`, () => {
        if (expectedVersion === null) {
          assert.throws(
            () => preview.calculateNextVersion(table.currentVersion, channel, operation),
            /Select version: (minor or major|major)\./,
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

  test('reads the selected ref from the shared workflow dispatch container', () => {
    const menuButton = { textContent: ' main ' };
    const summary = {
      textContent: 'Branch: main',
      querySelector: (selector: string) =>
        selector === '[data-menu-button]' ? menuButton : undefined,
    };
    const dispatch = {
      querySelectorAll: () => [],
      querySelector: (selector: string) =>
        selector === '.branch-selection summary' ? summary : undefined,
    };

    assert.equal(
      JSON.stringify(preview.selectedRef(dispatch)),
      JSON.stringify({ name: 'main', type: 'heads' }),
    );
  });

  for (const type of ['heads', 'tags']) {
    test(`reads ${type} from the label-associated workflow picker`, () => {
      const picker = {
        matches: (selector: string) => selector === 'button',
        querySelector: (selector: string) => {
          if (selector === '[data-component="text"]') return { textContent: ' release/test ' };
          if (selector === (type === 'tags' ? '.octicon-tag' : '.octicon-git-branch')) return {};
          return undefined;
        },
      };
      const dispatch = {
        querySelectorAll: (selector: string) => selector === 'label[for]' ? [
          { textContent: 'Unrelated label' },
          { textContent: ' Use workflow from: ', control: picker },
        ] : [],
        contains: (element: unknown) => element === picker,
        querySelector: () => undefined,
      };

      assert.equal(
        JSON.stringify(preview.selectedRef(dispatch)),
        JSON.stringify({ name: 'release/test', type }),
      );
    });
  }
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

test('extension logging defaults off and can be toggled', async () => {
  let onChanged: (changes: object, area: string) => void;
  const messages: unknown[] = [];
  const sandbox = {
    AbortController,
    console: { log: (...args: unknown[]) => messages.push(args) },
    chrome: { storage: {
      local: { get: async () => ({}) },
      onChanged: { addListener: (listener: typeof onChanged) => { onChanged = listener; } },
    } },
    __npmReleasePreview: undefined as PreviewApi | undefined,
  };
  runInNewContext(readFileSync(new URL('../src/content.js', import.meta.url), 'utf8'), sandbox);
  const load = sandbox.__npmReleasePreview!.createPackageVersionLoader(
    async () => Response.json({ version: '1.2.3' }),
  );

  await load('/package.json');
  assert.equal(messages.length, 0);

  onChanged!({ loggingEnabled: { newValue: true } }, 'local');
  await load('/package.json');
  assert.ok(messages.length > 0);

  onChanged!({ loggingEnabled: { newValue: false } }, 'local');
  messages.length = 0;
  await load('/package.json');
  assert.equal(messages.length, 0);
});

const headOid = 'a'.repeat(40);
const tagOid = 'b'.repeat(40);
function treePage(oid: string) {
  return `<script type="application/json">${JSON.stringify({ payload: {
    codeViewTreeRoute: { refInfo: { currentOid: oid } },
  } })}</script>`;
}

describe('Release commit check', () => {
  test('warns only when the selected ref and release tag resolve to the same commit', async () => {
    for (const [oid, expected] of [[headOid, 'same'], [tagOid, 'different']]) {
      const result = await preview.checkReleaseCommit(async (url, options) => {
        assert.equal(options?.credentials, 'same-origin');
        assert.equal(options?.cache, 'no-store');
        assert.equal(new Headers(options?.headers).get('Accept'), 'text/html');
        return new Response(treePage(url === '/head' ? headOid : oid));
      }, { head: '/head', tag: '/tag' });
      assert.equal(result.status, expected);
    }
  });

  test('reports missing tags, failed requests and changed page metadata as unknown', async () => {
    for (const fetcher of [
      async () => new Response('', { status: 404 }),
      async () => new Response('<html>Sign in</html>'),
      async () => new Response(treePage('invalid')),
      async () => { throw new Error('Network error'); },
    ]) {
      assert.equal((await preview.checkReleaseCommit(fetcher, { head: '/head', tag: '/tag' })).status, 'unknown');
    }
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
    for (const route of ['codeViewTreeRoute', 'codeViewRepoRoute']) {
      const data = { payload: { [route]: { refInfo: { currentOid: headOid } } } };
      assert.equal(preview.commitFromPage(JSON.stringify(data)), headOid);
      assert.equal(preview.commitFromPage(`<script type='application/json'>${JSON.stringify(data)}</script>`), headOid);
    }
    assert.equal(preview.commitFromPage(JSON.stringify({ refInfo: { currentOid: headOid } })), headOid);
  });

  test('links follow branch or tag refs, including slashes and special characters', () => {
    for (const type of ['heads', 'tags']) {
      const links = preview.releaseLinks({ owner: 'owner', repository: 'repo' }, { type, name: 'feature/a#b' }, '1.2.3-beta.0');
      assert.equal(links.head, `/owner/repo/tree/refs/${type}/feature/a%23b`);
      assert.equal(links.changelog, `/owner/repo/blob/refs/${type}/feature/a%23b/CHANGELOG.md#unreleased`);
      assert.equal(links.tag, '/owner/repo/tree/refs/tags/v1.2.3-beta.0');
      assert.equal(links.compare, `/owner/repo/compare/v1.2.3-beta.0...refs/${type}/feature/a%23b`);
    }
  });
});

test('falls back to an explicit identical-ref comparison when metadata is missing', async () => {
  const html = '<h3 class="mb-1">There isn’t anything to compare.</h3><strong>main</strong> are identical.';
  assert.equal(preview.identicalComparison(html), true);
  assert.equal(preview.identicalComparison('<h3>There isn’t anything to compare.</h3>'), false);
  assert.equal(preview.identicalComparison('0 files changed'), false);
  const result = await preview.checkReleaseCommit(async (url) => new Response(
    url === '/compare' ? html : '<html>No metadata</html>',
  ), { head: '/head', tag: '/tag', compare: '/compare' });
  assert.equal(result.status, 'same');
  const unknown = await preview.checkReleaseCommit(async () => new Response('0 files changed'),
    { head: '/head', tag: '/tag', compare: '/compare' });
  assert.equal(unknown.status, 'unknown');
});

test('lower-operation messages explain the prerelease line and list valid choices', () => {
  for (const channel of ['stable', 'next']) {
    const verb = channel === 'stable' ? 'release' : 'pre-release';
    for (const [version, operation, line, choices] of [
      ['1.2.0-next.2', 'patch', 'minor', 'minor or major'],
      ['10.0.0-next.2', 'patch', 'major', 'major'],
      ['10.0.0-next.2', 'minor', 'major', 'major'],
    ]) {
      assert.throws(() => preview.calculateNextVersion(version, channel, operation), {
        message: `Can't ${verb} ${operation} on ${version}: already on a ${line} pre-release. Select version: ${choices}.`,
      });
    }
  }
});

test('commit result stays hidden until selection is valid, including after async completion', async () => {
  class Element {
    children: any[] = [];
    textContent = '';
    className = '';
    hidden = false;
    isConnected = true;
    value = '';
    options: { value: string }[] = [];
    listeners: Record<string, () => void> = {};
    classList = { add() {}, remove() {}, toggle() {} };
    append(...nodes: any[]) { this.children.push(...nodes); }
    setAttribute() {}
    addEventListener(event: string, callback: () => void) { this.listeners[event] = callback; }
    removeEventListener() {}
    closest(_selector: string): any { return undefined; }
  }
  const channel = new Element();
  const version = new Element();
  version.value = 'minor';
  version.options = ['patch', 'minor', 'major'].map(value => ({ value }));
  let panel: Element;
  version.closest = () => ({ after(node: Element) { panel = node; } });
  const dispatch = { querySelectorAll: () => [], querySelector: (selector: string) => selector === '.branch-selection summary' ? {
    textContent: 'Branch: main', querySelector: () => ({ textContent: 'main' }),
  } : undefined };
  const form = {
    querySelector: (selector: string) => selector.includes('[channel]') ? channel : version,
    closest: () => dispatch,
  };
  runInNewContext(readFileSync(new URL('../src/content.js', import.meta.url), 'utf8'), {
    AbortController, queueMicrotask, HTMLSelectElement: Element,
    location: { pathname: '/owner/repo/actions/workflows/release.yml' },
    document: {
      createElement: () => new Element(), documentElement: {},
      querySelectorAll: () => [form], querySelector: () => dispatch,
    },
    MutationObserver: class { observe() {} },
    fetch: async (url: string) => url.endsWith('package.json')
      ? Response.json({ version: '0.4.0-next.4' }) : new Response(treePage(headOid)),
  });
  await new Promise<void>(resolve => setImmediate(resolve));
  const commits = panel!.children[3];
  const links = panel!.children[4];
  assert.equal(commits.hidden, true);
  assert.equal(links.hidden, true);
  channel.value = 'next';
  channel.listeners.change();
  assert.equal(commits.hidden, false);
  assert.equal(links.hidden, false);
  version.value = 'patch';
  version.listeners.change();
  assert.equal(commits.hidden, true);
  assert.equal(links.hidden, true);
  version.value = 'minor';
  version.listeners.change();
  assert.equal(commits.hidden, false);
  channel.value = '';
  channel.listeners.change();
  assert.equal(commits.hidden, true);
  assert.equal(links.hidden, true);
});
