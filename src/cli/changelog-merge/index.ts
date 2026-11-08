/**
 * Adapts changelog merging to Git's temporary-file and exit-code contract.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeChangelog, type MergeInput } from '../../changelog/merge/index.ts';
import { logger } from '../../utils/logger.ts';

/**
 * Documents the argument order used by Git's %O, %A, and %B placeholders.
 */
const USAGE = 'Usage: npx --yes @vitalets/npm-release changelog-merge <base> <ours> <theirs>';

/**
 * Writes the merge result to ours and returns zero for success or one for conflict.
 * Invalid input and operational failures throw before claiming a successful merge.
 */
export function runChangelogMerge(args: string[]) {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    logger.log(`${USAGE}\n\nOverwrites <ours>. Exits 0 when merged, nonzero on conflict or error.\nUses git merge-file when ordinary text merging is appropriate.`);
    return 0;
  }
  if (args.length !== 3 || args.some((arg) => !arg)) throw new Error(USAGE);
  const [basePath, oursPath, theirsPath] = args.map((arg) => resolve(arg));
  const input = {
    base: readFileSync(basePath, 'utf8'),
    ours: readFileSync(oursPath, 'utf8'),
    theirs: readFileSync(theirsPath, 'utf8'),
  };
  const result = mergeChangelog(input);
  if (result.status === 'merged') {
    writeFileSync(oursPath, result.text);
    return 0;
  }
  if (result.status === 'not-applicable') {
    return mergeText(basePath, oursPath, theirsPath);
  }
  writeFileSync(oursPath, formatConflict(input));
  logger.error(`Changelog merge requires manual resolution: ${result.reason}`);
  return 1;
}

function mergeText(basePath: string, oursPath: string, theirsPath: string) {
  const result = spawnSync('git', [
    'merge-file', '--diff3', '-L', 'ours', '-L', 'base', '-L', 'theirs',
    '--', oursPath, basePath, theirsPath,
  ], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (result.error) throw result.error;
  if (result.status === null || result.status > 127) {
    throw new Error(`git merge-file failed (${result.signal ?? result.status})`);
  }
  return result.status === 0 ? 0 : 1;
}

function formatConflict(input: MergeInput) {
  const newline = input.ours.includes('\r\n') ? '\r\n' : '\n';
  return `<<<<<<< ours${newline}${endLine(input.ours, newline)}` +
    `||||||| base${newline}${endLine(input.base, newline)}` +
    `=======${newline}${endLine(input.theirs, newline)}>>>>>>> theirs${newline}`;
}

function endLine(text: string, newline: string) {
  return text && !text.endsWith('\n') ? text + newline : text;
}
