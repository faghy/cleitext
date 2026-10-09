import type { ThemeDefinition } from '@cleitext/theme-sdk';
import { theme as aurora } from '@cleitext/theme-aurora';

/** Installed themes. Installation from packages comes with plugins (M4). */
const THEMES = new Map<string, ThemeDefinition>([[aurora.slug, aurora]]);
export const DEFAULT_THEME = 'aurora';

export function themeFor(slug: string | null | undefined): ThemeDefinition {
  return THEMES.get(slug ?? DEFAULT_THEME) ?? THEMES.get(DEFAULT_THEME)!;
}

export function installedThemes(): ThemeDefinition[] {
  return [...THEMES.values()];
}
