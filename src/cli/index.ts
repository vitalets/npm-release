#!/usr/bin/env node
/**
 * Coordinates validated local release previews and GitHub workflow execution.
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as util from 'node:util';
import { inc, valid } from 'semver';
import { Gh } from './gh.ts';
import * as git from './git.ts';
import { extractWorkflowInputs } from './parse-workflow.ts';
import { collectInputs, confirmRelease } from './cli-inputs.ts';
import { npmVersionOperation } from '../action/versioning.ts';
import { withSpinner } from './spinner.ts';
import { updateLocal } from './local-update.ts';
import { parseCliArgs } from './args.ts';

type ReleaseOptions = { workflow: string; branch?: string; channel?: string };
type ReleaseContext = ReturnType<typeof prepareRelease>;

// Run only when executed directly, not when imported by tests or the demo.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

/**
 * Validates the checkout, confirms the release, and monitors its execution.
 * Exported for tests.
 */
export async function release(options: ReleaseOptions, dependencies = {
  github: new Gh(), git, collect: collectInputs, confirm: confirmRelease, updateLocal, log: console.log,
}) {
  const { github, git, collect, confirm, updateLocal, log } = dependencies;
  const context = prepareRelease(options, github, git);
  printReleaseContext(context, log);
  const inputs = await collect(
    context.definitions, (channel, choice) => preview(context.version, channel, choice), options.channel,
  );
  if (options.channel !== undefined) log(`Channel: ${inputs.channel}`);
  if (!await confirmPlan(context, inputs, confirm, log)) return;
  checkCheckout(context.branch, git);
  if (git.getHeadSha() !== context.sha) throw new Error('Local commit changed during selection. Run again to refresh the preview.');
  const runUrl = await dispatchRelease(context, inputs, github, log);
  await updateLocal({ repo: context.repo, host: new URL(runUrl).host, branch: context.branch, dryRun: inputs['dry-run'] === 'true' }, log);
}

/**
 * Calculates the version displayed before dispatching a release.
 * Exported for tests.
 */
export function preview(current: string, channel: string, choice: string) {
  if (!valid(current)) throw new Error(`Invalid package version: ${current}`);
  const operation = npmVersionOperation(current, channel, choice);
  const version = channel === 'stable' ? inc(current, operation) : inc(current, operation, channel);
  if (!version) throw new Error(`Cannot calculate version for ${channel} ${choice}`);
  return version;
}

async function main() {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: npm-release .github/workflows/release.yml [--branch <name>] [--channel <name>]\n\nBranch defaults to main. --channel skips the channel prompt; otherwise it is selected interactively.\nRequires a clean checkout on the selected branch, synchronized with GitHub.\nRequires Node.js 20+, git, and authenticated GitHub CLI (gh auth login).");
    } else {
      if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run this command in an interactive terminal.');
      await release(options);
    }
  } catch (error) {
    if ((error as Error).name === 'ExitPromptError') console.error(styleText('red', 'Release cancelled.'));
    else console.error(styleText('red', `✖ ${(error as Error).message}`));
    process.exitCode = 1;
  }
}

function prepareRelease(options: ReleaseOptions, github: Gh, helpers: typeof git) {
  const branch = helpers.resolveBranch(options.branch);
  checkCheckout(branch, helpers);
  const repo = github.getRepository();
  const sha = github.getBranchSha(repo.nameWithOwner, branch);
  if (helpers.getHeadSha() !== sha) {
    throw new Error(`Local branch ${branch} is not synchronized with ${repo.nameWithOwner}:${branch}.\nFetch the release repository and inspect the differences with git status and git log.\nPush local commits, or integrate remote changes with git pull --rebase, then rerun. Verify your remote and upstream target the release repository and branch.`);
  }
  const definitions = extractWorkflowInputs(helpers.readReleaseFile(options.workflow));
  const pkg = JSON.parse(helpers.readReleaseFile('package.json'));
  if (typeof pkg.version !== 'string') throw new Error('Local package.json has no version.');
  return { repo: repo.nameWithOwner, workflow: options.workflow, branch, sha, definitions, version: pkg.version as string };
}

