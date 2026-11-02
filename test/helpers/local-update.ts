/**
 * Provides simulated checkouts and temporary Git repositories for local-update tests.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import type * as git from '../../src/cli/git.ts';

/**
 * Creates a clean matching checkout with recorded Git operations and log messages.
 */
export function createScenario() {
  const calls: string[] = [];
  const messages: string[] = [];
  const helpers = {
    getCurrentBranch: () => 'main',
    isWorktreeClean: () => true,
    hasOperationInProgress: () => false,
    getUpstream: (): ReturnType<typeof git.getUpstream> => ({ remote: 'origin', remoteRef: 'refs/heads/main', ref: 'refs/remotes/origin/main' }),
    getRemoteUrl: () => 'git@github.com:owner/package.git',
    fetchRemote: async () => { calls.push('fetch'); },
    getAheadBehind: () => ({ ahead: 0, behind: 1 }),
    pullRebase: async () => { calls.push('pull'); },
  };
  const log = (message: string) => { messages.push(message); };
  return { helpers, calls, messages, log };
}

/**
 * Creates local and publisher clones, enters the local checkout, and registers cleanup.
 */
export function createGitRepository(context: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'npm-release-local-update-'));
  const remote = join(root, 'remote.git');
  const local = join(root, 'local');
  const publisher = join(root, 'publisher');
  const previousCwd = process.cwd();
  context.after(() => {
    process.chdir(previousCwd);
    rmSync(root, { recursive: true, force: true });
  });
  runGit(root, 'init', '--bare', '--initial-branch=main', remote);
  runGit(root, 'clone', remote, local);
  runGit(local, 'config', 'user.name', 'Test');
  runGit(local, 'config', 'user.email', 'test@example.com');
  writeFileSync(join(local, 'version.txt'), '1.0.0');
  runGit(local, 'add', '.');
  runGit(local, 'commit', '-m', 'initial');
  runGit(local, 'push', '-u', 'origin', 'main');
  runGit(root, 'clone', remote, publisher);
  runGit(publisher, 'config', 'user.name', 'Test');
  runGit(publisher, 'config', 'user.email', 'test@example.com');

  process.chdir(local);
  return {
    publishVersion(version: string) {
      writeFileSync(join(publisher, 'version.txt'), version);
      runGit(publisher, 'commit', '-am', 'foo');
      runGit(publisher, 'push');
    },
    commitLocalVersion(version: string) {
      writeFileSync(join(local, 'version.txt'), version);
      runGit(local, 'commit', '-am', 'bar');
    },
    localHead: () => runGit(local, 'rev-parse', 'HEAD'),
    publishedHead: () => runGit(publisher, 'rev-parse', 'HEAD'),
    writeUntrackedFile: () => writeFileSync(join(local, 'foo.txt'), 'foo'),
    detach: () => runGit(local, 'checkout', '--detach'),
  };
}

function runGit(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
}
