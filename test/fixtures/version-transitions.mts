import type { Release } from '../../src/versioning.mts';

export type Transition = [channel: string, version: Release, expectedVersion: string | null];

export interface VersionTable {
  name?: string;
  currentVersion: string;
  transitions: Transition[];
}

export const versionTables: VersionTable[] = [
  {
    currentVersion: '1.2.3',
    transitions: [
      ['stable', 'patch', '1.2.4'],
      ['stable', 'minor', '1.3.0'],
      ['stable', 'major', '2.0.0'],
      ['next', 'patch', '1.2.4-next.0'],
      ['next', 'minor', '1.3.0-next.0'],
      ['next', 'major', '2.0.0-next.0'],
    ],
  },
  {
    currentVersion: '1.2.3-next.0',
    transitions: [
      ['stable', 'patch', '1.2.3'],
      ['stable', 'minor', '1.3.0'],
      ['stable', 'major', '2.0.0'],
      ['next', 'patch', '1.2.3-next.1'],
      ['next', 'minor', '1.3.0-next.0'],
      ['next', 'major', '2.0.0-next.0'],
    ],
  },
  {
    currentVersion: '1.2.0-next.0',
    transitions: [
      ['stable', 'patch', null],
      ['stable', 'minor', '1.2.0'],
      ['stable', 'major', '2.0.0'],
      ['next', 'patch', null],
      ['next', 'minor', '1.2.0-next.1'],
      ['next', 'major', '2.0.0-next.0'],
    ],
  },
  {
    currentVersion: '1.0.0-next.0',
    transitions: [
      ['stable', 'patch', null],
      ['stable', 'minor', null],
      ['stable', 'major', '1.0.0'],
      ['next', 'patch', null],
      ['next', 'minor', null],
      ['next', 'major', '1.0.0-next.1'],
    ],
  },
  {
    name: 'Transition from alpha patch to next',
    currentVersion: '1.2.3-alpha.4',
    transitions: [
      ['next', 'patch', '1.2.3-next.0'],
      ['next', 'minor', '1.3.0-next.0'],
      ['next', 'major', '2.0.0-next.0'],
    ],
  },
  {
    name: 'Transition from alpha minor to next',
    currentVersion: '1.2.0-alpha.4',
    transitions: [
      ['next', 'patch', null],
      ['next', 'minor', '1.2.0-next.0'],
      ['next', 'major', '2.0.0-next.0'],
    ],
  },
  {
    name: 'Transition from alpha major to next',
    currentVersion: '1.0.0-alpha.4',
    transitions: [
      ['next', 'patch', null],
      ['next', 'minor', null],
      ['next', 'major', '1.0.0-next.0'],
    ],
  },
  {
    name: 'Next suffix with build metadata',
    currentVersion: '1.2.3-next.9+build.7',
    transitions: [['next', 'patch', '1.2.3-next.10']],
  },
];
