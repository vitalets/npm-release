import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as git from '../src/cli/git.ts';
import { updateLocal } from '../src/cli/local-update.ts';
import { createScenario, createGitRepository } from './helpers/local-update.ts';

const target = { repo: 'owner/package', host: 'github.com', branch: 'main', dryRun: false };

test('clean matching branch is fetched and pulled', async () => {
  const scenario = createScenario();
  await updateLocal(target, scenario.log, scenario.helpers);
  assert.deepEqual(scenario.calls, ['fetch', 'pull']);
  assert.ok(scenario.messages.includes('✔ Local branch updated.'));
});

test('an up-to-date branch skips pulling', async () => {
  await assertPullSkipped({ ahead: 0, behind: 0 }, /Already up to date/);
});

test('local-only commits prevent rebasing', async () => {
  await assertPullSkipped({ ahead: 1, behind: 0 }, /local-only commits/);
  await assertPullSkipped({ ahead: 1, behind: 1 }, /local-only commits/);
});

test('dry runs do not inspect or modify Git', async () => {
  const scenario = createScenario();
  scenario.helpers.getCurrentBranch = () => assert.fail('must not inspect Git');
  await updateLocal({ ...target, dryRun: true }, scenario.log, scenario.helpers);
  assert.deepEqual(scenario.calls, []);
  assert.match(scenario.messages.join('\n'), /dry run/);
});

test('a different or detached branch skips the update', async () => {
  await assertCheckoutSkipped({ getCurrentBranch: () => 'foo' });
  await assertCheckoutSkipped({ getCurrentBranch: () => 'HEAD' });
});

test('unfinished Git work skips the update', async () => {
  await assertCheckoutSkipped({ isWorktreeClean: () => false });
  await assertCheckoutSkipped({ hasOperationInProgress: () => true });
});

test('a missing or mismatched upstream skips the update', async () => {
  await assertCheckoutSkipped({ getUpstream: () => undefined });
  await assertCheckoutSkipped({
    getUpstream: () => ({ remote: 'origin', remoteRef: 'refs/heads/next', ref: 'refs/remotes/origin/next' }),
  });
  await assertCheckoutSkipped({ getRemoteUrl: () => 'https://github.com/foo/package.git' });
  await assertCheckoutSkipped({ getRemoteUrl: () => 'https://foo.example/owner/package.git' });
  await assertCheckoutSkipped({ getRemoteUrl: () => '/foo/bar' });
});

test('dirty checkout instructions put the command on its own line', async () => {
  const scenario = createScenario();
  scenario.helpers.isWorktreeClean = () => false;
  await updateLocal(target, scenario.log, scenario.helpers);
  assert.match(scenario.messages.join('\n'), /Commit or stash them, then run:\ngit pull --rebase$/);
});

test('HTTPS and SSH URLs identify the same repository', async () => {
  await assertRemoteUpdated('https://github.com/owner/package.git');
  await assertRemoteUpdated('ssh://git@github.com/owner/package.git');
  await assertRemoteUpdated('git@github.com:owner/package.git');
});

test('checkout changes during fetch prevent pulling', async () => {
  await assertCheckoutChangedDuringFetch({ getCurrentBranch: () => 'foo' });
  await assertCheckoutChangedDuringFetch({ isWorktreeClean: () => false });
  await assertCheckoutChangedDuringFetch({
    getUpstream: () => ({ remote: 'foo', remoteRef: 'refs/heads/main', ref: 'refs/remotes/foo/main' }),
  });
});

test('Git failures preserve the successful release result', async () => {
  await assertGitFailureReported('fetchRemote');
  await assertGitFailureReported('pullRebase');
});

test('real Git helpers update a clean clone and preserve local commits', async (context) => {
  const repository = createGitRepository(context);
  repository.publishVersion('1.0.1');
  const messages: string[] = [];
  const helpers = { ...git, getRemoteUrl: () => 'https://github.com/owner/package.git' };

  await updateLocal(target, message => messages.push(message), helpers);
  assert.equal(repository.localHead(), repository.publishedHead());
  assert.ok(messages.includes('✔ Local branch updated.'));

  // A subsequent update must preserve unpublished local commits.
  repository.commitLocalVersion('foo');
  const localHead = repository.localHead();
  await updateLocal(target, message => messages.push(message), helpers);
  assert.equal(repository.localHead(), localHead);
  assert.match(messages.join('\n'), /local-only commits/);
});

test('real Git helpers detect untracked files', (context) => {
  const repository = createGitRepository(context);
  repository.writeUntrackedFile();
  assert.equal(git.isWorktreeClean(), false);
});

test('real Git helpers detect a detached checkout', (context) => {
  const repository = createGitRepository(context);
  repository.detach();
  assert.equal(git.getCurrentBranch(), 'HEAD');
});

async function assertPullSkipped(counts: { ahead: number; behind: number }, message: RegExp) {
  const scenario = createScenario();
  scenario.helpers.getAheadBehind = () => counts;
  await updateLocal(target, scenario.log, scenario.helpers);
  assert.deepEqual(scenario.calls, ['fetch']);
  assert.match(scenario.messages.join('\n'), message);
}

async function assertCheckoutSkipped(overrides: Partial<ReturnType<typeof createScenario>['helpers']>) {
  const scenario = createScenario();
  await updateLocal(target, scenario.log, { ...scenario.helpers, ...overrides });
  assert.deepEqual(scenario.calls, []);
  assert.match(scenario.messages.join('\n'), /Local update skipped/);
  assert.ok(scenario.messages.join('\n').includes('\ngit pull --rebase'));
}

async function assertRemoteUpdated(url: string) {
  const scenario = createScenario();
  scenario.helpers.getRemoteUrl = () => url;
  await updateLocal(target, scenario.log, scenario.helpers);
  assert.deepEqual(scenario.calls, ['fetch', 'pull']);
}

async function assertCheckoutChangedDuringFetch(overrides: Partial<ReturnType<typeof createScenario>['helpers']>) {
  const scenario = createScenario();
  scenario.helpers.fetchRemote = async () => {
    scenario.calls.push('fetch');
    Object.assign(scenario.helpers, overrides);
  };
  await updateLocal(target, scenario.log, scenario.helpers);
  assert.deepEqual(scenario.calls, ['fetch']);
  assert.match(scenario.messages.join('\n'), /Local update skipped/);
}

async function assertGitFailureReported(method: 'fetchRemote' | 'pullRebase') {
  const scenario = createScenario();
  scenario.helpers[method] = async () => { throw new Error('Git failed'); };
  await updateLocal(target, scenario.log, scenario.helpers);
  assert.match(scenario.messages.join('\n'), /Release succeeded; local update failed: Git failed/);
  assert.equal(scenario.messages.includes('✔ Local branch updated.'), false);
}
