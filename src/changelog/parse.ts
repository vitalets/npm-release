/**
 * Reads release sections from Keep a Changelog Markdown without changing its text.
 */

/**
 * Reads the section body for a released version.
 */
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

/**
 * Extracts released version numbers from changelog headings.
 */
export function extractReleasedVersions(text: string) {
  return text
    .split('\n')
    .map((line) => line.match(/^## \[(\d+\.\d+\.\d+)\] - \d{4}-\d{2}-\d{2}$/)?.[1])
    .filter((version): version is string => Boolean(version));
}
