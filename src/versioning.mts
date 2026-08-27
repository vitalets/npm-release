/**
 * Resolves the action's channel and version dropdowns to an npm version
 * operation. npm remains responsible for calculating and validating the next
 * SemVer version. A prerelease operation increments the suffix when the
 * selected version line matches; otherwise it starts the selected line.
 * Operations below the current prerelease line are rejected as likely mistakes.
 *
 * Version labels may include explanatory text after the operation name; only
 * the first whitespace-delimited token is treated as the canonical operation.
 * Channel names are passed to npm unchanged as the prerelease identifier.
 *
 * Runtime usage (Node.js ≥ 24):
 *   node src/versioning.mts <current-version> <channel> <version>
 */
export type Release = 'patch' | 'minor' | 'major';
type NpmVersionOperation = Release | `pre${Release}` | 'prerelease';

const INCREMENT_TYPE: readonly string[] = ['patch', 'minor', 'major'];
const VERSION_RE = /^\d+\.(\d+)\.(\d+)(-|$)/;

if (import.meta.main) {
  main();
}

function main(): void {
  const [currentVersion, channel, version] = process.argv.slice(2);

  if (!currentVersion || channel === undefined || version === undefined) {
    console.error('Usage: versioning.mts <current-version> <channel> <version>');
    process.exitCode = 1;
    return;
  }

  try {
    console.log(npmVersionOperation(currentVersion, channel, version));
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

/** Resolve a release channel and version choice to an npm version operation. */
export function npmVersionOperation(
  currentVersion: string,
  channel: string,
  versionChoice: string,
): NpmVersionOperation {
  if (!channel || channel === '-') {
    throw new Error('Select a release channel');
  }

  const versionOperation = operationFromChoice(versionChoice);
  if (!versionOperation || !INCREMENT_TYPE.includes(versionOperation)) {
    throw new Error(`Unknown version operation: ${versionOperation ?? versionChoice}`);
  }

  const release = versionOperation as Release;
  const currentLine = currentPrereleaseLine(currentVersion);
  const requestedOperation = channel === 'stable' ? release : `${channel}-${release}`;
  assertNotLowerRelease(currentVersion, currentLine, requestedOperation, release);

  if (channel === 'stable') return release;
  if (currentLine === release) return 'prerelease';
  return `pre${release}`;
}

function operationFromChoice(choice: string): string | undefined {
  const normalized = choice.trim();
  if (!normalized) return undefined;

  // The first token is the action's stable contract. Any remaining text is a
  // consumer-defined label shown in the workflow_dispatch dropdown.
  return normalized.split(/\s+/, 1)[0];
}

function currentPrereleaseLine(version: string): Release | undefined {
  const match = VERSION_RE.exec(version);
  if (!match || match[3] !== '-') return undefined;

  const minor = Number(match[1]);
  const patch = Number(match[2]);
  if (patch > 0) return 'patch';
  if (minor > 0) return 'minor';
  return 'major';
}

function assertNotLowerRelease(
  currentVersion: string,
  currentLine: Release | undefined,
  requestedOperation: string,
  requestedRelease: Release,
): void {
  if (!currentLine) return;

  if (
    (currentLine === 'minor' && requestedRelease === 'patch') ||
    (currentLine === 'major' && requestedRelease !== 'major')
  ) {
    throw new Error(
      `Cannot use ${requestedOperation} from ${currentVersion}: ` +
      `lower operations are not permitted while on a ${currentLine} prerelease line`,
    );
  }
}
