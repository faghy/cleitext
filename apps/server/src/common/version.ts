import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appRoot } from '../install/token.js';

let version: string | undefined;

/** The running Cleitext version (the root package.json), read once. */
export function appVersion(): string {
  if (version === undefined) {
    try {
      const pkg = JSON.parse(readFileSync(join(appRoot(), 'package.json'), 'utf8')) as {
        version?: string;
      };
      version = pkg.version ?? 'dev';
    } catch {
      version = 'dev';
    }
  }
  return version;
}

/**
 * The `user-agent` of the core's calls to the services of cleitext.com (the
 * relays of Chriss base and of the app's notifications): an explicit one, so
 * the proxy in front of them does not take the server for a bad browser.
 */
export function relayUserAgent(): string {
  return `Cleitext/${appVersion()} (+https://cleitext.com)`;
}
