/**
 * What Vetta SEO does without Vetta SEO Pro, and how Vetta SEO Pro lifts it:
 * a list kept on `globalThis` under `Symbol.for('cleitext.vetta')`, set up
 * again whenever plugins reload. Vetta SEO Pro requires Vetta SEO, so it
 * loads after it and finds the API in its own `setup`.
 *
 * Without Pro a site has one keyword per page, and neither SEO on each
 * category and tag nor the local business data, the log of pages not found,
 * IndexNow or llms.txt. Nothing a site already used before Vetta SEO 2.0
 * stops: those features are remembered per site (`kept`) and stay free there.
 * What a site switched on while Pro was current is remembered the same way,
 * so it keeps working when the license ends; only switching more on waits.
 * The product and own JSON-LD of pages came with Vetta SEO 2.1, inside Pro:
 * a site keeps them once it had Pro.
 */
import { moduleOn, type Config, type Module } from './config.js';

export const UPGRADE_URL = 'https://cleitext.com/plugins/vetta-pro';

/** Keywords per page without Pro, and with it. */
export const FREE_KEYWORDS = 1;
export const PRO_KEYWORDS = 5;

/** The modules that need Pro. */
export const PRO_MODULES = [
  'localSeo',
  'monitor404',
  'indexNow',
  'llms',
] as const satisfies readonly Module[];
export type ProModule = (typeof PRO_MODULES)[number];

/**
 * Everything Pro adds: its modules, more keywords, SEO on each term, and the
 * product and own JSON-LD of each page (`schemaPlus`, Vetta SEO 2.1).
 */
export type ProFeature = ProModule | 'keywords' | 'terms' | 'schemaPlus';

export const isProModule = (m: string): m is ProModule =>
  (PRO_MODULES as readonly string[]).includes(m);

export interface VettaServerApi {
  version: 1;
  /**
   * Whether Vetta SEO Pro lifts the limits on a site: any `true` wins,
   * `null` means "no opinion". Vetta SEO Pro answers `true` while its
   * license is current on that site.
   */
  unlocked: ((siteId: string) => boolean | null | Promise<boolean | null>)[];
  /** The address of the Vetta SEO Pro page shown in the invitations. */
  upgradeUrl: string;
}

/** What a site may use, as the admin shows it. */
export interface Limits {
  pro: boolean;
  keywords: number;
  terms: boolean;
  /** The product (or application, service) and own JSON-LD of each page. */
  schema: boolean;
  /** The modules of Pro this site may switch on. */
  modules: Record<ProModule, boolean>;
  upgradeUrl: string;
}

const KEY = Symbol.for('cleitext.vetta');

export function installServerApi(): VettaServerApi {
  const api: VettaServerApi = { version: 1, unlocked: [], upgradeUrl: UPGRADE_URL };
  (globalThis as unknown as Record<symbol, unknown>)[KEY] = api;
  return api;
}

/** Whether Vetta SEO Pro lifts the limits on the site. A failing answer counts as no. */
export async function isUnlocked(
  api: VettaServerApi,
  siteId: string,
  log?: (message: string) => void,
): Promise<boolean> {
  for (const provider of api.unlocked) {
    try {
      if ((await provider(siteId)) === true) return true;
    } catch (error) {
      log?.(`Vetta SEO Pro's check failed: ${String(error)}`);
    }
  }
  return false;
}

/**
 * The features of Pro a site already had before Vetta SEO 2.0, kept free
 * there: the modules of Pro that were on, more keywords and SEO on terms
 * (both were part of every site's Vetta). A site where Vetta is switched on
 * for the first time keeps nothing.
 */
export function keptFeatures(config: Config): ProFeature[] {
  return [...PRO_MODULES.filter((m) => moduleOn(config, m)), 'keywords', 'terms'];
}

export function limitsFor(
  pro: boolean,
  kept: readonly ProFeature[],
  upgradeUrl = UPGRADE_URL,
): Limits {
  const has = (f: ProFeature) => pro || kept.includes(f);
  return {
    pro,
    keywords: has('keywords') ? PRO_KEYWORDS : FREE_KEYWORDS,
    terms: has('terms'),
    schema: has('schemaPlus'),
    modules: Object.fromEntries(PRO_MODULES.map((m) => [m, has(m)])) as Record<ProModule, boolean>,
    upgradeUrl,
  };
}

/** The settings as the site may use them: the modules of Pro it may not use are off. */
export function effectiveConfig(config: Config, limits: Limits): Config {
  const out = { ...config };
  for (const m of PRO_MODULES) if (!limits.modules[m]) out[`module_${m}`] = false;
  return out;
}
