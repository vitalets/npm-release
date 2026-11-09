/**
 * Discovers a working tree and registers the changelog driver in local Git config.
 */

import { spawnSync } from 'node:child_process';
import { logger } from '../../utils/logger.ts';

/**
 * Package-qualified command used by Git to merge changelog temporary files.
 */
const DRIVER = 'npx --yes @vitalets/npm-release changelog-merge "%O" "%A" "%B"';

/**
 * Git config representation of the registered merge driver.
 */
export const MERGE_DRIVER_CONFIG = `[merge "keep-a-changelog"]
    driver = ${DRIVER.replaceAll('"', '\\"')}`;

/**
 * Finds the repository root, skipping environments without Git or a working tree.
 */
export function findWorkingTree() {
  const checkout = runGit(['rev-parse', '--is-inside-work-tree']);
  if ((checkout.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    logger.log('Skipping changelog merge setup: Git is unavailable.');
    return undefined;
  }
  if ((checkout.status === 128 && /not a git repository/.test(checkout.stderr)) ||
      (checkout.status === 0 && checkout.stdout.trim() !== 'true')) {
    logger.log('Skipping changelog merge setup: no Git working tree.');
    return undefined;
  }
  checkGitResult(checkout);
  const root = runGit(['rev-parse', '--show-toplevel']);
  checkGitResult(root);
  return root.stdout.trim();
}

/**
 * Replaces the local driver settings without accumulating duplicate values.
 */
export function configureMergeDriver() {
  const driver = readLocalConfig('merge.keep-a-changelog.driver');
  if (driver === `${DRIVER}\n`) return 'unchanged';
  checkGitResult(runGit(['config', '--local', '--replace-all', 'merge.keep-a-changelog.driver', DRIVER]));
  return 'updated';
}

function readLocalConfig(key: string) {
  const result = runGit(['config', '--local', '--get-all', key]);
  if (result.status === 1) return '';
  checkGitResult(result);
  return result.stdout;
}

function runGit(args: string[]) {
  return spawnSync('git', args, { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
}

function checkGitResult(result: ReturnType<typeof runGit>) {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `Git setup failed (${result.signal ?? result.status})`);
  }
}
