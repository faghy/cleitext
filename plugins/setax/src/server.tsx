import {
  defineBlock,
  definePlugin,
  type FieldDefinition,
  type PluginContext,
} from '@cleitext/plugin-sdk';
import {
  choiceUrl,
  choices,
  combinations,
  fillCount,
  fillTemplate,
  headingOf,
  select,
  type Choice,
  type Item,
} from './data';
import { importPlaces } from './import';
import { attrsOf, chosen, DEFAULT_ATTRS, Filter, wordingOf, type FilterAttrs } from './render';

/**
 * Setax: a filter by type and place for listings of services or shops by
 * area ("Washing machines in Albenga"). A block with two selects (the terms
 * of a taxonomy, the places of a text field) lists the matching entries.
 * Each choice has a readable address (`/zone/?tipo=lavatrici&zona=albenga`)
 * that search engines index as a page of its own: its title, description,
 * canonical address and structured data, links to every choice with results
 * and the sitemap. Choices without results are kept out of search. The
 * place field comes from WordPress's meta (e.g. ACF's `comune`) on import.
 */

const SLUG = 'setax';
const BLOCK = `${SLUG}/filter`;
const GROUP = SLUG;
/** Content types that get the place field. */
const FIELD_TYPES = ['page', 'article', 'post'];

const SETTINGS: FieldDefinition[] = [
  {
    name: 'meta_key',
    type: 'text',
    maxLength: 100,
    default: 'comune',
    label: { en: 'WordPress field of the place', it: 'Campo WordPress della località' },
    help: {
      en: 'Its value becomes the Place of each page on import (an ACF field or any post meta), e.g. comune.',
      it: 'Il suo valore diventa la Località di ogni pagina all’importazione (un campo ACF o qualsiasi meta), es. comune.',
    },
  },
];

/** The Setax block of a document, when it has one (also inside other blocks). */
export function findFilter(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findFilter(child);
      if (found) return found;
    }
    return null;
  }
  const value = node as Record<string, unknown>;
  if (value.type === BLOCK) return (value.attrs as Record<string, unknown>) ?? {};
  for (const key of ['blocks', 'children', 'nodes', 'content']) {
    const found = findFilter(value[key]);
    if (found) return found;
  }
  return null;
}

const placeOf = (fields: unknown): string => {
  const group = (fields as Record<string, unknown> | undefined)?.[GROUP];
  const place = (group as Record<string, unknown> | undefined)?.place;
  return typeof place === 'string' ? place.trim() : '';
};

/** The first taxonomy of some entries, besides categories and tags (when the block names none). */
function firstTaxonomy(terms: Record<string, unknown[] | undefined>[]): string {
  for (const t of terms) {
    const found = Object.keys(t).find(
      (k) => k !== 'category' && k !== 'tag' && (t[k]?.length ?? 0) > 0,
    );
    if (found) return found;
  }
  return '';
}

/** The entries of the filter, read on the server (for the page's head and the sitemap). */
async function itemsOf(
  ctx: PluginContext,
  siteId: string,
  locale: string,
  attrs: FilterAttrs,
): Promise<{ items: Item[]; attrs: FilterAttrs }> {
  const types = attrs.types
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const entries = (
    await Promise.all(types.map((type) => ctx.content.find(siteId, { type, locale, limit: 200 })))
  ).flat();
  const taxonomy = attrs.taxonomy || firstTaxonomy(entries.map((e) => e.terms));
  const terms = taxonomy ? await ctx.terms.find(siteId, { taxonomy, locale, limit: 500 }) : [];
  const termById = new Map(terms.map((t) => [t.id, { slug: t.slug, name: t.name }]));
  const items = entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    url: entry.url,
    excerpt: '',
    types: (entry.terms[taxonomy] ?? [])
      .map((id) => termById.get(id))
      .filter((t): t is Choice => Boolean(t)),
    place: placeOf(entry.fields),
  }));
  return { items, attrs: { ...attrs, taxonomy } };
}

const text = (value: string, max = 300) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

