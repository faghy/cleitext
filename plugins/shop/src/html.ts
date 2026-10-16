/**
 * HTML of the shop's public pages, escaped by default: values are text
 * unless they are `Html` themselves (`html` results or `raw`).
 */
export class Html {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

type Value = Html | string | number | boolean | null | undefined | Value[];

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

function render(value: Value): string {
  if (value === null || value === undefined || value === false || value === true) return '';
  if (Array.isArray(value)) return value.map(render).join('');
  if (value instanceof Html) return value.value;
  return escape(String(value));
}

export function html(strings: TemplateStringsArray, ...values: Value[]): Html {
  let out = strings[0]!;
  for (let i = 0; i < values.length; i++) out += render(values[i]!) + strings[i + 1]!;
  return new Html(out);
}

/** Markup made by the shop itself (e.g. its stylesheet). */
export const raw = (value: string) => new Html(value);
