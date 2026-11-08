/**
 * Merges changelog entries and release transitions without filesystem or Git access.
 */

import {
  parseChangelog,
  parseChangelogBody,
  type ChangelogBody,
  type ChangelogDocument,
  type ChangelogEntry,
} from '../parse.ts';
import { compareEntries, normalizeEntry } from './compare.ts';

export type MergeResult =
  | { status: 'merged'; text: string }
  | { status: 'not-applicable'; reason: string }
  | { status: 'conflict'; reason: string };

export type MergeInput = { base: string; ours: string; theirs: string };

type EntryChanges = {
  matches: Map<number, ChangelogEntry>;
  additions: Map<number, ChangelogEntry[]>;
};

/**
 * Combines independent entries while preserving published release history.
 * A not-applicable result permits text merging; a conflict requires review.
 */
export function mergeChangelog(input: MergeInput): MergeResult {
  if (input.ours === input.theirs) return { status: 'merged', text: input.ours };
  const base = parseChangelog(input.base);
  const ours = parseChangelog(input.ours);
  const theirs = parseChangelog(input.theirs);
  if (!base || !ours || !theirs) {
    return { status: 'conflict', reason: 'Cannot establish release membership from changelog headings' };
  }
  try {
    const oursReleased = hasNewReleases(base, ours);
    const theirsReleased = hasNewReleases(base, theirs);
    if (oursReleased && theirsReleased) {
      throw new Error('Both sides introduced release histories');
    }
    if (oursReleased || theirsReleased) {
      return mergeRelease(base, oursReleased ? ours : theirs, oursReleased ? theirs : ours, oursReleased);
    }
    return mergeDevelopment(base, ours, theirs);
  } catch (error) {
    return { status: 'conflict', reason: (error as Error).message };
  }
}

function mergeDevelopment(base: ChangelogDocument, ours: ChangelogDocument, theirs: ChangelogDocument): MergeResult {
  const bodies = [base, ours, theirs].map((document) => parseChangelogBody(document.unreleased.body));
  if (bodies.some((body) => !body)) {
    return { status: 'not-applicable', reason: 'Unsupported Unreleased Markdown' };
  }
  const [baseBody, oursBody, theirsBody] = bodies as ChangelogBody[];
  if (categoriesChanged(baseBody, oursBody) || categoriesChanged(baseBody, theirsBody)) {
    return { status: 'not-applicable', reason: 'Existing categories or entry categories changed' };
  }
  if (outsideUnreleased(base) !== outsideUnreleased(ours) || outsideUnreleased(base) !== outsideUnreleased(theirs)) {
    return { status: 'not-applicable', reason: 'Content outside Unreleased changed' };
  }
  const body = mergeBodies(baseBody, oursBody, theirsBody);
  return { status: 'merged', text: renderDocument(ours, body) };
}

function mergeRelease(
  base: ChangelogDocument,
  released: ChangelogDocument,
  development: ChangelogDocument,
  releaseIsOurs: boolean,
): MergeResult {
  if (outsideUnreleased(base) !== outsideUnreleased(development)) {
    throw new Error('Development changed content outside Unreleased during a release');
  }
  const newCount = released.releases.length - base.releases.length;
  if (newCount < 1 || released.releases.slice(newCount).map((section) => section.raw).join('') !==
      base.releases.map((section) => section.raw).join('')) {
    throw new Error('Existing release history changed');
  }
  const baseBody = requireBody(base.unreleased.body);
  const developmentBody = requireBody(development.unreleased.body);
  const releasedBody = requireBody(released.unreleased.body);
  const newReleases = released.releases.slice(0, newCount).map((section) => requireBody(section.body));
  if (categoriesChanged(baseBody, developmentBody)) {
    throw new Error('Categories changed during a release transition');
  }
  if (!newReleases.some((body) => containsOriginalEntries(baseBody, body))) {
    throw new Error('Cannot locate unchanged ancestor entries in a new release');
  }
  const additions = extractReleaseAdditions(baseBody, developmentBody);
  removePublishedAdditions(additions, newReleases);
  additions.categories = additions.categories.filter((category) => category.entries.length);
  const empty: ChangelogBody = { leading: '', categories: [] };
  const body = releaseIsOurs
    ? mergeBodies(empty, releasedBody, additions)
    : mergeBodies(empty, additions, releasedBody);
  // Keep the release document's existing category layout and surrounding whitespace.
  const order = new Map(releasedBody.categories.map((category, index) => [category.name, index]));
  body.categories.sort((left, right) => {
    if (!left.name) return -1;
    if (!right.name) return 1;
    return (order.get(left.name) ?? Infinity) - (order.get(right.name) ?? Infinity);
  });
  for (const category of body.categories) {
    const existing = releasedBody.categories.find((item) => item.name === category.name);
    if (existing) category.heading = existing.heading;
  }
  body.leading = releasedBody.leading;
  return { status: 'merged', text: renderDocument(released, body) };
}

