# npm-release

[![Test](https://github.com/vitalets/npm-release/actions/workflows/test.yml/badge.svg)](https://github.com/vitalets/npm-release/actions/workflows/test.yml)

A GitHub composite action that performs a full npm package release:

1. Applies an explicit stable or beta version operation to `package.json`
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
   - **Workflow filename**: the workflow file that calls this action (e.g. `publish.yml`)

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

Full copy-paste workflow template:

```yaml
name: Publish to npm

on:
  workflow_dispatch:
    inputs:
      stable-release:
        description: Stable release (keep 'none' if releasing beta)
        required: false
        type: choice
        default: none
        options:
          - none
          - patch
          - minor
          - major
      beta-release:
        description: Beta release (keep 'none' if releasing stable)
        required: false
        type: choice
        default: none
        options:
          - none
          - beta-patch (start or continue)
          - beta-minor (start or continue)
          - beta-major (start or continue)
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

      - uses: vitalets/npm-release@v1
        with:
          stable-release:   ${{ inputs.stable-release }}
          beta-release:     ${{ inputs.beta-release }}
          skip-npm-publish: ${{ inputs.skip-npm-publish }}
          dry-run:          ${{ inputs.dry-run }}
          github-token:     ${{ secrets.GITHUB_TOKEN }}
```

### Version transition examples

Select exactly one operation across the two dropdowns. Leave the other dropdown as `none`. The action exits with a clear error if neither dropdown or both dropdowns are selected.

- Stable `patch`, `minor`, and `major` follow npm's SemVer behavior. On a prerelease, an operation can remove the beta suffix without incrementing a numeric part.
- `beta-patch`, `beta-minor`, and `beta-major` start the requested beta line at `beta.0`.
- If the current version already belongs to the selected beta line, the operation increments only `beta.N`.
- While on a minor or major beta, lower stable and beta operations are rejected because they would misrepresent or branch below the unreleased beta line.

### Currently on stable version

| Current version | Action | New version |
|---|---|---|
| `1.2.3` | `patch` | `1.2.4` |
| `1.2.3` | `minor` | `1.3.0` |
| `1.2.3` | `major` | `2.0.0` |
| `1.2.3` | `beta-patch` | `1.2.4-beta.0` |
| `1.2.3` | `beta-minor` | `1.3.0-beta.0` |
| `1.2.3` | `beta-major` | `2.0.0-beta.0` |

### Currently on beta patch

| Current version | Action | New version |
|---|---|---|
| `1.2.3-beta.0` | `patch` | `1.2.3` |
| `1.2.3-beta.0` | `minor` | `1.3.0` |
| `1.2.3-beta.0` | `major` | `2.0.0` |
| `1.2.3-beta.0` | `beta-patch` | `1.2.3-beta.1` |
| `1.2.3-beta.0` | `beta-minor` | `1.3.0-beta.0` |
| `1.2.3-beta.0` | `beta-major` | `2.0.0-beta.0` |

### Currently on beta minor

| Current version | Action | New version |
|---|---|---|
| `1.2.0-beta.0` | `patch` | Not permitted |
| `1.2.0-beta.0` | `minor` | `1.2.0` |
| `1.2.0-beta.0` | `major` | `2.0.0` |
| `1.2.0-beta.0` | `beta-patch` | Not permitted |
| `1.2.0-beta.0` | `beta-minor` | `1.2.0-beta.1` |
| `1.2.0-beta.0` | `beta-major` | `2.0.0-beta.0` |

### Currently on beta major

| Current version | Action | New version |
|---|---|---|
| `1.0.0-beta.0` | `patch` | Not permitted |
| `1.0.0-beta.0` | `minor` | Not permitted |
| `1.0.0-beta.0` | `major` | `1.0.0` |
| `1.0.0-beta.0` | `beta-patch` | Not permitted |
| `1.0.0-beta.0` | `beta-minor` | Not permitted |
| `1.0.0-beta.0` | `beta-major` | `1.0.0-beta.1` |

## Action Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `stable-release` | no | `none` | Stable release: `patch`, `minor`, or `major`. Select exactly one stable or beta release. |
| `beta-release` | no | `none` | Beta release: `beta-patch`, `beta-minor`, or `beta-major`. Betas publish with npm tag `next` and skip changelog updates and GitHub Releases. |
| `skip-npm-publish` | no | `false` | Skip the `npm publish` step |
| `dry-run` | no | `false` | No git push, no npm publish — prints a summary of what would happen |
| `github-token` | yes | — | Pass `secrets.GITHUB_TOKEN` — used for git push and creating the GitHub Release |

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](https://github.com/vitalets/npm-release/blob/main/LICENSE)