import type { BlockLoadContext, PluginContext } from '@cleitext/plugin-sdk';
import { useEffect, useState } from 'react';
import { numeric } from '../../lib/emit';
import type { Attrs } from '../../lib/types';

/**
 * The posts of the post blocks (grid, carousel, timeline): read on the site
 * by `load`, fetched through the admin API in the editor, drawn by `View`
 * from the same shape.
 */

export interface PostImage {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  srcSet?: string;
}

export interface PostItem {
  id: string;
  title: string;
  url: string;
  /** Publication date (ISO). */
  date: string | null;
  author: { name: string; url: string | null } | null;
  /** Plain text: the author's excerpt, else the start of the text. */
  excerpt: string;
  /** Paragraphs of the whole text (the "full post" option only). */
  content: string[];
  image: PostImage | null;
  /** Approved comments, when known. */
  comments: number | null;
  /** Terms of the block's taxonomy. */
  terms: { name: string; url: string }[];
  /** The custom fields the block shows (`customFields`), as text, in their order. */
  fields?: { label: string; value: string }[];
}

/**
 * The custom fields a block shows: one per line, `key` or `key: Label`
 * (`dimensions: Size`). Keys are those of the content type's fields.
 */
export function fieldList(value: unknown): { key: string; label: string }[] {
  return String(value ?? '')
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((line) => {
      const at = line.indexOf(':');
      const key = (at === -1 ? line : line.slice(0, at)).trim();
      const label = at === -1 ? '' : line.slice(at + 1).trim();
      return { key, label };
    })
    .filter((f) => /^[A-Za-z0-9_-]{1,64}$/.test(f.key));
}

/** A field value as text: numbers, words, lists, choices (`{ label }`), links (`{ url }`). */
export function fieldText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.replace(/<[^>]*>/g, '').trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(fieldText).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return fieldText(o.label ?? o.name ?? o.title ?? o.text ?? '');
  }
  return '';
}

/** The chosen fields of an entry, those with a value. */
export function fieldsOf(fields: unknown, a: Attrs): { label: string; value: string }[] {
  const values = (fields ?? {}) as Record<string, unknown>;
  return fieldList(a.customFields)
    .map((f) => ({ label: f.label, value: fieldText(values[f.key]) }))
    .filter((f) => f.value);
}

export interface PostsData {
  posts: PostItem[];
  page: number;
  pages: number;
  /** Query parameter of the page number (pagination links). */
  param: string;
  locale: string;
}

/** WordPress's names of the core content types and taxonomies → Cleitext's. */
export function postTypeOf(value: unknown): string {
  const type = typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value) ? value : '';
  return !type || type === 'post' ? 'article' : type;
}
export function taxonomyOf(value: unknown): string {
  const tax = typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value) ? value : '';
  return !tax ? 'category' : tax === 'post_tag' ? 'tag' : tax;
}

/** The chosen terms as slugs (WordPress term ids, kept by imports, cannot be matched). */
export function termSlugs(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return list
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v !== '' && !/^\d+$/.test(v) && /^[\p{L}\p{N}_-]{1,200}$/u.test(v))
    .slice(0, 50);
}

const ORDER_BY: Record<string, 'date' | 'title' | 'modified' | 'random' | 'order'> = {
  date: 'date',
  title: 'title',
  modified: 'modified',
  rand: 'random',
  // WordPress's menu_order: the manual order of the admin.
  menu_order: 'order',
};

/** Image sizes of WordPress, by name, as widths. */
const SIZES: Record<string, number> = {
  thumbnail: 150,
  medium: 300,
  medium_large: 768,
  large: 1024,
};

interface MediaLike {
  url: string;
  alt?: string | Record<string, string>;
  width: number | null;
  height: number | null;
  variants?: { url: string; width: number; height: number; format?: string }[];
}

