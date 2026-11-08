/**
 * Reads Markdown merge scenarios and applies strict, complete-context branch diffs.
 */

import assert from 'node:assert/strict';

type FixtureBlock = { language: string; text: string };

/**
 * Loads three merge inputs and their expected outcome from a scenario document.
 */
export function parseMergeFixture(markdown: string) {
  const { title, blocks } = readBlocks(markdown);
  const base = requireBlock(blocks, 'Base', 'markdown');
  const ours = readBranch(base, blocks, 'Ours');
  const theirs = readBranch(base, blocks, 'Theirs');
  if (blocks.has('Expected')) {
    assert.deepEqual([...blocks.keys()], ['Base', 'Ours', 'Theirs', 'Expected'], 'Unexpected fixture sections');
    return { title, base, ours, theirs, expected: { status: 'merged' as const, text: requireBlock(blocks, 'Expected', 'markdown') } };
  }
  const status = requireBlock(blocks, 'Expected status', 'text').trim();
  assert.ok(status === 'conflict' || status === 'not-applicable', 'Invalid expected status');
  const sections = ['Base', 'Ours', 'Theirs', 'Expected status'];
  const reason = blocks.has('Expected reason')
    ? new RegExp(requireBlock(blocks, 'Expected reason', 'regex').trim())
    : undefined;
  if (reason) sections.push('Expected reason');
  assert.deepEqual([...blocks.keys()], sections, 'Unexpected fixture sections');
  return { title, base, ours, theirs, expected: { status, reason } };
}

/**
 * Applies a diff that consumes every base line exactly once, without fuzzy matching.
 * Empty diff lines are shorthand for unchanged empty lines.
 */
export function applyFixtureDiff(base: string, diff: string, branch = 'Branch') {
  const baseLines = splitContent(base);
  const result: string[] = [];
  let cursor = 0;
  for (const [index, line] of splitContent(diff).entries()) {
    const marker = line ? line[0] : ' ';
    const content = line.slice(1);
    const location = `${branch} diff line ${index + 1}`;
    assert.ok([' ', '+', '-'].includes(marker), `${location}: invalid diff prefix`);
    if (marker !== '+') {
      assert.ok(cursor < baseLines.length, `${location}: consumes beyond Base`);
      assert.equal(content, baseLines[cursor], `${location}: does not match Base line ${cursor + 1}`);
      cursor++;
    }
    if (marker !== '-') result.push(content);
  }
  assert.equal(cursor, baseLines.length, `${branch} diff does not consume all Base lines`);
  return result.length ? result.join('\n') + '\n' : '';
}

function readBlocks(markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const title = lines.shift()?.match(/^# (.+)$/)?.[1];
  assert.ok(title, 'Fixture must start with a title');
  const blocks = new Map<string, FixtureBlock>();
  let index = 0;
  while (index < lines.length) {
    if (lines[index] === '') {
      index++;
      continue;
    }
    const heading = lines[index++].match(/^## (.+)$/)?.[1];
    assert.ok(heading, `Expected a section heading near line ${index + 1}`);
    assert.ok(!blocks.has(heading), `Duplicate section: ${heading}`);
    while (lines[index] === '') index++;
    if ((heading === 'Ours' || heading === 'Theirs') && lines[index] === 'No changes.') {
      blocks.set(heading, { language: 'unchanged', text: '' });
      index++;
      continue;
    }
    const fence = lines[index++]?.match(/^(`{3,})(markdown|diff|text|regex)$/);
    assert.ok(fence, `${heading}: expected a fenced code block`);
    const content: string[] = [];
    while (index < lines.length && lines[index] !== fence[1]) content.push(lines[index++]);
    assert.ok(index < lines.length, `${heading}: unclosed code fence`);
    index++;
    blocks.set(heading, { language: fence[2], text: content.length ? content.join('\n') + '\n' : '' });
  }
  return { title, blocks };
}

function readBranch(base: string, blocks: Map<string, FixtureBlock>, name: string) {
  if (blocks.get(name)?.language === 'unchanged') return base;
  return applyFixtureDiff(base, requireBlock(blocks, name, 'diff'), name);
}

function requireBlock(blocks: Map<string, FixtureBlock>, name: string, language: string) {
  const block = blocks.get(name);
  assert.ok(block, `Missing fixture section: ${name}`);
  assert.equal(block.language, language, `${name}: incorrect code block language`);
  return block.text;
}

function splitContent(text: string) {
  if (!text) return [];
  assert.ok(text.endsWith('\n'), 'Fixture content must end with a newline');
  return text.slice(0, -1).split('\n');
}
