import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeChangelog } from '../src/changelog/merge/index.ts';
import { compareEntries } from '../src/changelog/merge/compare.ts';
import { parseChangelog, parseChangelogBody } from '../src/changelog/parse.ts';

const OLD_RELEASE = '## [1.0.0] - 2024-01-01\n\n- Initial release\n\n';
const OLD_LINKS = '[unreleased]: https://example.com/compare/v1.0.0...HEAD\n';
const NEW_LINKS = '[unreleased]: https://example.com/compare/v1.1.0...HEAD\n' +
  '[1.1.0]: https://example.com/compare/v1.0.0...v1.1.0\n';

const ORIGINAL = '- Provide detailed diagnostics for failed uploads';
const EDITED = '- Provide detailed diagnostics for failed upload';
const OTHER_EDIT = '- Provide detailed diagnostics for failed uploads!';

test('entry comparison distinguishes exact, likely, unrelated, and uncertain wording', () => {
  assert.deepEqual(compareEntries('- Foo\r\n', '* Foo\n'), { status: 'same', reason: 'Exact normalized match' });
  assert.equal(compareEntries(ORIGINAL, EDITED).status, 'same');
  assert.equal(compareEntries('- Apples', '- Oranges').status, 'different');
  assert.equal(compareEntries('- Enable authentication', '- Disable authentication').status, 'uncertain');
  assert.equal(compareEntries('- the', '- a').status, 'uncertain');
});

test('parsing preserves original Markdown blocks and reference links', () => {
  const text = document('### Added\n\n* Foo\n  More detail.\n\n### Fixed\n- Bar').replace(/\n/g, '\r\n');
  const parsed = parseChangelog(text)!;
  assert.equal(parsed.prefix + parsed.unreleased.raw + parsed.releases[0].raw + parsed.links, text);
  const body = parseChangelogBody(parsed.unreleased.body)!;
  assert.equal(body.categories[1].entries[0].text, '* Foo\r\n  More detail.\r\n\r\n');
  assert.equal(body.categories[2].name, 'Fixed');
});

test('independent additions at the same position retain ours then theirs', () => {
  assertMerged(document('- Existing'), document('- Apples\n- Existing'), document('- Oranges\n- Existing'),
    document('- Apples\n- Oranges\n- Existing'));
});

test('exact concurrent additions are deduplicated within their category', () => {
  assertMerged(document('- Existing'), document('- Apples\n- Existing'), document('- Existing\n* Apples'),
    document('- Apples\n- Existing'));
});

test('a one-sided wording revision wins over unchanged text', () => {
  assertMerged(document(ORIGINAL), document(EDITED), document(ORIGINAL), document(EDITED));
});

test('different edits to the same entry remain conflicted', () => {
  assertConflict(document(ORIGINAL), document(EDITED), document(OTHER_EDIT), /wording/);
});

test('delete versus unchanged removes the entry', () => {
  assertMerged(document(`${ORIGINAL}\n- Apples`), document('- Apples'), document(`${ORIGINAL}\n- Apples`), document('- Apples'));
});

test('delete versus edit remains conflicted', () => {
  assertConflict(document(ORIGINAL), document(''), document(EDITED), /deleted.*edited/);
});

test('unrelated replacements retain both new descriptions', () => {
  assertMerged(document('- Pears'), document('- Apples'), document('- Oranges'), document('- Apples\n\n- Oranges'));
});

test('similar concurrent additions are not silently deduplicated', () => {
  assertConflict(document(''), document(ORIGINAL), document(EDITED), /additions/);
});

test('uncertain short edits remain conflicted', () => {
  assertConflict(document('- Enable authentication'), document('- Disable authentication'), document('- Enable authentication'), /matching/);
});

test('multiple possible wording matches remain conflicted', () => {
  assertConflict(document(`${ORIGINAL}\n${OTHER_EDIT}`), document(EDITED), document(`${ORIGINAL}\n${OTHER_EDIT}`), /matching/);
});

