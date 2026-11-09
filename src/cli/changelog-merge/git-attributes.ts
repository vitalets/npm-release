/**
 * Ensures the repository root selects the changelog merge driver, preserving existing attributes.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Selects the merge driver for the root changelog.
 */
export const CHANGELOG_ATTRIBUTE = '/CHANGELOG.md merge=keep-a-changelog';

/**
 * Adds the changelog merge rule to root .gitattributes when it is missing.
 */
export function ensureAttributes(root: string) {
  const path = join(root, '.gitattributes');
  let content = '';
  let existed = true;
  try {
    content = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    existed = false;
  }
  const hasRule = content.split(/\r?\n/).some((line) => {
    const [pattern, ...attributes] = line.trim().split(/\s+/);
    return /^"?\/?CHANGELOG\.md"?$/.test(pattern) && attributes.includes('merge=keep-a-changelog');
  });
  if (hasRule) return 'unchanged';
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const separator = content && !content.endsWith('\n') ? newline : '';
  writeFileSync(path, `${content}${separator}${CHANGELOG_ATTRIBUTE}${newline}`);
  return existed ? 'updated' : 'created';
}
