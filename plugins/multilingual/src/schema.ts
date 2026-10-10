import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const languages = pgTable('languages', {
  siteId: uuid('site_id').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  urlPrefix: text('url_prefix'),
  position: integer('position').notNull().default(0),
});

export const translations = pgTable('translations', {
  siteId: uuid('site_id').notNull(),
  kind: text('kind').$type<'entry' | 'term'>().notNull(),
  elementId: uuid('element_id').notNull(),
  groupId: uuid('group_id').notNull(),
  locale: text('locale').notNull(),
  sourceLocale: text('source_locale'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  needsUpdate: boolean('needs_update').notNull().default(false),
});

export const strings = pgTable('strings', {
  siteId: uuid('site_id').notNull(),
  locale: text('locale').notNull(),
  key: text('key').$type<'title' | 'tagline'>().notNull(),
  value: text('value').notNull(),
});

/** A language as listed by GET /api/v1/ext/multilingual/languages. */
export interface LanguageView {
  code: string;
  name: string;
  /** Address prefix, e.g. `/en` (empty for the default language). */
  prefix: string;
  urlPrefix: string | null;
  position: number;
  isDefault: boolean;
  usage: { entries: number; terms: number; menus: number };
}

/** Another language version, with what lists show of it. */
export interface TranslationView {
  id: string;
  locale: string;
  title: string;
  status?: string;
  /** The original changed after this translation was last saved. */
  needsUpdate?: boolean;
}

/** GET /translations: for each id, its language and the other versions. */
export type TranslationsResponse = Record<
  string,
  { locale: string; needsUpdate: boolean; isOriginal: boolean; links: TranslationView[] }
>;

/** GET /strings: site texts by language (the default language's are the core settings). */
export type StringsResponse = Record<string, { title: string; tagline: string }>;

/** GET /overview: entries of a type in the default language, with their translations. */
export interface OverviewRow {
  id: string;
  title: string;
  status: string;
  links: TranslationView[];
}
