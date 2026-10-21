/**
 * Pages built with Fresco (a document whose `editor.id` is `fresco`: nested
 * `fresco/container` boxes and widgets with their settings) as native blocks
 * of the block editor, so a site can stop using the page builder: top-level
 * containers become full-width groups, rows and grids become columns with
 * their widths, and each widget the core blocks closest to it. What has no
 * native block is reported.
 *
 * The widgets map as Fresco's own "switch to the block editor" does
 * (`plugins/fresco/src/core/convert.ts`, `toBlocks`); this one also keeps the
 * layout (groups, columns, widths, colors, padding). It is a copy, not an
 * import: Layout Import must work without Fresco installed.
 *
 * Pure functions, so they can be tested.
 */
import type { CxdBlock, CxdInline } from '@cleitext/blocks';
import { INLINE_COLOR, htmlToBlocks, htmlToInline } from '@cleitext/blocks/inline';
import {
  prune,
  type ConvertOptions,
  type ImportMaps,
  type LayoutResult,
  type Warning,
  type WarningKind,
} from './convert.js';

/** Prefix of a job's content that holds a Fresco page (its blocks as JSON). */
export const FRESCO_LAYOUT = '\u0001fresco\u0001';

/** A Fresco element: a CXD block whose attributes are its settings. */
export interface FrescoNode {
  id?: string;
  type: string;
  v?: number;
  attrs?: Record<string, unknown>;
  children?: FrescoNode[];
}

type Settings = Record<string, unknown>;

let counter = 0;
function blockId(): string {
  counter = (counter + 1) % 1_296;
  return `b_${Date.now().toString(36)}${counter.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 8)}`;
}

const str = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
const obj = (v: unknown): Settings =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Settings) : {};
const list = (v: unknown): Settings[] => (Array.isArray(v) ? v.map(obj) : []);
const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A Fresco size `{ size, unit }` as a CSS length. */
const length = (v: unknown): string | undefined => {
  const s = obj(v);
  const n = typeof s.size === 'number' ? s.size : Number.parseFloat(str(s.size));
  if (!Number.isFinite(n)) return undefined;
  const unit = str(s.unit) || 'px';
  return /^(px|em|rem|%|vw|vh)$/.test(unit) ? `${n}${unit}` : undefined;
};
const ALIGN: Record<string, string> = {
  left: 'left',
  start: 'left',
  center: 'center',
  right: 'right',
  end: 'right',
  justify: 'left',
};
const VERTICAL: Record<string, string> = {
  'flex-start': 'top',
  start: 'top',
  center: 'center',
  'flex-end': 'bottom',
  end: 'bottom',
  stretch: 'stretch',
};
const CONTAINERS = new Set([
  'fresco/container',
  'fresco/a-div',
  'fresco/a-flexbox',
  'fresco/a-grid',
]);

/** Number of elements of a Fresco page (for the list of pages). */
export function countFrescoElements(nodes: readonly FrescoNode[] | undefined): number {
  return (nodes ?? []).reduce((n, node) => n + 1 + countFrescoElements(node.children), 0);
}

/** Whether a saved document is a Fresco page. */
export function isFrescoDocument(document: unknown): boolean {
  return obj(obj(document).editor).id === 'fresco' && Array.isArray(obj(document).blocks);
}

class FrescoConverter {
  private readonly warned = new Map<string, Warning>();

  constructor(
    private readonly maps: ImportMaps,
    private readonly newId: () => string,
  ) {}

  warn(kind: WarningKind, tag: string) {
    const key = `${kind}:${tag}`;
    const found = this.warned.get(key);
    if (found) found.count++;
    else this.warned.set(key, { kind, tag, count: 1 });
  }

  warnings(): Warning[] {
    return [...this.warned.values()];
  }

  block(type: string, attrs: Settings = {}, content?: CxdInline[], children?: CxdBlock[]) {
    return {
      id: this.newId(),
      type,
      v: 1,
      attrs,
      ...(content ? { content } : {}),
      ...(children ? { children } : {}),
    } as CxdBlock;
  }

