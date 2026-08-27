import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { npmVersionOperation } from '../src/versioning.mts';
import type { Release } from '../src/versioning.mts';

type Transition = [channel: string, version: Release, expectedVersion: string | null];

interface VersionTable {
  name?: string;
  currentVersion: string;
  transitions: Transition[];
}

const versionTables: VersionTable[] = [
  {
    currentVersion: '1.2.3',
    transitions: [
      ['stable', 'patch', '1.2.4'],
      ['stable', 'minor', '1.3.0'],
      ['stable', 'major', '2.0.0'],
      ['beta', 'patch', '1.2.4-beta.0'],
      ['beta', 'minor', '1.3.0-beta.0'],
      ['beta', 'major', '2.0.0-beta.0'],
    ],
  },
  {
    currentVersion: '1.2.3-beta.0',
    transitions: [
      ['stable', 'patch', '1.2.3'],
      ['stable', 'minor', '1.3.0'],
      ['stable', 'major', '2.0.0'],
      ['beta', 'patch', '1.2.3-beta.1'],
      ['beta', 'minor', '1.3.0-beta.0'],
      ['beta', 'major', '2.0.0-beta.0'],
    ],
  },
  {
    currentVersion: '1.2.0-beta.0',
    transitions: [
      ['stable', 'patch', null],
      ['stable', 'minor', '1.2.0'],
      ['stable', 'major', '2.0.0'],
      ['beta', 'patch', null],
      ['beta', 'minor', '1.2.0-beta.1'],
      ['beta', 'major', '2.0.0-beta.0'],
    ],
  },
  {
    currentVersion: '1.0.0-beta.0',
    transitions: [
      ['stable', 'patch', null],
      ['stable', 'minor', null],
      ['stable', 'major', '1.0.0'],
      ['beta', 'patch', null],
      ['beta', 'minor', null],
      ['beta', 'major', '1.0.0-beta.1'],
    ],
  },
  {
    name: 'Transition from alpha patch to beta',
    currentVersion: '1.2.3-alpha.4',
    transitions: [
      ['beta', 'patch', '1.2.3-beta.0'],
      ['beta', 'minor', '1.3.0-beta.0'],
      ['beta', 'major', '2.0.0-beta.0'],
    ],
  },
  {
    name: 'Transition from alpha minor to beta',
    currentVersion: '1.2.0-alpha.4',
    transitions: [
      ['beta', 'patch', null],
      ['beta', 'minor', '1.2.0-beta.0'],
      ['beta', 'major', '2.0.0-beta.0'],
    ],
  },
  {
    name: 'Transition from alpha major to beta',
    currentVersion: '1.0.0-alpha.4',
    transitions: [
      ['beta', 'patch', null],
      ['beta', 'minor', null],
      ['beta', 'major', '1.0.0-beta.0'],
    ],
  },
  {
    name: 'Beta suffix with build metadata',
    currentVersion: '1.2.3-beta.9+build.7',
    transitions: [
      ['beta', 'patch', '1.2.3-beta.10'],
    ],
  },
];

describe('Version transitions', () => {
  for (const versionTable of versionTables) {
    describe(versionTable.name ?? versionTable.currentVersion, () => {
      for (const [channel, version, expectedVersion] of versionTable.transitions) {
        test(`${channel} ${version} ${expectedVersion ? `produces ${expectedVersion}` : 'is prohibited'}`, () => {
          if (expectedVersion === null) {
            assert.throws(
              () => npmVersionOperation(versionTable.currentVersion, channel, version),
              /lower operations are not permitted/,
            );
            return;
          }

          verifyPackageVersion(versionTable.currentVersion, channel, version, expectedVersion);
        });
      }
    });
  }
});

describe('Input validation', () => {
  const invalidCases = [
    {
      name: 'rejects the unselected channel placeholder',
      channel: '-',
      version: 'patch',
      error: 'Select a release channel',
    },
    {
      name: 'rejects an empty channel',
      channel: '',
      version: 'patch',
      error: 'Select a release channel',
    },
    {
      name: 'rejects an unknown version operation',
      channel: 'stable',
      version: 'promote-beta',
      error: 'Unknown version operation: promote-beta',
    },
    {
      name: 'rejects an empty version operation',
      channel: 'stable',
      version: '',
      error: 'Unknown version operation: ',
    },
  ];

  for (const invalidCase of invalidCases) {
    test(invalidCase.name, () => {
      assert.throws(
        () => npmVersionOperation('1.2.3', invalidCase.channel, invalidCase.version),
        { message: invalidCase.error },
      );
    });
  }
});

function verifyPackageVersion(
  currentVersion: string,
  channel: string,
  version: string,
  expectedVersion: string,
): void {
  const directory = mkdtempSync(join(tmpdir(), 'npm-release-version-'));

  try {
    const packagePath = join(directory, 'package.json');
    writeFileSync(packagePath, JSON.stringify({ name: 'version-test', version: currentVersion }));

    const operation = npmVersionOperation(currentVersion, channel, version);
    const args = ['version', operation, '--no-git-tag-version'];
    if (channel !== 'stable') args.push(`--preid=${channel}`);
    execFileSync('npm', args, { cwd: directory, stdio: 'pipe' });

    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    assert.equal(packageJson.version, expectedVersion);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
