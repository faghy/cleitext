/**
 * The <head> of public pages: title and description from the templates,
 * robots with Rank Math's precedence (the entry, then its content type or
 * taxonomy, then the site), canonical, Open Graph, X cards, Slack labels
 * and the webmaster verification tags. Pure: the server resolves media first.
 */
import {
  flag,
  keywordsOf,
  taxonomyValue,
  text,
  typeValue,
  value,
  type Config,
  type EntrySeo,
} from './config.js';
import {
  capitalize,
  plainDescription,
  replaceVariables,
  type VariableContext,
} from './variables.js';

export interface Head {
  title: string;
  description: string;
  canonical: string | null;
  alternates: { hreflang: string; href: string }[];
  og: Record<string, string>;
  robots?: string;
  tags?: (
    { tag: 'meta' | 'link'; attrs: Record<string, string> } | { tag: 'json-ld'; data: unknown }
  )[];
}

export interface HeadEntry {
  id: string;
  type: string;
  title: string;
  url: string;
  excerpt: string;
  publishedAt: string | null;
  author: { displayName: string } | null;
  terms: Record<string, { name: string }[]>;
  fields: Record<string, unknown>;
  words: number;
}

export interface HeadInput {
  head: Head;
  config: Config;
  locale: string;
  route: 'entry' | 'archive' | 'search' | '404' | 'maintenance';
  path: string;
  isFrontPage: boolean;
  archive?: { taxonomy?: string; term?: string; type?: string; home?: boolean };
  entry?: HeadEntry;
  seo: EntrySeo;
  /** The social image chosen for the page, or the site's default one. */
  image?: { url: string; width?: number | null; height?: number | null; alt?: string } | null;
  now?: Date;
}

const T = (locale: string, en: string, it: string) => (locale.startsWith('it') ? it : en);

/** The page number of an archive address: `/blog/page/3` → 3. */
export function pageNumber(path: string): number {
  const m = /\/page\/(\d+)\/?$/.exec(path);
  return m ? Number(m[1]) : 1;
}

/** "Name – Site" from the core's title: the name part. */
function namePart(title: string, siteName: string): string {
  if (!siteName) return title;
  for (const sep of [' – ', ' | ', ' - ', ' — ']) {
    const suffix = `${sep}${siteName}`;
    if (title.endsWith(suffix)) return title.slice(0, -suffix.length);
  }
  return title;
}

interface Robots {
  noindex: boolean;
  nofollow: boolean;
  noarchive: boolean;
  noimageindex: boolean;
  nosnippet: boolean;
}

function globalRobots(c: Config): Robots {
  return {
    noindex: flag(c, 'robots_noindex'),
    nofollow: flag(c, 'robots_nofollow'),
    noarchive: flag(c, 'robots_noarchive'),
    noimageindex: flag(c, 'robots_noimageindex'),
    nosnippet: flag(c, 'robots_nosnippet'),
  };
}

export function robotsFor(
  input: Pick<HeadInput, 'config' | 'route' | 'path' | 'archive' | 'entry' | 'seo'>,
): Robots {
  const c = input.config;
  let r = globalRobots(c);
  if (input.route === 'entry' && input.entry) {
    if (typeValue(c, input.entry.type, 'custom_robots') === true) {
      r = {
        ...r,
        noindex: typeValue(c, input.entry.type, 'robots_noindex') === true,
        nofollow: typeValue(c, input.entry.type, 'robots_nofollow') === true,
      };
    }
    const s = input.seo;
    // The entry's own choices win; unset ones keep the defaults.
    r = {
      noindex: s.noindex ?? r.noindex,
      nofollow: s.nofollow ?? r.nofollow,
      noarchive: s.noarchive ?? r.noarchive,
      noimageindex: s.noimageindex ?? r.noimageindex,
      nosnippet: s.nosnippet ?? r.nosnippet,
    };
  } else if (input.route === 'archive' && input.archive?.taxonomy) {
    const tax = input.archive.taxonomy;
    if (taxonomyValue(c, tax, 'custom_robots') === true) {
      r = {
        ...r,
        noindex: taxonomyValue(c, tax, 'robots_noindex') === true,
        nofollow: taxonomyValue(c, tax, 'robots_nofollow') === true,
      };
    }
  } else if (
    input.route === 'archive' &&
    /^(\/[a-z]{2,3}(-[a-z]{2,4})?)?\/author\//i.test(input.path)
  ) {
    if (flag(c, 'author_noindex')) r = { ...r, noindex: true };
  }
  if (input.route === 'search' && flag(c, 'noindex_search')) r = { ...r, noindex: true };
  if (input.route === '404' || input.route === 'maintenance') r = { ...r, noindex: true };
  if (pageNumber(input.path) > 1 && flag(c, 'noindex_paginated')) r = { ...r, noindex: true };
  return r;
}

