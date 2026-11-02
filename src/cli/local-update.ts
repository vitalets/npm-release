import * as git from './git.ts';
import { withSpinner } from './spinner.ts';

type ReleaseTarget = { repo: string; host: string; branch: string; dryRun: boolean };
type GitHelpers = Pick<typeof git, 'getCurrentBranch' | 'isWorktreeClean' | 'hasOperationInProgress' |
  'getUpstream' | 'getRemoteUrl' | 'fetchRemote' | 'getAheadBehind' | 'pullRebase'>;

export async function updateLocal(target: ReleaseTarget, log: typeof console.log = console.log, helpers: GitHelpers = git) {
  if (target.dryRun) {
    log('Local update skipped: dry run.');
    return;
  }
  try {
    await updateBranch(target, helpers, log);
  } catch (error) {
    log(`Release succeeded; local update failed: ${(error as Error).message}`);
    log('Check your Git status before retrying:\ngit status\ngit pull --rebase');
  }
}

async function updateBranch(target: ReleaseTarget, helpers: GitHelpers, log: typeof console.log) {
  const upstream = inspectCheckout(target, helpers, log);
  if (!upstream) return;

  await withSpinner('Fetching release changes…', () => helpers.fetchRemote(upstream.remote));

  // The user may change the checkout while the fetch is running.
  const latestUpstream = inspectCheckout(target, helpers, log);
  if (!latestUpstream) return;
  if (JSON.stringify(latestUpstream) !== JSON.stringify(upstream)) {
    log('Local update skipped: upstream changed during fetch. Review your branch configuration.');
    return;
  }

  const { ahead, behind } = helpers.getAheadBehind(upstream.ref);
  if (ahead > 0) {
    log('Local update skipped: local-only commits. Review them before rebasing:\ngit log @{upstream}..HEAD\ngit pull --rebase');
    return;
  }
  if (behind === 0) {
    log('✔ Already up to date.');
    return;
  }
  await withSpinner('Updating local branch…', () => helpers.pullRebase());
  log('✔ Local branch updated.');
}

function inspectCheckout(target: ReleaseTarget, helpers: GitHelpers, log: typeof console.log) {
  const branch = helpers.getCurrentBranch();
  if (branch === 'HEAD' || branch !== target.branch) {
    log(`Local update skipped: ${branch === 'HEAD' ? 'detached HEAD' : `you’re on ${branch}`}.`);
    log(`When ready, switch to the release branch and check its upstream before pulling:\ngit switch -- ${quoteBranch(target.branch)}\ngit status -sb\ngit pull --rebase`);
    return;
  }
  if (helpers.hasOperationInProgress()) {
    log('Local update skipped: a Git operation is in progress. Finish or abort it, then run:\ngit pull --rebase');
    return;
  }
  if (!helpers.isWorktreeClean()) {
    log('Local update skipped: uncommitted changes.\nCommit or stash them, then run:\ngit pull --rebase');
    return;
  }
  const upstream = helpers.getUpstream(branch);
  if (!upstream || upstream.remote === '.' || upstream.remoteRef !== `refs/heads/${target.branch}` ||
      !matchesRepository(helpers.getRemoteUrl(upstream.remote), target)) {
    log(`Local update skipped: upstream does not track ${target.host}/${target.repo}, branch ${target.branch}.`);
    log('Configure the matching upstream, then run:\ngit pull --rebase');
    return;
  }
  return upstream;
}

function matchesRepository(remoteUrl: string, target: ReleaseTarget): boolean {
  try {
    const url = new URL(remoteUrl.includes('://') ? remoteUrl : remoteUrl.replace(/^([^@]+@)?([^:]+):/, 'ssh://$1$2/'));
    const repo = decodeURIComponent(url.pathname).replace(/^\//, '').replace(/\/$/, '').replace(/\.git$/, '');
    return ['https:', 'http:', 'ssh:'].includes(url.protocol) &&
      url.host.toLowerCase() === target.host.toLowerCase() && repo.toLowerCase() === target.repo.toLowerCase();
  } catch {
    return false;
  }
}

function quoteBranch(branch: string): string {
  return /^[a-zA-Z0-9_./-]+$/.test(branch) ? branch : `'${branch.replaceAll("'", "'\\''")}'`;
}