/** An image at a WordPress size (`large`…, `full` for the original). */
export function imageAt(media: MediaLike | null | undefined, size: unknown): PostImage | null {
  if (!media || typeof media.url !== 'string') return null;
  const alt = typeof media.alt === 'string' ? media.alt : '';
  const target = SIZES[String(size)] ?? null;
  const variants = (media.variants ?? [])
    .filter((v) => v.format !== 'avif')
    .sort((x, y) => x.width - y.width);
  const chosen =
    target === null ? null : (variants.find((v) => v.width >= target) ?? variants.at(-1) ?? null);
  const base = chosen ?? {
    url: media.url,
    width: media.width ?? undefined,
    height: media.height ?? undefined,
  };
  return {
    src: base.url,
    alt,
    ...(base.width && base.height ? { width: base.width, height: base.height } : {}),
    ...(variants.length > 1
      ? { srcSet: variants.map((v) => `${v.url} ${v.width}w`).join(', ') }
      : {}),
  };
}

interface InlineLike {
  text?: string;
  children?: { text?: string }[];
}
interface BlockLike {
  type?: string;
  content?: InlineLike[];
  children?: BlockLike[];
}

/** The paragraphs of a block document, as plain text. */
export function paragraphs(document: unknown): string[] {
  const out: string[] = [];
  const walk = (blocks: unknown) => {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks as BlockLike[]) {
      if (!block || typeof block !== 'object') continue;
      if (
        Array.isArray(block.content) &&
        /paragraph|heading|list-item|quote/.test(block.type ?? '')
      ) {
        const text = block.content
          .map((n) =>
            typeof n.text === 'string'
              ? n.text
              : (n.children ?? []).map((c) => c.text ?? '').join(''),
          )
          .join('')
          .replace(/\s+/g, ' ')
          .trim();
        if (text) out.push(text);
      }
      walk(block.children);
    }
  };
  walk((document as { blocks?: unknown } | null)?.blocks);
  return out;
}

/** WordPress's excerpt: the author's, else the first 100 words of the text. */
export function excerptOf(excerpt: string | null | undefined, text: string[]): string {
  const own = (excerpt ?? '').trim();
  const full = text.join(' ');
  // An excerpt made from the text (cut with "…") is not the author's.
  const auto = !own || full.startsWith(own.replace(/…$/, '').trim());
  return auto ? full.split(' ').slice(0, 100).join(' ') : own;
}

/** At most `length` words, with "..." when cut (as Spectra). */
export function trimWords(text: string, length: unknown): string {
  const n = Math.max(0, Math.round(numeric(length) ?? 15));
  const words = text.split(' ').filter(Boolean);
  return words.length > n ? `${words.slice(0, n).join(' ')}...` : words.join(' ');
}

/** The query parameter of a block's page number. */
export function pageParam(attrs: Attrs): string {
  const id =
    typeof attrs.blockId === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(attrs.blockId)
      ? attrs.blockId
      : 'posts';
  return `pr-page-${id}`;
}

const clamp = (v: unknown, min: number, max: number, fallback: number) =>
  Math.min(Math.max(Math.round(numeric(v) ?? fallback), min), max);

/** What a post block shows, read on the site. */
export async function loadPosts(
  a: Attrs,
  context: BlockLoadContext,
  ctx: PluginContext,
  options: { paged?: boolean; size: unknown; full?: boolean; comments?: boolean },
): Promise<PostsData> {
  const taxonomy = taxonomyOf(a.taxonomyType);
  const slugs = termSlugs(a.categories);
  const per = clamp(a.postsToShow, 1, 100, 6);
  const skip = a.enableOffset ? clamp(a.postsOffset, 0, 10_000, 0) : 0;
  const param = pageParam(a);
  const page = options.paged
    ? Math.max(1, Math.trunc(Number(context.page.params?.[param]) || 1))
    : 1;
  const current = a.excludeCurrentPost ? context.entry?.id : undefined;
  const { entries, total } = await context.query({
    type: postTypeOf(a.postType),
    limit: per,
    offset: skip + (page - 1) * per,
    orderBy: ORDER_BY[String(a.orderBy)] ?? 'date',
    order: a.order === 'asc' ? 'asc' : 'desc',
    ...(slugs.length ? { terms: { taxonomy, slugs } } : {}),
    ...(current ? { exclude: [current] } : {}),
  });
  // Comment counts need the `comments` permission: without it they are left out.
  let counts: (number | null)[] = entries.map(() => null);
  if (options.comments && entries.length) {
    try {
      context.tag('comments');
      counts = await Promise.all(
        entries.map(
          async (e) =>
            (
              await ctx.comments.find(context.siteId, {
                entryId: e.id,
                type: 'comment',
                limit: 1000,
              })
            ).length,
        ),
      );
    } catch {
      counts = entries.map(() => null);
    }
  }
  const limit = clamp(a.pageLimit, 1, 1000, 10);
  return {
    posts: entries.map((e, i) => {
      const text = paragraphs(e.document);
      return {
        id: e.id,
        title: e.title,
        url: e.url,
        date: e.publishedAt,
        author: e.author ? { name: e.author.displayName, url: e.author.url ?? null } : null,
        excerpt: excerptOf(e.excerpt, text),
        content: options.full ? text : [],
        image: imageAt(e.featuredImage, options.size),
        comments: counts[i] ?? null,
        terms: (e.terms[taxonomy] ?? []).map((t) => ({ name: t.name, url: t.url })),
        fields: fieldsOf(e.fields, a),
      };
    }),
    page,
    pages: options.paged ? Math.min(limit, Math.ceil(Math.max(0, total - skip) / per)) : 1,
    param,
    locale: context.locale,
  };
}

