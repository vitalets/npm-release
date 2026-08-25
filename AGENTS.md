# npm-release — Agent Reference

## Purpose

A GitHub composite action that automates full npm package releases:

1. Apply an explicit stable or beta version operation to `package.json`
2. Stamp `CHANGELOG.md` with the new version and date, refresh compare links, extract release notes
3. Commit, tag, and push the release commit
4. Publish to npm via **OIDC trusted publishing** (no stored `NPM_TOKEN`)
5. Create a GitHub Release with extracted changelog notes

Beta releases (`beta-release` other than `none`) skip steps 2 and 5.

---

## Markdown Style

When creating or editing Markdown files, keep prose paragraphs on a single line and use exactly one blank line between block elements (headings, paragraphs, lists, tables, and code fences). Do not add consecutive blank lines or hard-wrap prose.

---

## Files

| File | Purpose |
|------|---------|
| `action.yml` | Composite action definition — all release steps |
| `src/changelog.mts` | Runtime for changelog updates and release-note extraction |
| `src/versioning.mts` | Dependency-free runtime that maps and validates release inputs as npm version operations |
| `CHANGELOG.md` | Keep-a-Changelog format changelog for this repo |
| `package.json` | Package metadata; `"type": "module"` for ESM; holds repository URL read by changelog.mts |
| `README.md` | Full documentation and copy-paste workflow template |

---

## Key Design Decisions

### OIDC Trusted Publishing Only

No `npm-token` input. The caller must:

1. Configure OIDC on npmjs.com (package → Access → Trusted Publishers → GitHub Actions)
2. Set `permissions: id-token: write` in the calling job
3. Call `actions/setup-node` with `registry-url: 'https://registry.npmjs.org'` **before** this action — this writes the `.npmrc` that enables OIDC token exchange

### Composite Action — Inputs Are Always Strings

All `if:` conditionals use `== 'true'` / `!= 'true'` string comparisons, never bare boolean checks.

### Runtime Scripts Require Node.js ≥ 24

The action runs the TypeScript source directly via Node.js type stripping:

```
node $GITHUB_ACTION_PATH/src/versioning.mts <current-version> <stable-release> <beta-release>
node $GITHUB_ACTION_PATH/src/changelog.mts <version>
```

The caller must set `node-version: 24` (or higher) in `actions/setup-node`.

### Dependency-free Runtime Scripts

The runtime scripts use only Node.js built-ins. Consumers do not install this action's development dependencies, and no build or bundled runtime is needed.

Workflow dropdown labels are consumer-defined. The first whitespace-delimited token is the canonical action value; any remaining explanatory text is ignored.

### Pre-releases

- `beta-patch`, `beta-minor`, and `beta-major` start that beta line at `beta.0`
- A beta operation increments `beta.N` when the current version already belongs to that line
- Stable and beta operations below the current beta line are rejected
- Published to npm with `--tag next`
- CHANGELOG.md **not** updated — `[Unreleased]` accumulates until next stable release
- No GitHub Release created

### Permissions Caller Must Set

```yaml
permissions:
  contents: write  # git commit, tag, push
  id-token: write  # OIDC trusted publishing to npm
```

---

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `stable-release` | no | `none` | `patch`, `minor`, or `major` |
| `beta-release` | no | `none` | `beta-patch`, `beta-minor`, or `beta-major` |
| `skip-npm-publish` | no | `false` | Skip `npm publish` step |
| `dry-run` | no | `false` | No push, no publish — prints summary |
| `github-token` | yes | — | `secrets.GITHUB_TOKEN` for git push and GitHub Release |

---

## Action Steps (in order)

1. `Configure git` — sets bot committer identity
2. `Bump version` — validates exactly one release operation, resolves an npm version operation, and lets `npm version` calculate the next version
3. `Update changelog and extract release notes` — skipped for beta releases
4. `Commit, tag, push` — skipped if `dry-run == 'true'`; uses `GH_TOKEN` from `github-token` input
5. `Publish to npm` — skipped if `dry-run == 'true'` or `skip-npm-publish == 'true'`; uses `--provenance` and `--tag next` for pre-releases
6. `Create GitHub Release` — skipped if `dry-run == 'true'` or for beta releases
7. `Dry run summary` — only runs if `dry-run == 'true'`; prints version, diff, and notes

---

## Action Reference

```yaml
- uses: vitalets/npm-release@v1
  with:
    stable-release:   ${{ inputs.stable-release }}
    beta-release:     ${{ inputs.beta-release }}
    skip-npm-publish: ${{ inputs.skip-npm-publish }}
    dry-run:          ${{ inputs.dry-run }}
    github-token:     ${{ secrets.GITHUB_TOKEN }}
```

---

## CHANGELOG.md Format Requirement

The calling repo must maintain a `CHANGELOG.md` with:

- A `## [Unreleased]` section (exactly this heading)
- `package.json` with a `repository` field pointing to the GitHub repo (used for compare links)

---

## Running the Changelog Script Locally

```bash
node src/changelog.mts <version>
```

Must be run from the **caller's repo root** (where `CHANGELOG.md` and `package.json` live).

---

## GitHub Marketplace & Versioning

This action is published on the [GitHub Marketplace](https://github.com/marketplace/actions/npm-release).

### Tag convention

Two tags are maintained per release:

- **Exact tag** (`v1.0.0`) — immutable, pinned to a specific release
- **Floating tag** (`v1`) — always points to the latest `v1.x.x`; consumers using `@v1` get bug fixes automatically

### How to publish a new release

1. Update `CHANGELOG.md` — add entries under `## [Unreleased]`
2. Run `.github/workflows/release.yml` from the GitHub Actions page and select exactly one stable or beta release
3. The workflow tests the branch, runs the local action with npm publishing disabled, and moves the floating major tag after a stable release
4. A new major floating tag (e.g. `v2`) is created automatically when releasing a **breaking** major version.
