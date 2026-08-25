import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { npmVersionOperation } from '../src/versioning.mts';
import type { BetaRelease, Release } from '../src/versioning.mts';

type ReleaseAction = Release | BetaRelease;

interface VersionTable {
  currentVersion: string;
  transitions: [action: ReleaseAction, expectedVersion: string | null][];
}

const versionTables: VersionTable[] = [
  {
    currentVersion: '1.2.3',
    transitions: [
      ['patch', '1.2.4'],
      ['minor', '1.3.0'],
      ['major', '2.0.0'],
      ['beta-patch', '1.2.4-beta.0'],
      ['beta-minor', '1.3.0-beta.0'],
      ['beta-major', '2.0.0-beta.0'],
    ],
  },
  {
    currentVersion: '1.2.3-beta.0',
    transitions: [
      ['patch', '1.2.3'],
      ['minor', '1.3.0'],
      ['major', '2.0.0'],
      ['beta-patch', '1.2.3-beta.1'],
      ['beta-minor', '1.3.0-beta.0'],
      ['beta-major', '2.0.0-beta.0'],
    ],
  },
  {
    currentVersion: '1.2.0-beta.0',
    transitions: [
      ['patch', null],
      ['minor', '1.2.0'],
      ['major', '2.0.0'],
      ['beta-patch', null],
      ['beta-minor', '1.2.0-beta.1'],
      ['beta-major', '2.0.0-beta.0'],
    ],
  },
  {
    currentVersion: '1.0.0-beta.0',
    transitions: [
      ['patch', null],
      ['minor', null],
      ['major', '1.0.0'],
      ['beta-patch', null],
      ['beta-minor', null],
      ['beta-major', '1.0.0-beta.1'],
    ],
  },
];

describe('Version transition tables', () => {
  for (const versionTable of versionTables) {
    describe(versionTable.currentVersion, () => {
      for (const [action, expectedVersion] of versionTable.transitions) {
        const isBeta = action.startsWith('beta-');
        const stableRelease = isBeta ? 'none' : action;
        const betaRelease = isBeta ? action : 'none';

        test(`${action} ${expectedVersion ? `produces ${expectedVersion}` : 'is prohibited'}`, () => {
          if (expectedVersion === null) {
            assert.throws(
              () => npmVersionOperation(
                versionTable.currentVersion,
                stableRelease,
                betaRelease,
              ),
              /lower operations are not permitted/,
            );
            return;
          }

          verifyPackageVersion(
            versionTable.currentVersion,
            stableRelease,
            betaRelease,
            expectedVersion,
          );
        });
      }
    });
  }
});

describe('Beta suffixes', () => {
  test('increments an existing beta suffix and removes build metadata', () => {
    verifyPackageVersion(
      '1.2.3-beta.9+build.7',
      'none',
      'beta-patch',
      '1.2.3-beta.10',
    );
  });
});

describe('Workflow option labels', () => {
  test('accepts explanatory text after a stable operation', () => {
    verifyPackageVersion('1.2.3', 'patch (stable release)', 'none', '1.2.4');
  });

  test('accepts explanatory text after a beta operation', () => {
    verifyPackageVersion(
      '1.2.3-beta.0',
      'none',
      'beta-patch (start or continue)',
      '1.2.3-beta.1',
    );
  });
});

describe('Input validation', () => {
  const invalidCases = [
    {
      name: 'rejects no selected release',
      currentVersion: '1.2.3',
      stableRelease: 'none',
      betaRelease: 'none',
      error: 'Select either a stable release or a beta release',
    },
    {
      name: 'rejects two selected releases',
      currentVersion: '1.2.3',
      stableRelease: 'patch',
      betaRelease: 'beta-patch',
      error: 'Select only one release: stable or beta',
    },
    {
      name: 'rejects an unknown stable operation',
      currentVersion: '1.2.3',
      stableRelease: 'promote-beta',
      betaRelease: 'none',
      error: 'Unknown stable release operation: promote-beta',
    },
    {
      name: 'rejects an unknown beta operation',
      currentVersion: '1.2.3',
      stableRelease: 'none',
      betaRelease: 'beta-suffix',
      error: 'Unknown beta release operation: beta-suffix',
    },
  ];

  for (const invalidCase of invalidCases) {
    test(invalidCase.name, () => {
      assert.throws(
        () => npmVersionOperation(
          invalidCase.currentVersion,
          invalidCase.stableRelease,
          invalidCase.betaRelease,
        ),
        { message: invalidCase.error },
      );
    });
  }
});


function verifyPackageVersion(
  currentVersion: string,
  stableRelease: string,
  betaRelease: string,
  expectedVersion: string,
): void {
  const directory = mkdtempSync(join(tmpdir(), 'npm-release-version-'));

  try {
    const packagePath = join(directory, 'package.json');
    writeFileSync(packagePath, JSON.stringify({ name: 'version-test', version: currentVersion }));

    const operation = npmVersionOperation(currentVersion, stableRelease, betaRelease);
    execFileSync('npm', ['version', operation, '--no-git-tag-version', '--preid=beta'], {
      cwd: directory,
      stdio: 'pipe',
    });

    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    assert.equal(packageJson.version, expectedVersion);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
