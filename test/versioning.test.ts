import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { npmVersionOperation } from '../src/action/versioning.ts';
import { testVersionTransitions } from './helpers/version-transitions.ts';

describe('Version transitions', () => {
  testVersionTransitions(calculatePackageVersion, /lower operations are not permitted/);
});

test('rejects invalid release channels', () => {
  assert.throws(() => npmVersionOperation('1.2.3', '', 'patch'), /Select a release channel/);
  assert.throws(() => npmVersionOperation('1.2.3', '-select-', 'patch'), /Select a release channel/);
  assert.throws(() => npmVersionOperation('1.2.3', '1next', 'patch'), /Select a release channel/);
  assert.throws(() => npmVersionOperation('1.2.3', ' next', 'patch'), /Select a release channel/);
});

test('rejects invalid version operations', () => {
  assert.throws(() => npmVersionOperation('1.2.3', 'stable', 'foo'), /Unknown version operation/);
  assert.throws(() => npmVersionOperation('1.2.3', 'stable', ''), /Unknown version operation/);
});

test('accepts a custom channel starting with a letter', () => {
  assert.equal(npmVersionOperation('1.2.3', 'beta-2', 'patch'), 'prepatch');
});

function calculatePackageVersion(
  currentVersion: string,
  channel: string,
  version: string,
) {
  const directory = mkdtempSync(join(tmpdir(), 'npm-release-version-'));

  try {
    const packagePath = join(directory, 'package.json');
    writeFileSync(packagePath, JSON.stringify({ name: 'foo', version: currentVersion }));

    const operation = npmVersionOperation(currentVersion, channel, version);
    const args = ['version', operation, '--no-git-tag-version'];
    if (channel !== 'stable') args.push(`--preid=${channel}`);
    execFileSync('npm', args, { cwd: directory, stdio: 'pipe' });

    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    return packageJson.version as string;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
