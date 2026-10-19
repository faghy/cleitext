/**
 * A page laid out with `[av_…]` shortcodes (the old theme's layout builder)
 * as native blocks of the block editor: sections become full-width groups,
 * column shortcodes and grid rows become columns, and each element becomes
 * the core blocks closest to it (headings, paragraphs, lists, images,
 * galleries, buttons, tables, quotes…). Links, images and categories point to
 * ids of the old site: `maps` (read from the WordPress export, and from this
 * site's media library) turns them into addresses of this site. What has no
 * native block is left out or kept as text, and reported in `warnings`.
 *
 * Pure functions, without React or the network, so they can be tested.
 */
import type { CxdBlock, CxdInline, CxdText } from '@cleitext/blocks';
import { INLINE_COLOR, decodeEntities, htmlToBlocks, htmlToInline } from '@cleitext/blocks/inline';
import { isCode, paragraphs, parseShortcodes, type Code, type Node } from './shortcodes.js';
import { convertJsonLayout, JSON_LAYOUT } from './json-layout.js';

export interface ImportMaps {
  /** Post and page ids of the old site → their address on this site (a path). */
  posts?: Record<string, string>;
  /** Attachment ids of the old site → the address of the file there. */
  media?: Record<string, string>;
  /** Term ids → taxonomy (`category` or `tag`) and slug. */
  terms?: Record<string, { taxonomy: string; slug: string }>;
  /**
   * The media library of this site, by `mediaKey` of the file name: images of
   * the old site that were imported get their id and address here.
   */
  library?: Record<string, { id: string; url: string }>;
  /** Address of the old site (`https://example.com`): its links become paths. */
  origin?: string;
  /**
   * How the old theme showed headings, which the export does not say: their
   * color and whether in capitals (for headings without a color of their own).
   */
  headings?: { color?: string; uppercase?: boolean };
}

export type WarningKind =
  /** No native block does it: left out. */
  | 'skipped'
  /** Shown with simpler native blocks (e.g. tabs as headings, a slider as a gallery). */
  | 'simplified'
  /** A shortcode the converter does not know: its text was kept. */
  | 'unknown'
  /** Background images of sections, columns and cells: not kept. */
  | 'background'
  /** Images not found in this site's media library. */
  | 'media'
  /** Other shortcodes (not of the layout) left as text. */
  | 'shortcode';

export interface Warning {
  kind: WarningKind;
  /** The shortcode (or the file, for `media`). */
  tag: string;
  count: number;
}

export interface LayoutResult {
  blocks: CxdBlock[];
  warnings: Warning[];
}

export interface ConvertOptions {
  /** Ids of the new blocks (default: like `newBlockId`). */
  newId?: () => string;
}

let counter = 0;

