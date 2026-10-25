/**
 * What a Divi site keeps outside its pages, read from the export: the
 * Theme Builder's templates and layouts (header, body, footer), the Divi
 * Library (saved sections, rows and modules, global ones too) and, when
 * the site's theme options come with the import (`et_divi.json`), the
 * global colors, fonts, module presets and layout. They become Fresco's
 * kit, Fresco Pro's templates (`fresco_template` entries) and, for sites
 * without Fresco Pro, the header and footer Fresco shows in the theme's
 * place. Divi's option and meta names are a data format: they appear here
 * only to be read.
 */
import {
  diviConditions,
  diviKit,
  diviPresets,
  diviToFresco,
  isDiviLayout,
  type DiviConditionContext,
  type DiviContext,
  type DiviRule,
} from '@cleitext/blocks/divi';
import type { CxdBlock } from '@cleitext/blocks';
import type { TransferDocumentInput } from '@cleitext/blocks/transfer';

type TransferEntryInput = NonNullable<TransferDocumentInput['entries']>[number];
type Status = TransferEntryInput['status'];

/** An item of the export, as the Divi parts need it. */
export interface DiviItem {
  id: number;
  type: string;
  status?: Status;
  title: string;
  slug: string;
  content: string;
  author: string;
  date?: string;
  /** Every value of each meta key (Theme Builder templates repeat `_et_use_on`). */
  meta: Map<string, string[]>;
  /** Terms by taxonomy (the Library's `layout_type` and `scope`). */
  terms: Map<string, string[]>;
}

/** WordPress's own records of Divi: not content. */
export const DIVI_TYPES = [
  'et_pb_layout',
  'et_template',
  'et_header_layout',
  'et_body_layout',
  'et_footer_layout',
  'et_theme_builder',
  'et_theme_options',
  'et_code_snippet',
];
export const DIVI_TAXONOMIES = [
  'layout_type',
  'scope',
  'module_width',
  'layout_category',
  'layout_tag',
  'layout_pack',
  'et_tb_item_type',
  'et_code_snippet_type',
];

const LAYOUT_KINDS: Record<string, 'header' | 'single' | 'footer'> = {
  et_header_layout: 'header',
  et_body_layout: 'single',
  et_footer_layout: 'footer',
};

/** The location Fresco shows in the theme's place without Fresco Pro (header and footer). */
export interface ImportedLocation {
  /** The template entry the same layout became (Fresco Pro shows that one when active). */
  ref: string;
  title: string;
  blocks: CxdBlock[];
  rules: DiviRule[];
}

export interface DiviSite {
  /** Whether a page is built with Divi (its layout is converted). */
  isDiviPage(item: DiviItem): boolean;
  /** The conversion context of a page or layout. */
  context(warn: (message: string) => void, title?: string, gutter?: number): DiviContext;
  /** The menus shown by menu modules: menu slug → location. */
  menuLocations: Map<string, string>;
  /** Theme Builder layouts and Library items, as Fresco Pro templates. */
  templates(): TransferEntryInput[];
  /** Data for Fresco (the kit, and the header and footer without Fresco Pro). */
  fresco(googleFonts: string[]): Record<string, unknown> | null;
  /** Whether the site was built with Divi (pages, Theme Builder or Library). */
  used: boolean;
}

export interface DiviSiteInput {
  items: DiviItem[];
  locale: string;
  /** Address of the old site. */
  origin: string;
  /** Divi's theme options (`et_divi`), when uploaded with the export. */
  options: Record<string, unknown> | null;
  /** Media: refs by old address and by attachment id, addresses by attachment id. */
  mediaByUrl(url: string): string | undefined;
  attachment(id: number): { ref?: string; url: string } | undefined;
  /** A post's address as a path of this site. */
  postLink(id: number): string | undefined;
  /** WordPress menus: id → slug, in the export's order. */
  menus: { id: number; slug: string; items: number }[];
  conditions: Omit<DiviConditionContext, 'note'>;
  /** Font families to load. */
  font(family: string): void;
  warnings: string[];
}