/** `index, follow, max-snippet:-1, …` with the advanced values only when the page may be shown. */
export function robotsContent(r: Robots, c: Config): string {
  const parts = [r.noindex ? 'noindex' : 'index', r.nofollow ? 'nofollow' : 'follow'];
  if (r.noarchive) parts.push('noarchive');
  if (r.noimageindex) parts.push('noimageindex');
  if (r.nosnippet) parts.push('nosnippet');
  if (!r.noindex && !r.nosnippet) {
    const snippet = Number(value(c, 'max_snippet'));
    const video = Number(value(c, 'max_video_preview'));
    const image = String(value(c, 'max_image_preview'));
    parts.push(`max-snippet:${Number.isFinite(snippet) ? snippet : -1}`);
    parts.push(`max-video-preview:${Number.isFinite(video) ? video : -1}`);
    parts.push(
      `max-image-preview:${['large', 'standard', 'none'].includes(image) ? image : 'large'}`,
    );
  }
  return parts.join(', ');
}

const httpUrl = (v: string | null | undefined) => {
  const s = v?.trim();
  return s && /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : null;
};

const VERIFY: [string, string][] = [
  ['verify_google', 'google-site-verification'],
  ['verify_bing', 'msvalidate.01'],
  ['verify_yandex', 'yandex-verification'],
  ['verify_baidu', 'baidu-site-verification'],
  ['verify_pinterest', 'p:domain_verify'],
  ['verify_norton', 'norton-safeweb-site-verification'],
];

/** The code of a verification tag: the value of `content`, from the whole tag pasted too. */
export function verificationCode(raw: string): string {
  const m = /content=["']([^"']+)["']/i.exec(raw);
  return (m ? m[1]! : raw)
    .trim()
    .replace(/[^A-Za-z0-9_\-.:=+/]/g, '')
    .slice(0, 200);
}

