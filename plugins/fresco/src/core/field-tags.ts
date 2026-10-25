import type { Settings } from './model.js';

/**
 * The "Custom field" dynamic tag (`field`, of Fresco Pro) read through the
 * core's dynamic sources (plugin API 1.47): values come formatted, so an
 * image field (a media id) gives the image, a list its texts. Resolved
 * before the other resolvers, which then no longer see these tags.
 */

interface FieldTag {
  tag: string;
  kind?: string;
  key?: string;
  before?: string;
  after?: string;
  fallback?: string;
}

type Kind = 'text' | 'url' | 'media';

/** A formatted media value (`{ id, url, alt }`). */
function asMedia(value: unknown): { id: string | null; url: string; alt?: string } | undefined {
  if (value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string') {
    const v = value as { id?: unknown; url: string; alt?: unknown };
    return {
      id: typeof v.id === 'string' ? v.id : null,
      url: v.url,
      ...(typeof v.alt === 'string' ? { alt: v.alt } : {}),
    };
  }
  if (
    typeof value === 'string' &&
    /^(https?:\/\/|\/(?!\/))\S+\.(jpe?g|png|gif|webp|avif|svg)(\?\S*)?$/i.test(value)
  ) {
    return { id: null, url: value };
  }
  return undefined;
}

/** A formatted value as a setting of a kind; undefined when it has none. */
export function fieldTagValue(value: unknown, kind: Kind): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (kind === 'media') return asMedia(value);
  if (kind === 'url') {
    if (typeof value === 'string') return value;
    return asMedia(value)?.url;
  }
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '✓' : '';
  if (Array.isArray(value)) {
    const texts = value.filter((v) => typeof v === 'string' || typeof v === 'number');
    return texts.length ? texts.join(', ') : undefined;
  }
  return undefined;
}

/**
 * Settings with their `field` tags filled in from the core's sources
 * (`resolve` gets a source id, e.g. `entry.field:team.photo`). Before,
 * after and the fallback work as for every tag; the tags are taken out of
 * `__dynamic`. Unchanged when there are none.
 */
export async function resolveFieldTags(
  attrs: Settings,
  resolve: (source: string) => Promise<unknown>,
): Promise<Settings> {
  const dynamic = attrs.__dynamic as Record<string, FieldTag> | undefined;
  if (!dynamic || typeof dynamic !== 'object') return attrs;
  const names = Object.keys(dynamic).filter(
    (name) => dynamic[name]?.tag === 'field' && typeof dynamic[name]?.key === 'string',
  );
  if (names.length === 0) return attrs;
  const out: Settings = { ...attrs };
  const rest: Record<string, FieldTag> = { ...dynamic };
  for (const name of names) {
    const input = dynamic[name]!;
    delete rest[name];
    const rich = input.kind === 'richtext';
    const kind: Kind = input.kind === 'url' || input.kind === 'media' ? input.kind : 'text';
    let value = fieldTagValue(await resolve(`entry.field:${input.key!.trim()}`), kind);
    let fallback = false;
    if (value === undefined || value === '') {
      if (!input.fallback) continue;
      value = kind === 'media' ? { id: null, url: input.fallback } : input.fallback;
      fallback = true;
    }
    if (kind === 'text') {
      const text = fallback
        ? String(value)
        : `${input.before ?? ''}${String(value)}${input.after ?? ''}`;
      out[name] = rich ? `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>` : text;
    } else if (kind === 'url') {
      const previous = (
        attrs[name] && typeof attrs[name] === 'object' ? attrs[name] : {}
      ) as Record<string, unknown>;
      out[name] = { ...previous, url: String(value) };
    } else {
      out[name] = value;
    }
  }
  if (Object.keys(rest).length > 0) out.__dynamic = rest;
  else delete out.__dynamic;
  return out;
}
