import { PROVINCES, TOWNS } from './comuni-data';

/**
 * The "Italian municipality" field (Forms 1.11.0): the ISTAT list, a town
 * found from what the visitor sent (its code, its name, or its name with the
 * province for the few homonyms) and the value sent on, its name or its
 * numeric ISTAT code without leading zeros (028001 → 28001).
 */

export interface Comune {
  /** Six digits: province (3) and number (3). */
  code: string;
  name: string;
  /** The province's three-digit code. */
  province: string;
}

export type ComuneSend = 'name' | 'code';

let list: Comune[] | null = null;
let byKey: Map<string, Comune[]> | null = null;
const provinceNames = new Map(PROVINCES);

/** Names compared without case, accents' spelling of apostrophes, or extra spaces. */
const keyOf = (text: string) =>
  text.toLowerCase().replace(/[’`´]/g, "'").replace(/\s+/g, ' ').trim();

/** Every town, in code order. */
export function comuni(): Comune[] {
  if (!list) {
    list = TOWNS.split('\n').map((line) => {
      const [code, name] = line.split('\t') as [string, string];
      return { code, name, province: code.slice(0, 3) };
    });
    byKey = new Map();
    for (const c of list) {
      const key = keyOf(c.name);
      byKey.set(key, [...(byKey.get(key) ?? []), c]);
    }
  }
  return list;
}

export const provinces = () => PROVINCES;

/** A province's three-digit code when it is one of the list; '' otherwise. */
export function provinceCode(value: unknown): string {
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  if (!/^\d{1,3}$/.test(raw)) return '';
  const code = raw.padStart(3, '0');
  return provinceNames.has(code) ? code : '';
}

export const provinceName = (code: string) => provinceNames.get(code) ?? '';

/** The towns of a province, or of Italy when none is given. */
export function comuniOf(province: string): Comune[] {
  const all = comuni();
  return province ? all.filter((c) => c.province === province) : all;
}

/** How a town is shown: its name, with the province for the few homonyms. */
export function comuneLabel(c: Comune): string {
  comuni();
  return (byKey!.get(keyOf(c.name))?.length ?? 0) > 1
    ? `${c.name} (${provinceName(c.province)})`
    : c.name;
}

/**
 * The town a visitor sent: an ISTAT code (with or without leading zeros),
 * a name, or a name with its province in brackets. Within `province` when
 * the field has one. Null when none, or when a bare name is ambiguous.
 */
export function findComune(value: string, province = ''): Comune | null {
  const all = comuni();
  const raw = value.trim();
  if (!raw) return null;
  const inScope = (c: Comune | undefined | null) =>
    c && (!province || c.province === province) ? c : null;
  if (/^\d{4,6}$/.test(raw)) {
    const code = raw.padStart(6, '0');
    return inScope(all.find((c) => c.code === code));
  }
  const withProvince = /^(.*?)\s*\(([^()]+)\)$/.exec(raw);
  if (withProvince) {
    const found = (byKey!.get(keyOf(withProvince[1]!)) ?? []).filter(
      (c) => keyOf(provinceName(c.province)) === keyOf(withProvince[2]!),
    );
    if (found.length === 1) return inScope(found[0]);
  }
  const found = (byKey!.get(keyOf(raw)) ?? []).filter((c) => !province || c.province === province);
  return found.length === 1 ? found[0]! : null;
}

/** What is sent on for a town: its name, or its numeric code without leading zeros. */
export function comuneValue(c: Comune, send: ComuneSend): string {
  return send === 'code' ? String(Number(c.code)) : c.name;
}

/**
 * The script that fills the search list of the fields without a province:
 * the whole list once, cached by the browser, instead of 8,000 options in
 * every page.
 */
export function comuniScript(): string {
  const labels = comuni().map(comuneLabel);
  return `(function(){if(window.__cfComuni)return;window.__cfComuni=1;var L=${JSON.stringify(labels)};function f(){document.querySelectorAll('datalist[data-cf-comuni]').forEach(function(d){if(d.options.length)return;var x=document.createDocumentFragment();L.forEach(function(t){var o=document.createElement('option');o.value=t;x.appendChild(o)});d.appendChild(x)})}document.readyState==='loading'?document.addEventListener('DOMContentLoaded',f):f()})();`;
}
