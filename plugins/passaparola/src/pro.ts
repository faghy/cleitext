/**
 * How Passaparola Pro will extend Passaparola on the server: lists kept on
 * `globalThis` under `Symbol.for('cleitext.passaparola')`, set up again
 * whenever plugins reload. A failing extension is logged and left out: it
 * never breaks a conversion.
 */
import { API_KEY, UPGRADE_URL } from './config';

export interface PassaparolaServerApi {
  version: 1;
  /**
   * Whether every source counts on a site (true wins). The free version
   * counts the one chosen in the settings; Passaparola Pro, with a valid
   * license, all of them.
   */
  allSources: ((siteId: string) => boolean | Promise<boolean>)[];
  /** The page of Passaparola Pro, for the invitations in the admin. */
  upgradeUrl: string;
}

const KEY = Symbol.for(API_KEY);

export function installServerApi(): PassaparolaServerApi {
  const api: PassaparolaServerApi = { version: 1, allSources: [], upgradeUrl: UPGRADE_URL };
  (globalThis as unknown as Record<symbol, unknown>)[KEY] = api;
  return api;
}

/** Whether every source counts on the site. */
export async function allSources(
  api: PassaparolaServerApi,
  siteId: string,
  log?: (message: string) => void,
): Promise<boolean> {
  for (const provider of api.allSources) {
    try {
      if ((await provider(siteId)) === true) return true;
    } catch (error) {
      log?.(`A sources provider failed: ${String(error)}`);
    }
  }
  return false;
}
