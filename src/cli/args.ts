/**
 * Parses explicit release workflow and branch arguments.
 */
import { parseArgs } from 'node:util';

/**
 * Validates the CLI invocation before release preparation.
 */
export function parseCliArgs(argv: string[]) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true,
    options: { branch: { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
  if (values.help) return { help: true as const };
  if (positionals.length !== 1 || !/^\.github\/workflows\/[^/]+\.ya?ml$/.test(positionals[0])) {
    throw new Error('Provide one workflow path: .github/workflows/release.yml');
  }
  if (values.branch?.includes('*')) throw new Error('--branch must name a specific branch; wildcards are not allowed.');
  if (values.branch === '') throw new Error('--branch must not be empty');
  return { help: false as const, workflow: positionals[0], branch: values.branch };
}