export default definePlugin({
  setup(ctx) {
    ctx.settings.define(SETTINGS, { title: { en: 'Setax', it: 'Setax' } });

    ctx.content.registerFieldGroup({
      id: GROUP,
      title: { en: 'Place', it: 'Località' },
      types: FIELD_TYPES,
      fields: [
        {
          name: 'place',
          type: 'text',
          maxLength: 120,
          label: { en: 'Place', it: 'Località' },
          help: {
            en: 'The town or area of this page, for the Setax filter (e.g. Albenga).',
            it: 'Il comune o la zona di questa pagina, per il filtro Setax (es. Albenga).',
          },
        },
      ],
    });

    const field = (
      name: keyof FilterAttrs,
      label: { en: string; it: string },
      help?: { en: string; it: string },
    ): FieldDefinition => ({
      name,
      type: 'text',
      maxLength: 200,
      default: String(DEFAULT_ATTRS[name]),
      label,
      ...(help ? { help } : {}),
    });

    ctx.blocks.register(
      defineBlock<
        Record<string, unknown>,
        { items: Item[]; options: { types: Choice[]; places: Choice[] }; attrs: FilterAttrs }
      >({
        type: BLOCK,
        title: { en: 'Filter by type and place', it: 'Filtro per tipo e zona' },
        description: {
          en: 'Two selects (a taxonomy and the Place field) and the matching pages, each choice with an address of its own for search engines.',
          it: 'Due selezioni (una tassonomia e il campo Località) e le pagine corrispondenti, ogni scelta con un indirizzo suo per i motori di ricerca.',
        },
        icon: 'filter',
        category: 'widgets',
        attributes: [
          {
            name: 'taxonomy',
            type: 'text',
            maxLength: 64,
            label: { en: 'Taxonomy of the types', it: 'Tassonomia dei tipi' },
            help: {
              en: 'Its slug, e.g. elettrodomestici. Empty: the first one the pages have.',
              it: 'Il suo slug, es. elettrodomestici. Vuoto: la prima che hanno le pagine.',
            },
          },
          field(
            'types',
            { en: 'Content types listed', it: 'Tipi di contenuto elencati' },
            { en: 'Comma-separated, e.g. page.', it: 'Separati da virgole, es. page.' },
          ),
          field('labelType', {
            en: 'Label of the first select',
            it: 'Etichetta della prima selezione',
          }),
          field('labelPlace', {
            en: 'Label of the second select',
            it: 'Etichetta della seconda selezione',
          }),
          field(
            'paramType',
            { en: 'Address parameter of the type', it: 'Parametro dell’indirizzo per il tipo' },
            { en: 'e.g. tipo: /zone/?tipo=lavatrici', it: 'es. tipo: /zone/?tipo=lavatrici' },
          ),
          field(
            'paramPlace',
            { en: 'Address parameter of the place', it: 'Parametro dell’indirizzo per la zona' },
            { en: 'e.g. comune: /zone/?comune=albenga', it: 'es. comune: /zone/?comune=albenga' },
          ),
          field('button', { en: 'Button', it: 'Pulsante' }),
          field(
            'headingBoth',
            { en: 'Heading with type and place', it: 'Titolo con tipo e zona' },
            {
              en: '{tipo} and {zona} are replaced. It is also the page title for search engines.',
              it: '{tipo} e {zona} vengono sostituiti. È anche il titolo della pagina per i motori di ricerca.',
            },
          ),
          field('headingType', { en: 'Heading with the type only', it: 'Titolo con il solo tipo' }),
          field('headingPlace', {
            en: 'Heading with the place only',
            it: 'Titolo con la sola zona',
          }),
          field(
            'description',
            { en: 'Description for search engines', it: 'Descrizione per i motori di ricerca' },
            {
              en: '{tipo}, {zona} and {n} (how many results) are replaced.',
              it: '{tipo}, {zona} e {n} (quanti risultati) vengono sostituiti.',
            },
          ),
          field('noResults', { en: 'No results', it: 'Nessun risultato' }),
          {
            name: 'show',
            type: 'select',
            default: 'excerpt',
            label: { en: 'Each result shows', it: 'Ogni risultato mostra' },
            options: [
              { value: 'excerpt', label: { en: 'Title and excerpt', it: 'Titolo ed estratto' } },
              { value: 'title', label: { en: 'Title only', it: 'Solo il titolo' } },
            ],
          },
          {
            name: 'index',
            type: 'boolean',
            default: true,
            label: { en: 'Links to every type and place', it: 'Link a ogni tipo e zona' },
            help: {
              en: 'Under the form, so that visitors and search engines find every choice with results.',
              it: 'Sotto il modulo, perché visitatori e motori di ricerca trovino ogni scelta con risultati.',
            },
          },
          field('indexTitle', { en: 'Title of the links', it: 'Titolo dei link' }),
        ],
        load: async (raw, context) => {
          const attrs = attrsOf(raw);
          const types = attrs.types
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
          const entries = [];
          for (const type of types) {
            for (let offset = 0; offset < 2000; offset += 100) {
              const page = await context.query({
                type,
                limit: 100,
                offset,
                orderBy: 'title',
                order: 'asc',
              });
              entries.push(...page.entries);
              if (offset + 100 >= page.total) break;
            }
          }
          const taxonomy = attrs.taxonomy || firstTaxonomy(entries.map((e) => e.terms ?? {}));
          const items: Item[] = entries.map((entry) => ({
            id: entry.id,
            title: entry.title,
            url: entry.url,
            excerpt: entry.excerpt,
            types: (entry.terms?.[taxonomy] ?? []).map((t) => ({ slug: t.slug, name: t.name })),
            place: placeOf(entry.fields),
          }));
          return { items, options: choices(items), attrs: { ...attrs, taxonomy } };
        },
        render({ data, context }) {
          if (!data) return null;
          return (
            <Filter
              attrs={data.attrs}
              items={data.items}
              options={data.options}
              params={context.page.params}
              path={context.page.entry?.url ?? '/'}
            />
          );
        },
      }),
    );

    // Each choice with results is a page of its own for search engines; the others stay out.
    ctx.hooks.filter(
      'render.head',
      async (head, context) => {
        const entry = context.entry;
        if (context.route !== 'entry' || !entry || !context.params) return head;
        const raw = findFilter(entry.document);
        if (!raw) return head;
        const { items, attrs } = await itemsOf(ctx, context.siteId, context.locale, attrsOf(raw));
        const options = choices(items);
        const { type, place, asked, invalid } = chosen(attrs, context.params, options);
        if (!asked) return head;
        const results = type || place ? select(items, type?.slug ?? null, place?.slug ?? null) : [];
        if (invalid || results.length === 0) {
          // A choice that does not exist (even in part) or has no results: out of search, the links still followed.
          return { ...head, robots: 'noindex, follow' };
        }
        const base = (head.canonical ?? '').split('?')[0] || entry.url;
        const url = choiceUrl(
          base,
          { type: attrs.paramType, place: attrs.paramPlace },
          type?.slug ?? null,
          place?.slug ?? null,
        );
        const heading = headingOf(wordingOf(attrs), type, place);
        const description = text(
          fillCount(fillTemplate(attrs.description, type, place), results.length).replace(
            /^[:\s]+/,
            '',
          ),
          160,
        );
        const siteName = head.og['og:site_name'] ?? '';
        const title = siteName ? `${heading} – ${siteName}` : heading;
        const origin = /^https?:\/\/[^/]+/.exec(base)?.[0] ?? '';
        const absolute = (path: string) => (/^https?:\/\//.test(path) ? path : `${origin}${path}`);
        return {
          ...head,
          title,
          description,
          canonical: url,
          robots: head.robots && /noindex/.test(head.robots) ? head.robots : 'index, follow',
          og: { ...head.og, 'og:title': heading, 'og:description': description, 'og:url': url },
          tags: [
            ...(head.tags ?? []),
            {
              tag: 'json-ld',
              data: {
                '@context': 'https://schema.org',
                '@type': 'ItemList',
                name: heading,
                url,
                numberOfItems: results.length,
                itemListElement: results.map((item, i) => ({
                  '@type': 'ListItem',
                  position: i + 1,
                  url: absolute(item.url),
                  name: item.title,
                })),
              },
            },
            {
              tag: 'json-ld',
              data: {
                '@context': 'https://schema.org',
                '@type': 'BreadcrumbList',
                itemListElement: [
                  { '@type': 'ListItem', position: 1, name: entry.title, item: absolute(base) },
                  { '@type': 'ListItem', position: 2, name: heading, item: url },
                ],
              },
            },
          ],
        };
      },
      { priority: 30 },
    );

    // The choices with results go in the sitemap, next to their page.
    ctx.hooks.filter('sitemap.urls', async (urls, { siteId, kind, locale }) => {
      if (kind !== 'type') return urls;
      const extra: typeof urls = [];
      for (const url of urls) {
        if (!url.entry) continue;
        const [entry] = await ctx.content.find(siteId, {
          ids: [url.entry.id],
          locale,
          withDocument: true,
          limit: 1,
        });
        const raw = entry ? findFilter(entry.document) : null;
        if (!raw) continue;
        const { items, attrs } = await itemsOf(ctx, siteId, locale, attrsOf(raw));
        const params = { type: attrs.paramType, place: attrs.paramPlace };
        for (const c of combinations(items)) {
          extra.push({
            loc: choiceUrl(url.loc, params, c.type?.slug ?? null, c.place?.slug ?? null),
            lastmod: url.lastmod,
            images: [],
            alternates: [],
          });
        }
      }
      return [...urls, ...extra];
    });

    // On import from WordPress: the place of each page from its meta (ACF's or any).
    ctx.hooks.filter('import.wxrMeta', async (result, { siteId, items }) => {
      const s = await ctx.settings.get(siteId);
      const key =
        typeof s.meta_key === 'string' && s.meta_key.trim() ? s.meta_key.trim() : 'comune';
      return importPlaces(result, items, key, GROUP);
    });
  },
});
