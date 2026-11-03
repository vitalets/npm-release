import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseCliArgs } from '../src/cli/args.ts';
import { Gh, type Runner } from '../src/cli/gh.ts';
import * as git from '../src/cli/git.ts';
import { extractWorkflowInputs } from '../src/cli/parse-workflow.ts';
import { preview, release } from '../src/cli/index.ts';
import { execFileSync } from 'node:child_process';
import { createGitRepository } from './helpers/local-update.ts';
import { testVersionTransitions } from './helpers/version-transitions.ts';

const workflow = readFileSync(new URL('../.github/workflows/example.yml', import.meta.url), 'utf8');

test('validates the workflow path', () => {
  assert.throws(() => parseCliArgs([]), /workflow path/);
  assert.throws(() => parseCliArgs(['../release.yml']), /workflow path/);
});

test('requires a concrete release branch', () => {
  assert.throws(() => parseCliArgs(['.github/workflows/release.yml', '--branch=*']), /specific branch/);
  assert.equal(git.resolveBranch(), 'main');
  assert.equal(git.resolveBranch('next'), 'next');
  assert.throws(() => git.resolveBranch('*'), /specific branch/);
});

test('workflow parsing preserves declaration order and boolean defaults', () => {
  const inputs = extractWorkflowInputs(workflow);
  assert.deepEqual(inputs.map(i => i.name), ['channel', 'version', 'dry-run', 'skip-npm-publish', 'skip-changelog-update']);
  assert.equal(inputs[2].default, 'false');
  assert.deepEqual(inputs[0].options, ['', 'stable', 'next']);
});

test('rejects workflows without supported dispatch inputs', () => {
  assert.throws(() => extractWorkflowInputs('on: push'), /workflow_dispatch/);
  assert.throws(() => extractWorkflowInputs(workflow.replace('type: boolean', 'type: environment')), /Unsupported input/);
  assert.throws(() => extractWorkflowInputs('on: [\n'), /Invalid workflow YAML/);
});

describe('CLI version preview', () => {
  testVersionTransitions(preview, /lower operations are not permitted/);
});

test('preview supports decorated workflow values', () => {
  assert.equal(preview('1.2.3', 'stable', 'minor (new features)'), '1.3.0');
});

test('dispatches and monitors a release', async () => {
  const inputs = {
    channel: 'stable',
    version: 'minor',
    'dry-run': 'true',
    'skip-npm-publish': 'false',
    'skip-changelog-update': 'false',
  };
  const scenario = createScenario({ inputs });
  await release({ workflow: '.github/workflows/release.yml' }, scenario.dependencies);

  // Dispatch preserves the selected inputs and branch.
  const dispatch = scenario.calls.find(c => c.args[0] === 'workflow' && c.args[1] === 'run')!;
  assert.deepEqual(dispatch.args, ['workflow', 'run', 'release.yml', '--repo', 'owner/package', '--ref', 'main', '--json']);
  assert.deepEqual(JSON.parse(dispatch.input!), inputs);

  // Preview uses the local package version without downloading release files.
  assert.ok(scenario.messages.some(message => message.includes('1.2.3 → 1.3.0')));
  assert.equal(scenario.calls.some(c => c.args.includes('--yaml') || c.args.some(arg => arg.includes('/contents/'))), false);

  // Completion reports the run link and updates the matching checkout.
  assert.ok(scenario.messages.includes('https://github.com/owner/package/actions/runs/123'));
  assert.ok(scenario.messages.includes('✔ Release workflow completed successfully.'));
  assert.deepEqual(scenario.calls.find(c => c.args[0] === 'run')!.args,
    ['run', 'view', '123', '--repo', 'owner/package', '--json', 'status,conclusion']);
  assert.deepEqual(scenario.localUpdates, [{ repo: 'owner/package', host: 'github.com', branch: 'main', dryRun: true }]);
});

test('failed dispatch rejects without reporting success', async () => {
  const scenario = createScenario({ dispatchFails: true });
  await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, scenario.dependencies), /Workflow dispatch failed/);
  assert.equal(scenario.messages.some(message => message.includes('workflow started')), false);
});

test('a missing run URL prevents monitoring without redispatching', async () => {
  const scenario = createScenario({ runUrl: '' });
  await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, scenario.dependencies), /did not return a run URL/);
  assert.equal(scenario.calls.filter(c => c.args[0] === 'workflow' && c.args[1] === 'run').length, 1);
});

test('waiting polls queued and running states until completion', async () => {
  const states = [
    { status: 'queued', conclusion: null },
    { status: 'in_progress', conclusion: null },
    { status: 'completed', conclusion: 'success' },
  ];
  const github = new Gh(() => JSON.stringify(states.shift()));
  assert.equal(await github.waitForWorkflowRun('owner/package', '123', 0), 'success');
  assert.equal(states.length, 0);
});

