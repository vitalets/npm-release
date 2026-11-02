/**
 * Shares worked release-version examples across the action, CLI, and extension.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * Checks version outputs and prohibited operations through the supplied public API.
 */
export function testVersionTransitions(
  calculateVersion: (current: string, channel: string, operation: string) => string,
  prohibitedOperation: RegExp,
) {
  test('releases from 1.2.3', () => {
    assert.equal(calculateVersion('1.2.3', 'stable', 'patch'), '1.2.4');
    assert.equal(calculateVersion('1.2.3', 'stable', 'minor'), '1.3.0');
    assert.equal(calculateVersion('1.2.3', 'stable', 'major'), '2.0.0');
    assert.equal(calculateVersion('1.2.3', 'next', 'patch'), '1.2.4-next.0');
    assert.equal(calculateVersion('1.2.3', 'next', 'minor'), '1.3.0-next.0');
    assert.equal(calculateVersion('1.2.3', 'next', 'major'), '2.0.0-next.0');
  });

  test('releases from 1.2.3-next.0', () => {
    assert.equal(calculateVersion('1.2.3-next.0', 'stable', 'patch'), '1.2.3');
    assert.equal(calculateVersion('1.2.3-next.0', 'stable', 'minor'), '1.3.0');
    assert.equal(calculateVersion('1.2.3-next.0', 'stable', 'major'), '2.0.0');
    assert.equal(calculateVersion('1.2.3-next.0', 'next', 'patch'), '1.2.3-next.1');
    assert.equal(calculateVersion('1.2.3-next.0', 'next', 'minor'), '1.3.0-next.0');
    assert.equal(calculateVersion('1.2.3-next.0', 'next', 'major'), '2.0.0-next.0');
  });

  test('releases from 1.2.0-next.0', () => {
    assert.throws(() => calculateVersion('1.2.0-next.0', 'stable', 'patch'), prohibitedOperation);
    assert.equal(calculateVersion('1.2.0-next.0', 'stable', 'minor'), '1.2.0');
    assert.equal(calculateVersion('1.2.0-next.0', 'stable', 'major'), '2.0.0');
    assert.throws(() => calculateVersion('1.2.0-next.0', 'next', 'patch'), prohibitedOperation);
    assert.equal(calculateVersion('1.2.0-next.0', 'next', 'minor'), '1.2.0-next.1');
    assert.equal(calculateVersion('1.2.0-next.0', 'next', 'major'), '2.0.0-next.0');
  });

  test('releases from 1.0.0-next.0', () => {
    assert.throws(() => calculateVersion('1.0.0-next.0', 'stable', 'patch'), prohibitedOperation);
    assert.throws(() => calculateVersion('1.0.0-next.0', 'stable', 'minor'), prohibitedOperation);
    assert.equal(calculateVersion('1.0.0-next.0', 'stable', 'major'), '1.0.0');
    assert.throws(() => calculateVersion('1.0.0-next.0', 'next', 'patch'), prohibitedOperation);
    assert.throws(() => calculateVersion('1.0.0-next.0', 'next', 'minor'), prohibitedOperation);
    assert.equal(calculateVersion('1.0.0-next.0', 'next', 'major'), '1.0.0-next.1');
  });

  test('Transition from alpha patch to next', () => {
    assert.equal(calculateVersion('1.2.3-alpha.4', 'next', 'patch'), '1.2.3-next.0');
    assert.equal(calculateVersion('1.2.3-alpha.4', 'next', 'minor'), '1.3.0-next.0');
    assert.equal(calculateVersion('1.2.3-alpha.4', 'next', 'major'), '2.0.0-next.0');
  });

  test('Transition from alpha minor to next', () => {
    assert.throws(() => calculateVersion('1.2.0-alpha.4', 'next', 'patch'), prohibitedOperation);
    assert.equal(calculateVersion('1.2.0-alpha.4', 'next', 'minor'), '1.2.0-next.0');
    assert.equal(calculateVersion('1.2.0-alpha.4', 'next', 'major'), '2.0.0-next.0');
  });

  test('Transition from alpha major to next', () => {
    assert.throws(() => calculateVersion('1.0.0-alpha.4', 'next', 'patch'), prohibitedOperation);
    assert.throws(() => calculateVersion('1.0.0-alpha.4', 'next', 'minor'), prohibitedOperation);
    assert.equal(calculateVersion('1.0.0-alpha.4', 'next', 'major'), '1.0.0-next.0');
  });

  test('Next suffix with build metadata', () => {
    assert.equal(calculateVersion('1.2.3-next.9+build.7', 'next', 'patch'), '1.2.3-next.10');
  });
}
