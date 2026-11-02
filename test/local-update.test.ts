import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as git from '../src/cli/git.ts';
import { updateLocal } from '../src/cli/local-update.ts';

const target = { repo: 'owner/package', host: 'github.com', branch: 'main', dryRun: false };

function createScenario() {
  const calls: string[] = [];
  const messages: string[] = [];
  const helpers = {
    getCurrentBranch: () => 'main',
    isWorktreeClean: () => true,
    hasOperationInProgress: () => false,
    getUpstream: (): ReturnType<typeof git.getUpstream> => ({ remote: 'origin', remoteRef: 'refs/heads/main', ref: 'refs/remotes/origin/main' }),
    getRemoteUrl: () => 'git@github.com:owner/package.git',
    fetchRemote: async () => { calls.push('fetch'); },
    getAheadBehind: () => ({ ahead: 0, behind: 1 }),
    pullRebase: async () => { calls.push('pull'); },
  };
  const log = (message: string) => { messages.push(message); };
  return { helpers, calls, messages, log };
}

test('clean matching branch is fetched and pulled', async () => {
  const s = createScenario();
  await updateLocal(target, s.log, s.helpers);
  assert.deepEqual(s.calls, ['fetch', 'pull']);
  assert.ok(s.messages.includes('✔ Local branch updated.'));
});

test('already up to date skips pulling; local-only commits skip rebasing', async () => {
  for (const counts of [{ ahead: 0, behind: 0 }, { ahead: 1, behind: 0 }, { ahead: 1, behind: 1 }]) {
    const s = createScenario();
    s.helpers.getAheadBehind = () => counts;
    await updateLocal(target, s.log, s.helpers);
    assert.deepEqual(s.calls, ['fetch']);
    assert.match(s.messages.join('\n'), counts.ahead ? /local-only commits/ : /Already up to date/);
  }
});

test('dry runs do not inspect or modify Git', async () => {
  const s = createScenario();
  s.helpers.getCurrentBranch = () => { throw new Error('must not inspect'); };
  await updateLocal({ ...target, dryRun: true }, s.log, s.helpers);
  assert.deepEqual(s.calls, []);
  assert.match(s.messages.join('\n'), /dry run/);
});

test('unsafe checkouts skip fetching and pulling with instructions', async () => {
  const cases = [
    { getCurrentBranch: () => 'feature/work' },
    { getCurrentBranch: () => 'HEAD' },
    { isWorktreeClean: () => false },
    { hasOperationInProgress: () => true },
    { getUpstream: () => undefined },
    { getUpstream: () => ({ remote: 'origin', remoteRef: 'refs/heads/next', ref: 'refs/remotes/origin/next' }) },
    { getRemoteUrl: () => 'https://github.com/fork/package.git' },
    { getRemoteUrl: () => 'https://other.example/owner/package.git' },
    { getRemoteUrl: () => '/local/repository' },
  ];
  for (const overrides of cases) {
    const s = createScenario();
    await updateLocal(target, s.log, { ...s.helpers, ...overrides });
    assert.deepEqual(s.calls, []);
    assert.match(s.messages.join('\n'), /Local update skipped/);
    assert.ok(s.messages.join('\n').includes('\ngit pull --rebase'));
  }
});

test('dirty checkout instructions put the command on its own line', async () => {
  const s = createScenario();
  s.helpers.isWorktreeClean = () => false;
  await updateLocal(target, s.log, s.helpers);
  assert.match(s.messages.join('\n'), /Commit or stash them, then run:\ngit pull --rebase$/);
});

test('HTTPS and SSH URLs for the same repository are accepted', async () => {
  for (const url of ['https://github.com/owner/package.git', 'ssh://git@github.com/owner/package.git', 'git@github.com:owner/package.git']) {
    const s = createScenario();
    s.helpers.getRemoteUrl = () => url;
    await updateLocal(target, s.log, s.helpers);
    assert.deepEqual(s.calls, ['fetch', 'pull']);
  }
});

test('checkout changes during fetch prevent pulling', async () => {
  for (const change of ['branch', 'dirty', 'upstream']) {
    const s = createScenario();
    s.helpers.fetchRemote = async () => {
      s.calls.push('fetch');
      if (change === 'branch') s.helpers.getCurrentBranch = () => 'other';
      if (change === 'dirty') s.helpers.isWorktreeClean = () => false;
      if (change === 'upstream') s.helpers.getUpstream = () => ({ remote: 'another', remoteRef: 'refs/heads/main', ref: 'refs/remotes/another/main' });
    };
    await updateLocal(target, s.log, s.helpers);
    assert.deepEqual(s.calls, ['fetch']);
    assert.match(s.messages.join('\n'), /Local update skipped/);
  }
});

test('fetch and pull failures preserve the successful release result', async () => {
  for (const method of ['fetchRemote', 'pullRebase'] as const) {
    const s = createScenario();
    s.helpers[method] = async () => { throw new Error('Git failed'); };
    await updateLocal(target, s.log, s.helpers);
    assert.match(s.messages.join('\n'), /Release succeeded; local update failed: Git failed/);
    assert.equal(s.messages.includes('✔ Local branch updated.'), false);
  }
});

test('real Git helpers update a clean clone and preserve local commits', async () => {
  const root = mkdtempSync(join(tmpdir(), 'npm-release-local-update-'));
  const remote = join(root, 'remote.git');
  const local = join(root, 'local');
  const publisher = join(root, 'publisher');
  const previousCwd = process.cwd();
  const run = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  try {
    run(root, 'init', '--bare', '--initial-branch=main', remote);
    run(root, 'clone', remote, local);
    run(local, 'config', 'user.name', 'Test');
    run(local, 'config', 'user.email', 'test@example.com');
    writeFileSync(join(local, 'version.txt'), '1.0.0');
    run(local, 'add', '.');
    run(local, 'commit', '-m', 'initial');
    run(local, 'push', '-u', 'origin', 'main');
    run(root, 'clone', remote, publisher);
    run(publisher, 'config', 'user.name', 'Test');
    run(publisher, 'config', 'user.email', 'test@example.com');
    writeFileSync(join(publisher, 'version.txt'), '1.0.1');
    run(publisher, 'commit', '-am', 'release');
    run(publisher, 'push');

    process.chdir(local);
    const messages: string[] = [];
    const helpers = { ...git, getRemoteUrl: () => 'https://github.com/owner/package.git' };
    await updateLocal(target, message => messages.push(message), helpers);
    assert.equal(run(local, 'rev-parse', 'HEAD'), run(publisher, 'rev-parse', 'HEAD'));
    assert.ok(messages.includes('✔ Local branch updated.'));

    writeFileSync(join(local, 'version.txt'), 'local change');
    run(local, 'commit', '-am', 'local');
    const localHead = run(local, 'rev-parse', 'HEAD');
    await updateLocal(target, message => messages.push(message), helpers);
    assert.equal(run(local, 'rev-parse', 'HEAD'), localHead);
    assert.match(messages.join('\n'), /local-only commits/);

    writeFileSync(join(local, 'untracked.txt'), 'keep me');
    assert.equal(git.isWorktreeClean(), false);
    run(local, 'checkout', '--detach');
    assert.equal(git.getCurrentBranch(), 'HEAD');
  } finally {
    process.chdir(previousCwd);
    rmSync(root, { recursive: true, force: true });
  }
});
