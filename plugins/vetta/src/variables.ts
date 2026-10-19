/**
 * Title and description templates: `%title% %sep% %sitename%`. Variables are
 * written `%name%` or `%name(argument)%`; the `%%name%%` form of Yoast SEO
 * works too. Unknown or empty variables disappear, repeated separators
 * collapse into one, and spaces are tidied.
 */

export interface VariableContext {
  sep: string;
  sitename: string;
  sitedesc?: string;
  title?: string;
  parentTitle?: string;
  excerpt?: string;
  seoTitle?: string;
  seoDescription?: string;
  url?: string;
  date?: string | null;
  modified?: string | null;
  categories?: string[];
  tags?: string[];
  term?: string;
  termDescription?: string;
  name?: string;
  userDescription?: string;
  searchQuery?: string;
  id?: string;
  keywords?: string[];
  page?: number;
  pages?: number;
  typeSingular?: string;
  typePlural?: string;
  filename?: string;
  fields?: Record<string, unknown>;
  orgName?: string;
  orgUrl?: string;
  locale?: string;
  /** Now, for `%currentdate%` and the like (tests set it). */
  now?: Date;
  /** Words of the page (translated "Page"). */
  pageWord?: string;
  ofWord?: string;
}

const counters = new Map<string, number>();

/** A date as people read it, in the page's language. */
function formatDate(
  value: string | Date | null | undefined,
  locale: string,
  format?: string,
): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  if (format === 'Y') return String(date.getUTCFullYear());
  if (format === 'Y-m-d') return date.toISOString().slice(0, 10);
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** `limit=3&separator=, ` → { limit: '3', separator: ', ' } */
function params(argument: string | undefined): Record<string, string> {
  if (!argument) return {};
  return Object.fromEntries(
    argument.split('&').map((part) => {
      const i = part.indexOf('=');
      return i < 0 ? [part.trim(), ''] : [part.slice(0, i).trim(), part.slice(i + 1)];
    }),
  );
}

function listOf(items: string[] | undefined, argument: string | undefined): string {
  const p = params(argument);
  const exclude = new Set(
    (p.exclude ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const kept = (items ?? []).filter((i) => !exclude.has(i.toLowerCase()));
  const limit = Number(p.limit);
  return (Number.isFinite(limit) && limit > 0 ? kept.slice(0, limit) : kept).join(
    p.separator ?? ', ',
  );
}

function resolve(
  name: string,
  argument: string | undefined,
  c: VariableContext,
): string | undefined {
  const locale = c.locale ?? 'en';
  const now = c.now ?? new Date();
  switch (name) {
    case 'sep':
      return c.sep;
    case 'sitename':
      return c.sitename;
    case 'sitedesc':
      return c.sitedesc;
    case 'title':
    case 'post_title':
      return c.title;
    case 'parent_title':
      return c.parentTitle;
    case 'excerpt':
    case 'excerpt_only':
      return c.excerpt;
    case 'seo_title':
      return c.seoTitle || c.title;
    case 'seo_description':
      return c.seoDescription || c.excerpt;
    case 'url':
      return c.url;
    case 'date':
    case 'publish_date':
      return formatDate(c.date, locale, argument);
    case 'modified':
      return formatDate(c.modified ?? c.date, locale, argument);
    case 'category':
      return c.categories?.[0];
    case 'categories':
      return listOf(c.categories, argument);
    case 'tag':
      return c.tags?.[0];
    case 'tags':
      return listOf(c.tags, argument);
    case 'primary_taxonomy_terms':
      return c.categories?.[0];
    case 'term':
    case 'term_title':
      return c.term;
    case 'term_description':
      return c.termDescription;
    case 'name':
    case 'post_author':
    case 'author':
      return c.name;
    case 'user_description':
      return c.userDescription;
    case 'search_query':
    case 'searchphrase':
      return c.searchQuery;
    case 'id':
      return c.id;
    case 'focuskw':
      return c.keywords?.[0];
    case 'keywords':
      return c.keywords?.join(', ');
    case 'page': {
      if (!c.page || c.page < 2) return '';
      const of = c.pages && c.pages > 1 ? ` ${c.ofWord ?? 'of'} ${c.pages}` : '';
      return `${c.sep} ${c.pageWord ?? 'Page'} ${c.page}${of}`;
    }
    case 'pagenumber':
      return c.page && c.page > 1 ? String(c.page) : '';
    case 'pagetotal':
      return c.pages ? String(c.pages) : '';
    case 'pt_single':
      return c.typeSingular;
    case 'pt_plural':
      return c.typePlural;
    case 'filename':
      return c.filename;
    case 'customfield': {
      if (!argument) return '';
      // `group.name` or a field of the type: `price`.
      const [first, second] = argument.split('.');
      const value = second
        ? (c.fields?.[first!] as Record<string, unknown> | undefined)?.[second]
        : c.fields?.[first!];
      return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    }
    case 'org_name':
      return c.orgName;
    case 'org_url':
      return c.orgUrl;
    case 'currentdate':
      return formatDate(now, locale, argument);
    case 'currentday':
      return String(now.getUTCDate());
    case 'currentmonth':
      try {
        return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(now);
      } catch {
        return String(now.getUTCMonth() + 1);
      }
    case 'currentyear':
      return String(now.getUTCFullYear());
    case 'currenttime':
      return now.toISOString().slice(11, 16);
    case 'count': {
      const key = argument || 'default';
      const n = (counters.get(key) ?? 0) + 1;
      counters.set(key, n);
      return String(n);
    }
    default:
      return undefined;
  }
}

/** Starts the `%count()%` counters again (once per page). */
export function resetCounters(): void {
  counters.clear();
}

const VARIABLE = /%%([a-z_]+)(?:\(([^)%]*)\))?%%|%([a-z_]+)(?:\(([^)%]*)\))?%/g;

export function replaceVariables(template: string, context: VariableContext): string {
  const out = template.replace(
    VARIABLE,
    (_match, a?: string, aArg?: string, b?: string, bArg?: string) => {
      const name = (a ?? b)!;
      const value = resolve(name, aArg ?? bArg, context);
      return (value ?? '').replace(/\s+/g, ' ').trim();
    },
  );
  return tidy(out, context.sep);
}

/** One separator between parts, none at the ends; single spaces. */
function tidy(value: string, sep: string): string {
  // Brackets left empty by a variable without a value go too: "Title () – Site".
  let out = value
    .replace(/\s*(\(\s*\)|\[\s*\]|“\s*”|"\s*")/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (sep) {
    const s = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(new RegExp(`(?:\\s*${s}\\s*){2,}`, 'g'), ` ${sep} `)
      .replace(new RegExp(`^(?:\\s*${s}\\s*)+`), '')
      .replace(new RegExp(`(?:\\s*${s}\\s*)+$`), '');
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Capitalised titles ("The Best Way To Learn"), for sites that want them. */
export function capitalize(value: string): string {
  return value.replace(
    /(^|\s)(\p{Ll})/gu,
    (_m, space: string, letter: string) => space + letter.toUpperCase(),
  );
}

/** Plain text of a description: no tags, single spaces, at most 160 characters at a word. */
export function plainDescription(value: string, max = 160): string {
  const plain = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : plain.slice(0, max)).replace(/[\s,;:.–-]+$/, '')}…`;
}

/** The file name of an image as words: `red-shoes_2-1200x800.jpg` → `red shoes 2`. */
export function filenameWords(url: string): string {
  const base = decodeURIComponent(url.split('?')[0]!.split('/').pop() ?? '');
  return base
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/-\d+x\d+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
