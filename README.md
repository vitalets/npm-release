# npm-release

[![Test](https://github.com/vitalets/npm-release/actions/workflows/test.yml/badge.svg)](https://github.com/vitalets/npm-release/actions/workflows/test.yml)

A GitHub action that performs a full npm package release:

1. Applies an explicit release channel and version increment to `package.json`
2. Updates `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com) format
3. Commits, tags, and pushes the release commit
4. Publishes to npm via **OIDC trusted publishing** — no stored npm token required
5. Creates a GitHub Release with the extracted changelog notes

<img src="https://raw.githubusercontent.com/vitalets/npm-release/main/screenshot.png" alt="GitHub Run workflow form for selecting the release channel and version" width="368">

## Usage

### 1. Publish the first version manually

Your package must exist on npm before you can configure trusted publishing. If you haven't published it yet, run these commands from your package directory after completing your build and tests:

```sh
npm login
# ...commands to build your package, e.g. npm run build
npm publish --access public
```

This publishes the version specified in `package.json`. The `--access public` flag also makes scoped packages public.

### 2. Enable OIDC Trusted Publishing

Configure [OIDC Trusted Publishing](https://docs.npmjs.com/generating-provenance-statements#publishing-with-a-trusted-publisher) for your package on npmjs.com:

1. Go to your package on [npmjs.com](https://www.npmjs.com) → **Access** → **Trusted Publishers**
2. Add a new trusted publisher:
   - **Publisher**: GitHub Actions
   - **Repository owner**: your GitHub username or org
   - **Repository name**: your repository
   - **Workflow filename**: the workflow file that calls this action (e.g. `release.yml`)

### 3. Add CHANGELOG.md

Unless you set `skip-changelog-update: true`, your repository must have a `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com) format with an `## [Unreleased]` section:

```markdown
# Changelog

> This project follows the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

## [Unreleased]

- New feature 1
- New feature 2
...
```

### 4. Set up release workflow

Copy-paste the following workflow to `.github/workflows/release.yml`:

<details>
<summary>release.yml</summary>

```yaml
name: release

on:
  workflow_dispatch:
    inputs:
      channel:
        description: Channel
        required: true
        type: choice
        default: ''
        options:
          - ''
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
      skip-changelog-update:
        description: Skip changelog update and GitHub release
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
    runs-on: ubuntu-24.04

    permissions:
      contents: write  # git commit, tag, push
      id-token: write  # OIDC trusted publishing to npm

    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
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
          skip-changelog-update: ${{ inputs.skip-changelog-update }}
          dry-run:          ${{ inputs.dry-run }}
          github-token:     ${{ secrets.GITHUB_TOKEN }}
```

</details>

Adjust you project spesific pre-release checks (linting, tests).

### 5. Run the workflow

On GitHub:

- go to **Actions**
- select **release** in teh left panel 
- click **Run workflow** button
- select a Channel and Version
- click **Run workflow** at the bottom

See [Version transitions](transitions.md) for the complete release behavior reference.

### 6. Update local branch

After the release, run this command locally to pull the release commit and tag:

```sh
git pull --rebase
```

### Pre-release

Selecting any non-`stable` channel (e.g. `next`, `alpha`, `beta`, `rc`, etc) creates a prerelease version such as `1.2.3-next.0` and publishes it with the correspoinding npm dist-tag. Consumers can install that release explicitly, for example:

```sh
npm install package-name@next
```

## Action Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `channel` | yes | — | `stable` for a stable release, or an npm prerelease identifier and matching dist-tag such as `next`. Must start with a letter. |
| `version` | yes | — | Version increment: `patch`, `minor`, or `major`. |
| `skip-npm-publish` | no | `false` | Skip the `npm publish` step |
| `skip-changelog-update` | no | `false` | Skip changelog updates and GitHub Release creation. Version bump, commit, tag, push, and npm publishing still run. `CHANGELOG.md` is not required. |
| `dry-run` | no | `false` | No git push, no npm publish — prints a summary of what would happen |
| `github-token` | yes | — | Pass `secrets.GITHUB_TOKEN` — used for git push and creating the GitHub Release |

## Chrome extension

The optional [Chrome extension](extension/README.md) shows the current package version and the exact next version directly in GitHub's **Run workflow** form.

<img src="https://raw.githubusercontent.com/vitalets/npm-release/main/extension/screenshot.png" alt="Chrome extension showing the current and next package versions in GitHub's Run workflow form" width="368">

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](https://github.com/vitalets/npm-release/blob/main/LICENSE)