test('unsuccessful workflows do not update the local checkout', async () => {
  await assertUnsuccessfulRelease('failure', /finished: failure/);
  await assertUnsuccessfulRelease('cancelled', /finished: cancelled/);
  await assertUnsuccessfulRelease('timed_out', /finished: timed_out/);
  await assertUnsuccessfulRelease('skipped', /finished: skipped/);
});

test('monitoring errors retain the run link and do not redispatch', async () => {
  const scenario = createScenario({ monitorFails: true });
  await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, scenario.dependencies), /workflow may still be running/);
  assert.ok(scenario.messages.includes('https://github.com/owner/package/actions/runs/123'));
  assert.equal(scenario.calls.filter(c => c.args[0] === 'workflow' && c.args[1] === 'run').length, 1);
});

test('cancelling the release prevents dispatch', async () => {
  const scenario = createScenario({ confirmed: false });
  await release({ workflow: '.github/workflows/release.yml' }, scenario.dependencies);
  assertNoDispatch(scenario);
});

test('a missing remote branch prevents dispatch', async () => {
  const scenario = createScenario({ missing: true });
  await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, scenario.dependencies), /Branch not found/);
  assertNoDispatch(scenario);
});

test('a changed remote branch prevents dispatch', async () => {
  const scenario = createScenario({ moved: true });
  await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, scenario.dependencies), /branch changed/);
  assertNoDispatch(scenario);
});

test('a different checkout branch prevents release', async () => {
  const scenario = createScenario({ branch: 'next' });
  await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, scenario.dependencies), /requires branch main.*next/);
  assertNoDispatch(scenario);
});

test('an explicitly selected branch can release', async () => {
  const scenario = createScenario({ branch: 'next' });
  await release({ workflow: '.github/workflows/release.yml', branch: 'next' }, scenario.dependencies);
  assert.ok(scenario.calls.some(call => call.args.includes('--ref') && call.args.includes('next')));
});

test('detached HEAD is rejected even with an explicit branch', async () => {
  const scenario = createScenario({ branch: 'HEAD' });
  await assert.rejects(release({ workflow: '.github/workflows/release.yml', branch: 'main' }, scenario.dependencies), /detached HEAD/);
  assertNoDispatch(scenario);
});

test('dirty checkouts prevent release', async () => {
  const scenario = createScenario({ clean: false });
  await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, scenario.dependencies), /Commit or stash/);
  assertNoDispatch(scenario);
});

test('unfinished Git operations prevent release', async () => {
  const scenario = createScenario({ operation: true });
  await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, scenario.dependencies), /Finish or abort/);
  assertNoDispatch(scenario);
});

test('unpublished or stale local commits prevent release', async () => {
  const scenario = createScenario({ head: 'different-sha' });
  await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, scenario.dependencies), /not synchronized/);
  assertNoDispatch(scenario);
});

test('local commits changed during prompts prevent dispatch', async () => {
  const scenario = createScenario({ afterConfirm: () => {
    scenario.dependencies.git.getHeadSha = () => 'different-sha';
  } });
  await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, scenario.dependencies), /Local commit changed/);
  assertNoDispatch(scenario);
});

test('changes made during prompts prevent dispatch', async () => {
  const scenario = createScenario({ afterConfirm: () => {
    scenario.dependencies.git.isWorktreeClean = () => false;
  } });
  await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, scenario.dependencies), /uncommitted/);
  assertNoDispatch(scenario);
});

test('switching branches during prompts prevents dispatch', async () => {
  const scenario = createScenario({ afterConfirm: () => {
    scenario.dependencies.git.getCurrentBranch = () => 'next';
  } });
  await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, scenario.dependencies), /requires branch main/);
  assertNoDispatch(scenario);
});

test('reads tracked files from the repository root when invoked in a subdirectory', context => {
  createGitRepository(context);
  writeFileSync('package.json', '{"version":"1.2.3"}');
  mkdirSync('.github/workflows', { recursive: true });
  writeFileSync('.github/workflows/release.yml', workflow);
  execFileSync('git', ['add', '.']);
  execFileSync('git', ['commit', '-m', 'foo']);
  process.chdir('.github');
  assert.equal(git.readReleaseFile('package.json'), '{"version":"1.2.3"}');
  assert.equal(git.readReleaseFile('.github/workflows/release.yml'), workflow);
});

