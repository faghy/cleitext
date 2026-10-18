/**
 * Site-wide defaults of the blocks (Settings → Prisma): containers left at
 * the default use them, so changing a setting changes all of them.
 */
export interface Globals {
  /** Width of a container's boxed content (px). */
  contentWidth: number;
  /** Padding of containers on every side (px). */
  containerPadding: number;
  /** Space between the elements of a container (px). */
  elementsGap: number;
  /** CSS variables of the pages, e.g. a former theme's palette: `--name: value` lines. */
  cssVariables: string;
}

export const DEFAULT_GLOBALS: Globals = {
  contentWidth: 1140,
  containerPadding: 10,
  elementsGap: 20,
  cssVariables: '',
};

export function normalizeGlobals(value: Record<string, unknown> | null | undefined): Globals {
  const n = (v: unknown, fallback: number, min: number, max: number) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= min && x <= max ? x : fallback;
  };
  return {
    contentWidth: n(value?.contentWidth, DEFAULT_GLOBALS.contentWidth, 320, 4000),
    containerPadding: n(value?.containerPadding, DEFAULT_GLOBALS.containerPadding, 0, 400),
    elementsGap: n(value?.elementsGap, DEFAULT_GLOBALS.elementsGap, 0, 400),
    cssVariables: typeof value?.cssVariables === 'string' ? value.cssVariables : '',
  };
}

/** `:root{…}` of the variables set (only well-formed `--name: value` lines). */
export function variablesCss(globals: Globals): string {
  const lines = globals.cssVariables
    .split(/[\n;]+/)
    .map((line) => /^\s*(--[A-Za-z0-9_-]{1,60})\s*:\s*([^;{}<>]{1,200})\s*$/.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => `${m[1]}:${m[2]!.trim()}`);
  return lines.length ? `:root{${lines.join(';')}}` : '';
}