/** A block id like `newBlockId` of `@cleitext/blocks` (without loading the document schema). */
function blockId(): string {
  counter = (counter + 1) % 1_296;
  return `b_${Date.now().toString(36)}${counter.toString(36).padStart(2, '0')}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** A file's key in the media library: its name without folders, size suffix and case. */
export function mediaKey(url: string): string {
  const name = (url.split(/[?#]/)[0] ?? '').split('/').pop() ?? '';
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    // Kept as it is.
  }
  return decoded
    .toLowerCase()
    .replace(/-\d+x\d+(?=\.[a-z0-9]+$)/, '')
    .replace(/-scaled(?=\.[a-z0-9]+$)/, '');
}

// ---- Values ----------------------------------------------------------------------------------

const num = (v: string | undefined, fallback: number) => {
  const n = Number.parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
};
const color = (v: string | undefined) => (v && INLINE_COLOR.test(v.trim()) ? v.trim() : undefined);
const LENGTH = /^(0|-?\d{1,5}(\.\d{1,4})?(px|em|rem|%|vh|vw))$/i;
const SAFE_HREF = /^(https?:|mailto:|tel:|\/|#|\?)/i;
const stripTags = (html: string) =>
  decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();

/** Widths of the column shortcodes (and grid cells), as fractions. */
const FRACTION: Record<string, number> = {
  one_full: 1,
  four_fifth: 4 / 5,
  three_fourth: 3 / 4,
  two_third: 2 / 3,
  three_fifth: 3 / 5,
  one_half: 1 / 2,
  two_fifth: 2 / 5,
  one_third: 1 / 3,
  one_fourth: 1 / 4,
  one_fifth: 1 / 5,
};
const COLUMN =
  /^av_(one_full|four_fifth|three_fourth|two_third|three_fifth|one_half|two_fifth|one_third|one_fourth|one_fifth)$/;
const percent = (fraction: number) => `${Math.round(fraction * 10_000) / 100}%`;

/** Shortcodes inside a line of text: their text stays in the line. */
const INLINE_TAGS = new Set(['av_dropcap1', 'av_dropcap2', 'av_sc_text_highlight']);

/** Padding of sections in the old builder. */
const SECTION_PADDING: Record<string, string> = {
  'no-padding': '0',
  small: '20px',
  default: '50px',
  large: '70px',
  huge: '130px',
};

/** Colors of the notification boxes. */
const NOTICE: Record<string, { background: string; text: string }> = {
  green: { background: '#e0f1b5', text: '#4f5f39' },
  blue: { background: '#f5f6fc', text: '#4671a3' },
  red: { background: '#ffcdc9', text: '#8b2621' },
  orange: { background: '#ffefcb', text: '#7f5a1a' },
  silver: { background: '#f1f1f1', text: '#444444' },
};

/** Elements with no native block: left out. */
const SKIPPED = new Set([
  'av_google_map',
  'av_leaflet_map',
  'av_contact',
  'av_blog',
  'av_postslider',
  'av_masonry_entries',
  'av_portfolio',
  'av_magazine',
  'av_productslider',
  'av_product_slider',
  'av_productgrid',
  'av_product_list',
  'av_postcontent',
  'av_custom_layout',
  'av_sc_page_split',
  'av_submenu',
  'av_countdown',
  'av_social_share',
  'av_player',
  'av_layerslider',
  'av_feature_image_slider',
  'av_comments_list',
  'av_mailchimp',
  'av_search',
  'av_events_countdown',
  'av_upcoming_events',
  'av_author_box',
  'av_sidebar',
]);

type Style = {
  spacing?: { padding?: Record<string, string>; margin?: Record<string, string> };
  color?: { text?: string; background?: string };
  typography?: { fontSize?: string };
};

function style(parts: {
  background?: string | undefined;
  text?: string | undefined;
  padding?: Record<string, string> | undefined;
  fontSize?: string | undefined;
}): Style | undefined {
  const out: Style = {};
  if (parts.background || parts.text) {
    out.color = {
      ...(parts.text ? { text: parts.text } : {}),
      ...(parts.background ? { background: parts.background } : {}),
    };
  }
  if (parts.padding && Object.keys(parts.padding).length) out.spacing = { padding: parts.padding };
  if (parts.fontSize) out.typography = { fontSize: parts.fontSize };
  return Object.keys(out).length ? out : undefined;
}

/** `10px,20px` or `10px 20px 0 5px` (CSS order) as padding sides. */
function padding(value: string | undefined): Record<string, string> | undefined {
  if (!value) return undefined;
  const parts = value
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (/^\d+(\.\d+)?$/.test(p) ? (p === '0' ? '0' : `${p}px`) : p));
  if (!parts.length || parts.some((p) => !LENGTH.test(p))) return undefined;
  const [top, right = top, bottom = top, left = right] = parts as [string, ...string[]];
  const sides = { top, right, bottom, left };
  return Object.values(sides).every((v) => v === '0' || /^0[a-z%]+$/i.test(v)) ? undefined : sides;
}

const px = (v: string | undefined) => {
  const n = num(v, 0);
  return n > 0 ? `${n}px` : undefined;
};

// ---- Converter ---------------------------------------------------------------------------------

class Converter {
  private readonly warned = new Map<string, Warning>();

  constructor(
    private readonly maps: ImportMaps,
    private readonly newId: () => string,
  ) {}

  warnings(): Warning[] {
    return [...this.warned.values()];
  }

  warn(kind: WarningKind, tag: string): void {
    const key = `${kind}:${tag}`;
    const found = this.warned.get(key);
    if (found) found.count++;
    else this.warned.set(key, { kind, tag, count: 1 });
  }

  block(
    type: string,
    attrs: Record<string, unknown> = {},
    extra: Partial<CxdBlock> = {},
  ): CxdBlock {
    const clean = Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== undefined));
    return { id: this.newId(), type, v: 1, attrs: clean, ...extra };
  }

  group(children: CxdBlock[], attrs: Record<string, unknown> = {}): CxdBlock {
    return this.block('core/group', attrs, { children });
  }

  // ---- Links and media ----

  /** An address of the old site as one of this site (its own links become paths). */
  address(url: string): string | null {
    let value = decodeEntities(url.trim());
    if (!value || value === 'http://' || value === 'https://') return null;
    const origin = this.maps.origin?.replace(/\/$/, '');
    if (origin && value.toLowerCase().startsWith(origin.toLowerCase())) {
      value = value.slice(origin.length) || '/';
      if (!value.startsWith('/') && !value.startsWith('?') && !value.startsWith('#')) {
        value = `/${value}`;
      }
    }
    if (/^www\./i.test(value)) value = `https://${value}`;
    return SAFE_HREF.test(value) ? value : null;
  }

  /** `manually,<url>`, `<type>,<id>`, `<taxonomy>,<id>` or a bare address. */
  link(value: string | undefined, target?: string): { url: string; newTab: boolean } | null {
    if (!value || value === 'lightbox') return null;
    const comma = value.indexOf(',');
    const kind = comma === -1 ? '' : value.slice(0, comma);
    const rest = comma === -1 ? value : value.slice(comma + 1);
    let url: string | null = null;
    if (kind === 'manually') url = this.address(rest);
    else if (!/^[a-z_]+$/.test(kind)) url = this.address(value);
    else {
      const id = rest.split(',')[0]!.trim();
      const term = this.maps.terms?.[id];
      if (/^(category|post_tag|portfolio_entries|product_cat|product_tag)$/.test(kind) && term) {
        url = term.taxonomy === 'tag' ? `/tag/${term.slug}` : `/category/${term.slug}`;
      } else if (this.maps.posts?.[id]) url = this.maps.posts[id]!;
      else if (term) url = term.taxonomy === 'tag' ? `/tag/${term.slug}` : `/category/${term.slug}`;
    }
    return url ? { url, newTab: target === '_blank' } : null;
  }

  /** An image of the old site: this site's copy in the media library, or its old address. */
  image(src: string | undefined, attachment?: string): { id?: string; url: string } | null {
    const old = (attachment && this.maps.media?.[attachment.trim()]) || src?.trim();
    if (!old) {
      if (attachment && this.maps.library) this.warn('media', `#${attachment}`);
      return null;
    }
    const found = this.maps.library?.[mediaKey(old)];
    if (found) return { id: found.id, url: found.url };
    if (this.maps.library) this.warn('media', mediaKey(old) || old);
    // The old site's address, which works while that site is online.
    const url = decodeEntities(old);
    return SAFE_HREF.test(url) ? { url } : null;
  }

  imageBlock(
    image: { id?: string; url: string },
    extra: {
      alt?: string;
      href?: string | null;
      caption?: string;
      align?: string;
      newTab?: boolean;
    } = {},
  ): CxdBlock {
    const caption = extra.caption ? inlineOf(extra.caption) : [];
    return this.block('core/image', {
      ...(image.id ? { id: image.id } : {}),
      url: image.url,
      alt: extra.alt ?? '',
      ...(extra.align ? { align: extra.align } : {}),
      ...(extra.href ? { href: extra.href } : {}),
      ...(extra.href && extra.newTab ? { linkTarget: '_blank' } : {}),
      ...(caption.length ? { caption } : {}),
    });
  }

  gallery(ids: string | undefined, columns?: string): CxdBlock[] {
    const images = String(ids ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => this.image(undefined, id))
      .filter((image): image is { id?: string; url: string } => image !== null)
      .map((image) => this.imageBlock(image));
    if (!images.length) return [];
    const n = Math.round(num(columns, 0));
    return [
      this.block(
        'core/gallery',
        { ...(n >= 1 && n <= 8 ? { columns: n } : {}), linkTo: 'none' },
        {
          children: images,
        },
      ),
    ];
  }

  // ---- Text ----

  /** Rich-text HTML typed in the classic editor as native blocks. */
  rich(html: string, extra?: Style): CxdBlock[] {
    const source = paragraphs(html);
    if (!stripTags(source) && !/<img\b/i.test(source)) return [];
    for (const m of source.matchAll(/\[([a-z][\w-]*)(?:\s[^\]]*)?\]/gi)) {
      if (!m[1]!.toLowerCase().startsWith('av_')) this.warn('shortcode', m[1]!.toLowerCase());
    }
    const blocks = htmlToBlocks(source, { newId: this.newId });
    this.fix(blocks);
    if (extra) {
      for (const b of blocks) {
        if (['core/paragraph', 'core/heading', 'core/list', 'core/quote'].includes(b.type)) {
          b.attrs.style = extra;
        }
      }
    }
    return blocks;
  }

  /** Images of this site and links as its own paths, in blocks made from HTML. */
  fix(blocks: CxdBlock[]): void {
    for (const b of blocks) {
      if (b.type === 'core/image' && typeof b.attrs.url === 'string') {
        const image = this.image(b.attrs.url);
        if (image) {
          b.attrs.url = image.url;
          if (image.id) b.attrs.id = image.id;
        }
      }
      if (b.content) b.content = this.links(b.content);
      if (b.children) this.fix(b.children);
    }
  }

  links(nodes: CxdInline[]): CxdInline[] {
    return nodes.map((n) => {
      if (!('type' in n)) return n;
      const href = this.address(n.href);
      return href ? { ...n, href } : n;
    });
  }

  /** Text and nested shortcodes of an element as blocks: lines of text, and elements. */
  content(nodes: Node[], extra?: Style): CxdBlock[] {
    return this.sequence(nodes, extra);
  }

  // ---- Layout ----

  /** Elements one after the other; runs of column shortcodes become rows of columns. */
  sequence(nodes: Node[], extra?: Style): CxdBlock[] {
    const out: CxdBlock[] = [];
    let text = '';
    let row: { total: number; columns: { code: Code; fraction: number }[] } | null = null;
    const flushText = () => {
      const blocks = text.trim() ? this.rich(text, extra) : [];
      if (blocks.length) {
        flushRow();
        out.push(...blocks);
      }
      text = '';
    };
    const flushRow = () => {
      if (row?.columns.length) out.push(...this.row(row.columns));
      row = null;
    };
    for (const node of nodes) {
      if (!isCode(node) || INLINE_TAGS.has(node.tag)) {
        text += isCode(node) ? plain(node) : node;
        continue;
      }
      flushText();
      const column = COLUMN.exec(node.tag);
      if (column) {
        const fraction = FRACTION[column[1]!]!;
        const current: { total: number; columns: { code: Code; fraction: number }[] } | null = row;
        if (!current || node.flags.includes('first') || current.total + fraction > 1.001) {
          flushRow();
          row = { total: fraction, columns: [{ code: node, fraction }] };
        } else {
          current.total += fraction;
          current.columns.push({ code: node, fraction });
        }
        continue;
      }
      flushRow();
      out.push(...this.convert(node));
    }
    flushText();
    flushRow();
    return out;
  }

  /** A row of column shortcodes: columns side by side, or the content of a single full column. */
  row(columns: { code: Code; fraction: number }[]): CxdBlock[] {
    if (columns.length === 1 && columns[0]!.fraction > 0.999) {
      const { code } = columns[0]!;
      const look = this.boxStyle(code.attrs, code.tag);
      const inner = this.sequence(code.children);
      return look ? [this.group(inner, { style: look })] : inner;
    }
    const equal = columns.some((c) => c.code.attrs.min_height === 'av-equal-height-column');
    return [
      this.block(
        'core/columns',
        {},
        {
          children: columns.map(({ code, fraction }) => {
            const a = code.attrs;
            const valign =
              a.vertical_alignment === 'av-align-middle'
                ? 'center'
                : a.vertical_alignment === 'av-align-bottom'
                  ? 'bottom'
                  : equal && a.vertical_alignment === 'av-align-top'
                    ? 'top'
                    : undefined;
            return this.block(
              'core/column',
              {
                width: percent(fraction),
                ...(valign ? { verticalAlignment: valign } : {}),
                style: this.boxStyle(a, code.tag),
              },
              { children: this.sequence(code.children) },
            );
          }),
        },
      ),
    ];
  }

  /** Background color and padding of a column or cell (a background image is reported). */
  boxStyle(a: Record<string, string>, tag: string): Style | undefined {
    if (a.src || a.attachment) this.warn('background', tag);
    return style({
      background: color(a.background_color) ?? color(a.custom_bg),
      padding: padding(a.padding),
    });
  }

  /** A box of the layout, or an element; arrays for what becomes several blocks. */
  convert(code: Code): CxdBlock[] {
    const a = code.attrs;
    const tag = code.tag;
    if (tag === 'av_section') {
      if (a.src || a.attachment) this.warn('background', tag);
      const space = SECTION_PADDING[a.padding ?? 'default'] ?? '50px';
      return [
        this.group(this.sequence(code.children), {
          tagName: 'section',
          align: 'full',
          ...(a.id && /^[\w-]{1,100}$/.test(a.id) ? { anchor: a.id } : {}),
          style: style({
            background: color(a.custom_bg),
            padding: { top: space, bottom: space },
          }),
          layout: { type: 'constrained' },
        }),
      ];
    }
    if (tag === 'av_layout_row') {
      const cells = code.children.filter(isCode).filter((c) => /^av_cell_/.test(c.tag));
      return [
        this.block(
          'core/columns',
          {
            align: 'full',
            ...(a.mobile === 'av-fixed-cells' ? { isStackedOnMobile: false } : {}),
            ...(a.id && /^[\w-]{1,100}$/.test(a.id) ? { anchor: a.id } : {}),
          },
          {
            children: cells.map((cell) => {
              const size = /^av_cell_(\w+)$/.exec(cell.tag)?.[1] ?? 'one_half';
              const c = cell.attrs;
              const valign =
                c.vertical_align === 'middle'
                  ? 'center'
                  : c.vertical_align === 'bottom'
                    ? 'bottom'
                    : undefined;
              return this.block(
                'core/column',
                {
                  width: percent(FRACTION[size] ?? 1 / 2),
                  ...(valign ? { verticalAlignment: valign } : {}),
                  style: this.boxStyle(c, cell.tag),
                },
                { children: this.sequence(cell.children) },
              );
            }),
          },
        ),
      ];
    }
    if (COLUMN.test(tag)) return this.row([{ code, fraction: FRACTION[tag.slice(3)]! }]);
    if (/^av_cell_/.test(tag)) return this.sequence(code.children);
    return this.element(code);
  }

  /** The items of a shortcode with nested item shortcodes. */
  items(code: Code, ...tags: string[]): Code[] {
    return code.children.filter(isCode).filter((c) => tags.includes(c.tag));
  }

  heading(
    text: string,
    level: number,
    extra: { align?: string; link?: { url: string; newTab: boolean } | null; style?: Style } = {},
  ): CxdBlock[] {
    let content = inlineOf(text);
    if (!content.length) return [];
    if (this.maps.headings?.uppercase) content = upper(content);
    if (extra.link) content = linked(content, extra.link);
    return [
      this.block(
        'core/heading',
        {
          level: Math.min(6, Math.max(1, level)),
          ...(extra.align ? { textAlign: extra.align } : {}),
          style: extra.style,
        },
        { content },
      ),
    ];
  }

  /** A heading of an item (tabs, toggles, boxes…), in the theme's heading color. */
  itemHeading(text: string, level = 3, link?: { url: string; newTab: boolean } | null): CxdBlock[] {
    const headingColor = color(this.maps.headings?.color);
    return this.heading(text, level, {
      link: link ?? null,
      ...(headingColor ? { style: style({ text: headingColor }) } : {}),
    });
  }

  paragraph(
    text: string,
    extra: { bold?: boolean; align?: string; style?: Style } = {},
  ): CxdBlock[] {
    const content = inlineOf(text);
    if (!content.length) return [];
    return [
      this.block(
        'core/paragraph',
        { ...(extra.align ? { align: extra.align } : {}), style: extra.style },
        { content: extra.bold ? bold(content) : content },
      ),
    ];
  }

  button(a: Record<string, string>, fallback = 'Click me'): CxdBlock {
    const link = this.link(a.link, a.link_target);
    const custom = a.color === 'custom';
    return this.block(
      'core/button',
      {
        ...(link ? { url: link.url } : {}),
        ...(link?.newTab ? { linkTarget: '_blank', rel: 'noopener noreferrer' } : {}),
        style: custom
          ? style({ background: color(a.custom_bg), text: color(a.custom_font) })
          : undefined,
      },
      { content: inlineOf(a.label || fallback) },
    );
  }

  buttons(list: CxdBlock[], position?: string): CxdBlock[] {
    if (!list.length) return [];
    const justify = position === 'center' ? 'center' : position === 'right' ? 'right' : undefined;
    return [
      this.block(
        'core/buttons',
        justify ? { layout: { type: 'flex', justifyContent: justify } } : {},
        {
          children: list,
        },
      ),
    ];
  }

  element(code: Code): CxdBlock[] {
    const a = code.attrs;
    const tag = code.tag;
    const simplified = <T>(value: T): T => {
      this.warn('simplified', tag);
      return value;
    };
    if (SKIPPED.has(tag)) {
      this.warn('skipped', tag);
      return [];
    }
    switch (tag) {
      case 'av_textblock': {
        const textColor = a.font_color === 'custom' ? color(a.color) : undefined;
        const size = px(a.size);
        return this.content(code.children, style({ text: textColor, fontSize: size }));
      }
      case 'av_heading': {
        const level = /^h([1-6])$/.exec(a.tag ?? '')?.[1];
        const s = a.style ?? '';
        const align = /centered|center/.test(s) ? 'center' : /right/.test(s) ? 'right' : undefined;
        const own = a.color === 'custom-color-heading' ? color(a.custom_font) : undefined;
        const headingColor = own ?? color(this.maps.headings?.color);
        const heading = this.heading(a.heading ?? '', level ? Number(level) : 3, {
          ...(align ? { align } : {}),
          link: this.link(a.link, a.link_target),
          style: style({ text: headingColor, fontSize: px(a.size) }),
        });
        const sub = plainText(code);
        if (!a.subheading_active || !sub.trim()) return heading;
        const subheading = this.rich(
          sub,
          style({ fontSize: px(a.subheading_size), text: color(a.subheading_color) }),
        );
        if (align)
          for (const b of subheading) if (b.type === 'core/paragraph') b.attrs.align = align;
        return a.subheading_active.includes('above')
          ? [...subheading, ...heading]
          : [...heading, ...subheading];
      }
      case 'av_hr': {
        const kind = a.class ?? 'default';
        if (kind === 'invisible') {
          return [this.block('core/spacer', { height: `${Math.max(0, num(a.height, 50))}px` })];
        }
        const line = color(a.custom_border_color);
        return [
          this.block('core/separator', {
            ...(kind === 'full' || kind === 'big' ? { className: 'is-style-wide' } : {}),
            style: line ? style({ background: line, text: line }) : undefined,
          }),
        ];
      }
      case 'av_button':
        return this.buttons([this.button(a)], a.position);
      case 'av_buttonrow':
        return this.buttons(
          this.items(code, 'av_buttonrow_item').map((b) => this.button(b.attrs)),
          a.alignment,
        );
      case 'av_button_big': {
        const out = this.buttons([this.button(a)], 'center');
        const description = plainText(code);
        return description.trim()
          ? [...out, ...this.paragraph(description, { align: 'center' })]
          : out;
      }
      case 'av_image': {
        const image = this.image(a.src, a.attachment);
        if (!image) return [];
        const link =
          a.link === 'lightbox' ? { url: image.url, newTab: false } : this.link(a.link, a.target);
        const caption = a.caption === 'yes' ? plainText(code) : '';
        return [
          this.imageBlock(image, {
            alt: a.alt ?? '',
            href: link?.url ?? null,
            newTab: link?.newTab ?? false,
            ...(caption.trim() ? { caption } : {}),
            ...(a.align === 'left' || a.align === 'right' || a.align === 'center'
              ? { align: a.align }
              : {}),
          }),
        ];
      }
      case 'av_gallery':
      case 'av_masonry_gallery':
      case 'av_horizontal_gallery':
        return this.gallery(a.ids, a.columns && a.columns !== 'flexible' ? a.columns : undefined);
      case 'av_slideshow':
      case 'av_slideshow_full':
      case 'av_fullscreen':
      case 'av_slideshow_accordion':
      case 'av_partner': {
        const slides = code.children.filter(isCode);
        const images = slides
          .map((s) => {
            const image = this.image(s.attrs.src, s.attrs.id ?? s.attrs.attachment);
            const link = this.link(s.attrs.link, s.attrs.link_target);
            return image
              ? this.imageBlock(image, {
                  alt: s.attrs.title ?? s.attrs.hover ?? '',
                  href: link?.url ?? null,
                  newTab: link?.newTab ?? false,
                })
              : null;
          })
          .filter((b): b is CxdBlock => b !== null);
        const texts = slides.flatMap((s) => [
          ...(tag === 'av_partner' ? [] : this.itemHeading(s.attrs.title ?? '')),
          ...this.content(s.children),
        ]);
        const n = Math.round(num(a.columns, 0));
        const gallery = images.length
          ? [
              this.block(
                'core/gallery',
                { ...(n >= 1 && n <= 8 ? { columns: n } : {}), linkTo: 'none' },
                { children: images },
              ),
            ]
          : [];
        if (tag !== 'av_partner') this.warn('simplified', tag);
        return [...gallery, ...texts];
      }
      case 'av_video': {
        const url = a.src ? this.address(a.src) : null;
        return url ? [this.block('core/embed', { url })] : [];
      }
      case 'av_icon_box': {
        const link = this.link(a.link, a.linktarget);
        return [
          this.group([...this.itemHeading(a.title ?? '', 3, link), ...this.content(code.children)]),
        ];
      }
      case 'av_iconlist': {
        const items = this.items(code, 'av_iconlist_item');
        if (items.every((i) => !plainText(i).trim())) {
          const list = items
            .filter((i) => stripTags(i.attrs.title ?? ''))
            .map((i) => {
              const link = this.link(i.attrs.link, i.attrs.linktarget);
              const content = inlineOf(i.attrs.title ?? '');
              return this.block(
                'core/list-item',
                {},
                { content: link ? linked(content, link) : content },
              );
            });
          return list.length ? [this.block('core/list', {}, { children: list })] : [];
        }
        return [
          this.group(
            items.flatMap((i) => [
              ...this.itemHeading(
                i.attrs.title ?? '',
                4,
                this.link(i.attrs.link, i.attrs.linktarget),
              ),
              ...this.content(i.children),
            ]),
          ),
        ];
      }
      case 'av_promobox': {
        const button =
          a.button === 'yes' ? this.buttons([this.button(a, a.label || 'Click me')], 'left') : [];
        return [
          this.group([...this.content(code.children), ...button], {
            style: style({
              padding: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
              background: '#f8f8f8',
            }),
          }),
        ];
      }
      case 'av_notification': {
        const look =
          a.color === 'custom'
            ? { background: color(a.custom_bg), text: color(a.custom_font) }
            : (NOTICE[a.color ?? ''] ?? NOTICE.blue!);
        return [
          this.group(
            [...this.paragraph(a.title ?? '', { bold: true }), ...this.content(code.children)],
            {
              style: style({
                ...look,
                padding: { top: '15px', right: '20px', bottom: '15px', left: '20px' },
              }),
            },
          ),
        ];
      }
      case 'av_team_member': {
        const image = this.image(a.src, a.attachment);
        const social = this.items(code, 'av_team_icon')
          .map((i) => ({
            label: i.attrs.title || i.attrs.link || '',
            link: this.link(i.attrs.link, i.attrs.link_target),
          }))
          .filter((i): i is { label: string; link: { url: string; newTab: boolean } } =>
            Boolean(i.link),
          );
        const socialLine: CxdInline[] = social.flatMap((s, i) => [
          ...(i ? [{ text: ' · ' } as CxdText] : []),
          {
            type: 'link' as const,
            href: s.link.url,
            ...(s.link.newTab ? { target: '_blank' as const } : {}),
            children: [{ text: stripTags(s.label) || s.link.url }],
          },
        ]);
        return [
          this.group([
            ...(image ? [this.imageBlock(image, { alt: a.name ?? '' })] : []),
            ...this.itemHeading(a.name ?? '', 3),
            ...this.paragraph(a.job ?? '', { bold: true }),
            ...(a.description
              ? this.rich(a.description)
              : this.content(code.children.filter((c) => !isCode(c)))),
            ...(socialLine.length
              ? [this.block('core/paragraph', {}, { content: socialLine })]
              : []),
          ]),
        ];
      }
      case 'av_testimonials':
        return simplified(
          this.items(code, 'av_testimonial_single').map((t) => {
            const who = [t.attrs.name, t.attrs.subtitle]
              .map((s) => stripTags(s ?? ''))
              .filter(Boolean);
            const citation: CxdInline[] = who.length ? [{ text: who.join(', ') }] : [];
            const link = this.link(t.attrs.link);
            const children = this.content(t.children);
            return this.block(
              'core/quote',
              {
                ...(citation.length ? { citation: link ? linked(citation, link) : citation } : {}),
              },
              {
                children: children.length
                  ? children
                  : [this.block('core/paragraph', {}, { content: [] })],
              },
            );
          }),
        );
      case 'av_catalogue': {
        const rows = this.items(code, 'av_catalogue_item').map((i) => {
          const title = bold(inlineOf(i.attrs.title ?? ''));
          const link = this.link(i.attrs.link, i.attrs.target);
          const description = inlineOf(plainText(i).replace(/<\/p>\s*<p[^>]*>/gi, '<br>'));
          return {
            cells: [
              {
                tag: 'td',
                content: [
                  ...(link ? linked(title, link) : title),
                  ...(description.length ? [{ text: '\n' }, ...description] : []),
                ],
              },
              { tag: 'td', align: 'right', content: inlineOf(i.attrs.price ?? '') },
            ],
          };
        });
        return rows.length ? simplified([this.block('core/table', { body: rows })]) : [];
      }
      case 'av_timeline':
        return simplified([
          this.group(
            this.items(code, 'av_timeline_item').flatMap((t) => [
              ...this.paragraph(t.attrs.date ?? '', { bold: true }),
              ...this.itemHeading(t.attrs.title ?? '', 3),
              ...this.content(t.children),
            ]),
          ),
        ]);
      case 'av_content_slider':
        return simplified([
          ...this.itemHeading(a.heading ?? '', 2),
          ...this.items(code, 'av_content_slide').flatMap((s) => [
            ...this.itemHeading(s.attrs.title ?? '', 3),
            ...this.content(s.children),
          ]),
        ]);
      case 'av_icongrid':
      case 'av_icon_circles': {
        const items = this.items(code, 'av_icongrid_item', 'av_icon_circle_item').map((i) =>
          this.block(
            'core/column',
            {},
            {
              children: [
                ...this.itemHeading(
                  i.attrs.title ?? '',
                  3,
                  this.link(i.attrs.link, i.attrs.linktarget),
                ),
                ...this.paragraph(i.attrs.subtitle ?? '', { bold: true }),
                ...this.content(i.children),
              ],
            },
          ),
        );
        const per = Math.min(6, Math.max(1, Math.round(num(a.icongrid_numrow, 3))));
        const rows: CxdBlock[] = [];
        for (let i = 0; i < items.length; i += per) {
          rows.push(this.block('core/columns', {}, { children: items.slice(i, i + per) }));
        }
        return simplified(rows);
      }
      case 'av_tab_container':
      case 'av_toggle_container':
      case 'av_tab_section':
        return simplified(
          this.items(code, 'av_tab', 'av_toggle', 'av_tab_sub_section').flatMap((t) => [
            ...this.itemHeading(t.attrs.title ?? t.attrs.tab_title ?? '', 3),
            ...(t.tag === 'av_tab_sub_section'
              ? this.sequence(t.children)
              : this.content(t.children)),
          ]),
        );
      case 'av_table': {
        const head: { cells: Record<string, unknown>[] }[] = [];
        const body: { cells: Record<string, unknown>[] }[] = [];
        for (const r of this.items(code, 'av_row')) {
          const isHead = (r.attrs.row_style ?? '').includes('heading');
          const cells = this.items(r, 'av_cell').map((c) => ({
            tag: isHead || (c.attrs.col_style ?? '').includes('head') ? 'th' : 'td',
            content: inlineOf(
              plainText(c)
                .replace(/<\/(li|p)>\s*/gi, '<br>')
                .replace(/<(ul|ol|li|p)\b[^>]*>|<\/(ul|ol)>/gi, '')
                .replace(/(<br>\s*)+$/i, ''),
            ),
          }));
          (isHead && !body.length ? head : body).push({ cells });
        }
        if (!head.length && !body.length) return [];
        const caption = a.caption ? inlineOf(a.caption) : [];
        return [
          this.block('core/table', {
            ...(head.length ? { head } : {}),
            ...(body.length ? { body } : {}),
            ...(caption.length ? { caption } : {}),
          }),
        ];
      }
      case 'av_codeblock': {
        const code_ = decodeEntities(plainText(code).replace(/^\s*\n|\n\s*$/g, ''));
        return code_.trim() ? [this.block('core/code', {}, { content: [{ text: code_ }] })] : [];
      }
      case 'av_headline_rotator': {
        const words = this.items(code, 'av_rotator_item')
          .map((r) => stripTags(r.attrs.title ?? ''))
          .filter(Boolean);
        const text = [a.before_rotating, words.join(' / '), a.after_rotating]
          .map((s) => stripTags(s ?? ''))
          .filter(Boolean)
          .join(' ');
        const level = /^h([1-6])$/.exec(a.tag ?? '')?.[1];
        return simplified(
          level ? this.heading(text, Number(level)) : this.paragraph(text, { align: a.align }),
        );
      }
      case 'av_animated_numbers': {
        const label = plainText(code);
        return simplified([
          this.group([
            ...this.paragraph(a.number ?? '', {
              bold: true,
              align: 'center',
              style: style({ fontSize: px(a.font_size) ?? '40px' }),
            }),
            ...(label.trim() ? this.paragraph(label, { align: 'center' }) : []),
          ]),
        ]);
      }
      case 'av_progress': {
        const list = this.items(code, 'av_progress_bar').map((b) =>
          this.block(
            'core/list-item',
            {},
            {
              content: [
                { text: `${stripTags(b.attrs.title ?? '')}: ${num(b.attrs.progress, 0)}%` },
              ],
            },
          ),
        );
        return list.length ? simplified([this.block('core/list', {}, { children: list })]) : [];
      }
      case 'av_font_icon': {
        const text = plainText(code);
        if (!text.trim()) {
          this.warn('skipped', tag);
          return [];
        }
        return simplified(this.paragraph(text, { align: a.position }));
      }
      case 'av_image_hotspot': {
        const image = this.image(a.src, a.attachment);
        const spots = this.items(code, 'av_image_spot').flatMap((s) => [
          ...this.paragraph(s.attrs.title ?? '', { bold: true }),
          ...this.content(s.children),
        ]);
        return simplified([...(image ? [this.imageBlock(image)] : []), ...spots]);
      }
      case 'av_image_diff': {
        const sides = [
          [
            this.image(a.src_before ?? a.before_src, a.attachment_before ?? a.attachment),
            a.label_before,
          ],
          [this.image(a.src_after ?? a.after_src, a.attachment_after), a.label_after],
        ] as const;
        const columns = sides
          .filter(([image]) => image)
          .map(([image, label]) =>
            this.block(
              'core/column',
              {},
              {
                children: [this.imageBlock(image!, { ...(label ? { caption: label } : {}) })],
              },
            ),
          );
        return columns.length
          ? simplified([this.block('core/columns', {}, { children: columns })])
          : [];
      }
      case 'av_textblock_inner':
        return this.content(code.children);
      default: {
        // No equivalent known: the text it holds (and the elements nested in it).
        this.warn('unknown', tag);
        const keys = ['title', 'heading', 'label', 'content', 'description'];
        const attrText = keys
          .map((k) => a[k])
          .filter((v): v is string => Boolean(v && stripTags(v)));
        return [...attrText.flatMap((t) => this.paragraph(t)), ...this.sequence(code.children)];
      }
    }
  }
}

