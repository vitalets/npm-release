# npm-release

[![Test](https://github.com/vitalets/npm-release/actions/workflows/test.yml/badge.svg)](https://github.com/vitalets/npm-release/actions/workflows/test.yml)

A GitHub composite action that performs a full npm package release:

1. Applies an explicit release channel and version increment to `package.json`
2. Updates `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com) format
3. Commits, tags, and pushes the release commit
4. Publishes to npm via **OIDC trusted publishing** — no stored npm token required
5. Creates a GitHub Release with the extracted changelog notes

## Prerequisites

### 1. Enable OIDC Trusted Publishing

This action publishes to npm using [OIDC Trusted Publishing](https://docs.npmjs.com/generating-provenance-statements#publishing-with-a-trusted-publisher) — no `NPM_TOKEN` secret needed. Configure your package on npmjs.com:

1. Go to your package on [npmjs.com](https://www.npmjs.com) → **Access** → **Trusted Publishers**
2. Add a new trusted publisher:
   - **Publisher**: GitHub Actions
   - **Repository owner**: your GitHub username or org
   - **Repository name**: your repository
   - **Workflow filename**: the workflow file that calls this action (e.g. `release.yml`)

### 2. Add CHANGELOG.md

Your repository must have a `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com) format with an `## [Unreleased]` section:

```markdown
# Changelog

## [Unreleased]

- New feature 1
- New feature 2
...
```

## Usage

### 1. Setup release workflow

Copy-paste the following workflow to `.github/workflows/release.yml`:

```yaml
name: release

on:
  workflow_dispatch:
    inputs:
      channel:
        description: Channel
        required: true
        type: choice
        default: '-'
        options:
          - '-'
          - stable
          - next
      version:
        description: Version
        required: true
        type: choice
        default: patch
        options:
          - patch
          - minor
          - major
      skip-npm-publish:
        description: Skip NPM publish
        required: false
        type: boolean
        default: false
      dry-run:
        description: Dry run
        required: false
        type: boolean
        default: false

jobs:
  publish:
    runs-on: ubuntu-latest

    permissions:
      contents: write  # git commit, tag, push
      id-token: write  # OIDC trusted publishing to npm

    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v6
        with:
          node-version: 24
          # Required: writes .npmrc so OIDC token exchange works during npm publish
          registry-url: 'https://registry.npmjs.org'

      - run: npm ci

      # Add your project-specific pre-publish checks here, for example:
      # - run: npm run lint
      # - run: npm run build
      # - run: npm test

      - uses: vitalets/npm-release@v2
        with:
          channel:          ${{ inputs.channel }}
          version:          ${{ inputs.version }}
          skip-npm-publish: ${{ inputs.skip-npm-publish }}
          dry-run:          ${{ inputs.dry-run }}
          github-token:     ${{ secrets.GITHUB_TOKEN }}
```

Adjust you project spesific pre-release checks (linting, tests).

### 2. Run the workflow

On GitHub:

- go to **Actions**
- select **release** in teh left panel 
- click **Run workflow** button
- select a Channel and Version
- click **Run workflow** at the bottom

See [Version transitions](transitions.md) for the complete release behavior reference.

### Pre-release

Selecting any non-`stable` channel (e.g. `next`, `alpha`, `beta`, `rc`, etc) creates a prerelease version such as `1.2.3-next.0` and publishes it with the correspoinding npm dist-tag. Consumers can install that release explicitly, for example:

```sh
npm install package-name@next
```

## Action Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `channel` | yes | — | `stable` for a stable release, or an npm prerelease identifier and matching dist-tag such as `next`. |
| `version` | yes | — | Version increment: `patch`, `minor`, or `major`. |
| `skip-npm-publish` | no | `false` | Skip the `npm publish` step |
| `dry-run` | no | `false` | No git push, no npm publish — prints a summary of what would happen |
| `github-token` | yes | — | Pass `secrets.GITHUB_TOKEN` — used for git push and creating the GitHub Release |

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](https://github.com/vitalets/npm-release/blob/main/LICENSE)