const first = (item: DiviItem, key: string) => item.meta.get(key)?.[0] ?? '';

/** Reads a Divi site's parts and returns what the import of its pages and templates needs. */
export function prepareDivi(input: DiviSiteInput): DiviSite {
  const { items, options, warnings } = input;
  const isDiviPage = (item: DiviItem) =>
    first(item, '_et_pb_use_builder') === 'on' && isDiviLayout(item.content);
  const tbItems = items.filter((item) => item.type in LAYOUT_KINDS || item.type === 'et_template');
  const library = items.filter((item) => item.type === 'et_pb_layout' && item.status);
  const used =
    items.some(isDiviPage) || library.length > 0 || tbItems.some((i) => isDiviLayout(i.content));
  const site = used ? diviKit(options, input.font) : null;
  const presets = options ? diviPresets(options) : {};

  // Menu modules: a menu by id, or the site's main menu (the first one with items).
  const menuLocations = new Map<string, string>();
  const main = input.menus.find((m) => m.items > 0) ?? input.menus[0];
  const menuLocation = (menu: string) => {
    const found = menu ? input.menus.find((m) => String(m.id) === menu) : undefined;
    if (found) {
      const location = found.slug.slice(0, 64);
      menuLocations.set(found.slug, location);
      return location;
    }
    if (!main) return undefined;
    // Divi's menu module without a menu shows the theme's primary menu.
    menuLocations.set(main.slug, 'primary');
    return 'primary';
  };

  const context = (
    warn: (message: string) => void,
    title?: string,
    gutter?: number,
  ): DiviContext => ({
    warn,
    mediaByUrl: input.mediaByUrl,
    attachment: input.attachment,
    origin: input.origin,
    font: input.font,
    menuLocation,
    postLink: input.postLink,
    ...(title ? { title } : {}),
    ...(gutter ? { gutter } : {}),
    ...(site ? { layout: site.layout } : {}),
    presets,
  });

  const convert = (item: DiviItem, warn: (message: string) => void) => {
    const gutter = Number(first(item, '_et_pb_gutter_width')) || undefined;
    return diviToFresco(item.content, context(warn, item.title, gutter)) ?? [];
  };

  // ---- Theme Builder: which layouts show where -------------------------------------------
  const layoutRules = new Map<number, DiviRule[]>();
  const notes = new Map<string, number>();
  const conditionContext: DiviConditionContext = {
    ...input.conditions,
    note: (text) => notes.set(text, (notes.get(text) ?? 0) + 1),
  };
  let hiddenParts = 0;
  for (const template of tbItems.filter((item) => item.type === 'et_template')) {
    // Templates the Theme Builder no longer lists, or switched off, show nowhere.
    if (template.status !== 'published' || first(template, '_et_enabled') === '0') continue;
    if (first(template, '_et_theme_builder_marked_as_unused')) continue;
    const rules = diviConditions(
      template.meta.get('_et_use_on') ?? [],
      template.meta.get('_et_exclude_from') ?? [],
      first(template, '_et_default') === '1',
      conditionContext,
    );
    for (const part of ['header', 'body', 'footer']) {
      const id = Number(first(template, `_et_${part}_layout_id`));
      if (first(template, `_et_${part}_layout_enabled`) === '0') hiddenParts++;
      if (!id) continue;
      layoutRules.set(id, [...(layoutRules.get(id) ?? []), ...rules]);
    }
  }

  const templates = (): TransferEntryInput[] => {
    const out: TransferEntryInput[] = [];
    const counts = new Map<string, number>();
    const entry = (
      item: DiviItem,
      kind: string,
      rules: DiviRule[],
      blocks: CxdBlock[],
    ): TransferEntryInput => ({
      ref: `post:${item.id}`,
      type: 'fresco_template',
      locale: input.locale,
      slug: item.slug || `template-${item.id}`,
      title: item.title || `Template ${item.id}`,
      status: item.status ?? 'published',
      authorRef: `user:${item.author}`,
      ...(item.date ? { publishedAt: item.date, createdAt: item.date } : {}),
      document: {
        schema: 1,
        blocks,
        editor: { id: 'fresco', data: { template: { kind, conditions: rules } } },
      },
    });
    for (const item of tbItems) {
      const kind = LAYOUT_KINDS[item.type];
      if (!kind || !item.status || !isDiviLayout(item.content)) continue;
      const rules = layoutRules.get(item.id) ?? [];
      // Layouts of templates that show nowhere are left out.
      if (rules.length === 0) continue;
      const title = item.title && !/^theme builder layout/i.test(item.title) ? item.title : kind;
      const blocks = convert(item, (message) => warnings.push(`Template "${title}": ${message}`));
      out.push(entry({ ...item, title: `${capital(kind)} (Divi)` }, kind, rules, blocks));
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    let globals = 0;
    for (const item of library) {
      if (!isDiviLayout(item.content)) continue;
      const blocks = convert(item, (message) =>
        warnings.push(`Library item "${item.title}": ${message}`),
      );
      if (blocks.length === 0) continue;
      if (item.terms.get('scope')?.includes('global')) globals++;
      out.push(entry(item, 'section', [], blocks));
      counts.set('section', (counts.get('section') ?? 0) + 1);
    }
    if (out.length) {
      const list = [...counts].map(([kind, n]) => `${n} ${kind}`).join(', ');
      warnings.push(
        `${out.length} Divi Theme Builder layout(s) and Library item(s) (${list}) were imported as Fresco Pro templates: Fresco Pro must be active when importing to keep them.${counts.has('header') || counts.has('footer') ? ' Without it, Fresco shows the header and footer in the theme’s place.' : ''}`,
      );
    }
    if (globals) {
      warnings.push(
        `${globals} global Divi module(s) are kept in each page that uses them, and in the templates.`,
      );
    }
    if (hiddenParts) {
      warnings.push(
        'Some Divi templates hid the theme’s header, body or footer: check those pages after the import.',
      );
    }
    for (const [text, n] of notes)
      warnings.push(`Divi Theme Builder: ${text}${n > 1 ? ` (${n}×)` : ''}.`);
    return out;
  };

  /** The header and footer, for Fresco without Fresco Pro. */
  const locations = (): Record<string, ImportedLocation> => {
    const out: Record<string, ImportedLocation> = {};
    for (const item of tbItems) {
      const kind = LAYOUT_KINDS[item.type];
      if ((kind !== 'header' && kind !== 'footer') || out[kind]) continue;
      const rules = layoutRules.get(item.id) ?? [];
      if (rules.length === 0 || !item.status || !isDiviLayout(item.content)) continue;
      out[kind] = {
        ref: `post:${item.id}`,
        title: `${capital(kind)} (Divi)`,
        blocks: convert(item, () => undefined),
        rules,
      };
    }
    return out;
  };

  const fresco = (googleFonts: string[]): Record<string, unknown> | null => {
    if (!site) return null;
    if (!options) {
      const gcids = items.some((item) => /gcid-[0-9a-f]{8}/.test(item.content));
      warnings.push(
        gcids
          ? 'The Divi pages use global colors, but Divi’s theme options were not uploaded with the export: upload et_divi.json too to bring their values (and the site’s fonts and layout).'
          : 'Divi’s theme options were not uploaded with the export: Divi’s default fonts and colors were used.',
      );
    }
    const found = locations();
    return {
      kit: { ...site.kit, googleFonts: googleFonts.slice(0, 30) },
      ...(Object.keys(found).length ? { locations: found } : {}),
    };
  };

  return { isDiviPage, context, menuLocations, templates, fresco, used };
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
