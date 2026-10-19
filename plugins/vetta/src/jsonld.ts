/**
 * The schema.org graph of a page, one `@graph` linked by `@id`: WebSite,
 * the publisher (Organization, Person or a local business with address,
 * hours and coordinates), WebPage, primary image, BreadcrumbList and, for
 * posts, an Article (or BlogPosting, NewsArticle).
 */
import { lines, moduleOn, text, typeValue, value, type Config } from './config.js';

export interface Crumb {
  title: string;
  url: string;
}

export interface GraphInput {
  config: Config;
  pageUrl: string | null;
  title: string;
  description: string;
  siteName: string;
  locale: string;
  isHome: boolean;
  route: 'entry' | 'archive' | 'search' | '404' | 'maintenance';
  image: string | null;
  logo: string | null;
  crumbs: Crumb[];
  entry: {
    type: string;
    title: string;
    publishedAt: string | null;
    author: string | null;
    keywords: string[];
    sections: string[];
    /** The entry's own choice (`auto` follows its content type). */
    schema: string | null;
  } | null;
}

const DAYS: Record<string, string> = {
  mo: 'Monday',
  tu: 'Tuesday',
  we: 'Wednesday',
  th: 'Thursday',
  fr: 'Friday',
  sa: 'Saturday',
  su: 'Sunday',
};

