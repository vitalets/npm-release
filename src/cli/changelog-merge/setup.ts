/**
 * Registers the changelog merge driver and its repository attribute rule.
 */

import { logger } from '../../utils/logger.ts';
import { ensureAttributes } from './git-attributes.ts';
import { findWorkingTree, configureMergeDriver } from './git-config.ts';

/**
 * Describes the setup command, which takes no configuration arguments.
 */
const USAGE = 'Usage: npx --yes @vitalets/npm-release changelog-merge-setup';

/**
 * Installs repeatable local configuration and ensures the root attribute rule.
 * Skips environments without Git or a working tree so prepare can run there.
 */
export function runChangelogMergeSetup(args: string[]) {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    logger.log(`${USAGE}\n\nRegisters keep-a-changelog in local Git config and ensures the root .gitattributes rule.\nSafe to repeat from prepare. Skips when Git or a working tree is unavailable.`);
    return 0;
  }
  if (args.length) throw new Error(USAGE);
  const root = findWorkingTree();
  if (root === undefined) return 0;
  configureMergeDriver();
  ensureAttributes(root);
  logger.log('Configured keep-a-changelog merge driver in local Git config.');
  return 0;
}