export function buildHead(input: HeadInput): Head {
  const c = input.config;
  const { head, entry, seo, locale } = input;
  const siteName = head.og['og:site_name'] ?? '';
  const sep = text(c, 'separator') || '–';
  const page = pageNumber(input.path);
  const base: VariableContext = {
    sep,
    sitename: siteName,
    locale,
    page,
    pageWord: T(locale, 'Page', 'Pagina'),
    ofWord: T(locale, 'of', 'di'),
    ...(input.now ? { now: input.now } : {}),
    orgName: text(c, 'knowledge_name') || siteName,
  };
  const next: Head = { ...head, og: { ...head.og }, tags: [...(head.tags ?? [])] };
  let title = head.title;
  let description = head.description;

  if (input.route === 'entry' && entry) {
    const vars: VariableContext = {
      ...base,
      title: entry.title,
      excerpt: plainDescription(entry.excerpt ?? ''),
      url: entry.url,
      id: entry.id,
      date: entry.publishedAt,
      name: entry.author?.displayName ?? '',
      categories: (entry.terms.category ?? []).map((t) => t.name),
      tags: (entry.terms.tag ?? []).map((t) => t.name),
      keywords: keywordsOf(seo),
      fields: entry.fields,
    };
    const typeTitle = String(typeValue(c, entry.type, 'title') ?? '');
    // A title of the SEO plugin is the page's part only: the template adds the rest.
    title =
      seo.title && !seo.legacyTitle
        ? replaceVariables(seo.title, vars)
        : replaceVariables(
            typeTitle,
            seo.title ? { ...vars, title: replaceVariables(seo.title, vars) } : vars,
          ) || head.title;
    const typeDescription = String(typeValue(c, entry.type, 'description') ?? '');
    description = seo.description
      ? replaceVariables(seo.description, vars)
      : replaceVariables(typeDescription, vars) || head.description;
    // The home page's search title, when the front page is a page without its own.
    if (input.isFrontPage && !seo.title)
      title = replaceVariables(text(c, 'home_title'), { ...vars, title: entry.title }) || title;
    if (input.isFrontPage && !seo.description && text(c, 'home_description')) {
      description = replaceVariables(text(c, 'home_description'), vars);
    }
  } else if (input.route === 'archive' && input.archive?.home) {
    title = replaceVariables(text(c, 'home_title'), base) || head.title;
    if (text(c, 'home_description'))
      description = replaceVariables(text(c, 'home_description'), base);
  } else if (input.route === 'archive' && input.archive?.taxonomy) {
    const vars = {
      ...base,
      term: namePart(head.title, siteName),
      termDescription: head.description,
    };
    title =
      replaceVariables(String(taxonomyValue(c, input.archive.taxonomy, 'title') ?? ''), vars) ||
      head.title;
    description =
      replaceVariables(
        String(taxonomyValue(c, input.archive.taxonomy, 'description') ?? ''),
        vars,
      ) || head.description;
  } else if (input.route === 'archive' && /\/author\//.test(input.path)) {
    title =
      replaceVariables(text(c, 'author_title'), {
        ...base,
        name: namePart(head.title, siteName),
      }) || head.title;
  } else if (input.route === 'archive') {
    title =
      replaceVariables('%title% %page% %sep% %sitename%', {
        ...base,
        title: namePart(head.title, siteName),
      }) || head.title;
  } else if (input.route === 'search') {
    const query = namePart(head.title, siteName);
    title =
      replaceVariables(text(c, 'search_title'), { ...base, searchQuery: query }) || head.title;
  } else if (input.route === '404') {
    title =
      replaceVariables(text(c, 'not_found_title'), {
        ...base,
        title: T(locale, 'Page not found', 'Pagina non trovata'),
      }) || head.title;
  }
  if (flag(c, 'capitalize_titles')) title = capitalize(title);
  next.title = title;
  next.description = plainDescription(description ?? '');

  // Robots and canonical.
  const robots = robotsFor(input);
  next.robots = robotsContent(robots, c);
  if (robots.noindex) next.canonical = null;
  else if (input.route === 'entry' && httpUrl(seo.canonical))
    next.canonical = httpUrl(seo.canonical);

  // Open Graph and X.
  const ogTitle = seo.ogTitle?.trim() || title;
  const ogDescription = plainDescription(seo.ogDescription?.trim() || next.description, 200);
  next.og['og:title'] = ogTitle;
  if (ogDescription) next.og['og:description'] = ogDescription;
  else delete next.og['og:description'];
  next.og['og:locale'] = locale.replace('-', '_');
  if (input.route === 'entry' && entry && !input.isFrontPage) {
    next.og['og:type'] = 'article';
    if (entry.publishedAt) next.og['article:published_time'] = entry.publishedAt;
    const section = entry.terms.category?.[0]?.name;
    if (section) next.og['article:section'] = section;
  } else {
    next.og['og:type'] = 'website';
  }
  if (input.image?.url) {
    next.og['og:image'] = input.image.url;
    if (input.image.width) next.og['og:image:width'] = String(input.image.width);
    if (input.image.height) next.og['og:image:height'] = String(input.image.height);
    if (input.image.alt) next.og['og:image:alt'] = input.image.alt;
  }
  const facebook = httpUrl(text(c, 'facebook_url'));
  if (facebook && input.route === 'entry') next.og['article:publisher'] = facebook;
  const appId = text(c, 'facebook_app_id').replace(/\D/g, '');
  if (appId) next.og['fb:app_id'] = appId;

  const meta = (name: string, content: string) =>
    next.tags!.push({ tag: 'meta', attrs: { name, content } });
  const card =
    text(c, 'twitter_card') === 'summary' || !next.og['og:image']
      ? 'summary'
      : 'summary_large_image';
  meta('twitter:card', card);
  meta('twitter:title', ogTitle);
  if (ogDescription) meta('twitter:description', ogDescription);
  if (next.og['og:image']) meta('twitter:image', next.og['og:image']);
  const handle = text(c, 'twitter_site')
    .trim()
    .replace(/^@?/, '@')
    .replace(/[^@A-Za-z0-9_]/g, '');
  if (handle.length > 1) meta('twitter:site', handle);

  // Slack and other apps show two labels under the link.
  if (input.route === 'entry' && entry && !input.isFrontPage) {
    const minutes = Math.max(1, Math.round(entry.words / 200));
    let n = 1;
    if (entry.author?.displayName && entry.type !== 'page') {
      meta(`twitter:label${n}`, T(locale, 'Written by', 'Scritto da'));
      meta(`twitter:data${n}`, entry.author.displayName);
      n++;
    }
    meta(`twitter:label${n}`, T(locale, 'Time to read', 'Tempo di lettura'));
    meta(
      `twitter:data${n}`,
      T(
        locale,
        `${minutes} minute${minutes === 1 ? '' : 's'}`,
        `${minutes} minut${minutes === 1 ? 'o' : 'i'}`,
      ),
    );
  }

  // Webmaster tools, on the home page only.
  const home =
    input.isFrontPage ||
    input.archive?.home === true ||
    /^(\/[a-z]{2,3}(-[a-z]{2,4})?)?\/?$/i.test(input.path);
  if (home) {
    for (const [key, name] of VERIFY) {
      const code = verificationCode(text(c, key));
      if (code) meta(name, code);
    }
  }
  return next;
}
