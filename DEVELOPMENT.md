# Development

Use Node.js 24+ for development. The published CLI supports Node.js 20+.

```bash
npm ci
npm run tsc
npm run build
npm test
```

## Releasing

1. Run `release` action on GitHub
2. Select Channel `stable` and Version `major`
3. After release, pull the changes and update docs.
