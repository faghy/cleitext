import type { z } from 'zod';
import type { FieldDefinition, FieldValues } from './fields.js';

/**
 * Registry of field types (plugin API 1.47). The core's types (`text`,
 * `media`, `list`…) are registered here like those of plugins, which are
 * named `<plugin>/<name>` (e.g. `campus/gallery`). Each process has its own
 * registry: the server's gets the plugins' types from `ctx.fields.registerType`,
 * the admin's their editor components (`fieldTypes` of `defineAdminPlugin`).
 */

/** A media file as templates get it (`useField`, dynamic data). */
export interface FormattedMedia {
  id: string;
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
  mime: string;
  /** Resized copies by name (e.g. `md`), as the media library made them. */
  sizes: Record<string, { url: string; width: number; height: number }>;
  /** The file's name (`file` fields, plugin API 1.48). */
  filename?: string;
}

/** Another entry as templates get it (relation fields of plugins). */
export interface FormattedEntry {
  id: string;
  type: string;
  title: string;
  url: string;
}

/** A term as templates get it (`term` fields, plugin API 1.48). */
export interface FormattedTerm {
  id: string;
  taxonomy: string;
  name: string;
  slug: string;
  url: string;
}

/** A member of the site as templates get it (`user` fields, plugin API 1.48). */
export interface FormattedUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** Their author archive, when they have one. */
  url: string | null;
}

/** What a formatter can look up: loads are batched per page. */
export interface FieldFormatContext {
  siteId: string;
  locale: string;
  media(id: string): Promise<FormattedMedia | null>;
  entry(id: string): Promise<FormattedEntry | null>;
  /** A term (plugin API 1.48; missing on older cores). */
  term?(id: string): Promise<FormattedTerm | null>;
  /** A member of the site (plugin API 1.48; missing on older cores). */
  user?(id: string): Promise<FormattedUser | null>;
  /** A media file of any kind, with its file name (plugin API 1.48; `media` on older cores). */
  file?(id: string): Promise<FormattedMedia | null>;
  /** Formats the values of nested fields (e.g. the rows of a list). */
  format(fields: readonly FieldDefinition[], values: FieldValues): Promise<FieldValues>;
}

/**
 * References written into a site export: the importer gives them the new
 * site's ids (`{ $media }`, `{ $entry }`, `{ $term }`, `{ $user }` objects
 * become the new ids, or null when the record was not imported).
 */
export interface FieldTransferRefs {
  media(id: string): unknown;
  entry(id: string): unknown;
  term(id: string): unknown;
  user(id: string): unknown;
  /** Writes the values of nested fields (e.g. the rows of a list). */
  values(fields: readonly FieldDefinition[], values: FieldValues): FieldValues;
}

/**
 * What dynamic data (Fresco tags, block bindings) can do with a value. Since
 * plugin API 1.48 also `richtext` (HTML), `link` (`{ url, label, target }`),
 * `entry`, `term`, `user` (one related record) and `file` (a media file of
 * any kind); several related records are a `list`.
 */
export type FieldValueKind =
  | 'text'
  | 'url'
  | 'number'
  | 'boolean'
  | 'date'
  | 'media'
  | 'list'
  | 'object'
  | 'richtext'
  | 'link'
  | 'entry'
  | 'term'
  | 'user'
  | 'file';

