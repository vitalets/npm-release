/**
 * Presents setup results shared by the real command and the file-free demo.
 */

import * as util from 'node:util';
import { logger } from '../../utils/logger.ts';
import { CHANGELOG_ATTRIBUTE } from './git-attributes.ts';
import { MERGE_DRIVER_CONFIG } from './git-config.ts';

export type SetupResult = {
  attributes: 'created' | 'updated' | 'unchanged';
  config: 'updated' | 'unchanged';
};

/**
 * Prints two status bullets with the corresponding attribute and config snippets.
 */
export function printSetupResult(result: SetupResult) {
  const filename = styleText('cyan', '.gitattributes');
  const attributesMessage = result.attributes === 'unchanged'
    ? `Root ${filename} already contains the required rule:`
    : `${result.attributes === 'created' ? 'Created' : 'Updated'} root ${filename}:`;
  printBullet(attributesMessage, CHANGELOG_ATTRIBUTE, result.attributes === 'unchanged');
  logger.log('');
  const configMessage = result.config === 'unchanged'
    ? 'Local Git config already contains the required merge driver:'
    : 'Updated local Git config:';
  printBullet(configMessage, MERGE_DRIVER_CONFIG, result.config === 'unchanged');
}

function printBullet(message: string, snippet: string, unchanged: boolean) {
  logger.log(`${styleText('green', '✔')} ${unchanged ? styleText('green', message) : message}`);
  logger.log(styleText(unchanged ? 'green' : 'cyan', snippet));
}

function styleText(format: 'green' | 'cyan', value: string) {
  if (!process.stdout.isTTY || process.env.NO_COLOR !== undefined) return value;
  return util.styleText?.(format, value) ?? value;
}
