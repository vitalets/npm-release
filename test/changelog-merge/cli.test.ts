import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMergeFixture } from './fixture.ts';

const CLI = fileURLToPath(new URL('../../src/cli/index.ts', import.meta.url));

test('CLI merges a release without a terminal and only overwrites ours', (t) => {
  const fixture = loadFixture('a-remote-release-preserves-published-entries-and-relocates-multiline-additions.md');
  assert.equal(fixture.expected.status, 'merged');
  const files = prepareFiles(t, fixture);
  const result = runCli(files);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.equal(readFileSync(files.ours, 'utf8'), 'text' in fixture.expected ? fixture.expected.text : '');
  assert.equal(readFileSync(files.base, 'utf8'), fixture.base);
  assert.equal(readFileSync(files.theirs, 'utf8'), fixture.theirs);
});

test('CLI falls back to Git for a clean category rename', (t) => {
  const fixture = loadFixture('category-renames-without-a-release-permit-text-merging.md');
  const files = prepareFiles(t, fixture);
  const result = runCli(files);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(readFileSync(files.ours, 'utf8'), fixture.ours);
  assert.equal(readFileSync(files.base, 'utf8'), fixture.base);
  assert.equal(readFileSync(files.theirs, 'utf8'), fixture.theirs);
});

test('CLI preserves Git conflict markers when text fallback conflicts', (t) => {
  const files = prepareFiles(t, {
    base: '## [Unreleased]\n\nOriginal paragraph.\n',
    ours: '## [Unreleased]\n\nLocal paragraph.\n',
    theirs: '## [Unreleased]\n\nRemote paragraph.\n',
  });
  const result = runCli(files);
  assert.equal(result.status, 1);
  assert.equal(readFileSync(files.ours, 'utf8'), '## [Unreleased]\n\n<<<<<<< ours\nLocal paragraph.\n' +
    '||||||| base\nOriginal paragraph.\n=======\nRemote paragraph.\n>>>>>>> theirs\n');
});

test('CLI retains all three documents when semantic matching requires review', (t) => {
  const fixture = loadFixture('different-edits-to-the-same-entry-remain-conflicted.md');
  const files = prepareFiles(t, fixture);
  const result = runCli(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /manual resolution.*wording/);
  assert.equal(result.stdout, '');
  assert.equal(readFileSync(files.ours, 'utf8'), `<<<<<<< ours\n${fixture.ours}||||||| base\n${fixture.base}=======\n${fixture.theirs}>>>>>>> theirs\n`);
  assert.equal(readFileSync(files.base, 'utf8'), fixture.base);
  assert.equal(readFileSync(files.theirs, 'utf8'), fixture.theirs);
});

test('CLI does not accept a clean text merge when release membership requires review', (t) => {
  const input = {
    base: '## [Unreleased]\n\n- Apples\n- Pears\n- Bananas\n- Grapes\n- Plums\n',
    ours: '## [Unreleased]\n\n- Apples\n- Pears\n- Bananas\n- Grapes\n- Plums!\n',
    theirs: '## [Unreleased]\n\n## [1.0.0] - 2024-01-01\n\n- Apples\n- Pears\n- Bananas\n- Grapes\n- Plums\n',
  };
  const files = prepareFiles(t, input);
  // Ordinary text merging succeeds, but would silently change published notes.
  const textMerge = spawnSync('git', ['merge-file', '-p', files.ours, files.base, files.theirs], { encoding: 'utf8' });
  assert.equal(textMerge.status, 0, textMerge.stderr);
  const result = runCli(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /manual resolution/);
  assert.equal(readFileSync(files.ours, 'utf8'), `<<<<<<< ours\n${input.ours}||||||| base\n${input.base}=======\n${input.theirs}>>>>>>> theirs\n`);
});

test('CLI reports missing input files without changing ours', (t) => {
  const input = { base: 'base', ours: 'ours', theirs: 'theirs' };
  const files = prepareFiles(t, input);
  rmSync(files.theirs);
  const result = runCli(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENOENT/);
  assert.equal(readFileSync(files.ours, 'utf8'), input.ours);
});

test('CLI reports a missing Git executable without changing ours', (t) => {
  const fixture = loadFixture('category-renames-without-a-release-permit-text-merging.md');
  const files = prepareFiles(t, fixture);
  const result = spawnSync(process.execPath, [CLI, 'changelog-merge', files.base, files.ours, files.theirs], {
    encoding: 'utf8', env: { ...process.env, PATH: files.directory },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENOENT/);
  assert.equal(readFileSync(files.ours, 'utf8'), fixture.ours);
});

test('CLI validates arguments and provides command help without a terminal', () => {
  const missing = spawnSync(process.execPath, [CLI, 'changelog-merge'], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Usage:.*changelog-merge <base> <ours> <theirs>/);
  const help = spawnSync(process.execPath, [CLI, 'changelog-merge', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Overwrites <ours>/);
  assert.equal(help.stderr, '');
});

function loadFixture(name: string) {
  return parseMergeFixture(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
}

function prepareFiles(t: TestContext, input: { base: string; ours: string; theirs: string }) {
  const directory = mkdtempSync(join(tmpdir(), 'changelog driver '));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const files = {
    directory,
    base: join(directory, 'base.md'),
    ours: join(directory, '--ours $(foo).md'),
    theirs: join(directory, 'theirs.md'),
  };
  writeFileSync(files.base, input.base);
  writeFileSync(files.ours, input.ours);
  writeFileSync(files.theirs, input.theirs);
  return files;
}

function runCli(files: ReturnType<typeof prepareFiles>) {
  return spawnSync(process.execPath, [CLI, 'changelog-merge', files.base, files.ours, files.theirs], { encoding: 'utf8' });
}
