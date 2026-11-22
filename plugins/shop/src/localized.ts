/**
 * Shop texts in the customer's language (1.25): the checkout note with
 * `[en]`-style sections, the terms page with one address per language.
 */

const MARKER = /^\s*\[([a-z]{2,3}(?:[-_][a-z0-9]{2,8})?)\]\s*$/i;
const language = (locale: string) => locale.toLowerCase().split(/[-_]/)[0] ?? '';

/**
 * The note for a language. Text before any `[xx]` line is for every language
 * without its own section; a line `[en]` starts the English text, and so on.
 */
export function noteIn(note: string, locale: string): string {
  const sections = new Map<string, string[]>();
  let current = '';
  for (const line of note.split('\n')) {
    const marker = MARKER.exec(line);
    if (marker) {
      current = language(marker[1]!);
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (!sections.has(current)) sections.set(current, []);
    sections.get(current)!.push(line);
  }
  const pick = (key: string) => sections.get(key)?.join('\n').trim() ?? '';
  return pick(language(locale)) || pick('');
}

/**
 * The terms page for a language: `others` has one line per language, its code
 * then the address (`en https://example.com/terms`); otherwise `main`.
 */
export function termsIn(main: string, others: string, locale: string): string {
  const wanted = language(locale);
  for (const line of others.split('\n')) {
    const match = /^\s*([a-z]{2,3}(?:[-_][a-z0-9]{2,8})?)\s*[:=]?\s+(https?:\/\/\S+)\s*$/i.exec(
      line,
    );
    if (match && language(match[1]!) === wanted) return match[2]!;
  }
  return main;
}

/** A plain short text of a product's excerpt, for cart lines. */
export function shortText(excerpt: string, max = 140): string {
  const plain = excerpt
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}
