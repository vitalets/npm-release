# Development

Use Node.js 24+ for development. The published CLI supports Node.js 20+.

```bash
npm ci
npm run tsc
npm run build
npm test
```

## Releasing

Always run `npm run build` before `npm pack` or `npm publish`.

First release: publish `@vitalets/npm-release` manually, then configure npm trusted
publishing for `release.yml`. The CLI and action share one version.

1. Run `release` action on GitHub
2. Select Channel `stable` and Version `major`
3. After release, pull the changes and update docs.