test('new categories are appended in ours then theirs order', () => {
  assertMerged(document('### Added\n- Pears'), document('### Added\n- Pears\n\n### Fixed\n- Apples'),
    document('### Added\n- Pears\n\n### Changed\n- Oranges'),
    document('### Added\n- Pears\n\n### Fixed\n- Apples\n\n### Changed\n- Oranges'));
});

test('identical additions in different categories are retained', () => {
  assertMerged(document(''), document('### Added\n- Apples'), document('### Fixed\n- Apples'),
    document('### Added\n- Apples\n\n### Fixed\n- Apples'));
});

test('category renames without a release permit text merging', () => {
  assert.equal(mergeChangelog({ base: document('### Added\n- Apples'), ours: document('### Changed\n- Apples'),
    theirs: document('### Added\n- Apples') }).status, 'not-applicable');
});

test('moving entries between categories permits text merging without a release', () => {
  assert.equal(mergeChangelog({ base: document('### Added\n- Apples\n\n### Fixed\n- Oranges'),
    ours: document('### Added\n\n### Fixed\n- Oranges\n- Apples'),
    theirs: document('### Added\n- Apples\n\n### Fixed\n- Oranges') }).status, 'not-applicable');
});

test('standalone prose and fenced blocks permit text merging without a release', () => {
  assert.equal(mergeChangelog({ base: document('A paragraph'), ours: document('A new paragraph'),
    theirs: document('A paragraph') }).status, 'not-applicable');
  assert.equal(mergeChangelog({ base: document(''), ours: document('- Foo\n  ```js\n  foo()\n  ```'),
    theirs: document('') }).status, 'not-applicable');
});

test('outside edits without a release permit text merging', () => {
  assert.equal(mergeChangelog({ base: document('- Apples'), ours: document('- Apples').replace('# Changelog', '# History'),
    theirs: document('- Apples') }).status, 'not-applicable');
});

test('a remote release preserves published entries and relocates multiline additions', () => {
  const added = '- Oranges\n  With more details.\n  - Nested item';
  assertMerged(document('- Apples'), document(`- Apples\n${added}`), released('- Apples'), released('- Apples', added));
});

test('a release on ours works with the reversed input orientation used by rebase', () => {
  assertMerged(document('- Apples'), released('- Apples'), document('- Apples\n- Oranges'), released('- Apples', '- Oranges'));
});

test('concurrent post-release additions retain input order', () => {
  assertMerged(document('- Pears'), document('- Pears\n- Apples'), released('- Pears', '- Oranges'),
    released('- Pears', '- Apples\n\n- Oranges'));
});

test('multiple intervening releases retain all published text and links', () => {
  const remote = released('- Apples').replace('## [1.1.0]', '## [1.2.0] - 2024-03-01\n\n- Pears\n\n## [1.1.0]');
  assertMerged(document('- Apples'), document('- Apples\n- Oranges'), remote,
    remote.replace('## [Unreleased]\n\n', '## [Unreleased]\n\n- Oranges\n\n'));
});

test('an empty ancestor Unreleased still permits a release transition', () => {
  assertMerged(document(''), document('- Oranges'), released('- Apples'), released('- Apples', '- Oranges'));
});

test('category headings follow relocated entries without leaking empty categories', () => {
  assertMerged(document('### Added\n- Apples'), document('### Added\n- Apples\n\n### Fixed\n- Oranges'),
    released('### Added\n- Apples'), released('### Added\n- Apples', '### Fixed\n- Oranges'));
});

test('published additions are deduplicated only by exact normalized matches', () => {
  assertMerged(document('- Pears'), document('- Pears\n- Apples'), released('- Pears\n- Apples'), released('- Pears\n- Apples'));
  assertConflict(document('- Pears'), document(`- Pears\n${EDITED}`), released(`- Pears\n${ORIGINAL}`), /published/);
});

test('editing or deleting a released ancestor entry remains conflicted', () => {
  assertConflict(document(ORIGINAL), document(EDITED), released(ORIGINAL), /edited or deleted/);
  assertConflict(document(ORIGINAL), document(''), released(ORIGINAL), /edited or deleted/);
});

