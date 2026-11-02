import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseCliArgs } from '../src/cli/args.ts';
import { Gh, type Runner } from '../src/cli/gh.ts';
import { resolveBranch } from '../src/cli/git.ts';
import { extractWorkflowInputs } from '../src/cli/parse-workflow.ts';
import { preview, release } from '../src/cli/index.ts';
import { testVersionTransitions } from './helpers/version-transitions.ts';

const workflow = readFileSync(new URL('../.github/workflows/example.yml', import.meta.url), 'utf8');

test('validates the workflow path', () => {
  assert.throws(() => parseCliArgs([]), /workflow path/);
  assert.throws(() => parseCliArgs(['../release.yml']), /workflow path/);
});

test('accepts the current-branch wildcard', () => {
  assert.deepEqual(parseCliArgs(['.github/workflows/release.yml', '--branch=*']), {
    help: false, workflow: '.github/workflows/release.yml', branch: '*',
  });
});

test('branch policy never reads the local branch without explicit wildcard', () => {
  const unexpected = () => { throw new Error('must not read local branch'); };
  assert.equal(resolveBranch(undefined, 'main', unexpected), 'main');
  assert.equal(resolveBranch('next', 'main', unexpected), 'next');
  assert.equal(resolveBranch('*', 'main', () => 'feature/release\n'), 'feature/release');
  assert.throws(() => resolveBranch('*', 'main', () => ''), /detached HEAD/);
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

  // Preview reads are pinned to the branch commit checked before dispatch.
  const view = scenario.calls.find(c => c.args[0] === 'workflow' && c.args[1] === 'view')!;
  assert.deepEqual(view.args, ['workflow', 'view', 'release.yml', '--repo', 'owner/package', '--ref', 'original-sha', '--yaml']);
  assert.equal(scenario.calls.filter(c => c.args.includes('ref=original-sha')).length, 1);

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

function createScenario({
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
      return JSON.stringify({ commit: { sha: moved && branchReads++ ? 'new-sha' : 'original-sha' } });
    }
    if (args[0] === 'workflow' && args[1] === 'view') return workflow;
    if (args.includes('repos/owner/package/contents/package.json')) return '{"version":"1.2.3"}';
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
      getCurrentBranch: () => 'feature/release',
      collect: async () => inputs,
      confirm: async () => confirmed,
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
