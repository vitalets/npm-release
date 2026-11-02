import { execFile, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

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

export function getCurrentBranch(): string {
  return runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
}

export function isWorktreeClean(): boolean {
  return runGit(['status', '--porcelain', '--untracked-files=all']) === '';
}

export function hasOperationInProgress(): boolean {
  return ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer']
    .some(name => existsSync(runGit(['rev-parse', '--git-path', name])));
}

export function getUpstream(branch: string) {
  const rows = runGit(['for-each-ref', '--format=%(refname)%00%(upstream:remotename)%00%(upstream:remoteref)%00%(upstream)', `refs/heads/${branch}`]);
  const row = rows.split('\n').find(row => row.split('\0')[0] === `refs/heads/${branch}`);
  const [, remote, remoteRef, ref] = row?.split('\0') ?? [];
  return remote && remoteRef && ref ? { remote, remoteRef, ref } : undefined;
}

export function getRemoteUrl(remote: string): string {
  return runGit(['remote', 'get-url', '--', remote]);
}

export function fetchRemote(remote: string): Promise<void> {
  return runGitAsync(['fetch', '--no-tags', '--no-recurse-submodules', '--', remote]);
}

export function getAheadBehind(ref: string) {
  const [ahead, behind] = runGit(['rev-list', '--left-right', '--count', `HEAD...${ref}`, '--']).split(/\s+/).map(Number);
  return { ahead, behind };
}

export function pullRebase(): Promise<void> {
  // Refuse divergence or auto-stashing if the checkout changes after inspection.
  return runGitAsync(['pull', '--rebase', '--ff-only', '--no-autostash']);
}

export function resolveBranch(requested: string | undefined, defaultBranch: string, current: () => string) {
  const branch = requested === '*' ? current().trim() : requested ?? defaultBranch;
  if (!branch || branch === 'HEAD') throw new Error('Cannot release from detached HEAD; provide --branch explicitly.');
  return branch;
}
