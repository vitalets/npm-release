# npm-release — Agent Reference

## Purpose

A GitHub composite action that automates full npm package releases:

1. Bump version in `package.json` (`patch` / `minor` / `major`)
2. Stamp `CHANGELOG.md` with the new version and date, refresh compare links, extract release notes
3. Commit, tag, and push the release commit
4. Publish to npm via **OIDC trusted publishing** (no stored `NPM_TOKEN`)
5. Create a GitHub Release with extracted changelog notes

Pre-releases (`prerelease: true`) skip steps 2 and 5.

---

## Files

| File | Purpose |
|------|---------|
| `action.yml` | Composite action definition — all release steps |
| `scripts/changelog.mts` | Node.js TypeScript script that updates CHANGELOG.md and prints release notes to stdout |
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

### changelog.mts Requires Node.js ≥ 22
The script is TypeScript (`.mts`). It runs via:
```
node --experimental-strip-types $GITHUB_ACTION_PATH/scripts/changelog.mts <version>
```
The caller must set `node-version: 22` (or higher) in `actions/setup-node`.

### Pre-releases
- Version bumped with `--preid=beta` (e.g. `1.2.0-beta.0`)
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
| `release-version` | yes | — | `patch`, `minor`, or `major` |
| `prerelease` | no | `false` | Pre-release beta; skips changelog + GitHub Release |
| `skip-npm-publish` | no | `false` | Skip `npm publish` step |
| `dry-run` | no | `false` | No push, no publish — prints summary |
| `github-token` | yes | — | `secrets.GITHUB_TOKEN` for git push and GitHub Release |

---

## Action Steps (in order)

1. `Configure git` — sets bot committer identity
2. `Bump version` — runs `npm version`; for pre-release prepends `pre` to get `prepatch` etc.
3. `Update changelog and extract release notes` — skipped if `prerelease == 'true'`
4. `Commit, tag, push` — skipped if `dry-run == 'true'`; uses `GH_TOKEN` from `github-token` input
5. `Publish to npm` — skipped if `dry-run == 'true'` or `skip-npm-publish == 'true'`; uses `--provenance` and `--tag next` for pre-releases
6. `Create GitHub Release` — skipped if `dry-run == 'true'` or `prerelease == 'true'`
7. `Dry run summary` — only runs if `dry-run == 'true'`; prints version, diff, and notes

---

## Action Reference

```yaml
- uses: vitalets/npm-release@v1
  with:
    release-version: ${{ inputs.release-version }}
    prerelease:       ${{ inputs.prerelease }}
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
node --experimental-strip-types scripts/changelog.mts <version>
```

Must be run from the **caller's repo root** (where `CHANGELOG.md` and `package.json` live).
