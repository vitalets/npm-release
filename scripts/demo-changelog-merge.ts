/**
 * Previews changelog merge setup output from simulated initial states without writing files.
 */

import { parseArgs } from 'node:util';
import { select } from '@inquirer/prompts';
import { printSetupResult } from '../src/cli/changelog-merge/setup-output.ts';

/**
 * Documents how to start the interactive preview.
 */
const USAGE = `Usage: npm run demo:changelog-merge

Interactively select the initial .gitattributes and local Git config states.
No files or Git configuration are changed.`;

await main();

async function main() {
  try {
    const { values } = parseArgs({ options: {
      help: { type: 'boolean' },
    } });
    if (values.help) {
      console.log(USAGE);
      return;
    }
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run this demo in an interactive terminal.');
    console.log('DEMO: Simulated setup. No files or Git configuration are changed.\n');
    const attributes = await select({
      message: 'Initial .gitattributes state:',
      choices: [
        { name: 'Missing — file does not exist', value: 'created' as const },
        { name: 'Existing — file is missing the changelog rule', value: 'updated' as const },
        { name: 'Configured — file already contains the changelog rule', value: 'unchanged' as const },
      ],
    });
    const config = await select({
      message: 'Initial local Git config state:',
      choices: [
        { name: 'Missing — merge driver is not configured', value: 'updated' as const },
        { name: 'Existing — merge driver settings need updating', value: 'updated' as const },
        { name: 'Configured — merge driver settings are already correct', value: 'unchanged' as const },
      ],
    });
    console.log('');
    printSetupResult({ attributes, config });
  } catch (error) {
    console.error((error as Error).name === 'ExitPromptError' ? 'Demo cancelled.' : (error as Error).message);
    process.exitCode = 1;
  }
}