// ---- Inline helpers ----------------------------------------------------------------------------

/** The source text inside a shortcode, nested shortcodes as their text. */
function plain(code: Code): string {
  return code.children.map((c) => (isCode(c) ? plain(c) : c)).join('');
}

/** The text inside a shortcode, without its nested shortcodes. */
function plainText(code: Code): string {
  return code.children
    .map((c) => (isCode(c) ? (INLINE_TAGS.has(c.tag) ? plain(c) : '') : c))
    .join('')
    .trim();
}

/** A line of HTML as rich text, with white space collapsed. */
function inlineOf(html: string): CxdInline[] {
  const nodes = htmlToInline(
    html
      .replace(/\s+/g, ' ')
      .replace(/\s*<br\s*\/?>\s*/gi, '<br>')
      .trim(),
  );
  return nodes.filter((n) => 'type' in n || n.text !== '');
}

function upper(nodes: CxdInline[]): CxdInline[] {
  return nodes.map((n) =>
    'type' in n
      ? { ...n, children: n.children.map((c) => ({ ...c, text: c.text.toLocaleUpperCase() })) }
      : { ...n, text: n.text.toLocaleUpperCase() },
  );
}

function bold(nodes: CxdInline[]): CxdInline[] {
  const add = (t: CxdText): CxdText =>
    t.marks?.includes('bold') ? t : { ...t, marks: ['bold', ...(t.marks ?? [])] };
  return nodes.map((n) => ('type' in n ? { ...n, children: n.children.map(add) } : add(n)));
}

