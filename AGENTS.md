# npm-release — Agent Guidance

## Purpose

`npm-release` is a GitHub composite action that performs a complete npm package release. It resolves an explicit stable or beta version operation, updates the package version, manages release notes, commits and tags the result, publishes to npm, and creates a GitHub Release when applicable.

## Architecture

`action.yml` orchestrates the release. The runtime logic is split into two small TypeScript modules:

- `src/versioning.mts` validates the selected release operation and maps it to an npm version operation.
- `src/changelog.mts` stamps `CHANGELOG.md`, refreshes compare links, and extracts the notes used for the GitHub Release.

The action delegates version calculation to `npm version`. Stable releases then update the changelog, push the release commit and exact tag, publish to npm, and create a GitHub Release. Beta releases publish a prerelease but deliberately skip the changelog and GitHub Release.

Consumers prepare Node and npm authentication before invoking the action. The action itself owns the release mutation and publication flow.

## Important Rules

- Runtime scripts must remain dependency-free and use only Node.js built-ins. Consumers do not install this repository's development dependencies.
- Scripts run directly from their TypeScript source with Node.js 24 or newer. Do not introduce a required build or bundled runtime artifact.