test('release detection rejects rewritten ancestor entries', () => {
  assertConflict(document(ORIGINAL), document(`${ORIGINAL}\n- Apples`), released(EDITED), /locate unchanged/);
});

test('category changes during a release remain conflicted', () => {
  assertConflict(document('### Added\n- Apples'), document('### Changed\n- Apples'), released('### Added\n- Apples'), /Categories/);
});

test('development edits outside Unreleased cannot overwrite release content', () => {
  assertConflict(document('- Apples'), document('- Apples').replace('Initial release', 'Initial version'), released('- Apples'), /outside/);
});

test('competing release histories remain conflicted', () => {
  assertConflict(document('- Apples'), released('- Apples'), released('- Apples').replaceAll('1.1.0', '1.2.0'), /Both sides/);
});

test('unsupported Markdown during a release remains conflicted', () => {
  assertConflict(document('- Apples'), document('- Apples\n\nA paragraph'), released('- Apples'), /Unsupported/);
});

test('CRLF release content and entry indentation are preserved', () => {
  assertMerged(document('- Apples').replaceAll('\n', '\r\n'), document('- Apples\n- Oranges').replaceAll('\n', '\r\n'),
    released('- Apples').replaceAll('\n', '\r\n'), released('- Apples', '- Oranges').replaceAll('\n', '\r\n'));
});

test('documents without releases retain their final newline convention', () => {
  assertMerged('## [Unreleased]\n\n- Pears', '## [Unreleased]\n\n- Apples\n- Pears',
    '## [Unreleased]\n\n- Oranges\n- Pears', '## [Unreleased]\n\n- Apples\n- Oranges\n- Pears');
});

test('different existing entries can be revised independently', () => {
  const second = '- Display detailed information for pending downloads';
  const secondEdit = '- Display detailed information for pending download';
  assertMerged(document(`${ORIGINAL}\n${second}`), document(`${EDITED}\n${second}`),
    document(`${ORIGINAL}\n${secondEdit}`), document(`${EDITED}\n${secondEdit}`));
});

test('repeated original bullets require review when matching is ambiguous', () => {
  assertConflict(document('- Apples\n- Apples'), document('- Apples\n- Apples\n- Pears'),
    document('- Apples\n- Apples'), /Multiple possible/);
});

test('release transitions cannot rewrite older published sections', () => {
  assertConflict(document('- Apples'), document('- Apples\n- Oranges'),
    released('- Apples').replace('Initial release', 'Initial version'), /history changed/);
});

test('category layout on the release side takes priority over newly introduced categories', () => {
  assertMerged(document('- Pears'), document('- Pears\n\n### Added\n- Apples'),
    released('- Pears', '### Fixed\n- Oranges'),
    released('- Pears', '### Fixed\n- Oranges\n\n### Added\n- Apples'));
});

test('missing or duplicate section headings cannot establish release membership', () => {
  assertConflict(document('- Apples'), document('- Apples').replace('## [Unreleased]', '## Changes'),
    released('- Apples'), /headings/);
  assertConflict(document('- Apples'), document('- Apples'),
    released('- Apples').replace('## [1.0.0]', '## [1.1.0]'), /headings/);
});

function document(body: string) {
  return '# Changelog\n\n## [Unreleased]\n\n' + (body ? body + '\n\n' : '') + OLD_RELEASE + OLD_LINKS;
}

function released(body: string, unreleased = '') {
  return '# Changelog\n\n## [Unreleased]\n\n' + (unreleased ? unreleased + '\n\n' : '') +
    '## [1.1.0] - 2024-02-01\n\n' + body + '\n\n' + OLD_RELEASE + NEW_LINKS;
}

function assertMerged(base: string, ours: string, theirs: string, text: string) {
  assert.deepEqual(mergeChangelog({ base, ours, theirs }), { status: 'merged', text });
}

function assertConflict(base: string, ours: string, theirs: string, reason: RegExp) {
  const result = mergeChangelog({ base, ours, theirs });
  assert.equal(result.status, 'conflict');
  assert.match('reason' in result ? result.reason : '', reason);
}
