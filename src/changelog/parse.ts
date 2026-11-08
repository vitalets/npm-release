/**
 * Reads release sections from Keep a Changelog Markdown without changing its text.
 */

export type ChangelogEntry = { text: string };
export type ChangelogCategory = { name: string; heading: string; entries: ChangelogEntry[] };
export type ChangelogBody = { leading: string; categories: ChangelogCategory[] };
export type ChangelogSection = { name: string; heading: string; body: string; raw: string };
export type ChangelogDocument = {
  prefix: string;
  unreleased: ChangelogSection;
  releases: ChangelogSection[];
  links: string;
  newline: string;
};

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

/**
 * Splits a changelog into verbatim sections, rejecting ambiguous heading layouts.
 */
export function parseChangelog(text: string): ChangelogDocument | undefined {
  const sections: ChangelogSection[] = [];
  let prefix = '';
  let links = '';
  let current: ChangelogSection | undefined;
  let fence = '';
  for (const line of splitLines(text)) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    const outsideFence = !fence;
    if (marker && !fence) fence = marker;
    else if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = '';

    if (outsideFence && /^\[[^\]]+\]:[ \t]/.test(line)) {
      links += line;
      continue;
    }
    if (links) {
      if (outsideFence && /^## /.test(line)) return undefined;
      links += line;
      continue;
    }
    if (outsideFence && /^## /.test(line)) {
      const name = line.match(/^## \[(Unreleased|\d+\.\d+\.\d+)\](?: - \d{4}-\d{2}-\d{2})?[ \t]*(?:\r?\n)?$/)?.[1];
      if (!name || sections.some((section) => section.name === name)) return undefined;
      current = { name, heading: line, body: '', raw: line };
      sections.push(current);
    } else if (current) {
      current.body += line;
      current.raw += line;
    } else {
      prefix += line;
    }
  }
  if (fence || sections[0]?.name !== 'Unreleased') return undefined;
  return {
    prefix,
    unreleased: sections[0],
    releases: sections.slice(1),
    links,
    newline: text.includes('\r\n') ? '\r\n' : '\n',
  };
}

/**
 * Reads flat or categorized bullets, preserving entry text and blank separators.
 * Standalone prose, fenced code, and ambiguous nested headings are unsupported.
 */
export function parseChangelogBody(text: string): ChangelogBody | undefined {
  const body: ChangelogBody = { leading: '', categories: [{ name: '', heading: '', entries: [] }] };
  let category = body.categories[0];
  let entry: ChangelogEntry | undefined;
  for (const line of splitLines(text)) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) return undefined;
    const heading = line.match(/^### ([^\r\n]+)(?:\r?\n)?$/);
    if (heading) {
      const name = heading[1].trim();
      if (!name || body.categories.some((item) => item.name === name)) return undefined;
      category = { name, heading: line, entries: [] };
      body.categories.push(category);
      entry = undefined;
    } else if (/^[-+*][ \t]+\S/.test(line)) {
      entry = { text: line };
      category.entries.push(entry);
    } else if (!line.trim()) {
      if (entry) entry.text += line;
      else if (category.name) category.heading += line;
      else body.leading += line;
    } else if (entry && /^(?: {2,}|\t)\S?/.test(line)) {
      entry.text += line;
    } else {
      return undefined;
    }
  }
  return body;
}

function splitLines(text: string) {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}
