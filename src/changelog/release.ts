/**
 * Stamps the Unreleased section and opens a new section for future changes.
 */

import { logger } from '../utils/logger.ts';

/**
 * Converts the Unreleased section into a dated release section.
 */
export function stampChangelog(text: string, version: string) {
  const date = new Date().toISOString().slice(0, 10);
  const updated = text.replace('## [Unreleased]', `## [Unreleased]\n\n## [${version}] - ${date}`);
  if (updated === text) {
    logger.error('Could not find "## [Unreleased]" section in CHANGELOG.md');
    process.exit(1);
  }
  return updated;
}
