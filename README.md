# npm-release

A GitHub composite action that performs a full npm package release:

1. Bumps the version in `package.json` (`patch`, `minor`, or `major`)
2. Updates `CHANGELOG.md` — stamps the `[Unreleased]` section with the new version and date, refreshes compare links, and extracts release notes
3. Commits, tags, and pushes the release commit
4. Publishes to npm via **OIDC trusted publishing** — no stored npm token required
5. Creates a GitHub Release with the extracted changelog notes

Pre-releases (`prerelease: true`) skip steps 2 and 5 so the `[Unreleased]` section keeps accumulating until the next stable release.

---

## Prerequisites

### 1. OIDC Trusted Publishing on npmjs.com

This action publishes to npm using [OIDC Trusted Publishing](https://docs.npmjs.com/generating-provenance-statements#publishing-with-a-trusted-publisher) — no `NPM_TOKEN` secret needed. Configure your package on npmjs.com:

1. Go to your package on [npmjs.com](https://www.npmjs.com) → **Access** → **Trusted Publishers**
2. Add a new trusted publisher:
   - **Publisher**: GitHub Actions
   - **Repository owner**: your GitHub username or org
   - **Repository name**: your repository
   - **Workflow filename**: the workflow file that calls this action (e.g. `publish.yml`)

### 2. CHANGELOG.md format

Your repository must have a `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com) format with an `## [Unreleased]` section. Example:

```markdown
## [Unreleased]

### Added
- New feature

## [1.2.0] - 2026-05-01
...
```

### 3. `actions/setup-node` with `registry-url`

Call `actions/setup-node` with `registry-url: 'https://registry.npmjs.org'` **before** this action. It writes the `.npmrc` configuration that enables the OIDC token exchange during `npm publish`.

---

## Permissions

The calling job must declare these permissions — composite actions cannot set permissions themselves:

```yaml
permissions:
  contents: write  # git commit, tag, push
  id-token: write  # OIDC trusted publishing to npm
```

---

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `release-version` | yes | — | `patch`, `minor`, or `major` |
| `prerelease` | no | `false` | Bump as pre-release (`--preid=beta`), publish with `--tag next`. Skips changelog update and GitHub Release. |
| `skip-npm-publish` | no | `false` | Skip the `npm publish` step |
| `dry-run` | no | `false` | No git push, no npm publish — prints a summary of what would happen |
| `github-token` | yes | — | Pass `secrets.GITHUB_TOKEN` — used for git push and creating the GitHub Release |

---

## Usage

Full copy-paste workflow template:

```yaml
name: Publish to npm

on:
  workflow_dispatch:
    inputs:
      release-version:
        description: Release version type
        required: true
        type: choice
        options:
          - patch
          - minor
          - major
        default: patch
      prerelease:
        description: Pre-release (beta)
        required: false
        type: boolean
        default: false
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
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          # Required: writes .npmrc so OIDC token exchange works during npm publish
          registry-url: 'https://registry.npmjs.org'

      - run: npm ci

      # Add your project-specific pre-publish checks here, for example:
      # - run: npm run lint
      # - run: npm run build
      # - run: npm test

      - uses: vitalets/npm-release@v1
        with:
          release-version: ${{ inputs.release-version }}
          prerelease:       ${{ inputs.prerelease }}
          skip-npm-publish: ${{ inputs.skip-npm-publish }}
          dry-run:          ${{ inputs.dry-run }}
          github-token:     ${{ secrets.GITHUB_TOKEN }}
```
