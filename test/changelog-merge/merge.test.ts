import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { mergeChangelog } from '../../src/changelog/merge/index.ts';
import { compareEntries } from '../../src/changelog/merge/compare.ts';
import { parseChangelog, parseChangelogBody } from '../../src/changelog/parse.ts';
import { parseMergeFixture } from './fixture.ts';

const fixtureDirectory = new URL('./fixtures/', import.meta.url);
const fixtureFiles = readdirSync(fixtureDirectory).filter((name) => name.endsWith('.md') && name !== 'README.md').sort();
assert.ok(fixtureFiles.length, 'Expected changelog merge fixtures');

for (const filename of fixtureFiles) {
  test(filename, () => {
    const fixture = parseMergeFixture(readFileSync(new URL(filename, fixtureDirectory), 'utf8'));
    assertFixtureResult(fixture);
  });
}

const OLD_RELEASE = '## [1.0.0] - 2024-01-01\n\n- Initial release\n\n';
const OLD_LINKS = '[unreleased]: https://example.com/compare/v1.0.0...HEAD\n';
const NEW_LINKS = '[unreleased]: https://example.com/compare/v1.1.0...HEAD\n' +
  '[1.1.0]: https://example.com/compare/v1.0.0...v1.1.0\n';

const ORIGINAL = '- Provide detailed diagnostics for failed uploads';
const EDITED = '- Provide detailed diagnostics for failed upload';

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

test('CRLF release content and entry indentation are preserved', () => {
  assertMerged(document('- Apples').replaceAll('\n', '\r\n'), document('- Apples\n- Oranges').replaceAll('\n', '\r\n'),
    released('- Apples').replaceAll('\n', '\r\n'), released('- Apples', '- Oranges').replaceAll('\n', '\r\n'));
});

test('documents without releases retain their final newline convention', () => {
  assertMerged('## [Unreleased]\n\n- Pears', '## [Unreleased]\n\n- Apples\n- Pears',
    '## [Unreleased]\n\n- Oranges\n- Pears', '## [Unreleased]\n\n- Apples\n- Oranges\n- Pears');
});

function assertFixtureResult(fixture: ReturnType<typeof parseMergeFixture>) {
  const result = mergeChangelog(fixture);
  assert.equal(result.status, fixture.expected.status);
  if (fixture.expected.status === 'merged') {
    assert.deepEqual(result, fixture.expected);
  } else if (fixture.expected.reason && result.status !== 'merged') {
    assert.match(result.reason, fixture.expected.reason);
  }
}

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
