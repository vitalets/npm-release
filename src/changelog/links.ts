/**
 * Refreshes Keep a Changelog reference links while preserving the section content.
 */

import { extractReleasedVersions } from './parse.ts';

/**
 * Refreshes Keep a Changelog link references at the end of the file.
 */
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

/**
 * Removes the existing changelog link reference block.
 */
export function removeCompareLinks(text: string) {
  const lines = text.split('\n');
  const compareLinksStartIndex = lines.findIndex((line) => /^\[unreleased\]: /i.test(line));
  return compareLinksStartIndex === -1 ? text : lines.slice(0, compareLinksStartIndex).join('\n');
}

/**
 * Builds link references for Unreleased and every released version.
 */
export function buildCompareLinks(versions: string[], repositoryUrl: string) {
  return [
    `[unreleased]: ${repositoryUrl}/compare/v${versions[0]}...HEAD`,
    ...versions.map((version, index) =>
      buildVersionCompareLink(versions, repositoryUrl, version, index),
    ),
  ];
}

/**
 * Builds a tag or compare link reference for a released version.
 */
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

/**
 * Removes blank lines from the end of a line array.
 */
export function trimTrailingEmptyLines(lines: string[]) {
  while (lines.at(-1) === '') {
    lines.pop();
  }
}
