/**
 * Resolves repository metadata from the GitHub Actions environment.
 */

import { logger } from './logger.ts';

/**
 * Builds the current repository URL from GitHub Actions environment variables.
 */
export function getRepositoryUrl(env: NodeJS.ProcessEnv = process.env) {
  const serverUrl = env.GITHUB_SERVER_URL?.replace(/\/+$/, '');
  const repository = env.GITHUB_REPOSITORY?.replace(/^\/+|\/+$/g, '');
  if (!serverUrl || !repository) {
    logger.error('Could not determine repository URL from GitHub Actions environment');
    process.exit(1);
  }
  return `${serverUrl}/${repository}`;
}
