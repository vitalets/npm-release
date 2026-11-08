import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFixtureDiff, parseMergeFixture } from './fixture.ts';

const FIXTURE = `# Concurrent additions

## Base

\`\`\`\`markdown
- Foo
\`\`\`\`

## Ours

\`\`\`\`diff
 - Foo
+- Bar
\`\`\`\`

## Theirs

\`\`\`\`diff
 - Foo
+- Baz
\`\`\`\`

## Expected

\`\`\`\`markdown
- Foo
- Bar
- Baz
\`\`\`\`
`;

test('fixture reader reconstructs both branches independently from Base', () => {
  assert.deepEqual(parseMergeFixture(FIXTURE), {
    title: 'Concurrent additions',
    base: '- Foo\n',
    ours: '- Foo\n- Bar\n',
    theirs: '- Foo\n- Baz\n',
    expected: { status: 'merged', text: '- Foo\n- Bar\n- Baz\n' },
  });
});

test('No changes uses Base verbatim for either branch', () => {
  const unchangedOurs = FIXTURE.replace('````diff\n - Foo\n+- Bar\n````', 'No changes.');
  const unchangedTheirs = FIXTURE.replace('````diff\n - Foo\n+- Baz\n````', 'No changes.');
  assert.equal(parseMergeFixture(unchangedOurs).ours, '- Foo\n');
  assert.equal(parseMergeFixture(unchangedOurs).theirs, '- Foo\n- Baz\n');
  assert.equal(parseMergeFixture(unchangedTheirs).theirs, '- Foo\n');
});

test('No changes cannot replace Base or hide extra branch content', () => {
  assert.throws(() => parseMergeFixture(FIXTURE.replace('````markdown\n- Foo\n````', 'No changes.')),
    /Base.*fenced code block/);
  assert.throws(() => parseMergeFixture(FIXTURE.replace('````diff\n - Foo\n+- Bar\n````', 'No changes.\n+- Bar')),
    /section heading/);
});

test('complete-context diffs preserve indentation and blank lines', () => {
  assert.equal(applyFixtureDiff('- Foo\n  Detail\n\n', ' - Foo\n-  Detail\n+  More detail\n\n'),
    '- Foo\n  More detail\n\n');
  assert.equal(applyFixtureDiff('', '+- Foo\n'), '- Foo\n');
  assert.equal(applyFixtureDiff('- Foo\n', '-- Foo\n'), '');
});

test('diffs reject mismatched context and deletions', () => {
  assert.throws(() => applyFixtureDiff('- Foo\n', ' - Bar\n', 'Ours'), /Ours diff line 1.*Base line 1/);
  assert.throws(() => applyFixtureDiff('- Foo\n', '-- Bar\n', 'Theirs'), /Theirs diff line 1.*Base line 1/);
});

test('diffs must consume Base completely and exactly once', () => {
  assert.throws(() => applyFixtureDiff('- Foo\n- Bar\n', ' - Foo\n'), /consume all Base/);
  assert.throws(() => applyFixtureDiff('- Foo\n', ' - Foo\n - Foo\n'), /beyond Base/);
});

test('diffs reject hunk headers and missing line prefixes', () => {
  assert.throws(() => applyFixtureDiff('- Foo\n', '@@ -1 +1 @@\n'), /invalid diff prefix/);
  assert.throws(() => applyFixtureDiff('Foo\n', 'Foo\n'), /invalid diff prefix/);
});

test('fixture reader rejects duplicate and missing sections', () => {
  assert.throws(() => parseMergeFixture(FIXTURE.replace('## Theirs', '## Ours')), /Duplicate section/);
  assert.throws(() => parseMergeFixture(FIXTURE.replace('## Theirs', '## Other')), /Missing.*Theirs/);
});

test('fixture reader rejects malformed fences and conflicting expectations', () => {
  assert.throws(() => parseMergeFixture(FIXTURE.slice(0, -5)), /unclosed code fence/);
  assert.throws(() => parseMergeFixture(FIXTURE + '\n## Expected status\n\n```text\nconflict\n```\n'),
    /Unexpected fixture sections/);
});

test('fixture reader supports conflict reasons as keyword patterns', () => {
  const conflictFixture = FIXTURE.replace(/## Expected[\s\S]*$/, '## Expected status\n\n```text\nconflict\n```\n\n## Expected reason\n\n```regex\nwording.*entry\n```\n');
  assert.deepEqual(parseMergeFixture(conflictFixture).expected, { status: 'conflict', reason: /wording.*entry/ });
  assert.throws(() => parseMergeFixture(conflictFixture.replace('conflict\n', 'success\n')), /Invalid expected status/);
});

test('outer fences allow literal Markdown fences in branch content', () => {
  const nestedFixture = FIXTURE.replace('+- Bar\n', '+- Bar\n+  ```js\n+  foo()\n+  ```\n');
  assert.equal(parseMergeFixture(nestedFixture).ours, '- Foo\n- Bar\n  ```js\n  foo()\n  ```\n');
});
