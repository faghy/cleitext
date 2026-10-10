import { useSyncExternalStore } from 'react';

/**
 * Admin translations (RF-ADM-04). Texts are written in English in the code
 * and looked up by that text: `t('Add New User')`. Missing translations fall
 * back to English. Values replace `{name}` placeholders.
 */
export type Messages = Record<string, string>;

const catalogs = new Map<string, Messages>();
const listeners = new Set<() => void>();
let language = 'en';

/** Adds translations for a language (the admin and plugins call it). */
export function addMessages(locale: string, messages: Messages): void {
  catalogs.set(locale, { ...catalogs.get(locale), ...messages });
  for (const listener of listeners) listener();
}

/** Language of the admin, e.g. `it` (from the user's profile). */
export function setLanguage(locale: string): void {
  const next = locale.split('-')[0]!.toLowerCase();
  if (next === language) return;
  language = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  for (const listener of listeners) listener();
}

export function getLanguage(): string {
  return language;
}

export function t(text: string, values?: Record<string, string | number>): string {
  const translated = catalogs.get(language)?.[text] ?? text;
  if (!values) return translated;
  return translated.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** `t` bound to the current language; components re-render when it changes. */
export function useT(): { t: typeof t; language: string } {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => `${language}:${catalogs.size}`,
  );
  return { t, language: current.split(':')[0]! };
}
