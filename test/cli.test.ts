import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseCliArgs } from '../src/cli/args.ts';
import { Gh, type Runner } from '../src/cli/gh.ts';
import { resolveBranch } from '../src/cli/git.ts';
import { extractWorkflowInputs } from '../src/cli/parse-workflow.ts';
import { preview, release } from '../src/cli/index.ts';
import { versionTables } from './fixtures/version-transitions.ts';

const workflow = readFileSync(new URL('../.github/workflows/example.yml', import.meta.url), 'utf8');

test('requires a workflow and accepts explicit branch and wildcard', () => {
  assert.throws(() => parseCliArgs([]), /workflow path/);
  assert.throws(() => parseCliArgs(['../release.yml']), /workflow path/);
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
  assert.throws(() => extractWorkflowInputs('on: push'), /workflow_dispatch/);
  assert.throws(() => extractWorkflowInputs(workflow.replace('type: boolean', 'type: environment')), /Unsupported input/);
  assert.throws(() => extractWorkflowInputs('on: [\n'), /Invalid workflow YAML/);
});

for (const table of versionTables) {
  test(`CLI previews match npm version transitions: ${table.name ?? table.currentVersion}`, () => {
    for (const [channel, operation, expected] of table.transitions) {
      if (expected === null) assert.throws(() => preview(table.currentVersion, channel, operation));
      else assert.equal(preview(table.currentVersion, channel, operation), expected);
    }
  });
}

test('preview supports decorated workflow values', () => {
  assert.equal(preview('1.2.3', 'stable', 'minor (new features)'), '1.3.0');
});

function createScenario({ confirmed = true, moved = false, missing = false, dispatchFails = false, monitorFails = false, conclusion = 'success', runUrl = 'https://github.com/owner/package/actions/runs/123' } = {}) {
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
  const inputs = { channel: 'stable', version: 'minor', 'dry-run': 'true', 'skip-npm-publish': 'false', 'skip-changelog-update': 'false' };
  return { calls, inputs, messages, localUpdates, dependencies: {
    github: new Gh(run), getCurrentBranch: () => 'feature/release',
    collect: async () => inputs, confirm: async () => confirmed, log: (message: string) => { messages.push(message); },
    updateLocal: async (target: unknown) => { localUpdates.push(target); },
  } };
}

test('dispatch submits exact workflow input values and explicit branch using JSON stdin', async () => {
  const s = createScenario();
  await release({ workflow: '.github/workflows/release.yml' }, s.dependencies);
  const dispatch = s.calls.find(c => c.args[0] === 'workflow' && c.args[1] === 'run')!;
  assert.deepEqual(dispatch.args, ['workflow', 'run', 'release.yml', '--repo', 'owner/package', '--ref', 'main', '--json']);
  assert.deepEqual(JSON.parse(dispatch.input!), s.inputs);
  const view = s.calls.find(c => c.args[0] === 'workflow' && c.args[1] === 'view')!;
  assert.deepEqual(view.args, ['workflow', 'view', 'release.yml', '--repo', 'owner/package', '--ref', 'original-sha', '--yaml']);
  assert.equal(s.calls.filter(c => c.args.includes('ref=original-sha')).length, 1);
  assert.ok(s.messages.includes('https://github.com/owner/package/actions/runs/123'));
  assert.ok(s.messages.includes('✔ Release workflow completed successfully.'));
  assert.deepEqual(s.calls.find(c => c.args[0] === 'run')!.args,
    ['run', 'view', '123', '--repo', 'owner/package', '--json', 'status,conclusion']);
  assert.deepEqual(s.localUpdates, [{ repo: 'owner/package', host: 'github.com', branch: 'main', dryRun: true }]);
});

test('failed dispatch rejects without reporting success', async () => {
  const s = createScenario({ dispatchFails: true });
  await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, s.dependencies), /Workflow dispatch failed/);
  assert.equal(s.messages.some(message => message.includes('workflow started')), false);
});

test('missing run URL reports successful dispatch without retrying or guessing a run', async () => {
  const s = createScenario({ runUrl: '' });
  await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, s.dependencies), /did not return a run URL/);
  assert.equal(s.calls.filter(c => c.args[0] === 'workflow' && c.args[1] === 'run').length, 1);
});

test('waiting polls queued and running states until completion', async () => {
  const states = ['queued', 'in_progress', 'completed'];
  const github = new Gh(() => {
    const status = states.shift();
    return JSON.stringify({ status, conclusion: status === 'completed' ? 'success' : null });
  });
  assert.equal(await github.waitForWorkflowRun('owner/package', '123', 0), 'success');
  assert.equal(states.length, 0);
});

test('unsuccessful workflow conclusions reject without reporting completion success', async () => {
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'skipped']) {
    const s = createScenario({ conclusion });
    await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, s.dependencies), new RegExp(`finished: ${conclusion}`));
    assert.equal(s.messages.some(message => message.includes('completed successfully')), false);
    assert.equal(s.localUpdates.length, 0);
  }
});

test('monitoring errors retain the run link and do not redispatch', async () => {
  const s = createScenario({ monitorFails: true });
  await assert.rejects(release({ workflow: '.github/workflows/release.yml' }, s.dependencies), /workflow may still be running/);
  assert.ok(s.messages.includes('https://github.com/owner/package/actions/runs/123'));
  assert.equal(s.calls.filter(c => c.args[0] === 'workflow' && c.args[1] === 'run').length, 1);
});

test('cancellation, missing remote branches, and changed branches never dispatch', async () => {
  for (const options of [{ confirmed: false }, { moved: true }, { missing: true }]) {
    const s = createScenario(options);
    const result = release({ workflow: '.github/workflows/release.yml' }, s.dependencies);
    if (options.moved || options.missing) await assert.rejects(result);
    else await result;
    assert.equal(s.calls.some(c => c.args[0] === 'workflow' && c.args[1] === 'run'), false);
    assert.equal(s.localUpdates.length, 0);
  }
});