function linked(nodes: CxdInline[], link: { url: string; newTab: boolean }): CxdInline[] {
  const children = nodes.flatMap((n) => ('type' in n ? n.children : [n]));
  return children.length
    ? [
        {
          type: 'link',
          href: link.url,
          ...(link.newTab ? { target: '_blank' as const, rel: 'noopener noreferrer' } : {}),
          children,
        },
      ]
    : [];
}

// ---- Entry point ---------------------------------------------------------------------------------

/** A page of `[av_…]` shortcodes as native blocks, with what could not be kept. */
export function convertLayout(
  content: string,
  maps: ImportMaps = {},
  options: ConvertOptions = {},
): LayoutResult {
  const converter = new Converter(maps, options.newId ?? blockId);
  const blocks = prune(converter.sequence(parseShortcodes(content)));
  return { blocks, warnings: converter.warnings() };
}

/**
 * Boxes left empty by what was skipped (e.g. a column that held a list of
 * posts) go away: a row keeps its other columns, sharing the space, and a
 * row with one column left becomes that column's content.
 */
function prune(blocks: CxdBlock[]): CxdBlock[] {
  return blocks.flatMap((block): CxdBlock[] => {
    if (!block.children) return [block];
    const children = prune(block.children);
    if (block.type === 'core/column' || block.type === 'core/group') {
      return children.length ? [{ ...block, children }] : [];
    }
    if (block.type === 'core/columns') {
      if (!children.length) return [];
      if (children.length === 1 && block.children.length > 1) return children[0]!.children ?? [];
      if (children.length < block.children.length) {
        return [
          {
            ...block,
            children: children.map(({ attrs: { width: _width, ...attrs }, ...c }) => ({
              ...c,
              attrs,
            })),
          },
        ];
      }
    }
    return [{ ...block, children }];
  });
}