/** Opening hours rows `{ days: 'Mo,Tu', opens: '09:00', closes: '18:00' }` as schema.org specifications. */
export function openingHours(rows: unknown): Record<string, unknown>[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => row as { days?: unknown; opens?: unknown; closes?: unknown })
    .map((row) => {
      const days = String(row.days ?? '')
        .split(/[,\s]+/)
        .map((d) => DAYS[d.slice(0, 2).toLowerCase()])
        .filter((d): d is string => Boolean(d));
      const time = (v: unknown) =>
        typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v.trim())
          ? v.trim().padStart(5, '0')
          : null;
      const opens = time(row.opens);
      const closes = time(row.closes);
      return days.length && opens && closes
        ? { '@type': 'OpeningHoursSpecification', dayOfWeek: days, opens, closes }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

const url = (v: unknown) =>
  typeof v === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(v.trim()) ? v.trim() : null;

/** The article type of an entry: its own choice, else its content type's (`auto`: posts are articles). */
export function articleType(config: Config, entry: GraphInput['entry']): string | null {
  if (!entry) return null;
  const choice =
    entry.schema && entry.schema !== 'auto'
      ? entry.schema
      : String(typeValue(config, entry.type, 'schema') ?? 'auto');
  const resolved =
    choice === 'auto'
      ? entry.type === 'article' || entry.type === 'post'
        ? 'BlogPosting'
        : 'none'
      : choice;
  return ['Article', 'BlogPosting', 'NewsArticle'].includes(resolved) ? resolved : null;
}

export function schemaGraph(input: GraphInput): Record<string, unknown> | null {
  const c = input.config;
  if (!input.pageUrl) return null;
  const origin = new URL(input.pageUrl).origin;
  const websiteId = `${origin}/#website`;
  const kind = text(c, 'knowledge_kind') === 'person' ? 'person' : 'organization';
  const local = kind === 'organization' && moduleOn(c, 'localSeo');
  const name = text(c, 'knowledge_name') || input.siteName;
  const publisherId = kind === 'person' ? `${origin}/#person` : `${origin}/#organization`;
  const graph: Record<string, unknown>[] = [];

  graph.push({
    '@type': 'WebSite',
    '@id': websiteId,
    url: `${origin}/`,
    name: input.siteName,
    ...(text(c, 'knowledge_alternate') ? { alternateName: text(c, 'knowledge_alternate') } : {}),
    inLanguage: input.locale,
    publisher: { '@id': publisherId },
    ...(input.isHome
      ? {
          potentialAction: {
            '@type': 'SearchAction',
            target: {
              '@type': 'EntryPoint',
              urlTemplate: `${origin}/search?q={search_term_string}`,
            },
            'query-input': 'required name=search_term_string',
          },
        }
      : {}),
  });

  const logoId = `${origin}/#logo`;
  const logo = input.logo
    ? {
        '@type': 'ImageObject',
        '@id': logoId,
        url: input.logo,
        contentUrl: input.logo,
        caption: name,
      }
    : null;
  const sameAs = (() => {
    const v = value(c, 'knowledge_same_as');
    const list = Array.isArray(v)
      ? v.map((item) =>
          typeof item === 'string' ? item : String((item as { url?: unknown })?.url ?? ''),
        )
      : lines(String(v ?? ''));
    return list
      .map(url)
      .filter((u): u is string => Boolean(u))
      .slice(0, 30);
  })();
  const publisher: Record<string, unknown> = {
    '@type':
      kind === 'person'
        ? 'Person'
        : local
          ? text(c, 'local_type') || 'LocalBusiness'
          : 'Organization',
    '@id': publisherId,
    name,
    url: `${origin}/`,
    ...(text(c, 'knowledge_description') ? { description: text(c, 'knowledge_description') } : {}),
    ...(text(c, 'knowledge_email') ? { email: text(c, 'knowledge_email') } : {}),
    ...(text(c, 'knowledge_phone') ? { telephone: text(c, 'knowledge_phone') } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(logo ? (kind === 'person' ? { image: logo } : { logo, image: { '@id': logoId } }) : {}),
  };
  if (local) {
    const address = {
      '@type': 'PostalAddress',
      ...(text(c, 'local_street') ? { streetAddress: text(c, 'local_street') } : {}),
      ...(text(c, 'local_locality') ? { addressLocality: text(c, 'local_locality') } : {}),
      ...(text(c, 'local_region') ? { addressRegion: text(c, 'local_region') } : {}),
      ...(text(c, 'local_postal_code') ? { postalCode: text(c, 'local_postal_code') } : {}),
      ...(text(c, 'local_country') ? { addressCountry: text(c, 'local_country') } : {}),
    };
    if (Object.keys(address).length > 1) publisher.address = address;
    const lat = Number(text(c, 'local_latitude'));
    const lng = Number(text(c, 'local_longitude'));
    if (
      text(c, 'local_latitude') &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      publisher.geo = { '@type': 'GeoCoordinates', latitude: lat, longitude: lng };
    }
    const hours = openingHours(value(c, 'local_hours'));
    if (hours.length) publisher.openingHoursSpecification = hours;
    if (text(c, 'local_price_range')) publisher.priceRange = text(c, 'local_price_range');
    if (text(c, 'local_legal_name')) publisher.legalName = text(c, 'local_legal_name');
    if (text(c, 'local_vat_id')) publisher.vatID = text(c, 'local_vat_id');
    if (logo) publisher.image = { '@id': logoId };
  }
  graph.push(publisher);

  const imageId = `${input.pageUrl}#primaryimage`;
  if (input.image)
    graph.push({
      '@type': 'ImageObject',
      '@id': imageId,
      url: input.image,
      contentUrl: input.image,
    });

  const pageType =
    input.route === 'search'
      ? 'SearchResultsPage'
      : input.route === 'archive' && !input.isHome
        ? 'CollectionPage'
        : 'WebPage';
  graph.push({
    '@type': pageType,
    '@id': `${input.pageUrl}#webpage`,
    url: input.pageUrl,
    name: input.title,
    isPartOf: { '@id': websiteId },
    inLanguage: input.locale,
    ...(input.description ? { description: input.description } : {}),
    ...(input.entry?.publishedAt ? { datePublished: input.entry.publishedAt } : {}),
    ...(input.image ? { primaryImageOfPage: { '@id': imageId } } : {}),
    ...(input.isHome ? { about: { '@id': publisherId } } : {}),
    ...(input.crumbs.length > 1 ? { breadcrumb: { '@id': `${input.pageUrl}#breadcrumb` } } : {}),
  });

  if (input.crumbs.length > 1) {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': `${input.pageUrl}#breadcrumb`,
      itemListElement: input.crumbs.map((crumb, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: crumb.title,
        item: new URL(crumb.url, origin).href,
      })),
    });
  }

  const article = moduleOn(c, 'schema') ? articleType(c, input.entry) : null;
  if (article && input.entry) {
    graph.push({
      '@type': article,
      '@id': `${input.pageUrl}#article`,
      headline: input.entry.title.slice(0, 110),
      isPartOf: { '@id': `${input.pageUrl}#webpage` },
      mainEntityOfPage: { '@id': `${input.pageUrl}#webpage` },
      inLanguage: input.locale,
      ...(input.entry.publishedAt ? { datePublished: input.entry.publishedAt } : {}),
      ...(input.entry.author ? { author: { '@type': 'Person', name: input.entry.author } } : {}),
      publisher: { '@id': publisherId },
      ...(input.image ? { image: { '@id': imageId } } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.entry.keywords.length ? { keywords: input.entry.keywords.join(', ') } : {}),
      ...(input.entry.sections.length ? { articleSection: input.entry.sections } : {}),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}