function mergeBodies(base: ChangelogBody, ours: ChangelogBody, theirs: ChangelogBody): ChangelogBody {
  const names = [...new Set([...base.categories, ...ours.categories, ...theirs.categories].map((category) => category.name))];
  const categories = names.map((name) => {
    const original = base.categories.find((category) => category.name === name);
    const left = ours.categories.find((category) => category.name === name);
    const right = theirs.categories.find((category) => category.name === name);
    return {
      name,
      heading: (left ?? right ?? original)?.heading ?? '',
      entries: mergeEntries(original?.entries ?? [], left?.entries ?? [], right?.entries ?? []),
    };
  });
  return { leading: ours.leading, categories };
}

function mergeEntries(base: ChangelogEntry[], ours: ChangelogEntry[], theirs: ChangelogEntry[]) {
  const left = matchChanges(base, ours);
  const right = matchChanges(base, theirs);
  const leftAdditions = [...left.additions.values()].flat();
  for (const [anchor, additions] of right.additions) {
    right.additions.set(anchor, mergeAdditions(leftAdditions, additions).slice(leftAdditions.length));
  }
  const entries: ChangelogEntry[] = [];
  for (let index = -1; index < base.length; index++) {
    if (index >= 0) {
      const entry = mergeExistingEntry(base[index], left.matches.get(index), right.matches.get(index));
      if (entry) entries.push(entry);
    }
    entries.push(...mergeAdditions(left.additions.get(index) ?? [], right.additions.get(index) ?? []));
  }
  return entries;
}

function matchChanges(base: ChangelogEntry[], side: ChangelogEntry[]): EntryChanges {
  const matches = new Map<number, ChangelogEntry>();
  const positions = new Map<number, number>();
  // Reserve exact matches before considering similar wording.
  side.forEach((entry, position) => {
    const candidates = base.flatMap((original, index) => exact(original, entry) ? [index] : []);
    if (candidates.length > 1 || (candidates.length === 1 && matches.has(candidates[0]))) {
      throw new Error('Multiple possible matches for an existing entry');
    }
    if (candidates.length === 1) {
      matches.set(candidates[0], entry);
      positions.set(position, candidates[0]);
    }
  });
  side.forEach((entry, position) => {
    if (positions.has(position)) return;
    const candidates = base.flatMap((original, index) => {
      if (matches.has(index)) return [];
      return compareEntries(original.text, entry.text).status === 'different' ? [] : [index];
    });
    if (!candidates.length) return;
    if (candidates.length !== 1 || compareEntries(base[candidates[0]].text, entry.text).status !== 'same') {
      throw new Error('Uncertain matching of edited entries');
    }
    const index = candidates[0];
    const competitors = side.filter((other, otherPosition) => !positions.has(otherPosition) &&
      compareEntries(base[index].text, other.text).status !== 'different');
    if (competitors.length !== 1) throw new Error('Multiple possible wording revisions');
    matches.set(index, entry);
    positions.set(position, index);
  });
  const additions = new Map<number, ChangelogEntry[]>();
  let anchor = -1;
  side.forEach((entry, position) => {
    const index = positions.get(position);
    if (index !== undefined) {
      if (index < anchor) throw new Error('Existing entry order changed');
      anchor = index;
    } else {
      const group = additions.get(anchor) ?? [];
      group.push(entry);
      additions.set(anchor, group);
    }
  });
  return { matches, additions };
}