export interface FieldTypeDefinition {
  /** `<plugin>/<name>` (lowercase, digits and `-`), or a core type. */
  type: string;
  /**
   * Checks the type's own settings of a definition (its `settings` object,
   * e.g. `z.object({ max: z.number().optional() })`); the common ones (name,
   * label, required…) are checked by the core.
   */
  settings?: z.ZodType<unknown>;
  /** Validator of a value that is set (null and missing values are never checked). Default: any JSON. */
  value?: (field: FieldDefinition) => z.ZodType<unknown>;
  /** The value as it is saved, after validation (e.g. trimmed, sorted). */
  normalize?: (value: unknown, field: FieldDefinition) => unknown;
  /**
   * Whether a value counts as empty: required fields and `showIf: { empty }`.
   * Default: null, `''`, `[]` and `{}`.
   */
  isEmpty?: (value: unknown, field: FieldDefinition) => boolean;
  /** The value as templates get it (`useField`). Default: the value itself. */
  format?: (
    value: unknown,
    field: FieldDefinition,
    context: FieldFormatContext,
  ) => unknown | Promise<unknown>;
  /**
   * The value as plain text or a number, for search, indexes and text
   * output (`<Field>`, a dynamic text tag). Default: strings, numbers and
   * booleans as they are; nothing for others.
   */
  index?: (value: unknown, field: FieldDefinition) => string | number | boolean | null;
  /**
   * The value in a site export, with references to other records written
   * with `refs` (media, entries, terms, users) so that an import into
   * another site points to the imported ones. Default: the value as it is.
   */
  export?: (value: unknown, field: FieldDefinition, refs: FieldTransferRefs) => unknown;
  /** What dynamic data offers it as. Default `text`. */
  kind?: FieldValueKind;
  /** The kind for a given definition, when it depends on its settings (plugin API 1.48). */
  kindOf?: (field: FieldDefinition) => FieldValueKind;
  /**
   * What each row of a list holds (plugin API 1.49), for Field rows, page
   * builders and block bindings: `{ kind: 'fields', fields }` for rows of
   * fields (each a `row.field:<name>` source, nested lists included), or
   * `{ kind: 'entry' | 'term' | 'user' }` for related records. Null for a
   * value that is not a list. The core's `list` and multiple relations
   * have it.
   */
  rows?: (field: FieldDefinition) => FieldRows | null | undefined;
}

/** What each row of a list field holds (`FieldTypeDefinition.rows`, plugin API 1.49). */
export type FieldRows =
  { kind: 'fields'; fields: readonly FieldDefinition[] } | { kind: 'entry' | 'term' | 'user' };

const types = new Map<string, FieldTypeDefinition>();
let version = 0;
const listeners = new Set<() => void>();

/** Field types of plugins: `<plugin>/<name>`. */
export const CUSTOM_FIELD_TYPE_RE = /^[a-z][a-z0-9-]{0,63}\/[a-z][a-z0-9-]{0,63}$/;

/** Adds (or replaces) a field type. */
export function registerFieldType(definition: FieldTypeDefinition): void {
  types.set(definition.type, definition);
  version++;
  for (const listener of listeners) listener();
}

export function unregisterFieldType(type: string): void {
  if (!types.delete(type)) return;
  version++;
  for (const listener of listeners) listener();
}

/** A registered field type, or undefined (a plugin type whose plugin is not loaded). */
export function fieldType(type: string): FieldTypeDefinition | undefined {
  return types.get(type);
}

/** Names of the registered field types. */
export function fieldTypeNames(): string[] {
  return [...types.keys()];
}

/** Changes on every registration: for caches and `useSyncExternalStore`. */
export function fieldTypesVersion(): number {
  return version;
}

export function onFieldTypesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** What dynamic data offers a field's values as (`kindOf`, then `kind`, default `text`). */
export function fieldValueKind(field: FieldDefinition): FieldValueKind {
  const type = types.get(field.type);
  return type?.kindOf?.(field) ?? type?.kind ?? 'text';
}

/** What each row of a field's list holds (see `rows`); null for fields that are not lists. */
export function fieldRows(field: FieldDefinition): FieldRows | null {
  const hook = types.get(field.type)?.rows;
  if (!hook) return null;
  try {
    const rows = hook(field);
    if (!rows || typeof rows !== 'object') return null;
    if (rows.kind === 'fields') return Array.isArray(rows.fields) ? rows : null;
    return rows.kind === 'entry' || rows.kind === 'term' || rows.kind === 'user' ? rows : null;
  } catch {
    return null;
  }
}

/** Whether a value counts as empty for a field (see `isEmpty`). */
export function isEmptyValue(value: unknown, field?: FieldDefinition): boolean {
  const custom = field ? types.get(field.type)?.isEmpty : undefined;
  if (custom && field) return custom(value, field);
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}
