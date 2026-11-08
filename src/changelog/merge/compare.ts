/**
 * Compares changelog entry wording without deciding which version to keep.
 */

/**
 * Minimum similarity for treating longer entries as possible revisions.
 */
const SIMILARITY_THRESHOLD = 0.9;

/**
 * Short entries need exact matches because small edits can change their meaning.
 */
const MIN_WORDS = 5;

/**
 * Common words that do not establish a relationship between entries.
 */
const STOP_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'is', 'it']);

export type EntryComparison = {
  status: 'same' | 'different' | 'uncertain';
  reason: string;
};

/**
 * Identifies exact matches, likely revisions, and unrelated entry descriptions.
 */
export function compareEntries(ours: string, theirs: string): EntryComparison {
  const left = normalizeEntry(ours);
  const right = normalizeEntry(theirs);
  if (left === right) return { status: 'same', reason: 'Exact normalized match' };

  const leftWords = getWords(left);
  const rightWords = getWords(right);
  if (Math.min(leftWords.length, rightWords.length) >= MIN_WORDS) {
    const similarity = 1 - editDistance(left, right) / Math.max(left.length, right.length);
    if (similarity >= SIMILARITY_THRESHOLD) {
      return { status: 'same', reason: 'Likely wording revision' };
    }
  }

  const meaningfulWords = new Set(leftWords.filter((word) => !STOP_WORDS.has(word)));
  const rightMeaningfulWords = rightWords.filter((word) => !STOP_WORDS.has(word));
  if (meaningfulWords.size && rightMeaningfulWords.length &&
      !rightMeaningfulWords.some((word) => meaningfulWords.has(word))) {
    return { status: 'different', reason: 'No shared meaningful words' };
  }
  return { status: 'uncertain', reason: 'Overlapping wording without a clear match' };
}

/**
 * Normalizes entry boundaries and bullet markers while retaining internal Markdown.
 */
export function normalizeEntry(text: string) {
  return text.replace(/\r\n/g, '\n').trim().replace(/^[-+*][ \t]+/, '');
}

function getWords(text: string) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function editDistance(left: string, right: string) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row++) {
    const current = [row];
    for (let column = 1; column <= right.length; column++) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + Number(left[row - 1] !== right[column - 1]),
      );
    }
    previous = current;
  }
  return previous[right.length];
}
