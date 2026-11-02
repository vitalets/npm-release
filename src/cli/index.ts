#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as util from 'node:util';
import { parseCliArgs } from './args.ts';
import { Gh } from './gh.ts';
import { getCurrentBranch, resolveBranch } from './git.ts';
import { extractWorkflowInputs } from './parse-workflow.ts';
import { collectInputs, confirmRelease } from './cli-inputs.ts';
import { inc, valid } from 'semver';
import { npmVersionOperation } from '../action/versioning.ts';
import { withSpinner } from './spinner.ts';
import { updateLocal } from './local-update.ts';

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

async function main() {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: npm-release .github/workflows/release.yml [--branch <name|*>]\n\nDefaults to the remote default branch. --branch='*' uses the current local branch.\nRequires Node.js 20+, git, and authenticated GitHub CLI (gh auth login).");
    } else {
      if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run this command in an interactive terminal.');
      await release(options);
    }
  } catch (error) {
    if ((error as Error).name === 'ExitPromptError') console.error('Release cancelled.');
    else console.error(styleText('red', `✖ ${(error as Error).message}`));
    process.exitCode = 1;
  }
}

type ReleaseOptions = { workflow: string; branch?: string };
type ReleaseContext = ReturnType<typeof prepareRelease>;

export async function release(options: ReleaseOptions, dependencies = {
  github: new Gh(), getCurrentBranch, collect: collectInputs, confirm: confirmRelease, updateLocal, log: console.log,
}) {
  const { github, getCurrentBranch, collect, confirm, updateLocal, log } = dependencies;
  const context = prepareRelease(options, github, getCurrentBranch);
  printReleaseContext(context, log);
  const inputs = await collect(context.definitions, (channel, choice) => preview(context.version, channel, choice));
  if (!await confirmPlan(context, inputs, confirm, log)) return;
  const runUrl = await dispatchRelease(context, inputs, github, log);
  await updateLocal({ repo: context.repo, host: new URL(runUrl).host, branch: context.branch, dryRun: inputs['dry-run'] === 'true' }, log);
}

function prepareRelease(options: ReleaseOptions, github: Gh, getCurrentBranch: () => string) {
  const repo = github.getRepository();
  if (!repo.defaultBranchRef) throw new Error('Repository has no default branch.');
  const branch = resolveBranch(options.branch, repo.defaultBranchRef.name, getCurrentBranch);
  const sha = github.getBranchSha(repo.nameWithOwner, branch);
  const definitions = extractWorkflowInputs(github.getWorkflowFile(repo.nameWithOwner, options.workflow, sha));
  const pkg = JSON.parse(github.getFile(repo.nameWithOwner, 'package.json', sha));
  if (typeof pkg.version !== 'string') throw new Error('Remote package.json has no version.');
  return { repo: repo.nameWithOwner, workflow: options.workflow, branch, sha, definitions, version: pkg.version as string };
}

function printReleaseContext(context: ReleaseContext, log: typeof console.log) {
  const { repo, branch, version } = context;
  log(`\nRelease ${styleText('bold', styleText('cyan', repo))} from the remote branch ${styleText('bold', styleText('cyan', branch))} on GitHub.`);
  log(styleText('yellow', 'Local changes are excluded.'));
  log(`${styleText('dim', 'Current version:')} ${styleText('bold', version)}\n`);
}

function styleText(format: 'bold' | 'dim' | 'cyan' | 'green' | 'yellow' | 'red', value: string): string {
  if (!process.stdout.isTTY || process.env.NO_COLOR !== undefined) return value;
  // Early Node 20 versions do not provide util.styleText.
  return util.styleText?.(format, value) ?? value;
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
  if (!confirmed) log('Release cancelled.');
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

export function preview(current: string, channel: string, choice: string): string {
  if (!valid(current)) throw new Error(`Invalid package version: ${current}`);
  const operation = npmVersionOperation(current, channel, choice);
  const version = channel === 'stable' ? inc(current, operation) : inc(current, operation, channel);
  if (!version) throw new Error(`Cannot calculate version for ${channel} ${choice}`);
  return version;
}
