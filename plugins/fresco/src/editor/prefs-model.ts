/**
 * The editor's preferences of each user (User preferences, Ctrl+Shift+U):
 * the look of the editor, where "Exit" goes, the panel's width and the
 * favorite elements. Kept by Fresco's server per user (and in the browser,
 * for the first paint); the same checks run on both sides.
 */

export interface Preferences {
  /** The editor's colors: as the system's, light or dark. */
  theme: 'auto' | 'light' | 'dark';
  /** Where "Exit" goes: the list of entries, the page on the site, or the dashboard. */
  exitTo: 'list' | 'page' | 'dashboard';
  /** The panel's width in px (the default when absent). */
  panelWidth?: number;
  /** Element types shown first in the panel. */
  favorites: string[];
}

export const DEFAULT_PREFERENCES: Preferences = { theme: 'light', exitTo: 'list', favorites: [] };

export const PANEL_WIDTH = { min: 280, max: 600, initial: 300 } as const;

/** A width within the panel's limits. */
export function clampPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return PANEL_WIDTH.initial;
  return Math.round(Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, width)));
}

/** Preferences read from storage or a request: unknown values fall back to the defaults. */
export function normalizePreferences(value: unknown): Preferences {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const theme = ['auto', 'light', 'dark'].includes(input.theme as string)
    ? (input.theme as Preferences['theme'])
    : DEFAULT_PREFERENCES.theme;
  const exitTo = ['list', 'page', 'dashboard'].includes(input.exitTo as string)
    ? (input.exitTo as Preferences['exitTo'])
    : DEFAULT_PREFERENCES.exitTo;
  const favorites = Array.isArray(input.favorites)
    ? [
        ...new Set(
          input.favorites.filter(
            (f): f is string => typeof f === 'string' && /^[\w/:.-]{1,120}$/.test(f),
          ),
        ),
      ].slice(0, 60)
    : [];
  return {
    theme,
    exitTo,
    favorites,
    ...(typeof input.panelWidth === 'number' && Number.isFinite(input.panelWidth)
      ? { panelWidth: clampPanelWidth(input.panelWidth) }
      : {}),
  };
}

/** Whether the editor is dark: the preference, or the system's when "auto". */
export function isDark(theme: Preferences['theme'], systemDark: boolean): boolean {
  return theme === 'dark' || (theme === 'auto' && systemDark);
}

/**
 * Where "Exit" goes: the entries list (the host's), the page on the site
 * (once published; else the list), or the admin's dashboard.
 */
export function exitUrl(
  exitTo: Preferences['exitTo'],
  places: { list: string; page: string | null; dashboard: string },
): string {
  if (exitTo === 'page' && places.page) return places.page;
  if (exitTo === 'dashboard') return places.dashboard;
  return places.list;
}