test('missing and ignored release files cannot supply configuration', context => {
  createGitRepository(context);
  assert.throws(() => git.readReleaseFile('package.json'), /tracked release file/);
  writeFileSync('.gitignore', 'package.json\n');
  writeFileSync('package.json', '{"version":"1.2.3"}');
  assert.throws(() => git.readReleaseFile('package.json'), /tracked release file/);
});

test('all local change types are detected', context => {
  const repository = createGitRepository(context);
  assert.equal(git.isWorktreeClean(), true);
  repository.writeUntrackedFile();
  assert.equal(git.isWorktreeClean(), false);
  execFileSync('git', ['add', 'foo.txt']);
  assert.equal(git.isWorktreeClean(), false);
  execFileSync('git', ['commit', '-m', 'foo']);
  writeFileSync('version.txt', '2.0.0');
  assert.equal(git.isWorktreeClean(), false);
});

test('local-only commits prevent release against a real checkout', async context => {
  const repository = createGitRepository(context);
  const scenario = createScenario({ remoteSha: repository.publishedHead() });
  repository.commitLocalVersion('2.0.0');
  scenario.dependencies.git = git;
  await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, scenario.dependencies), /not synchronized/);
  assertNoDispatch(scenario);
});

test('remote-only commits prevent release even with stale tracking refs', async context => {
  const repository = createGitRepository(context);
  repository.publishVersion('2.0.0');
  const scenario = createScenario({ remoteSha: repository.publishedHead() });
  scenario.dependencies.git = git;
  await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, scenario.dependencies), /not synchronized/);
  assertNoDispatch(scenario);
});

test('diverged commits prevent release', async context => {
  const repository = createGitRepository(context);
  repository.publishVersion('2.0.0');
  repository.commitLocalVersion('3.0.0');
  const scenario = createScenario({ remoteSha: repository.publishedHead() });
  scenario.dependencies.git = git;
  await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, scenario.dependencies), /not synchronized/);
  assertNoDispatch(scenario);
});

function createScenario({
  remoteSha = 'original-sha',
  branch = 'main',
  clean = true,
  operation = false,
  head = 'original-sha',
  afterConfirm = () => {},
  confirmed = true,
  moved = false,
  missing = false,
  dispatchFails = false,
  monitorFails = false,
  conclusion = 'success',
  runUrl = 'https://github.com/owner/package/actions/runs/123',
  inputs = { channel: 'stable', version: 'minor', 'dry-run': 'true', 'skip-npm-publish': 'false', 'skip-changelog-update': 'false' },
} = {}) {
  const calls: { command: string; args: string[]; input?: string }[] = [];
  const messages: string[] = [];
  const localUpdates: unknown[] = [];
  let branchReads = 0;
  const run: Runner = (command, args, input) => {
    calls.push({ command, args, input });
    if (args[0] === 'repo') return JSON.stringify({ nameWithOwner: 'owner/package', defaultBranchRef: { name: 'main' } });
    if (args[1]?.includes('/branches/')) {
      if (missing) throw new Error('Branch not found');
      return JSON.stringify({ commit: { sha: moved && branchReads++ ? 'new-sha' : remoteSha } });
    }
    if (args[0] === 'workflow' && args[1] === 'run') {
      if (dispatchFails) throw new Error('Workflow dispatch failed');
      return runUrl;
    }
    if (args[0] === 'run' && args[1] === 'view') {
      if (monitorFails) throw new Error('Network unavailable');
      return JSON.stringify({ status: 'completed', conclusion });
    }
    throw new Error(`Unexpected command ${command} ${args}`);
  };
  return {
    calls,
    messages,
    localUpdates,
    dependencies: {
      github: new Gh(run),
      git: {
        ...git,
        getCurrentBranch: () => branch,
        isWorktreeClean: () => clean,
        hasOperationInProgress: () => operation,
        getHeadSha: () => head,
        readReleaseFile: (path: string) => path === 'package.json' ? '{"version":"1.2.3"}' : workflow,
      },
      collect: async () => inputs,
      confirm: async () => { afterConfirm(); return confirmed; },
      log: (message: string) => { messages.push(message); },
      updateLocal: async (target: unknown) => { localUpdates.push(target); },
    },
  };
}

function assertNoDispatch(scenario: ReturnType<typeof createScenario>) {
  assert.equal(scenario.calls.some(call => call.args[0] === 'workflow' && call.args[1] === 'run'), false);
  assert.deepEqual(scenario.localUpdates, []);
}

async function assertUnsuccessfulRelease(conclusion: string, error: RegExp) {
  const scenario = createScenario({ conclusion });
  await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, scenario.dependencies), error);
  assert.equal(scenario.messages.some(message => message.includes('completed successfully')), false);
  assert.deepEqual(scenario.localUpdates, []);
}
