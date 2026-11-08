# Changelog merge fixtures

Each `.md` file is an executable scenario. The tests discover new files automatically;
`README.md` is excluded. Run them with:

```sh
node --test test/changelog-merge/*.test.ts
```

A fixture has a descriptive title followed by these sections, in order:

1. **Base** (`markdown`): the complete common ancestor.
2. **Ours** (`diff`): changes from Base to the first branch.
3. **Theirs** (`diff`): changes from Base to the second branch, independently of Ours.
4. **Expected** (`markdown`): the complete expected merged document.

For an unresolved scenario, replace Expected with **Expected status** (`text`),
containing `conflict` or `not-applicable`. An optional **Expected reason** (`regex`)
checks meaningful keywords in the reason, without requiring its exact wording.

## Diff notation

Diffs contain the entire document, not selected hunks:

- A leading space preserves a Base line.
- `-` removes a Base line.
- `+` adds a branch line.
- An empty line preserves an empty Base line. A single space does the same.
- A lone `+` or `-` adds or removes an empty line.

For example, `+- New feature` adds a Markdown bullet. `-- Old feature` removes one.
All context and removed lines must match Base exactly, in sequence. Every Base line
must be consumed. There are no filenames, hunk headers, line numbers, or fuzzy matches.
For an unchanged branch, write plain `No changes.` instead of a diff block:

```markdown
## Theirs

No changes.
```

This uses Base verbatim. The shorthand is accepted only for Ours and Theirs.
Complete unchanged diffs are also valid; an empty diff is valid only when Base is empty.

Use four-backtick fences around fixture blocks so that triple-backtick fences can
appear in the changelog content. The closing fence must match the opening fence.
The loader retains blank lines and indentation. Each nonempty block represents
content ending in LF; an empty block represents an empty document. CRLF and missing
final-newline behavior are covered separately in TypeScript tests.

Start with [local additions after a release](a-remote-release-preserves-published-entries-and-relocates-multiline-additions.md)
or [concurrent additions](independent-additions-at-the-same-position-retain-ours-then-theirs.md).
Expected documents are authored explicitly, never generated from the merge result.