function mergeExistingEntry(base: ChangelogEntry, ours?: ChangelogEntry, theirs?: ChangelogEntry) {
  if (!ours && !theirs) return undefined;
  if (!ours || !theirs) {
    if (!exact(base, (ours ?? theirs)!)) throw new Error('An entry was deleted on one side and edited on the other');
    return undefined;
  }
  if (exact(ours, theirs)) return ours;
  if (exact(base, ours)) return theirs;
  if (exact(base, theirs)) return ours;
  throw new Error('Both sides changed the wording of an existing entry');
}

function mergeAdditions(ours: ChangelogEntry[], theirs: ChangelogEntry[]) {
  const entries = [...ours];
  for (const entry of theirs) {
    if (entries.some((other) => exact(other, entry))) continue;
    if (ours.some((other) => compareEntries(other.text, entry.text).status !== 'different')) {
      throw new Error('Concurrent additions have similar or uncertain wording');
    }
    entries.push(entry);
  }
  return entries;
}

function extractReleaseAdditions(base: ChangelogBody, development: ChangelogBody): ChangelogBody {
  const categories = development.categories.map((category) => {
    const originals = base.categories.find((item) => item.name === category.name)?.entries ?? [];
    const changes = matchChanges(originals, category.entries);
    if (originals.some((entry, index) => !changes.matches.has(index) || !exact(entry, changes.matches.get(index)!))) {
      throw new Error('Development edited or deleted an entry that was released');
    }
    return { ...category, entries: [...changes.additions.values()].flat() };
  });
  return { leading: development.leading, categories };
}

function removePublishedAdditions(additions: ChangelogBody, releases: ChangelogBody[]) {
  for (const category of additions.categories) {
    const published = releases.flatMap((body) => body.categories
      .filter((item) => item.name === category.name).flatMap((item) => item.entries));
    category.entries = category.entries.filter((entry) => {
      if (published.some((other) => exact(other, entry))) return false;
      if (published.some((other) => compareEntries(other.text, entry.text).status !== 'different')) {
        throw new Error('A new entry may be a revision of a published entry');
      }
      return true;
    });
  }
}

function containsOriginalEntries(base: ChangelogBody, released: ChangelogBody) {
  return base.categories.every((category) => {
    const entries = released.categories.find((item) => item.name === category.name)?.entries ?? [];
    let previous = -1;
    return category.entries.every((entry) => {
      const candidates = entries.flatMap((other, index) => exact(entry, other) ? [index] : []);
      if (candidates.length !== 1 || candidates[0] <= previous) return false;
      previous = candidates[0];
      return true;
    });
  });
}

function categoriesChanged(base: ChangelogBody, side: ChangelogBody) {
  const names = base.categories.filter((category) => category.name).map((category) => category.name);
  const retained = side.categories.filter((category) => names.includes(category.name)).map((category) => category.name);
  if (names.join('\n') !== retained.join('\n')) return true;
  return base.categories.some((category) => category.entries.some((entry) =>
    side.categories.some((other) => other.name !== category.name && other.entries.some((item) => exact(entry, item)))));
}

function renderDocument(document: ChangelogDocument, body: ChangelogBody) {
  const newline = document.newline;
  let text = body.leading;
  for (const category of body.categories) {
    if (category.name) text = appendBlock(text, category.heading, newline);
    for (const entry of category.entries) text = appendBlock(text, entry.text, newline);
  }
  if ((document.releases.length || document.links) && text.trim() && !text.endsWith(newline + newline)) {
    text = text.replace(/(?:\r?\n)*$/, '') + newline + newline;
  }
  return document.prefix + document.unreleased.heading + text +
    document.releases.map((section) => section.raw).join('') + document.links;
}

function appendBlock(text: string, block: string, newline: string) {
  if (text && !text.endsWith('\n')) text += newline;
  return text + block;
}

function requireBody(text: string) {
  const body = parseChangelogBody(text);
  if (!body) throw new Error('Unsupported Markdown during a release transition');
  return body;
}

function hasNewReleases(base: ChangelogDocument, side: ChangelogDocument) {
  return side.releases.some((section) => !base.releases.some((original) => original.name === section.name));
}

function outsideUnreleased(document: ChangelogDocument) {
  return document.prefix + document.unreleased.heading + document.releases.map((section) => section.raw).join('') + document.links;
}

function exact(left: ChangelogEntry, right: ChangelogEntry) {
  return normalizeEntry(left.text) === normalizeEntry(right.text);
}
