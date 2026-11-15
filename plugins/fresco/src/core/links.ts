import type { LinkValue } from './model.js';

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#|\?)/i;

/** The HTML attributes of a link: address, target, rel, title and custom ones. */
export type LinkProps = { href: string; target?: string; rel?: string; title?: string } & {
  [attribute: string]: string | undefined;
};

/** Attributes a custom pair may not set: scripts, addresses and styles. */
const BLOCKED =
  /^(on|href$|xlink:href$|src$|srcset$|srcdoc$|action$|formaction$|style$|target$|rel$|title$)/i;
const NAME = /^[a-z_:][a-z0-9_.:-]{0,63}$/i;

/** `name|value, name2|value2` → safe attribute pairs (at most 20). */
export function customAttributes(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof raw !== 'string') return out;
  for (const pair of raw.split(/,|\n/).slice(0, 20)) {
    const bar = pair.indexOf('|');
    const name = (bar < 0 ? pair : pair.slice(0, bar)).trim();
    if (!NAME.test(name) || BLOCKED.test(name)) continue;
    out[name.toLowerCase()] =
      bar < 0
        ? ''
        : pair
            .slice(bar + 1)
            .trim()
            .slice(0, 500);
  }
  return out;
}

/** Attributes of a link setting, or null when there is no (safe) address. */
export function linkProps(value: unknown): LinkProps | null {
  if (!value || typeof value !== 'object') return null;
  const link = value as LinkValue;
  const url = typeof link.url === 'string' ? link.url.trim() : '';
  if (!url || !SAFE_HREF.test(url)) return null;
  const rel = [link.newTab ? 'noopener' : '', link.nofollow ? 'nofollow' : ''].filter(Boolean);
  const title = typeof link.title === 'string' ? link.title.trim() : '';
  return {
    ...customAttributes(link.attributes),
    href: url,
    ...(link.newTab ? { target: '_blank' } : {}),
    ...(rel.length ? { rel: rel.join(' ') } : {}),
    ...(title ? { title } : {}),
  };
}
