/** Admin color scheme (RF-ADM-04), remembered per browser. */
export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'cleitext.theme';

export function themePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

/** `system` follows the operating system (prefers-color-scheme). */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
  try {
    if (preference === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, preference);
  } catch {
    // Not remembered: the choice still applies to this visit.
  }
}
