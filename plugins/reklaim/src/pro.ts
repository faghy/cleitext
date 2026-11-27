/**
 * How Reklaim Pro adds to Reklaim: a list kept on `globalThis` under
 * `Symbol.for('cleitext.reklaim')`, set up again whenever plugins reload.
 * Reklaim Pro requires Reklaim, so it loads after it and finds the API in
 * its own `setup`. For each page, Reklaim asks Pro which bars it adds (in
 * order: the first whose anchor is on the page wins), whether the page hides
 * the bar, and whether it also shows on computers or at the top.
 */

export const UPGRADE_URL = 'https://cleitext.com/plugins/reklaim-pro';

/** A bar: what it says, and where its button goes. */
export interface Bar {
  /** Names the bar in the click counter, e.g. `default`, `page`, a rule's name. */
  id: string;
  /**
   * The id of an element of the page (without `#`), e.g. `demo`: when the
   * page has it, the button goes there and the bar hides while it is in view.
   * A bar of Pro with an anchor is used only on pages that have it.
   */
  anchor: string;
  text: string;
  button: string;
  /** Where the button goes when the page has no anchor. */
  link: string;
  /** Shown from and until these days (`YYYY-MM-DD`, the visitor's date), when set. */
  from?: string;
  to?: string;
}

/** The page Reklaim asks about. */
export interface ReklaimPage {
  siteId: string;
  locale: string;
  path: string;
  route: string;
  entry?: { id: string; type: string; fields: Record<string, unknown> };
}

/** What Pro says about a page; anything missing leaves Reklaim's own. */
export interface ProAnswer {
  /** No bar on this page. */
  hide?: boolean;
  /** Bars tried before the site's bar, in order. */
  bars?: Bar[];
  /** Also on computers and tablets. */
  desktop?: boolean;
  position?: 'bottom' | 'top';
}

export interface ReklaimServerApi {
  version: 1;
  providers: ((page: ReklaimPage) => ProAnswer | null | Promise<ProAnswer | null>)[];
  /** The address of the Reklaim Pro page shown in the invitations. */
  upgradeUrl: string;
}

const KEY = Symbol.for('cleitext.reklaim');

export function installServerApi(): ReklaimServerApi {
  const api: ReklaimServerApi = { version: 1, providers: [], upgradeUrl: UPGRADE_URL };
  (globalThis as unknown as Record<symbol, unknown>)[KEY] = api;
  return api;
}

/** The answers of Pro put together: bars in order; any `hide` hides. A failing answer is skipped. */
export async function askPro(
  api: ReklaimServerApi,
  page: ReklaimPage,
  log?: (message: string) => void,
): Promise<{ pro: boolean } & Required<ProAnswer>> {
  const out = {
    pro: false,
    hide: false,
    bars: [] as Bar[],
    desktop: false,
    position: 'bottom' as const as 'bottom' | 'top',
  };
  for (const provider of api.providers) {
    try {
      const answer = await provider(page);
      if (!answer) continue;
      out.pro = true;
      if (answer.hide) out.hide = true;
      if (answer.bars) out.bars.push(...answer.bars);
      if (answer.desktop) out.desktop = true;
      if (answer.position) out.position = answer.position;
    } catch (error) {
      log?.(`Reklaim Pro's answer failed: ${String(error)}`);
    }
  }
  return out;
}
