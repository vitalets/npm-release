import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../../src/cli/index.ts', import.meta.url));

test('setup registers the scoped driver locally without modifying project files', (t) => {
  const repo = createEnvironment(t);
  git(repo, ['init']);
  writeFileSync(join(repo.directory, 'package.json'), '{"name":"foo"}\n');
  writeFileSync(join(repo.directory, '.gitattributes'), '/CHANGELOG.md merge=keep-a-changelog\n');
  git(repo, ['add', '.']);
  const before = git(repo, ['status', '--porcelain']);
  const result = setup(repo);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /✔ Root \.gitattributes already contains the required rule:/);
  assert.match(result.stdout, /✔ Updated local Git config:/);
  assert.match(result.stdout, /\[merge "keep-a-changelog"\]/);
  assert.equal(git(repo, ['config', '--local', '--get', 'merge.keep-a-changelog.driver']).trim(),
    'npx --yes @vitalets/npm-release changelog-merge "%O" "%A" "%B"');
  assert.equal(git(repo, ['config', '--local', '--get-regexp', '^merge\\.keep-a-changelog\\.']).trim(),
    'merge.keep-a-changelog.driver npx --yes @vitalets/npm-release changelog-merge "%O" "%A" "%B"');
  assert.equal(git(repo, ['status', '--porcelain']), before);
  assert.equal(readFileSync(join(repo.directory, 'package.json'), 'utf8'), '{"name":"foo"}\n');
  assert.equal(existsSync(join(repo.directory, 'CHANGELOG.md')), false);
  assert.equal(readFileSync(repo.globalConfig, 'utf8'), '[user]\n\tname = Foo\n');
});

test('repeated setup replaces stale driver values without duplicates', (t) => {
  const repo = createEnvironment(t);
  git(repo, ['init']);
  git(repo, ['config', '--local', '--add', 'merge.keep-a-changelog.driver', 'old']);
  git(repo, ['config', '--local', '--add', 'merge.keep-a-changelog.driver', 'older']);
  const initial = setup(repo);
  assert.equal(initial.status, 0, initial.stderr);
  assert.match(initial.stdout, /✔ Created root \.gitattributes:\n/);
  assert.match(initial.stdout, /^\/CHANGELOG.md merge=keep-a-changelog$/m);
  const first = readFileSync(join(repo.directory, '.git/config'), 'utf8');
  const repeated = setup(repo);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.match(repeated.stdout, /✔ Root \.gitattributes already contains the required rule:/);
  assert.match(repeated.stdout, /✔ Local Git config already contains the required merge driver:/);
  assert.equal(readFileSync(join(repo.directory, '.git/config'), 'utf8'), first);
  assert.equal(git(repo, ['config', '--local', '--get-all', 'merge.keep-a-changelog.driver']).trim().split('\n').length, 1);
  assert.equal(readFileSync(join(repo.directory, '.gitattributes'), 'utf8'), '/CHANGELOG.md merge=keep-a-changelog\n');
});

test('setup discovers the repository from a nested directory', (t) => {
  const repo = createEnvironment(t);
  git(repo, ['init']);
  const nested = join(repo.directory, 'packages/foo');
  mkdirSync(nested, { recursive: true });
  const result = setup({ ...repo, directory: nested });
  assert.equal(result.status, 0, result.stderr);
  assert.match(git(repo, ['config', '--local', '--get', 'merge.keep-a-changelog.driver']), /@vitalets\/npm-release/);
  assert.equal(readFileSync(join(repo.directory, '.gitattributes'), 'utf8'), '/CHANGELOG.md merge=keep-a-changelog\n');
  assert.equal(existsSync(join(nested, '.gitattributes')), false);
});

test('setup preserves existing attributes and adds the changelog rule after a missing newline', (t) => {
  const repo = createEnvironment(t);
  git(repo, ['init']);
  const path = join(repo.directory, '.gitattributes');
  const original = '# merge=keep-a-changelog\r\nOTHER.md merge=keep-a-changelog\r\n*.md text';
  writeFileSync(path, original);
  const result = setup(repo);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /✔ Updated root \.gitattributes:\n/);
  assert.equal(readFileSync(path, 'utf8'), original + '\r\n/CHANGELOG.md merge=keep-a-changelog\r\n');
  assert.equal(git(repo, ['check-attr', 'merge', '--', 'CHANGELOG.md']).trim(), 'CHANGELOG.md: merge: keep-a-changelog');
});

test('setup retains an existing changelog rule with other attributes', (t) => {
  const repo = createEnvironment(t);
  git(repo, ['init']);
  const path = join(repo.directory, '.gitattributes');
  const original = 'CHANGELOG.md text merge=keep-a-changelog eol=lf\n';
  writeFileSync(path, original);
  assert.equal(setup(repo).status, 0);
  assert.equal(readFileSync(path, 'utf8'), original);
});

test('setup skips environments without a working tree or Git', (t) => {
  const repo = createEnvironment(t);
  const noCheckout = setup(repo);
  assert.equal(noCheckout.status, 0, noCheckout.stderr);
  assert.match(noCheckout.stdout, /Skipping.*working tree/);
  const noGit = setup({ ...repo, env: { ...repo.env, PATH: repo.directory } });
  assert.equal(noGit.status, 0, noGit.stderr);
  assert.match(noGit.stdout, /Skipping.*Git is unavailable/);
  assert.equal(existsSync(join(repo.directory, '.git')), false);
});

test('setup skips bare repositories', (t) => {
  const repo = createEnvironment(t);
  git(repo, ['init', '--bare']);
  const before = readFileSync(join(repo.directory, 'config'), 'utf8');
  const result = setup(repo);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Skipping.*working tree/);
  assert.equal(readFileSync(join(repo.directory, 'config'), 'utf8'), before);
});

test('configuration write failures are reported instead of silently skipped', (t) => {
  const repo = createEnvironment(t);
  git(repo, ['init']);
  writeFileSync(join(repo.directory, '.git/config.lock'), '');
  const result = setup(repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /lock.*config/);
});

test('setup validates arguments and displays help without configuring anything', (t) => {
  const repo = createEnvironment(t);
  const invalid = setup(repo, ['foo']);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Usage:.*changelog-merge-setup/);
  const help = setup(repo, ['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /local Git config/);
  assert.equal(existsSync(join(repo.directory, '.git')), false);
});

function createEnvironment(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'merge setup '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, 'checkout');
  mkdirSync(directory);
  const globalConfig = join(root, 'global.config');
  writeFileSync(globalConfig, '[user]\n\tname = Foo\n');
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' };
  return { directory, globalConfig, env };
}

function git(repo: ReturnType<typeof createEnvironment>, args: string[]) {
  return execFileSync('git', args, { cwd: repo.directory, env: repo.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function setup(repo: ReturnType<typeof createEnvironment>, args: string[] = []) {
  return spawnSync(process.execPath, [CLI, 'changelog-merge-setup', ...args], {
    cwd: repo.directory, env: repo.env, encoding: 'utf8',
  });
}
