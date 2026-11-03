/**
 * Provides Git inspection and guarded local update operations for the CLI.
 */
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reads the checked-out branch.
 */
export function getCurrentBranch(): string {
  return runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
}

/**
 * Checks for staged, unstaged, and untracked changes.
 */
export function isWorktreeClean(): boolean {
  return runGit(['status', '--porcelain', '--untracked-files=all']) === '';
}

/**
 * Detects unfinished Git operations.
 */
export function hasOperationInProgress(): boolean {
  return ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer']
    .some(name => existsSync(runGit(['rev-parse', '--git-path', name])));
}

/**
 * Reads the configured tracking branch.
 */
export function getUpstream(branch: string) {
  const rows = runGit(['for-each-ref', '--format=%(refname)%00%(upstream:remotename)%00%(upstream:remoteref)%00%(upstream)', `refs/heads/${branch}`]);
  const row = rows.split('\n').find(row => row.split('\0')[0] === `refs/heads/${branch}`);
  const [, remote, remoteRef, ref] = row?.split('\0') ?? [];
  return remote && remoteRef && ref ? { remote, remoteRef, ref } : undefined;
}

/**
 * Resolves a named remote URL.
 */
export function getRemoteUrl(remote: string): string {
  return runGit(['remote', 'get-url', '--', remote]);
}

/**
 * Refreshes remote branches without fetching tags.
 */
export function fetchRemote(remote: string): Promise<void> {
  return runGitAsync(['fetch', '--no-tags', '--no-recurse-submodules', '--', remote]);
}

/**
 * Counts local-only and remote-only commits.
 */
export function getAheadBehind(ref: string) {
  const [ahead, behind] = runGit(['rev-list', '--left-right', '--count', `HEAD...${ref}`, '--']).split(/\s+/).map(Number);
  return { ahead, behind };
}

/**
 * Updates the checkout only when it can fast-forward.
 */
export function pullRebase(): Promise<void> {
  // Refuse divergence or auto-stashing if the checkout changes after inspection.
  return runGitAsync(['pull', '--rebase', '--ff-only', '--no-autostash']);
}

/**
 * Selects a concrete release branch, defaulting to main.
 */
export function resolveBranch(requested?: string) {
  const branch = requested ?? 'main';
  if (!branch || branch.includes('*')) throw new Error('--branch must name a specific branch; wildcards are not allowed.');
  try {
    runGit(['check-ref-format', '--branch', branch]);
  } catch {
    throw new Error(`Invalid release branch: ${branch}. Pass a concrete Git branch name with --branch.`);
  }
  return branch;
}

/**
 * Identifies the checked-out commit for remote synchronization checks.
 */
export function getHeadSha() {
  return runGit(['rev-parse', 'HEAD']);
}

/**
 * Reads a tracked release file relative to the repository root.
 */
export function readReleaseFile(path: string) {
  const root = runGit(['rev-parse', '--show-toplevel']);
  try {
    runGit(['-C', root, 'ls-files', '--error-unmatch', '--', path]);
    return readFileSync(join(root, path), 'utf8');
  } catch {
    throw new Error(`Cannot read tracked release file ${path}. Ensure it exists in the repository root, is committed, and is pushed before releasing.`);
  }
}

function runGit(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function runGitAsync(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile('git', args, { encoding: 'utf8' }, error => {
      if (error) reject(error);
      else resolve();
    });
    child.stdin?.end();
  });
}
