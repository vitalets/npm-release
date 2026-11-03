/**
 * Runs the real CLI interaction with simulated Git and GitHub responses.
 * Reads local release files without requiring commits, credentials, or network access.
 */
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { release } from '../src/cli/index.ts';
import { parseCliArgs } from '../src/cli/args.ts';
import { collectInputs, confirmRelease } from '../src/cli/cli-inputs.ts';
import { Gh, type Runner } from '../src/cli/gh.ts';
import * as git from '../src/cli/git.ts';
import { withSpinner } from '../src/cli/spinner.ts';

await main();

async function main() {
  try {
    const args = process.argv.slice(2);
    const options = parseCliArgs(args.length ? args : ['.github/workflows/example.yml']);
    if (options.help) {
      console.log('Usage: npm run demo:cli -- [.github/workflows/example.yml] [--branch <name>]');
      return;
    }
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run this demo in an interactive terminal.');
    const branch = options.branch ?? 'main';
    console.log('DEMO: Git state, workflow runs, and local updates are simulated. Nothing is published or changed.');
    await release(options, {
      github: createDemoGithub(),
      git: {
        ...git,
        resolveBranch: requested => {
          if (requested?.includes('*')) throw new Error('Pass a concrete branch name.');
          return requested ?? 'main';
        },
        getCurrentBranch: () => branch,
        getHeadSha: () => 'demo-sha',
        isWorktreeClean: () => true,
        hasOperationInProgress: () => false,
        readReleaseFile: path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'),
      },
      collect: collectInputs,
      confirm: confirmRelease,
      updateLocal: async (target, log = console.log) => {
        if (target.dryRun) {
          log('Local update skipped: dry run.');
          return;
        }
        await withSpinner('Fetching release changes…', () => setTimeout(500));
        await withSpinner('Updating local branch…', () => setTimeout(500));
        log('✔ Local branch updated (simulated).');
      },
      log: console.log,
    });
  } catch (error) {
    console.error((error as Error).name === 'ExitPromptError' ? 'Demo cancelled.' : (error as Error).message);
    process.exitCode = 1;
  }
}

function createDemoGithub() {
  let polls = 0;
  const run: Runner = (_command, args, input) => {
    if (args[0] === 'repo') return JSON.stringify({ nameWithOwner: 'demo/package' });
    if (args[0] === 'api' && args[1]?.startsWith('repos/demo/package/branches/')) return JSON.stringify({ commit: { sha: 'demo-sha' } });
    if (args[0] === 'workflow' && args[1] === 'run') {
      console.log('\nSimulated workflow inputs:', JSON.parse(input!));
      return 'https://example.invalid/demo/package/actions/runs/123';
    }
    if (args[0] === 'run' && args[1] === 'view') {
      return JSON.stringify(++polls === 1
        ? { status: 'in_progress', conclusion: null }
        : { status: 'completed', conclusion: 'success' });
    }
    throw new Error(`Unexpected demo GitHub request: ${args.join(' ')}`);
  };
  return new Gh(run);
}
