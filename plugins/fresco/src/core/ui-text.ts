/**
 * The few words Fresco writes on the page itself for visitors (labels of
 * buttons read by screen readers), in the page's language. English is the
 * fallback.
 */
const TEXTS = {
  Close: { it: 'Chiudi' },
  Previous: { it: 'Precedente' },
  Next: { it: 'Successivo' },
  Menu: { it: 'Menu' },
  'Play video': { it: 'Riproduci il video' },
  Images: { it: 'Immagini' },
} as const;

export type UiText = keyof typeof TEXTS;

/** A visitor-facing label in a locale (`it`, `it-IT`…), or the English one. */
export function uiText(locale: string | undefined, text: UiText): string {
  const language = (locale ?? '').toLowerCase().split(/[-_]/)[0] as string;
  return (TEXTS[text] as Partial<Record<string, string>>)[language] ?? text;
}
