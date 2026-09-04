import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stampChangelog,
  extractReleaseNotes,
  updateCompareLinks,
  extractReleasedVersions,
  removeCompareLinks,
  getRepositoryUrl,
} from '../src/changelog.mts';

const REPO_URL = 'https://github.com/owner/repo';

test('getRepositoryUrl builds the URL from GitHub Actions environment variables', () => {
  assert.equal(
    getRepositoryUrl({
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REPOSITORY: 'owner/repo',
    }),
    REPO_URL,
  );
});

test('getRepositoryUrl supports GitHub Enterprise and trims surrounding slashes', () => {
  assert.equal(
    getRepositoryUrl({
      GITHUB_SERVER_URL: 'https://github.example.com/',
      GITHUB_REPOSITORY: '/owner/repo/',
    }),
    'https://github.example.com/owner/repo',
  );
});

test('stampChangelog inserts versioned heading below [Unreleased]', () => {
  const input = `
## [Unreleased]

### Added
- New feature
`.trim();
  const result = stampChangelog(input, '1.2.3');
  assert.match(result, /^## \[Unreleased\]\n\n## \[1\.2\.3\] - \d{4}-\d{2}-\d{2}\n/);
  assert.ok(result.includes('### Added\n- New feature'));
});

test('extractReleaseNotes returns trimmed body between two version headings', () => {
  const text = `
## [Unreleased]

## [1.2.3] - 2024-06-01

### Added
- Feature A

## [1.2.2] - 2024-01-01

### Fixed
- Bug B
`.trim();
  assert.equal(extractReleaseNotes(text, '1.2.3'), '### Added\n- Feature A');
});

test('extractReleasedVersions returns version numbers in document order', () => {
  const text = `
## [Unreleased]
## [1.2.3] - 2024-06-01
## [1.2.2] - 2024-01-01
## [1.0.0] - 2023-01-01
`.trim();
  assert.deepEqual(extractReleasedVersions(text), ['1.2.3', '1.2.2', '1.0.0']);
});

test('removeCompareLinks strips the link reference block', () => {
  const text = `
## [1.0.0] - 2024-01-01

- content

[unreleased]: https://github.com/...
[1.0.0]: https://github.com/...
`.trim();
  const result = removeCompareLinks(text);
  assert.ok(!result.includes('[unreleased]:'));
  assert.ok(result.includes('- content'));
});

test('updateCompareLinks builds compare and tag links for all versions', () => {
  const text = `
## [Unreleased]

## [1.2.3] - 2024-06-01

## [1.2.2] - 2024-01-01
`.trim();
  const result = updateCompareLinks(text, REPO_URL);
  assert.ok(result.includes('[unreleased]: https://github.com/owner/repo/compare/v1.2.3...HEAD'));
  assert.ok(result.includes('[1.2.3]: https://github.com/owner/repo/compare/v1.2.2...v1.2.3'));
  assert.ok(result.includes('[1.2.2]: https://github.com/owner/repo/releases/tag/v1.2.2'));
});

test('updateCompareLinks uses a tag link when only one version exists', () => {
  const text = `
## [Unreleased]

## [1.0.0] - 2024-01-01
`.trim();
  const result = updateCompareLinks(text, REPO_URL);
  assert.ok(result.includes('[unreleased]: https://github.com/owner/repo/compare/v1.0.0...HEAD'));
  assert.ok(result.includes('[1.0.0]: https://github.com/owner/repo/releases/tag/v1.0.0'));
});
