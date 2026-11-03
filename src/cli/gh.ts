/**
 * Accesses GitHub repository metadata and dispatches and monitors releases.
 */
import { execFile, execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

/**
 * Runs short GitHub metadata requests synchronously.
 */
const execute: Runner = (command, args, input) => execFileSync(command, args, {
  encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'],
});

/**
 * Runs dispatch and monitoring requests without blocking the terminal.
 */
const executeAsync: AsyncRunner = (command, args, input) => new Promise((resolve, reject) => {
  const child = execFile(command, args, { encoding: 'utf8' }, (error, stdout) => {
    if (error) reject(error);
    else resolve(stdout);
  });
  child.stdin?.on('error', () => {}); // Process failures are reported by the callback.
  child.stdin?.end(input);
});

export type Runner = (command: string, args: string[], input?: string) => string;
export type AsyncRunner = (command: string, args: string[], input?: string) => Promise<string>;
export class Gh {
  private run: Runner;
  private runAsync: AsyncRunner;
  constructor(run: Runner = execute, runAsync: AsyncRunner = run === execute ? executeAsync : async (...args) => run(...args)) {
    this.run = run;
    this.runAsync = runAsync;
  }

  getRepository() {
    return JSON.parse(this.run('gh', ['repo', 'view', '--json', 'nameWithOwner'])) as {
      nameWithOwner: string;
    };
  }

  getBranchSha(repo: string, branch: string): string {
    const result = JSON.parse(this.run('gh', ['api', `repos/${repo}/branches/${encodeURIComponent(branch)}`]));
    return result.commit.sha;
  }

  runWorkflow(repo: string, workflow: string, branch: string, inputs: Record<string, string>) {
    return this.runAsync('gh', ['workflow', 'run', workflow.split('/').at(-1)!,
      '--repo', repo, '--ref', branch, '--json'], JSON.stringify(inputs));
  }

  async waitForWorkflowRun(repo: string, runId: string, interval = 3000): Promise<string> {
    while (true) {
      const output = await this.runAsync('gh', ['run', 'view', runId,
        '--repo', repo, '--json', 'status,conclusion']);
      const run = JSON.parse(output) as { status: string; conclusion: string | null };
      if (run.status === 'completed') return run.conclusion ?? 'unknown';
      await setTimeout(interval);
    }
  }
}
