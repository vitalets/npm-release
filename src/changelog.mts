/**
 * Finalizes CHANGELOG.md for a release: stamps the [Unreleased] section with
 * the given version and today's date, refreshes compare links at the bottom,
 * opens a fresh [Unreleased] section above it, and prints the release notes to
 * stdout for use in CI (e.g. GitHub Release body).
 *
 * Runtime usage (Node.js ≥ 24):
 *   node src/changelog.mts <version>
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const CHANGELOG_PATH = 'CHANGELOG.md';
const logger = console;

const version = process.argv[2];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

/** Updates the changelog for the requested release version. */
function main() {
  if (!version) {
    logger.error('Usage: changelog.mts <version>');
    process.exit(1);
  }

  const content = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const repositoryUrl = getRepositoryUrl();
  const newContent = updateCompareLinks(stampChangelog(content, version), repositoryUrl);
  fs.writeFileSync(CHANGELOG_PATH, newContent);
  const releaseNotes = extractReleaseNotes(newContent, version);
  logger.log(releaseNotes);
}

/** Converts the Unreleased section into a dated release section. */
export function stampChangelog(text: string, version: string) {
  const date = new Date().toISOString().slice(0, 10);
  const updated = text.replace('## [Unreleased]', `## [Unreleased]\n\n## [${version}] - ${date}`);
  if (updated === text) {
    logger.error('Could not find "## [Unreleased]" section in CHANGELOG.md');
    process.exit(1);
  }
  return updated;
}

/** Reads the section body for a released version. */
export function extractReleaseNotes(text: string, version: string) {
  const lines = text.split('\n');
  const headingIndex = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  const bodyLines = [];
  for (let i = headingIndex + 1; i < lines.length; i++) {
    if (lines[i]?.startsWith('## ')) break;
    bodyLines.push(lines[i]);
  }
  return bodyLines.join('\n').trim();
}

/** Refreshes Keep a Changelog link references at the end of the file. */
export function updateCompareLinks(text: string, repositoryUrl: string) {
  const versions = extractReleasedVersions(text);
  const lines = removeCompareLinks(text).split('\n');
  trimTrailingEmptyLines(lines);

  if (versions.length === 0) {
    return `${lines.join('\n')}\n`;
  }

  lines.push('', ...buildCompareLinks(versions, repositoryUrl));
  return `${lines.join('\n')}\n`;
}

/** Extracts released version numbers from changelog headings. */
export function extractReleasedVersions(text: string) {
  return text
    .split('\n')
    .map((line) => line.match(/^## \[(\d+\.\d+\.\d+)\] - \d{4}-\d{2}-\d{2}$/)?.[1])
    .filter((version): version is string => Boolean(version));
}

/** Removes the existing changelog link reference block. */
export function removeCompareLinks(text: string) {
  const lines = text.split('\n');
  const compareLinksStartIndex = lines.findIndex((line) => /^\[unreleased\]: /i.test(line));
  return compareLinksStartIndex === -1 ? text : lines.slice(0, compareLinksStartIndex).join('\n');
}

/** Builds link references for Unreleased and every released version. */
export function buildCompareLinks(versions: string[], repositoryUrl: string) {
  return [
    `[unreleased]: ${repositoryUrl}/compare/v${versions[0]}...HEAD`,
    ...versions.map((version, index) =>
      buildVersionCompareLink(versions, repositoryUrl, version, index),
    ),
  ];
}

/** Builds a tag or compare link reference for a released version. */
export function buildVersionCompareLink(
  versions: string[],
  repositoryUrl: string,
  version: string,
  index: number,
) {
  const previousVersion = versions[index + 1];
  const url = previousVersion
    ? `${repositoryUrl}/compare/v${previousVersion}...v${version}`
    : `${repositoryUrl}/releases/tag/v${version}`;
  return `[${version}]: ${url}`;
}

/** Removes blank lines from the end of a line array. */
export function trimTrailingEmptyLines(lines: string[]) {
  while (lines.at(-1) === '') {
    lines.pop();
  }
}

/** Builds the current repository URL from GitHub Actions environment variables. */
export function getRepositoryUrl(env: NodeJS.ProcessEnv = process.env) {
  const serverUrl = env.GITHUB_SERVER_URL?.replace(/\/+$/, '');
  const repository = env.GITHUB_REPOSITORY?.replace(/^\/+|\/+$/g, '');
  if (!serverUrl || !repository) {
    logger.error('Could not determine repository URL from GitHub Actions environment');
    process.exit(1);
  }
  return `${serverUrl}/${repository}`;
}
