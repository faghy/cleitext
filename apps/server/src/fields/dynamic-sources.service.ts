import {
  contentTypes,
  entries,
  revisions,
  settings,
  sites,
  taxonomies,
  terms,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import type {
  BlockPage,
  DynamicContext,
  DynamicSource,
  DynamicSourceInfo,
} from '@cleitext/plugin-sdk';
import {
  fieldValueKind,
  labelText,
  type FieldDefinition,
  type FieldGroupView,
  type Label,
} from '@cleitext/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { taxonomyFields } from '../content/terms.service.js';
import { LanguagesService, defaultLocaleIn } from '../content/languages.service.js';
import { DATABASE } from '../database/database.module.js';
import { PluginHost } from '../plugins/plugin-host.service.js';
import { isPublished, loadSiteData } from '../public/site-data.js';
import type { UrlBuilder } from '../public/urls.js';
import { FieldGroupsService } from './field-groups.service.js';
import { FieldValuesService } from './field-values.service.js';
import { formatContext } from './field-format.js';
import { OptionsPagesService } from './options-pages.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTRY: Label = { en: 'Entry', it: 'Voce' };
const TERM: Label = { en: 'Term', it: 'Termine' };
const SITE: Label = { en: 'Site', it: 'Sito' };
const PERSON: Label = { en: 'Person', it: 'Persona' };
const OPTIONS: Label = { en: 'Options', it: 'Opzioni' };

/** The core's sources that are not fields. */
const CORE_SOURCES: DynamicSourceInfo[] = [
  { id: 'entry.title', label: { en: 'Title', it: 'Titolo' }, group: ENTRY, type: 'text' },
  { id: 'entry.url', label: { en: 'Address', it: 'Indirizzo' }, group: ENTRY, type: 'url' },
  { id: 'entry.excerpt', label: { en: 'Excerpt', it: 'Riassunto' }, group: ENTRY, type: 'text' },
  { id: 'entry.date', label: { en: 'Date', it: 'Data' }, group: ENTRY, type: 'date' },
  {
    id: 'entry.featuredImage',
    label: { en: 'Featured image', it: 'Immagine in evidenza' },
    group: ENTRY,
    type: 'media',
  },
  { id: 'term.name', label: { en: 'Name', it: 'Nome' }, group: TERM, type: 'text' },
  {
    id: 'term.description',
    label: { en: 'Description', it: 'Descrizione' },
    group: TERM,
    type: 'text',
  },
  { id: 'term.url', label: { en: 'Address', it: 'Indirizzo' }, group: TERM, type: 'url' },
  {
    id: 'site.title',
    label: { en: 'Site title', it: 'Titolo del sito' },
    group: SITE,
    type: 'text',
  },
  { id: 'site.tagline', label: { en: 'Tagline', it: 'Motto' }, group: SITE, type: 'text' },
  { id: 'site.url', label: { en: 'Home page', it: 'Pagina iniziale' }, group: SITE, type: 'url' },
  // A person shown in Field rows (plugin API 1.48).
  { id: 'user.name', label: { en: 'Name', it: 'Nome' }, group: PERSON, type: 'text' },
  {
    id: 'user.url',
    label: { en: 'Author page', it: "Pagina dell'autore" },
    group: PERSON,
    type: 'url',
  },
  { id: 'user.avatar', label: { en: 'Picture', it: 'Immagine' }, group: PERSON, type: 'media' },
];

/** Rows of a list field or a relation to several records, for Field rows (plugin API 1.48). */
function rowsOf(field: FieldDefinition): Pick<DynamicSourceInfo, 'rowKind' | 'rows'> {
  if (field.type === 'list') {
    return {
      rowKind: 'fields',
      rows: field.fields.map((sub) => ({
        id: `row.field:${sub.name}`,
        label: labelText(sub.label),
        type: fieldValueKind(sub),
        ...rowsOf(sub),
      })),
    };
  }
  if ((field.type === 'entry' || field.type === 'term' || field.type === 'user') && field.multiple)
    return { rowKind: field.type };
  return {};
}

/** A field as a source: `<object>.field:<name>` or `<object>.field:<group>.<name>`. */
function fieldSource(
  object: 'entry' | 'term' | 'user',
  field: FieldDefinition,
  group: FieldGroupView | null,
  heading: Label,
): DynamicSourceInfo {
  const label: Label = group
    ? `${labelText(group.title)} → ${labelText(field.label)}`
    : labelText(field.label);
  return {
    id: `${object}.field:${group ? `${group.id}.` : ''}${field.name}`,
    label,
    group: heading,
    type: fieldValueKind(field),
    ...rowsOf(field),
  };
}

/** An options page's field as a source: `option.field:<page>.<name>` (or `<page>.<group>.<name>`). */
function optionSource(
  page: { slug: string; title: Label },
  field: FieldDefinition,
  group: FieldGroupView | null,
): DynamicSourceInfo {
  return {
    id: `option.field:${page.slug}.${group ? `${group.id}.` : ''}${field.name}`,
    label: [
      labelText(page.title),
      ...(group ? [labelText(group.title)] : []),
      labelText(field.label),
    ].join(' → '),
    group: OPTIONS,
    type: fieldValueKind(field),
    ...rowsOf(field),
  };
}

/**
 * Dynamic data sources (plugin API 1.47), shared by Fresco's dynamic tags,
 * block bindings and themes: the core's (entry, term, site), one per custom
 * field, and the plugins'. Values come formatted as `useField` gives them.
 */
@Injectable()
export class DynamicSourcesService {
  private readonly logger = new Logger('DynamicSources');

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly plugins: PluginHost,
    private readonly fieldGroups: FieldGroupsService,
    private readonly fieldValues: FieldValuesService,
    private readonly languages: LanguagesService,
    private readonly options: OptionsPagesService,
  ) {}

  private async pluginSources(siteId: string): Promise<DynamicSource[]> {
    const result: DynamicSource[] = [];
    for (const plugin of await this.plugins.activePlugins(siteId)) {
      result.push(...plugin.dynamicSources);
      for (const provider of plugin.dynamicProviders) {
        try {
          const own = (await provider(siteId)).filter(
            (s) => typeof s?.id === 'string' && s.id.startsWith(`${plugin.slug}:`),
          );
          result.push(...own);
        } catch (error) {
          this.logger.error(`Dynamic sources of ${plugin.slug} failed: ${String(error)}`);
        }
      }
    }
    return result;
  }

  /** Every source of a site, as pickers list them. */
  async sources(siteId: string): Promise<DynamicSourceInfo[]> {
    const fieldSources: DynamicSourceInfo[] = [];
    const fieldsHeading: Label = { en: 'Fields', it: 'Campi' };
    const { types, taxonomyRows } = await withContext(this.database.db, { siteId }, async (tx) => ({
      types: await tx.select().from(contentTypes),
      taxonomyRows: await tx.select().from(taxonomies),
    }));
    const seen = new Set<string>();
    const add = (source: DynamicSourceInfo) => {
      if (seen.has(source.id)) return;
      seen.add(source.id);
      fieldSources.push(source);
    };
    for (const type of types) {
      const { fields } = await this.plugins.fieldsFor(siteId, type);
      for (const field of fields) add(fieldSource('entry', field, null, fieldsHeading));
    }
    for (const group of await this.fieldGroups.groups(siteId)) {
      if (group.storage === 'document') continue;
      const objects = new Set<'entry' | 'term' | 'user'>();
      for (const and of group.location ?? []) {
        for (const rule of and) {
          if (['taxonomy'].includes(rule.param)) objects.add('term');
          else if (['userRole', 'userForm'].includes(rule.param)) objects.add('user');
          else if (rule.param !== 'currentUserRole' && rule.param !== 'optionsPage')
            objects.add('entry');
        }
      }
      for (const object of objects)
        for (const field of group.fields) add(fieldSource(object, field, group, fieldsHeading));
    }
    for (const taxonomy of taxonomyRows)
      for (const field of taxonomyFields(taxonomy))
        add(fieldSource('term', field, null, fieldsHeading));
    // Options pages (plugin API 1.48): their own fields and their groups'.
    const allOptionGroups = (await this.fieldGroups.groups(siteId, 'options')).filter(
      (g) => g.storage !== 'document',
    );
    for (const page of await this.options.pages(siteId)) {
      for (const field of page.fields ?? []) add(optionSource(page, field, null));
      for (const group of allOptionGroups) {
        const rules = group.location ?? [];
        const named = rules.some((and) =>
          and.some(
            (r) => r.param === 'optionsPage' && r.operator === '==' && r.value === page.slug,
          ),
        );
        if (named) for (const field of group.fields) add(optionSource(page, field, group));
      }
    }
    const plugin = (await this.pluginSources(siteId)).map(({ resolve: _resolve, ...info }) => info);
    return [...CORE_SOURCES, ...fieldSources, ...plugin];
  }

  /** The value of a source; undefined when there is none. */
  async resolve(siteId: string, id: string, context: DynamicContext): Promise<unknown> {
    try {
      if (id.startsWith('entry.')) return await this.entryValue(siteId, id, context);
      if (id.startsWith('term.')) return await this.termValue(siteId, id, context);
      if (id.startsWith('user.field:')) return await this.userValue(siteId, id, context);
      if (id.startsWith('site.')) return await this.siteValue(siteId, id, context);
      if (id.startsWith('option.field:')) return await this.optionValue(siteId, id, context);
      if (id.startsWith('row.field:')) return rowValue(id, context);
      if (id.startsWith('user.')) return await this.userProperty(siteId, id, context);
      const source = (await this.pluginSources(siteId)).find((s) => s.id === id);
      return source ? await source.resolve({ ...context, siteId }) : undefined;
    } catch (error) {
      this.logger.warn(`Dynamic source ${id} failed: ${String(error)}`);
      return undefined;
    }
  }

  /**
   * Values of sources for the block editor's preview (plugin API 1.48): of
   * the entry being edited, with the values not saved yet when given
   * (`fields`), in a language. Undefined values are left out.
   */
  async preview(
    siteId: string,
    ids: readonly string[],
    input: { entryId?: string; locale?: string; fields?: Record<string, unknown>; title?: string },
  ): Promise<Record<string, unknown>> {
    const defaultLocale = await withContext(this.database.db, { siteId }, (tx) =>
      defaultLocaleIn(tx, siteId),
    );
    // Read before the transaction: they may need connections of their own.
    const slugs = await this.plugins.activeSlugs(siteId);
    const locales = await this.languages.locales(siteId, defaultLocale);
    const { page, locale } = await withContext(this.database.db, { siteId }, async (tx) => {
      if (!input.entryId || !UUID_RE.test(input.entryId)) {
        return { page: undefined, locale: input.locale || defaultLocale };
      }
      const [row] = await tx
        .select({ entry: entries, revision: revisions })
        .from(entries)
        .leftJoin(revisions, eq(revisions.id, entries.currentRevisionId))
        .where(eq(entries.id, input.entryId));
      if (!row) return { page: undefined, locale: input.locale || defaultLocale };
      const locale = input.locale || row.entry.locale;
      const data = await loadSiteData(tx, slugs, locales);
      const values = input.fields ?? ((row.revision?.fields as Record<string, unknown>) || {});
      const fieldValues = await this.fieldValues.entry(
        { tx, siteId, locale, urls: data.urls },
        row.entry.typeSlug,
        values,
      );
      const featured = row.revision?.featuredMediaId
        ? await formatContext(tx, siteId, locale, data.urls).media(row.revision.featuredMediaId)
        : null;
      const entry = {
        id: row.entry.id,
        type: row.entry.typeSlug,
        locale: row.entry.locale,
        slug: row.entry.slug,
        title: input.title ?? row.revision?.title ?? row.entry.title,
        url: data.urls.entry(row.entry),
        publishedAt: row.entry.publishedAt?.toISOString() ?? null,
        excerpt: row.revision?.excerpt ?? '',
        featuredImage: featured,
        fields: values,
        ...(fieldValues ? { fieldValues } : {}),
      };
      return { page: { route: 'entry', entry } as unknown as BlockPage, locale };
    });
    const out: Record<string, unknown> = {};
    for (const id of ids.slice(0, 100)) {
      const value = await this.resolve(siteId, id, { locale, ...(page ? { page } : {}) });
      if (value !== undefined) out[id] = value;
    }
    return out;
  }

  private async scope<T>(
    siteId: string,
    locale: string,
    fn: (tx: SiteTransaction, urls: UrlBuilder, locale: string) => Promise<T>,
  ): Promise<T> {
    return withContext(this.database.db, { siteId }, async (tx) => {
      const defaultLocale = await defaultLocaleIn(tx, siteId);
      const data = await loadSiteData(
        tx,
        await this.plugins.activeSlugs(siteId),
        await this.languages.locales(siteId, defaultLocale),
      );
      return fn(tx, data.urls, locale || defaultLocale);
    });
  }

  private async entryValue(siteId: string, id: string, context: DynamicContext) {
    const page = context.page?.entry;
    const wanted = context.entry?.id ?? page?.id;
    const key = id.startsWith('entry.field:') ? id.slice('entry.field:'.length) : null;
    // The page's own entry: everything is already there.
    if (page && wanted === page.id) {
      if (key !== null) {
        if (page.fieldValues && key in page.fieldValues) return page.fieldValues[key] ?? undefined;
      } else return entryProperty(id, page);
    }
    if (!wanted || !UUID_RE.test(wanted)) return undefined;
    return this.scope(siteId, context.locale, async (tx, urls, locale) => {
      const [row] = await tx
        .select({ entry: entries, revision: revisions })
        .from(entries)
        .innerJoin(revisions, eq(revisions.id, entries.publishedRevisionId))
        .where(and(eq(entries.id, wanted), isPublished));
      if (!row) return undefined;
      const values = row.revision.fields as Record<string, unknown>;
      if (key !== null) {
        const formatted = await this.fieldValues.entry(
          { tx, siteId, locale, urls },
          row.entry.typeSlug,
          values,
        );
        return formatted?.[key] ?? undefined;
      }
      const featuredImage =
        id === 'entry.featuredImage' && row.revision.featuredMediaId
          ? await formatContext(tx, siteId, locale, urls).media(row.revision.featuredMediaId)
          : null;
      return entryProperty(id, {
        title: row.revision.title,
        url: urls.entry(row.entry),
        excerpt: row.revision.excerpt ?? '',
        publishedAt: row.entry.publishedAt?.toISOString() ?? null,
        featuredImage,
      });
    });
  }

  private async termValue(siteId: string, id: string, context: DynamicContext) {
    const archive = context.page?.archive?.term as
      | {
          taxonomy: string;
          slug: string;
          name: string;
          description: string | null;
          fieldValues?: Record<string, unknown>;
        }
      | undefined;
    const key = id.startsWith('term.field:') ? id.slice('term.field:'.length) : null;
    if (!context.term && archive) {
      if (key === null) {
        if (id === 'term.name') return archive.name;
        if (id === 'term.description') return archive.description ?? undefined;
      } else if (archive.fieldValues && key in archive.fieldValues) {
        return archive.fieldValues[key] ?? undefined;
      }
    }
    const wanted = context.term?.id;
    if (wanted ? !UUID_RE.test(wanted) : !archive) return undefined;
    return this.scope(siteId, context.locale, async (tx, urls, locale) => {
      const [row] = await tx
        .select({ term: terms, taxonomy: taxonomies.slug })
        .from(terms)
        .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
        .where(
          wanted
            ? eq(terms.id, wanted)
            : and(
                eq(taxonomies.slug, archive!.taxonomy),
                eq(terms.slug, archive!.slug),
                eq(terms.locale, locale),
              ),
        );
      if (!row) return undefined;
      if (key !== null) {
        const formatted = await this.fieldValues.term(
          { tx, siteId, locale, urls },
          row.taxonomy,
          row.term.fields as Record<string, unknown>,
        );
        return formatted?.[key] ?? undefined;
      }
      if (id === 'term.name') return row.term.name;
      if (id === 'term.description') return row.term.description ?? undefined;
      if (id === 'term.url') return urls.term(row.taxonomy, row.term.slug, row.term.locale);
      return undefined;
    });
  }

  private async userValue(siteId: string, id: string, context: DynamicContext) {
    const key = id.slice('user.field:'.length);
    const userId = context.user?.id;
    if (!userId || !UUID_RE.test(userId)) return undefined;
    return this.scope(siteId, context.locale, async (tx, urls, locale) => {
      const formatted = await this.fieldValues.user({ tx, siteId, locale, urls }, userId);
      return formatted?.[key] ?? undefined;
    });
  }

  /** `option.field:<page>.<name>` (or `<page>.<group>.<name>`), formatted, in the page's language. */
  private async optionValue(siteId: string, id: string, context: DynamicContext) {
    const key = id.slice('option.field:'.length);
    const dot = key.indexOf('.');
    if (dot <= 0) return undefined;
    const page = key.slice(0, dot);
    const name = key.slice(dot + 1);
    return this.scope(siteId, context.locale, async (tx, urls, locale) => {
      const all = await this.options.formatted({ tx, siteId, locale, urls });
      return all[page]?.[name] ?? undefined;
    });
  }

  /** `user.name`, `user.url`, `user.avatar` of the person given (Field rows of members). */
  private async userProperty(siteId: string, id: string, context: DynamicContext) {
    const userId = context.user?.id;
    if (!userId || !UUID_RE.test(userId)) return undefined;
    return this.scope(siteId, context.locale, async (tx, urls, locale) => {
      const person = await formatContext(tx, siteId, locale, urls).user!(userId);
      if (!person) return undefined;
      if (id === 'user.name') return person.name;
      if (id === 'user.url') return person.url ?? undefined;
      if (id === 'user.avatar')
        return person.avatarUrl ? { id: null, url: person.avatarUrl, alt: person.name } : undefined;
      return undefined;
    });
  }

  private async siteValue(siteId: string, id: string, context: DynamicContext) {
    const site = context.page?.site;
    if (id === 'site.url') return site?.home ?? '/';
    if (site)
      return id === 'site.title' ? site.title : id === 'site.tagline' ? site.tagline : undefined;
    return withContext(this.database.db, { siteId }, async (tx) => {
      const key = id === 'site.title' ? 'title' : id === 'site.tagline' ? 'tagline' : null;
      if (!key) return undefined;
      const [row] = await tx
        .select({ value: settings.value })
        .from(settings)
        .where(and(eq(settings.namespace, 'core'), eq(settings.key, key)));
      if (typeof row?.value === 'string' && row.value) return row.value;
      // Without a title of its own, the site's name (as pages show it).
      if (key !== 'title') return undefined;
      const [site] = await tx.select({ name: sites.name }).from(sites).where(eq(sites.id, siteId));
      return site?.name || undefined;
    });
  }
}

/** `row.field:<name>`: a value of the row shown (Field rows), already formatted. */
function rowValue(id: string, context: DynamicContext): unknown {
  const row = context.row;
  if (!row) return undefined;
  return row[id.slice('row.field:'.length)] ?? undefined;
}

/** A property of an entry for `entry.*` sources. */
function entryProperty(
  id: string,
  entry: {
    title: string;
    url: string;
    excerpt: string;
    publishedAt: string | null;
    featuredImage: {
      id: string;
      url: string;
      alt: string;
      width: number | null;
      height: number | null;
    } | null;
  },
): unknown {
  switch (id) {
    case 'entry.title':
      return entry.title;
    case 'entry.url':
      return entry.url;
    case 'entry.excerpt':
      return entry.excerpt || undefined;
    case 'entry.date':
      return entry.publishedAt ?? undefined;
    case 'entry.featuredImage':
      return entry.featuredImage
        ? {
            id: entry.featuredImage.id,
            url: entry.featuredImage.url,
            alt: entry.featuredImage.alt,
            width: entry.featuredImage.width,
            height: entry.featuredImage.height,
          }
        : undefined;
    default:
      return undefined;
  }
}
