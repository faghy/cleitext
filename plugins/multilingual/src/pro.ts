/**
 * What Multilingual does without Multilingual Pro, and how Multilingual Pro
 * lifts it: a list kept on `globalThis` under `Symbol.for('cleitext.multilingual')`,
 * set up again whenever plugins reload. Multilingual Pro requires
 * Multilingual, so it loads after it and finds the API in its own `setup`.
 *
 * Without Pro a site has its default language and one more, only the first
 * site of the installation adds languages, and the extras (automatic
 * translation, a domain per language, content not translated yet) cannot be
 * set up. Nothing already set up ever stops working: the limits only refuse
 * adding more.
 */

/** Languages, the default one included, a site may have without Multilingual Pro. */
export const FREE_LANGUAGES = 2;

export const UPGRADE_URL = 'https://cleitext.com/plugins/multilingual-pro';

export interface MultilingualServerApi {
  version: 1;
  /**
   * Whether Multilingual Pro lifts the limits on a site: any `true` wins,
   * `null` means "no opinion". Multilingual Pro answers `true` while its
   * license is current on that site.
   */
  unlocked: ((siteId: string) => boolean | null | Promise<boolean | null>)[];
  /** The address of the Multilingual Pro page shown in the invitations. */
  upgradeUrl: string;
}

/** The limits of a site, as the Languages page shows them. */
export interface Limits {
  pro: boolean;
  /** Languages the site may have, the default included; null: no limit. */
  languages: number | null;
  /** False on the other sites of an installation, which keep their default language only. */
  freeSite: boolean;
  upgradeUrl: string;
}

const KEY = Symbol.for('cleitext.multilingual');

export function installServerApi(): MultilingualServerApi {
  const api: MultilingualServerApi = { version: 1, unlocked: [], upgradeUrl: UPGRADE_URL };
  (globalThis as unknown as Record<symbol, unknown>)[KEY] = api;
  return api;
}

export function serverApi(): MultilingualServerApi | undefined {
  return (globalThis as unknown as Record<symbol, MultilingualServerApi | undefined>)[KEY];
}

/** Whether Multilingual Pro lifts the limits on the site. A failing answer counts as no. */
export async function isUnlocked(
  api: MultilingualServerApi,
  siteId: string,
  log?: (message: string) => void,
): Promise<boolean> {
  for (const provider of api.unlocked) {
    try {
      if ((await provider(siteId)) === true) return true;
    } catch (error) {
      log?.(`Multilingual Pro's check failed: ${String(error)}`);
    }
  }
  return false;
}

/**
 * The free site of an installation: the oldest one where the plugin is
 * active. Older cores cannot tell, and every site counts as free there.
 */
export function isFreeSite(siteId: string, activeSites: string[] | null): boolean {
  if (!activeSites || activeSites.length === 0) return true;
  return activeSites[0] === siteId;
}

export function limitsFor(pro: boolean, freeSite: boolean, upgradeUrl = UPGRADE_URL): Limits {
  return {
    pro,
    languages: pro ? null : freeSite ? FREE_LANGUAGES : 1,
    freeSite,
    upgradeUrl,
  };
}