  /** A color: literal ones only (global colors live in Fresco's kit). */
  color(v: unknown): string | undefined {
    const c = str(v).trim();
    if (!c) return undefined;
    if (INLINE_COLOR.test(c)) return c;
    if (/^var\(--fr-/.test(c)) this.warn('simplified', 'global color');
    return undefined;
  }

  /** An address: links to the old site (`maps.origin`) as paths of this one. */
  url(value: unknown): string | undefined {
    const raw = str(obj(value).url ?? value).trim();
    if (!raw) return undefined;
    const origin = this.maps.origin?.replace(/\/$/, '');
    if (origin && raw.startsWith(origin) && /^($|[/?#])/.test(raw.slice(origin.length))) {
      return raw.slice(origin.length).replace(/^(?=[?#])|^$/, '/');
    }
    return raw;
  }

  newTab(value: unknown): boolean {
    return obj(value).newTab === true;
  }

  /** Links and images of the old site, in a piece of HTML, as paths of this one. */
  local(html: string): string {
    const origin = this.maps.origin?.replace(/\/$/, '');
    if (!origin) return html;
    const escaped = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return html.replace(new RegExp(`(href|src)=(["'])${escaped}(?=[/"'])`, 'g'), '$1=$2');
  }

  text(html: string): CxdBlock[] {
    return html.trim() ? htmlToBlocks(this.local(html), { newId: this.newId }) : [];
  }

  inline(text: string): CxdInline[] {
    return htmlToInline(this.local(text).replace(/\n/g, '<br>'));
  }

  linked(content: CxdInline[], link: unknown): CxdInline[] {
    const href = this.url(link);
    if (!href) return content;
    return [
      {
        type: 'link',
        href,
        ...(this.newTab(link) ? { target: '_blank' as const, rel: 'noopener noreferrer' } : {}),
        children: content.flatMap((node) => ('type' in node ? node.children : [node])),
      },
    ];
  }

  heading(title: string, level: number, attrs: Settings = {}, link?: unknown): CxdBlock {
    const content = this.inline(title);
    return this.block(
      'core/heading',
      { level, ...attrs },
      this.linked(content.length ? content : [{ text: title }], link),
    );
  }

  paragraph(html: string, attrs: Settings = {}): CxdBlock {
    return this.block('core/paragraph', attrs, this.inline(html));
  }

  /** A Fresco image `{ id, url, alt }` as a core/image. */
  image(value: unknown, extra: Settings = {}): CxdBlock[] {
    const v = obj(value);
    const url = str(v.url);
    if (!url) return [];
    return [
      this.block('core/image', {
        ...(str(v.id) ? { id: str(v.id) } : {}),
        url: this.url(url) ?? url,
        alt: str(v.alt),
        ...extra,
      }),
    ];
  }

  style(parts: { background?: string; text?: string; padding?: unknown; fontSize?: string }) {
    const out: Settings = {};
    if (parts.background || parts.text) {
      out.color = {
        ...(parts.text ? { text: parts.text } : {}),
        ...(parts.background ? { background: parts.background } : {}),
      };
    }
    const p = obj(parts.padding);
    const sides = ['top', 'right', 'bottom', 'left'] as const;
    if (sides.some((k) => p[k] !== undefined && p[k] !== '')) {
      const unit = /^(px|em|rem|%|vw|vh)$/.test(str(p.unit)) ? str(p.unit) : 'px';
      out.spacing = {
        padding: Object.fromEntries(
          sides.map((k) => {
            const n = Number.parseFloat(str(p[k])) || 0;
            return [k, n === 0 ? '0' : `${n}${unit}`];
          }),
        ),
      };
    }
    if (parts.fontSize) out.typography = { fontSize: parts.fontSize };
    return Object.keys(out).length ? out : undefined;
  }

  /** The background and padding of a container, as a block style. */
  boxStyle(s: Settings) {
    const type = str(s.background_type);
    if (type === 'gradient') this.warn('background', 'gradient');
    if (type === 'classic' && str(obj(s.background_image).url)) {
      this.warn('background', 'background image');
    }
    if (str(obj(s.background_video).url)) this.warn('background', 'background video');
    if (str(s.overlay_bg_type) || str(s.overlay_color)) this.warn('background', 'overlay');
    if (length(s.min_height)) this.warn('simplified', 'minimum height');
    return this.style({
      background: type === 'classic' ? this.color(s.background_color) : undefined,
      padding: s._padding,
    });
  }

  convert(node: FrescoNode): CxdBlock[] {
    const s = node.attrs ?? {};
    // Shown only on smaller screens (usually a copy of what computers show).
    if (s._hide_desktop === true) {
      this.warn('skipped', 'hidden on computers');
      return [];
    }
    if (CONTAINERS.has(node.type)) return this.container(node, false);
    return this.widget(node);
  }

  children(node: FrescoNode): CxdBlock[] {
    return (node.children ?? []).flatMap((child) => this.convert(child));
  }

  /** What a box holds: its items as columns when they sit side by side. */
  inner(node: FrescoNode): CxdBlock[] {
    const s = node.attrs ?? {};
    const kids = (node.children ?? []).filter((k) => k.attrs?._hide_desktop !== true);
    const grid = str(s.container_type) === 'grid' || node.type === 'fresco/a-grid';
    const row = grid || str(s.flex_direction).startsWith('row');
    if (!row || kids.length < 2) return this.children(node);
    if (kids.length < (node.children ?? []).length) this.warn('skipped', 'hidden on computers');
    const per = grid ? Math.max(1, Math.min(8, Number(s.grid_columns) || 3)) : kids.length;
    const vertical = VERTICAL[str(s.align_items)];
    const rows: CxdBlock[] = [];
    for (let i = 0; i < kids.length; i += per) {
      const slice = kids.slice(i, i + per);
      rows.push(
        this.block(
          'core/columns',
          vertical && vertical !== 'stretch' ? { verticalAlignment: vertical } : {},
          undefined,
          slice.map((kid) => this.column(kid, grid)),
        ),
      );
    }
    return rows;
  }

  column(kid: FrescoNode, grid: boolean): CxdBlock {
    if (!CONTAINERS.has(kid.type))
      return this.block('core/column', {}, undefined, this.convert(kid));
    const ks = kid.attrs ?? {};
    const width = grid ? undefined : length(ks.width);
    const style = this.boxStyle(ks);
    return this.block(
      'core/column',
      {
        ...(width && width.endsWith('%') ? { width } : {}),
        ...(style ? { style } : {}),
      },
      undefined,
      this.inner(kid),
    );
  }

  container(node: FrescoNode, top: boolean): CxdBlock[] {
    const s = node.attrs ?? {};
    const style = this.boxStyle(s);
    const inner = this.inner(node);
    if (!top && !style) return inner;
    const full = str(s.content_width) === 'full';
    return [
      this.block(
        'core/group',
        {
          ...(top ? { tagName: 'section', align: 'full' } : {}),
          ...(style ? { style } : {}),
          layout: { type: top && full ? 'default' : 'constrained' },
        },
        undefined,
        inner,
      ),
    ];
  }

  buttons(
    items: { text: string; link: unknown; style?: Settings | undefined }[],
    align: string | undefined,
  ): CxdBlock {
    return this.block(
      'core/buttons',
      align && align !== 'left'
        ? { layout: { type: 'flex', justifyContent: align === 'right' ? 'right' : 'center' } }
        : {},
      undefined,
      items.map(({ text, link, style }) => {
        const url = this.url(link);
        return this.block(
          'core/button',
          {
            ...(url ? { url } : {}),
            ...(this.newTab(link) ? { linkTarget: '_blank' } : {}),
            ...(style ? { style } : {}),
          },
          htmlToInline(text),
        );
      }),
    );
  }

  /** Items of tabs, accordions and toggles: each title as a heading, then its content. */
  items(node: FrescoNode): CxdBlock[] {
    this.warn('simplified', node.type.replace(/^fresco\//, ''));
    return (node.children ?? []).flatMap((item, i) => [
      this.heading(str(item.attrs?._title).trim() || `${i + 1}`, 3),
      ...(CONTAINERS.has(item.type) ? this.container(item, false) : this.convert(item)),
    ]);
  }

  widget(node: FrescoNode): CxdBlock[] {
    const s = node.attrs ?? {};
    const type = node.type;
    const align = ALIGN[str(s.align)];
    const name = type.replace(/^fresco\//, '');
    switch (type) {
      case 'fresco/heading':
      case 'fresco/a-heading': {
        const level = Number(/^h([1-6])$/.exec(str(s.tag))?.[1] ?? 2);
        const style = this.style({
          text: this.color(s.title_color),
          fontSize: length(s.title_typography_size),
        });
        return str(s.title).trim()
          ? [
              this.heading(
                str(s.title),
                level,
                { ...(align ? { textAlign: align } : {}), ...(style ? { style } : {}) },
                s.link,
              ),
            ]
          : [];
      }
      case 'fresco/text':
      case 'fresco/a-paragraph': {
        const blocks = this.text(str(s.content));
        const text = this.color(s.color);
        return blocks.map((b) =>
          (align || text) && (b.type === 'core/paragraph' || b.type === 'core/heading')
            ? {
                ...b,
                attrs: {
                  ...b.attrs,
                  ...(align ? (b.type === 'core/heading' ? { textAlign: align } : { align }) : {}),
                  ...(text ? { style: { color: { text } } } : {}),
                },
              }
            : b,
        );
      }
      case 'fresco/image': {
        const image = obj(s.image);
        const href =
          s.link_to === 'custom' ? this.url(s.link) : s.link_to === 'file' ? str(image.url) : '';
        const caption = s.caption_source === 'custom' ? str(s.caption).trim() : '';
        return this.image(image, {
          ...(align && align !== 'left' ? { align } : {}),
          ...(href ? { href } : {}),
          ...(caption ? { caption: htmlToInline(caption) } : {}),
        });
      }
      case 'fresco/a-image': {
        const image = obj(s.image);
        const href = this.url(s.link);
        return this.image(str(s.alt) ? { ...image, alt: str(s.alt) } : image, {
          ...(href ? { href } : {}),
        });
      }
      case 'fresco/button':
      case 'fresco/a-button':
        return [
          this.buttons(
            [
              {
                text: str(s.text) || 'Button',
                link: s.link,
                style: this.style({
                  background: this.color(s.background_color),
                  text: this.color(s.text_color),
                }),
              },
            ],
            align,
          ),
        ];
      case 'fresco/spacer':
        return [this.block('core/spacer', { height: length(s.space) ?? '50px' })];
      case 'fresco/divider':
      case 'fresco/a-divider':
        return [this.block('core/separator', {})];
      case 'fresco/gallery':
      case 'fresco/image-carousel': {
        if (type === 'fresco/image-carousel') this.warn('simplified', name);
        const images = list(s.images).flatMap((image) => this.image(image));
        const columns = Number(type === 'fresco/gallery' ? s.columns : s.per_view);
        return images.length
          ? [
              this.block(
                'core/gallery',
                columns >= 1 && columns <= 8 ? { columns } : {},
                undefined,
                images,
              ),
            ]
          : [];
      }
      case 'fresco/video':
      case 'fresco/a-youtube': {
        const url = str(s.url).trim();
        if (type === 'fresco/video' && (s.source === 'hosted' || !url)) {
          const file = str(obj(s.file).url);
          if (!file) return [];
          this.warn('simplified', 'video file');
          return [
            this.block('core/html', {
              content: `<video src="${escape(file)}" controls preload="metadata"></video>`,
            }),
          ];
        }
        return url ? [this.block('core/embed', { url })] : [];
      }
      case 'fresco/a-video': {
        const file = str(obj(s.file).url);
        if (!file) return [];
        this.warn('simplified', 'video file');
        return [
          this.block('core/html', {
            content: `<video src="${escape(file)}" controls preload="metadata"></video>`,
          }),
        ];
      }
      case 'fresco/icon-box':
      case 'fresco/image-box': {
        const out: CxdBlock[] = [];
        if (type === 'fresco/image-box') out.push(...this.image(s.image));
        if (str(s.title).trim()) {
          const level = Number(/^h([1-6])$/.exec(str(s.title_tag))?.[1] ?? 3);
          out.push(this.heading(str(s.title), level, align ? { textAlign: align } : {}, s.link));
        }
        out.push(...this.text(paragraphsOf(str(s.description))));
        return out.length ? [this.block('core/group', {}, undefined, out)] : [];
      }
      case 'fresco/icon-list': {
        const items = list(s.items).filter((item) => str(item.text).trim());
        return items.length
          ? [
              this.block(
                'core/list',
                {},
                undefined,
                items.map((item) =>
                  this.block(
                    'core/list-item',
                    {},
                    this.linked(htmlToInline(str(item.text)), item.link),
                  ),
                ),
              ),
            ]
          : [];
      }
      case 'fresco/testimonial': {
        const who = [str(s.name), str(s.job)].filter((v) => v.trim()).join(', ');
        const children = this.text(paragraphsOf(str(s.content)));
        return children.length || who
          ? [
              this.block(
                'core/quote',
                who ? { citation: htmlToInline(who) } : {},
                undefined,
                children,
              ),
            ]
          : [];
      }
      case 'fresco/counter': {
        this.warn('simplified', name);
        const number = `${str(s.prefix)}${str(s.end) || '100'}${str(s.suffix)}`;
        return [
          this.heading(number, 3, { textAlign: 'center' }),
          ...(str(s.title).trim() ? [this.paragraph(str(s.title), { align: 'center' })] : []),
        ];
      }
      case 'fresco/progress': {
        this.warn('simplified', name);
        const percent = str(obj(s.percent).size) || '50';
        return [
          this.paragraph(
            [str(s.title), str(s.inner), `${percent}%`].filter((v) => v.trim()).join(' — '),
          ),
        ];
      }
      case 'fresco/alert':
        return [
          this.block(
            'core/group',
            {
              style: {
                color: { background: '#f1f5f9' },
                spacing: { padding: { top: '16px', right: '20px', bottom: '16px', left: '20px' } },
              },
            },
            undefined,
            [
              ...(str(s.title).trim()
                ? [this.paragraph(`<strong>${escape(str(s.title))}</strong>`)]
                : []),
              ...this.text(paragraphsOf(str(s.description))),
            ],
          ),
        ];
      case 'fresco/star-rating': {
        this.warn('simplified', name);
        const scale = Number(s.scale) || 5;
        const rating = Math.round(Number.parseFloat(str(s.rating)) || scale);
        return [
          this.paragraph(
            `${'★'.repeat(Math.max(0, Math.min(scale, rating)))}${'☆'.repeat(Math.max(0, scale - rating))} ${escape(str(s.title))}`.trim(),
          ),
        ];
      }
      case 'fresco/html':
        return str(s.code).trim() ? [this.block('core/html', { content: str(s.code) })] : [];
      case 'fresco/tabs':
      case 'fresco/accordion':
      case 'fresco/toggle':
        return this.items(node);
      case 'fresco/block':
        // Another plugin's block, as it was.
        return (node.children ?? []) as unknown as CxdBlock[];
      default:
        // Icons, social icons, menus, maps, audio, forms and other Pro widgets:
        // no native block. Boxes of other plugins keep their content.
        if (node.children?.length) {
          this.warn('simplified', name);
          return this.children(node);
        }
        this.warn('skipped', name);
        return [];
    }
  }
}

/** Plain text with blank lines as paragraphs; HTML as it is. */
const paragraphsOf = (value: string) =>
  /<[a-z][^>]*>/i.test(value)
    ? value
    : value
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((p) => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`)
        .join('');

/** A Fresco page (the blocks of its document) as native blocks. */
export function convertFresco(
  nodes: readonly FrescoNode[],
  maps: ImportMaps = {},
  options: ConvertOptions = {},
): LayoutResult {
  const converter = new FrescoConverter(maps, options.newId ?? blockId);
  const blocks = nodes.flatMap((node) => {
    if (node.attrs?._hide_desktop === true) return converter.convert(node);
    return CONTAINERS.has(node.type) ? converter.container(node, true) : converter.convert(node);
  });
  return { blocks: prune(blocks), warnings: converter.warnings() };
}

/** A job's content for a Fresco page (see `convertAny`). */
export function frescoSource(nodes: readonly unknown[]): string {
  return `${FRESCO_LAYOUT}${JSON.stringify(nodes)}`;
}

/** A Fresco page saved by `frescoSource`, as native blocks. */
export function convertFrescoSource(
  json: string,
  maps: ImportMaps = {},
  options: ConvertOptions = {},
): LayoutResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { blocks: [], warnings: [{ kind: 'unknown', tag: 'invalid layout data', count: 1 }] };
  }
  return convertFresco(Array.isArray(data) ? (data as FrescoNode[]) : [], maps, options);
}