// ---- The editor ---------------------------------------------------------------------

const cache = new Map<string, Promise<unknown>>();

/** A GET of the admin API, kept for the editing session. */
export function apiGet<T>(path: string): Promise<T> {
  let found = cache.get(path) as Promise<T> | undefined;
  if (!found) {
    found = fetch(`/api/v1${path}`, { credentials: 'same-origin' }).then((res) =>
      res.ok ? (res.json() as Promise<T>) : Promise.reject(new Error(String(res.status))),
    );
    found.catch(() => cache.delete(path));
    cache.set(path, found);
  }
  return found;
}

interface ApiEntry {
  id: string;
  title: string;
  publishedAt: string | null;
  author: { displayName: string } | null;
  comments?: { count: number };
  terms?: Record<string, { name: string; slug: string }[]>;
  revision?: {
    excerpt: string | null;
    featuredMediaId: string | null;
    document: unknown;
    fields?: Record<string, unknown>;
  } | null;
}

async function editorPosts(a: Attrs, size: unknown, full: boolean): Promise<PostsData> {
  const type = postTypeOf(a.postType);
  const taxonomy = taxonomyOf(a.taxonomyType);
  const slugs = termSlugs(a.categories);
  const per = clamp(a.postsToShow, 1, 100, 6);
  const skip = a.enableOffset ? clamp(a.postsOffset, 0, 90, 0) : 0;
  let term = '';
  if (slugs.length) {
    const terms = await apiGet<{ id: string; slug: string }[]>(
      `/taxonomies/${encodeURIComponent(taxonomy)}/terms`,
    ).catch(() => []);
    term = terms.find((t) => t.slug === slugs[0])?.id ?? '';
  }
  const sort =
    a.orderBy === 'title'
      ? 'title'
      : a.orderBy === 'modified'
        ? 'updated'
        : a.orderBy === 'menu_order'
          ? 'order'
          : 'date';
  const query = new URLSearchParams({
    type,
    status: 'published',
    sort,
    dir: a.order === 'asc' ? 'asc' : 'desc',
    limit: String(Math.min(100, per + skip)),
    ...(term ? { term } : {}),
  });
  const list = await apiGet<{ items: { id: string }[] }>(`/entries?${query.toString()}`);
  const items = list.items.slice(skip, skip + per);
  const posts = await Promise.all(
    items.map(async (item): Promise<PostItem> => {
      const e = await apiGet<ApiEntry>(`/entries/${item.id}`);
      const text = paragraphs(e.revision?.document);
      const mediaId = e.revision?.featuredMediaId;
      const media = mediaId
        ? await apiGet<MediaLike & { alt: Record<string, string> }>(`/media/${mediaId}`).catch(
            () => null,
          )
        : null;
      return {
        id: e.id,
        title: e.title,
        url: '#',
        date: e.publishedAt,
        author: e.author ? { name: e.author.displayName, url: '#' } : null,
        excerpt: excerptOf(e.revision?.excerpt, text),
        content: full ? text : [],
        image: media
          ? imageAt({ ...media, alt: Object.values(media.alt ?? {})[0] ?? '' }, size)
          : null,
        comments: e.comments?.count ?? null,
        terms: (e.terms?.[taxonomy] ?? []).map((t) => ({ name: t.name, url: '#' })),
        fields: fieldsOf(e.revision?.fields, a),
      };
    }),
  );
  const pages = a.postPagination ? Math.max(1, Math.min(clamp(a.pageLimit, 1, 1000, 10), 2)) : 1;
  return {
    posts,
    page: 1,
    pages,
    param: pageParam(a),
    locale: document.documentElement.lang || navigator.language || 'en',
  };
}