/** Blocks in a document, nested ones included. */
export function countBlocks(blocks: readonly CxdBlock[] | undefined): number {
  return (blocks ?? []).reduce((sum, b) => sum + 1 + countBlocks(b.children), 0);
}

/** Every image address the layout refers to (to look them up in the media library). */
export function imageAddresses(content: string, maps: ImportMaps = {}): string[] {
  const found = new Set<string>();
  const walk = (nodes: Node[]) => {
    for (const node of nodes) {
      if (!isCode(node)) {
        for (const m of node.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi))
          found.add(m[1]!);
        continue;
      }
      const a = node.attrs;
      for (const key of ['attachment', 'id', 'attachment_before', 'attachment_after']) {
        const url = a[key] ? maps.media?.[a[key]!.trim()] : undefined;
        if (url) found.add(url);
      }
      for (const key of ['src', 'src_before', 'src_after', 'before_src', 'after_src']) {
        if (a[key] && /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(a[key]!)) found.add(a[key]!);
      }
      for (const id of String(a.ids ?? '').split(',')) {
        const url = maps.media?.[id.trim()];
        if (url) found.add(url);
      }
      walk(node.children);
    }
  };
  walk(parseShortcodes(content));
  return [...found];
}

/** Converts an entry's layout: `[av_…]` shortcodes, or builder JSON (see json-layout.ts). */
export function convertAny(
  content: string,
  maps: ImportMaps = {},
  options: ConvertOptions = {},
): LayoutResult {
  return content.startsWith(JSON_LAYOUT)
    ? convertJsonLayout(content.slice(JSON_LAYOUT.length), maps, options)
    : convertLayout(content, maps, options);
}
