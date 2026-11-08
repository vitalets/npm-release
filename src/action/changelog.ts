/**
 * Finalizes CHANGELOG.md for a release: stamps the [Unreleased] section with
 * the given version and today's date, refreshes compare links at the bottom,
 * opens a fresh [Unreleased] section above it, and prints the release notes to
 * stdout for use in CI (e.g. GitHub Release body).
 *
 * Runtime usage (Node.js ≥ 24):
 *   node src/action/changelog.ts <version>
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { extractReleaseNotes } from '../changelog/parse.ts';
import { stampChangelog } from '../changelog/release.ts';
import { updateCompareLinks } from '../changelog/links.ts';
import { getRepositoryUrl } from '../utils/repo.ts';
import { logger } from '../utils/logger.ts';

/**
 * Changelog file in the consumer's working directory.
 */
const CHANGELOG_PATH = 'CHANGELOG.md';

/**
 * Release version supplied by the action.
 */
const version = process.argv[2];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

/**
 * Updates the changelog for the requested release version.
 */
function main() {
  if (!version) {
    logger.error('Usage: changelog.ts <version>');
    process.exit(1);
  }

  const content = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const repositoryUrl = getRepositoryUrl();
  const newContent = updateCompareLinks(stampChangelog(content, version), repositoryUrl);
  fs.writeFileSync(CHANGELOG_PATH, newContent);
  const releaseNotes = extractReleaseNotes(newContent, version);
  logger.log(releaseNotes);
}
