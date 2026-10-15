import type { LinkValue } from './model.js';

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#|\?)/i;

/** Attributes of a link setting, or null when there is no (safe) address. */
export function linkProps(value: unknown): { href: string; target?: string; rel?: string } | null {
  if (!value || typeof value !== 'object') return null;
  const link = value as LinkValue;
  const url = typeof link.url === 'string' ? link.url.trim() : '';
  if (!url || !SAFE_HREF.test(url)) return null;
  const rel = [link.newTab ? 'noopener' : '', link.nofollow ? 'nofollow' : ''].filter(Boolean);
  return {
    href: url,
    ...(link.newTab ? { target: '_blank' } : {}),
    ...(rel.length ? { rel: rel.join(' ') } : {}),
  };
}
