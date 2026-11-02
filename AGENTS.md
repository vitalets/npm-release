# npm-release — Agent Guidance

## Purpose

`npm-release` is a GitHub composite action that performs a complete npm package release. It resolves an explicit channel and version operation, updates the package version, manages release notes, commits and tags the result, publishes to npm, and creates a GitHub Release when applicable.

## Architecture

`action.yml` orchestrates the release. The runtime logic is split into two small TypeScript modules:

- `src/action/versioning.ts` validates the selected release operation and maps it to an npm version operation.
- `src/action/changelog.ts` stamps `CHANGELOG.md`, refreshes compare links, and extracts the notes used for the GitHub Release.

The action delegates version calculation to `npm version`. Stable releases then update the changelog, push the release commit and exact tag, publish to npm, and create a GitHub Release. Other channels publish prereleases under matching npm dist-tags but deliberately skip the changelog and GitHub Release.

Consumers prepare Node and npm authentication before invoking the action. The action itself owns the release mutation and publication flow.

## Important Rules

- Action runtime scripts in `src/action/` must remain dependency-free and use only Node.js built-ins. Action consumers do not install this repository's development dependencies.
- Action scripts run directly from their TypeScript source with Node.js 24 or newer. Do not introduce a required build or bundled action runtime artifact.
- Add changelog entries for meaningful user-facing changes. Skip tiny fixes, routine maintenance, and internal CI or documentation tweaks unless the user explicitly requests an entry.
- Record new changes only in the `[Unreleased]` section of `CHANGELOG.md`. Never modify an existing released version's changelog entries unless the user explicitly asks for it.

## Source file structure

When creating or editing TypeScript source files, read and follow
[the TypeScript file structure rule](.agents/rules/ts-file-structure.md).

## Tests

When creating or editing test files, read and follow
[the good tests rule](.agents/rules/good-tests.md).

## Planning

When the user asks for a plan, do not edit files until they explicitly ask to implement it.
Treat follow-up additions and corrections as updates to the plan, not permission to implement.