/**
 * The posts shown in the editor (the site passes them as `data`): fetched
 * again when the query changes. Undefined while loading, and on the site.
 */
export function useEditorPosts(
  a: Attrs,
  editing: boolean,
  options: { size: unknown; full?: boolean },
): PostsData | undefined {
  const key = editing
    ? JSON.stringify([
        a.postType,
        a.taxonomyType,
        a.categories,
        a.postsToShow,
        a.enableOffset,
        a.postsOffset,
        a.order,
        a.orderBy,
        a.postPagination,
        a.pageLimit,
        options.size,
        Boolean(options.full),
      ])
    : '';
  const [state, setState] = useState<{ key: string; data: PostsData } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    editorPosts(a, options.size, Boolean(options.full))
      .then((data) => live && setState({ key, data }))
      .catch(() => live && setState({ key, data: emptyData(a) }));
    return () => {
      live = false;
    };
    // The key holds every attribute the query reads.
  }, [key]);
  return state && state.key === key ? state.data : undefined;
}

export const emptyData = (a: Attrs): PostsData => ({
  posts: [],
  page: 1,
  pages: 1,
  param: pageParam(a),
  locale: 'en',
});

/** `data` as given to `View`, safe to read. */
export function postsData(data: unknown): PostsData | undefined {
  const d = data as PostsData | undefined;
  return d && Array.isArray(d.posts) ? d : undefined;
}

// ---- Dates and words -------------------------------------------------------------------

const lang = (locale: string) => (/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(locale) ? locale : 'en');

/** A date as WordPress's default format (`F j, Y`) shows it, in the page's language. */
export function longDate(iso: string | null, locale: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(lang(locale), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** A date in a PHP format (`F j, Y`, `d/m/Y`…), the usual letters. */
export function phpDate(iso: string | null, format: unknown, locale: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const f = typeof format === 'string' && format ? format : 'F j, Y';
  const l = lang(locale);
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(l, { ...options, timeZone: 'UTC' }).format(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = date.getUTCDate();
  const suffix = () =>
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th';
  let out = '';
  for (let i = 0; i < f.length; i++) {
    const c = f[i]!;
    if (c === '\\') {
      out += f[++i] ?? '';
      continue;
    }
    switch (c) {
      case 'd':
        out += pad(day);
        break;
      case 'j':
        out += String(day);
        break;
      case 'S':
        out += suffix();
        break;
      case 'D':
        out += part({ weekday: 'short' });
        break;
      case 'l':
        out += part({ weekday: 'long' });
        break;
      case 'F':
        out += part({ month: 'long' });
        break;
      case 'M':
        out += part({ month: 'short' });
        break;
      case 'm':
        out += pad(date.getUTCMonth() + 1);
        break;
      case 'n':
        out += String(date.getUTCMonth() + 1);
        break;
      case 'Y':
        out += String(date.getUTCFullYear());
        break;
      case 'y':
        out += String(date.getUTCFullYear()).slice(-2);
        break;
      default:
        out += c;
    }
  }
  return out;
}

/** "No Comments", "1 Comment", "3 Comments", as WordPress writes them. */
export function commentsText(count: number, locale: string): string {
  if (locale.startsWith('it'))
    return count === 0 ? 'Nessun commento' : count === 1 ? '1 commento' : `${count} commenti`;
  return count === 0 ? 'No Comments' : count === 1 ? '1 Comment' : `${count} Comments`;
}
