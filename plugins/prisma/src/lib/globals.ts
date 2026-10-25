import { fontsMode, type GoogleFontsMode } from '@cleitext/design/fonts';

/**
 * Site-wide defaults of the blocks (Settings → Prisma): containers left at
 * the default use them, so changing a setting changes all of them.
 */
export interface Globals {
  /**
   * Width of a container's boxed content (px). Unset (`null`): the theme's
   * content width (`--cx-container-width`, 1140px without it), as the
   * original blocks take the theme's.
   */
  contentWidth: number | null;
  /** Padding of containers on every side (px). */
  containerPadding: number;
  /** Space between the elements of a container (px). */
  elementsGap: number;
  /** CSS variables of the pages, e.g. a former theme's palette: `--name: value` lines. */
  cssVariables: string;
  /**
   * How pages get the Google fonts the blocks choose: copies kept on this
   * site (`local`, the default, also for sites made before the setting: no
   * visitor reaches Google), from Google's servers (`google`), or not at all
   * (`none`: the theme or the site provides them).
   */
  googleFonts: GoogleFontsMode;
}

export const DEFAULT_GLOBALS: Globals = {
  contentWidth: null,
  containerPadding: 10,
  elementsGap: 20,
  cssVariables: '',
  googleFonts: 'local',
};

export function normalizeGlobals(value: Record<string, unknown> | null | undefined): Globals {
  const n = <T extends number | null>(v: unknown, fallback: T, min: number, max: number) => {
    if (v === null || v === undefined || v === '') return fallback;
    const x = Number(v);
    return Number.isFinite(x) && x >= min && x <= max ? x : fallback;
  };
  return {
    contentWidth: n(value?.contentWidth, DEFAULT_GLOBALS.contentWidth, 320, 4000),
    containerPadding: n(value?.containerPadding, DEFAULT_GLOBALS.containerPadding, 0, 400),
    elementsGap: n(value?.elementsGap, DEFAULT_GLOBALS.elementsGap, 0, 400),
    cssVariables: typeof value?.cssVariables === 'string' ? value.cssVariables : '',
    googleFonts: fontsMode(value?.googleFonts),
  };
}

/** Boxed content width of containers that set none: the theme's, else 1140px. */
export const THEME_CONTENT_WIDTH = 'var(--cx-container-width, 1140px)';

/** `:root{…}` of the variables set (only well-formed `--name: value` lines). */
export function variablesCss(globals: Globals): string {
  const lines = globals.cssVariables
    .split(/[\n;]+/)
    .map((line) => /^\s*(--[A-Za-z0-9_-]{1,60})\s*:\s*([^;{}<>]{1,200})\s*$/.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => `${m[1]}:${m[2]!.trim()}`);
  return lines.length ? `:root{${lines.join(';')}}` : '';
}
