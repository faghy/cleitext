import { z } from 'zod';
import type { FieldGroupView } from './plugins.js';
import type { FieldValueKind } from './field-types.js';
import { fieldListSchema, type FieldDefinition, type FieldValues, type Label } from './fields.js';

/**
 * Options pages (plugin API 1.48): site-wide settings pages, like ACF's.
 * They come from the site's owners (stored per site), from plugins
 * (`ctx.fields.addOptionsPage`) and from the theme (`optionsPages`); field
 * groups attach to them with the `optionsPage` location rule. Values are
 * kept per site, and per language for translatable fields when the site
 * has several languages.
 */

export const OPTIONS_PAGE_SLUG_RE = /^[a-z][a-z0-9_-]{0,63}$/;

export interface OptionsPageInput {
  /** Key of the page and of its values: lowercase letters, digits, `_` and `-`. */
  slug: string;
  title: Label;
  /** The menu's text, when shorter than the title. */
  menuTitle?: Label;
  /** A few words under the title. */
  description?: Label;
  /**
   * Shown under another options page (its slug) or an admin section
   * (`/settings`, `/appearance`, `/tools`…); a top-level menu entry when missing.
   */
  parent?: string;
  /**
   * Menu icon: one of the admin's (`settings`, `appearance`, `tools`,
   * `content`…) or SVG path data on a 24×24 grid, as plugins' pages.
   */
  icon?: string;
  /** Order of the top-level entries (lower first, default 100). */
  position?: number;
  /** Who can see and save it (default `manage_settings`). */
  capability?: string;
  /** The page's own fields, besides the groups attached with `optionsPage` rules. */
  fields?: FieldDefinition[];
}

const label = z.union([z.string().min(1).max(200), z.record(z.string(), z.string().max(200))]);

export const optionsPageSchema = z.object({
  slug: z.string().regex(OPTIONS_PAGE_SLUG_RE, 'Lowercase letters, digits, _ and -'),
  title: label,
  menuTitle: label.optional(),
  description: label.optional(),
  parent: z
    .string()
    .regex(
      /^(\/[a-z0-9/_-]{0,120}|[a-z][a-z0-9_-]{0,63})$/,
      'An options page slug or an admin path',
    )
    .optional(),
  icon: z
    .string()
    .max(2_000)
    .regex(
      /^[a-z0-9-]{1,40}$|^[MmLlHhVvCcSsQqTtAaZz0-9\s.,eE+-]{1,2000}$/,
      'An icon name or SVG path data',
    )
    .optional(),
  position: z.number().int().min(-1000).max(1000).optional(),
  capability: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,63}$/)
    .optional(),
  fields: z.lazy(() => fieldListSchema).optional(),
});

export const saveOptionsPageRequestSchema = optionsPageSchema;
export type SaveOptionsPageRequest = z.input<typeof saveOptionsPageRequestSchema>;

/** Where an options page comes from. */
export type OptionsPageSource = 'site' | 'theme' | `plugin:${string}`;

/** An options page as the admin and plugins see it. */
export interface OptionsPageView extends OptionsPageInput {
  source: OptionsPageSource;
}

/** The capability needed by default to see and save an options page. */
export const OPTIONS_PAGE_CAPABILITY = 'manage_settings';

/** A field is translatable unless it is the same in every language (`translation: 'copy'`). */
export function translatableField(field: FieldDefinition): boolean {
  return (field.translation ?? 'translate') !== 'copy';
}

/** An options page as edited: its fields and groups, and the values in a language. */
export interface OptionsScreenView {
  page: OptionsPageView;
  /** Field groups attached with an `optionsPage` rule (values under `values[<group id>]`). */
  groups: FieldGroupView[];
  /** The values in `locale`: own fields at the top, each group's under its id. */
  values: FieldValues;
  locale: string;
  /** The site's languages (one without a language plugin), the default first. */
  locales: { code: string; name: string; isDefault: boolean }[];
  /**
   * In a language other than the default one: only translatable fields are
   * shown and saved for it; the others are the same in every language.
   */
  translationsOnly: boolean;
}

/** A request to save the values of an options page. */
export const saveOptionsRequestSchema = z.object({
  fields: z.record(z.string(), z.unknown()),
  locale: z
    .string()
    .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/)
    .optional(),
});

/** A dynamic data source as pickers list it (block bindings, Fresco's tags). */
export interface DynamicSourceView {
  /** e.g. `entry.title`, `entry.field:team.photo`, `option.field:footer.phone`. */
  id: string;
  label: Label;
  /** Heading of pickers, e.g. `Entry`, `Fields`, `Options`. */
  group?: Label;
  type: FieldValueKind;
  /**
   * Lists (plugin API 1.48): what each row is, for the Field rows block —
   * rows of fields (`row.field:<name>` sources, given in `rows`), or related
   * entries, terms or members (their `entry.*`, `term.*`, `user.*` sources).
   */
  rowKind?: 'fields' | 'entry' | 'term' | 'user';
  rows?: DynamicSourceView[];
}

/** The block bindings source of the core (plugin API 1.48): `{ source, args: { key } }`. */
export const BINDING_SOURCE = 'cleitext/field';