function checkCheckout(branch: string, helpers: typeof git) {
  const current = helpers.getCurrentBranch();
  if (current === 'HEAD') throw new Error(`Cannot release from detached HEAD. Switch to the release branch:\ngit switch -- ${quoteBranch(branch)}`);
  if (current !== branch) throw new Error(`Release requires branch ${branch}; you are on ${current}.\ngit switch -- ${quoteBranch(branch)}`);
  if (helpers.hasOperationInProgress()) throw new Error('A Git operation is in progress. Finish or abort it, then rerun.');
  if (!helpers.isWorktreeClean()) throw new Error('Repository has uncommitted or untracked changes. Commit or stash them (including untracked files), then rerun.\ngit status');
}

function printReleaseContext(context: ReleaseContext, log: typeof console.log) {
  const { repo, branch, version } = context;
  log(`\nReleasing ${styleText('bold', styleText('cyan', repo))} from the remote branch ${styleText('bold', styleText('cyan', branch))} on GitHub.`);
  log(styleText('green', 'Local checkout is clean and matches the remote branch.'));
  log(`\n${styleText('bold', 'Current version:')} ${styleText('bold', styleText('cyan', version))}\n`);
}

async function confirmPlan(
  context: ReleaseContext,
  inputs: Record<string, string>,
  confirm: () => Promise<boolean>,
  log: typeof console.log,
) {
  const next = preview(context.version, inputs.channel, inputs.version);
  log(`\n${styleText('bold', 'Release:')} ${styleText('dim', context.version)} → ${styleText('green', next)}\n`);
  const confirmed = await confirm();
  if (!confirmed) log(styleText('red', 'Release cancelled.'));
  return confirmed;
}

async function dispatchRelease(context: ReleaseContext, inputs: Record<string, string>, github: Gh, log: typeof console.log) {
  const { repo, workflow, branch, sha } = context;
  if (github.getBranchSha(repo, branch) !== sha) {
    throw new Error('Remote branch changed during selection. Run again to refresh the preview.');
  }
  const result = await withSpinner('Starting release workflow…', () => github.runWorkflow(repo, workflow, branch, inputs));
  log(styleText('green', '✔ Release workflow started.'));
  const runUrl = result.trim();
  if (runUrl) log(styleText('cyan', runUrl));
  const runId = runUrl.match(/\/actions\/runs\/(\d+)\/?$/)?.[1];
  if (!runId) throw new Error('GitHub did not return a run URL, so completion cannot be monitored. Use gh run list to find the run; do not submit the release again.');
  await waitForRelease(repo, runId, github, log);
  return runUrl;
}

async function waitForRelease(repo: string, runId: string, github: Gh, log: typeof console.log) {
  let conclusion: string;
  try {
    conclusion = await withSpinner('Waiting for release workflow to finish…', () => github.waitForWorkflowRun(repo, runId));
  } catch (error) {
    throw new Error(`Could not monitor release workflow: ${(error as Error).message}. Check the run link above; the workflow may still be running.`);
  }
  if (conclusion !== 'success') throw new Error(`Release workflow finished: ${conclusion}. See the run link above.`);
  log(styleText('green', '✔ Release workflow completed successfully.'));
}

function quoteBranch(branch: string) {
  return `'${branch.replaceAll("'", "'\\''")}'`;
}

function styleText(format: 'bold' | 'dim' | 'cyan' | 'green' | 'yellow' | 'red', value: string) {
  if (!process.stdout.isTTY || process.env.NO_COLOR !== undefined) return value;
  // Early Node 20 versions do not provide util.styleText.
  return util.styleText?.(format, value) ?? value;
}
