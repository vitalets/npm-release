# Development

Install dependencies and run the tests before submitting changes:

```bash
npm ci
npm test
```

## Releasing the next version of this action

1. Add the release notes under `## [Unreleased]` in `CHANGELOG.md`, commit the changes, and push them to the release branch.
2. Open the `release` workflow on the GitHub Actions page and click **Run workflow** for the branch being released. It invokes the action with `uses: ./` so the release uses the code from that branch.
3. Select one stable or beta release and leave the other input as `-`. Leave `dry-run` as `false`. The workflow always skips npm publishing because this repository publishes a GitHub Action, not an npm package.
4. For a stable release, the action updates `package.json` and `CHANGELOG.md`, pushes the release commit and exact tag (for example, `v1.1.0`), and creates the GitHub Release. Beta releases skip the changelog and GitHub Release.
5. After a stable release, the workflow moves the floating major tag (for example, `v1`) to the new exact tag so users of `vitalets/npm-release@v1` receive the update. Beta and dry-run releases do not update the floating tag.
