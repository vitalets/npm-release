/**
 * Provides browser fixtures for exercising the real extension in isolated VM contexts.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

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

/**
 * Creates a GitHub page sandbox for observing navigation and workflow scans.
 */
export function createNavigationPage(pathname: string) {
  let onMutation: () => void = () => assert.fail('Observer was not installed');
  let scans = 0;
  let formsInspected = 0;
  const location = { pathname, href: 'https://github.com/owner/repo' };
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
  return {
    location,
    mutate: () => onMutation(),
    scans: () => scans,
    formsInspected: () => formsInspected,
  };
}

/**
 * Creates the legacy workflow branch picker for a selected ref.
 */
export function createSummaryPicker(name: string) {
  const menuButton = { textContent: ` ${name} ` };
  const summary = {
    textContent: `Branch: ${name}`,
    querySelector: (selector: string) =>
      selector === '[data-menu-button]' ? menuButton : undefined,
  };
  const dispatch = {
    querySelectorAll: () => [],
    querySelector: (selector: string) =>
      selector === '.branch-selection summary' ? summary : undefined,
  };

  return dispatch;
}

/**
 * Creates a label-associated workflow picker with the supplied ref icon.
 */
export function createLabeledPicker(name: string, icon: string) {
  const picker = {
    matches: (selector: string) => selector === 'button',
    querySelector: (selector: string) => ({
      '[data-component="text"]': { textContent: name },
      [icon]: {},
    })[selector],
  };
  return {
    querySelectorAll: (selector: string) => selector === 'label[for]' ? [
      { textContent: 'foo' },
      { textContent: ' Use workflow from: ', control: picker },
    ] : [],
    contains: (element: unknown) => element === picker,
    querySelector: () => undefined,
  };
}

/**
 * Loads the extension with controllable logging preferences and a package response.
 */
export function createLoggingExtension(version: string) {
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
    async () => Response.json({ version }),
  );

  return {
    load,
    messages,
    setLogging: (enabled: boolean) => onChanged!({ loggingEnabled: { newValue: enabled } }, 'local'),
  };
}

/**
 * Builds a GitHub tree page containing commit metadata.
 */
export function treePage(oid: string) {
  return `<script type="application/json">${JSON.stringify({ payload: {
    codeViewTreeRoute: { refInfo: { currentOid: oid } },
  } })}</script>`;
}

/**
 * Loads a release form with selectable inputs and completed version and commit requests.
 */
export async function createReleaseForm(currentVersion: string, operation: string, commitOid: string) {
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
  version.value = operation;
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
      ? Response.json({ version: currentVersion }) : new Response(treePage(commitOid)),
  });
  await flushAsyncWork();
  const commits = panel!.children[3];
  const links = panel!.children[4];
  return {
    commits,
    links,
    selectChannel(value: string) {
      channel.value = value;
      channel.listeners.change();
    },
    selectVersion(value: string) {
      version.value = value;
      version.listeners.change();
    },
  };
}

/**
 * Waits for pending extension callbacks to finish before assertions.
 */
export function flushAsyncWork() {
  return new Promise<void>(resolve => setImmediate(resolve));
}

/**
 * Loads the real extension preview API in an isolated context.
 */
export function loadPreviewApi() {
  const context = { AbortController } as { __npmReleasePreview?: PreviewApi };
  runInNewContext(readFileSync(new URL('../src/content.js', import.meta.url), 'utf8'), context);
  assert.ok(context.__npmReleasePreview);
  return context.__npmReleasePreview;
}
