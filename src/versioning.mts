/**
 * Resolves the action's stable and beta release dropdowns to an npm version
 * operation. npm remains responsible for calculating and validating the next
 * SemVer version. A beta operation increments the suffix when it matches the
 * current beta line; otherwise it starts the selected beta line.
 * Operations below the current beta line are rejected as likely mistakes.
 *
 * Dropdown labels may include explanatory text after the operation name; only
 * the first whitespace-delimited token is treated as the canonical operation.
 *
 * Runtime usage (Node.js ≥ 24):
 *   node src/versioning.mts <current-version> <stable-release|-> <beta-release|->
 */
export type Release = 'patch' | 'minor' | 'major';
export type BetaRelease = `beta-${Release}`;
type NpmVersionOperation = Release | `pre${Release}` | 'prerelease';

const VERSION = /^\d+\.(\d+)\.(\d+)(.*)$/;

if (import.meta.main) {
  main();
}

function main(): void {
  const [currentVersion, stableRelease, betaRelease] = process.argv.slice(2);

  if (!currentVersion || stableRelease === undefined || betaRelease === undefined) {
    console.error('Usage: versioning.mts <current-version> <stable-release|-> <beta-release|->');
    process.exitCode = 1;
    return;
  }

  try {
    console.log(npmVersionOperation(currentVersion, stableRelease, betaRelease));
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

/** Resolve one stable or beta release choice to an npm version operation. */
export function npmVersionOperation(
  currentVersion: string,
  stableChoice: string,
  betaChoice: string,
): NpmVersionOperation {
  const stableOperation = operationFromChoice(stableChoice);
  const betaOperation = operationFromChoice(betaChoice);

  if (!stableOperation && !betaOperation) {
    throw new Error('Select either a stable release or a beta release');
  }
  if (stableOperation && betaOperation) {
    throw new Error('Select only one release: stable or beta');
  }

  const currentBeta = currentBetaRelease(currentVersion);

  if (stableOperation) {
    if (!['patch', 'minor', 'major'].includes(stableOperation)) {
      throw new Error(`Unknown stable release operation: ${stableOperation}`);
    }
    const release = stableOperation as Release;
    assertNotLowerRelease(currentVersion, currentBeta, release, release);
    return release;
  }

  if (!['beta-patch', 'beta-minor', 'beta-major'].includes(betaOperation!)) {
    throw new Error(`Unknown beta release operation: ${betaOperation}`);
  }

  const requestedBetaRelease = betaOperation as BetaRelease;
  const release = releaseFromBeta(requestedBetaRelease);
  assertNotLowerRelease(
    currentVersion,
    currentBeta,
    requestedBetaRelease,
    release,
  );
  if (currentBeta === requestedBetaRelease) return 'prerelease';

  return `pre${release}`;
}

function operationFromChoice(choice: string): string | undefined {
  const normalized = choice.trim();
  if (!normalized || normalized === '-') return undefined;

  // The first token is the action's stable contract. Any remaining text is a
  // consumer-defined label shown in the workflow_dispatch dropdown.
  return normalized.split(/\s+/, 1)[0];
}

function currentBetaRelease(version: string): BetaRelease | undefined {
  const match = VERSION.exec(version);
  if (!match || !match[3]) return undefined;

  const minor = Number(match[1]);
  const patch = Number(match[2]);
  if (patch > 0) return 'beta-patch';
  if (minor > 0) return 'beta-minor';
  return 'beta-major';
}

/**
 * Removes the `beta-` prefix to get the corresponding release.
 *
 * @example
 * releaseFromBeta('beta-minor'); // 'minor'
 */
function releaseFromBeta(betaRelease: BetaRelease): Release {
  return betaRelease.slice('beta-'.length) as Release;
}

function assertNotLowerRelease(
  currentVersion: string,
  currentBeta: BetaRelease | undefined,
  requestedOperation: Release | BetaRelease,
  requestedRelease: Release,
): void {
  if (!currentBeta) return;

  if (
    (currentBeta === 'beta-minor' && requestedRelease === 'patch') ||
    (currentBeta === 'beta-major' && requestedRelease !== 'major')
  ) {
    throw new Error(
      `Cannot use ${requestedOperation} from ${currentVersion}: ` +
      `lower operations are not permitted while on ${currentBeta}`,
    );
  }
}
