/**
 * Pages of another page builder stored as JSON (`_elementor_data` in a
 * WordPress export: sections, columns, containers and widgets with their
 * settings) as native blocks of the block editor: sections and containers
 * become groups, rows become columns with their widths, and each widget the
 * core blocks closest to it. What has no native block is reported.
 *
 * Pure functions, so they can be tested.
 */
import type { CxdBlock, CxdInline } from '@cleitext/blocks';
import { INLINE_COLOR, htmlToBlocks, htmlToInline } from '@cleitext/blocks/inline';
import {
  mediaKey,
  type ConvertOptions,
  type ImportMaps,
  type LayoutResult,
  type Warning,
  type WarningKind,
} from './convert.js';

/** Prefix of an export entry's content that holds builder JSON instead of shortcodes. */
export const JSON_LAYOUT = '\u0001json-layout\u0001';

interface Element {
  id?: string;
  elType?: string;
  widgetType?: string;
  isInner?: boolean;
  settings?: Record<string, unknown>;
  elements?: Element[];
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
const color = (v: unknown) => {
  const c = str(v).trim();
  return c && INLINE_COLOR.test(c) ? c : undefined;
};
/** `{ size, unit }` as a CSS length. */
const size = (v: unknown): string | undefined => {
  const s = obj(v);
  const n = typeof s.size === 'number' ? s.size : Number.parseFloat(str(s.size));
  if (!Number.isFinite(n)) return undefined;
  const unit = str(s.unit) || 'px';
  return /^(px|em|rem|%|vw|vh)$/.test(unit) ? `${n}${unit}` : undefined;
};
const ALIGN: Record<string, string> = {
  left: 'left',
  center: 'center',
  right: 'right',
  justify: 'left',
};

/** Inline content as one link (links hold plain text runs only). */
function linkTo(content: CxdInline[], href: string, newTab = false): CxdInline[] {
  return [
    {
      type: 'link',
      href,
      ...(newTab ? { target: '_blank' as const, rel: 'noopener noreferrer' } : {}),
      children: content.flatMap((node) => ('type' in node ? node.children : [node])),
    },
  ];
}

/** Number of elements of a JSON layout (for the list of pages). */
export function countJsonElements(json: string): number {
  try {
    let n = 0;
    const walk = (items: Element[]) =>
      items.forEach((item) => {
        n++;
        walk(item.elements ?? []);
      });
    walk(JSON.parse(json) as Element[]);
    return n;
  } catch {
    return 0;
  }
}

class JsonConverter {
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

  block(
    type: string,
    attrs: Settings = {},
    content?: CxdInline[],
    children?: CxdBlock[],
  ): CxdBlock {
    return {
      id: this.newId(),
      type,
      v: 1,
      attrs,
      ...(content ? { content } : {}),
      ...(children ? { children } : {}),
    };
  }

  /** An address of the old site as a path of this one. */
  url(value: unknown): string | undefined {
    const raw = str(obj(value).url ?? value).trim();
    if (!raw || raw === '#') return raw || undefined;
    const origin = this.maps.origin?.replace(/\/$/, '');
    if (origin && raw.startsWith(origin)) return raw.slice(origin.length) || '/';
    return raw;
  }

  newTab(value: unknown): boolean {
    return obj(value).is_external === 'on' || obj(value).is_external === true;
  }

  /** An image of the old site: this site's copy when the library has it. */
  image(value: unknown): { id?: string; url: string } | null {
    const v = obj(value);
    const url = str(v.url) || (str(v.id) && this.maps.media?.[str(v.id)]) || '';
    if (!url) return null;
    const own = this.maps.library?.[mediaKey(url)];
    if (own) return { id: own.id, url: own.url };
    this.warn('media', mediaKey(url));
    return { url };
  }

  style(parts: { background?: string; text?: string; padding?: Settings; fontSize?: string }) {
    const out: Settings = {};
    if (parts.background || parts.text) {
      out.color = {
        ...(parts.text ? { text: parts.text } : {}),
        ...(parts.background ? { background: parts.background } : {}),
      };
    }
    const p = parts.padding;
    if (
      p &&
      ['top', 'right', 'bottom', 'left'].some((k) => str(p[k]) !== '' && str(p[k]) !== '0')
    ) {
      const unit = str(p.unit) || 'px';
      out.spacing = {
        padding: Object.fromEntries(
          ['top', 'right', 'bottom', 'left'].map((k) => [
            k,
            `${Number.parseFloat(str(p[k])) || 0}${unit}`,
          ]),
        ),
      };
    }
    if (parts.fontSize) out.typography = { fontSize: parts.fontSize };
    return Object.keys(out).length ? out : undefined;
  }

  convert(element: Element): CxdBlock[] {
    const s = element.settings ?? {};
    switch (element.elType) {
      case 'section':
        return this.section(element);
      case 'column':
        return this.children(element);
      case 'container':
      case 'e-flexbox':
      case 'e-div-block':
        return this.container(element);
      case 'widget':
        return this.widget(str(element.widgetType), s, element);
      default:
        return this.children(element);
    }
  }

  children(element: Element): CxdBlock[] {
    return (element.elements ?? []).flatMap((child) => this.convert(child));
  }

  boxStyle(s: Settings) {
    if (
      str(s.background_background) === 'classic' &&
      s.background_image &&
      str(obj(s.background_image).url)
    ) {
      this.warn('background', 'background image');
    }
    return this.style({
      background:
        str(s.background_background) === 'classic' ? color(s.background_color) : undefined,
      padding: obj(s.padding),
    });
  }

  section(element: Element): CxdBlock[] {
    const s = element.settings ?? {};
    const columns = (element.elements ?? []).filter((c) => c.elType === 'column');
    const inner =
      columns.length > 1
        ? [
            this.block(
              'core/columns',
              {},
              undefined,
              columns.map((column) => {
                const cs = column.settings ?? {};
                const width =
                  Number.parseFloat(str(cs._inline_size)) ||
                  Number.parseFloat(str(cs._column_size));
                return this.block(
                  'core/column',
                  {
                    ...(Number.isFinite(width) && width > 0
                      ? { width: `${Math.round(width * 100) / 100}%` }
                      : {}),
                    ...(this.boxStyle(cs) ? { style: this.boxStyle(cs) } : {}),
                  },
                  undefined,
                  this.children(column),
                );
              }),
            ),
          ]
        : this.children(element);
    if (element.isInner) return inner;
    const style = this.boxStyle(s);
    const full = str(s.stretch_section) === 'section-stretched' || str(s.layout) === 'full_width';
    if (!style && !full) return inner;
    return [
      this.block(
        'core/group',
        {
          tagName: 'section',
          ...(full ? { align: 'full' } : {}),
          ...(style ? { style } : {}),
          layout: { type: 'constrained' },
        },
        undefined,
        inner,
      ),
    ];
  }

  container(element: Element): CxdBlock[] {
    const s = element.settings ?? {};
    const kids = element.elements ?? [];
    const row = str(s.flex_direction) === 'row' || str(s.container_type) === 'grid';
    const style = this.boxStyle(s);
    let inner: CxdBlock[];
    if (row && kids.length > 1) {
      inner = [
        this.block(
          'core/columns',
          {},
          undefined,
          kids.map((kid) => {
            const width = size(obj(kid.settings ?? {}).width);
            return this.block(
              'core/column',
              width && width.endsWith('%') ? { width } : {},
              undefined,
              kid.elType === 'container' ? this.children(kid) : this.convert(kid),
            );
          }),
        ),
      ];
    } else {
      inner = this.children(element);
    }
    const top = !element.isInner && str(s.content_width) !== '';
    const full = str(s.content_width) === 'full';
    if (!style && !full) return inner;
    return [
      this.block(
        'core/group',
        {
          ...(top ? { tagName: 'section' } : {}),
          ...(full ? { align: 'full' } : {}),
          ...(style ? { style } : {}),
          layout: { type: 'constrained' },
        },
        undefined,
        inner,
      ),
    ];
  }

  heading(
    text: string,
    level: number,
    attrs: Settings = {},
    link?: { url?: string; newTab: boolean },
  ): CxdBlock {
    let content = htmlToInline(text);
    if (link?.url) content = linkTo(content, link.url, link.newTab);
    return this.block('core/heading', { level, ...attrs }, content);
  }

  paragraph(html: string, attrs: Settings = {}): CxdBlock {
    return this.block('core/paragraph', attrs, htmlToInline(html));
  }

  text(html: string): CxdBlock[] {
    return html.trim() ? htmlToBlocks(this.local(html)) : [];
  }

  /** Links and images of the old site, in a piece of HTML, as paths of this one. */
  local(html: string): string {
    const origin = this.maps.origin?.replace(/\/$/, '');
    if (!origin) return html;
    const escaped = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return html.replace(new RegExp(`(href|src)=(["'])${escaped}(?=[/"'])`, 'g'), '$1=$2');
  }

  widget(type: string, s: Settings, element: Element): CxdBlock[] {
    const align = ALIGN[str(s.align)] ?? ALIGN[str(s.text_align)];
    switch (type) {
      case 'heading': {
        const level = Number.parseInt(str(s.header_size).replace(/^h/, ''), 10) || 2;
        const style = this.style({
          text: color(s.title_color),
          fontSize: size(s.typography_font_size),
        });
        return [
          this.heading(
            str(s.title),
            Math.min(6, Math.max(1, level)),
            { ...(align ? { textAlign: align } : {}), ...(style ? { style } : {}) },
            { url: this.url(s.link), newTab: this.newTab(s.link) },
          ),
        ];
      }
      case 'text-editor': {
        const blocks = this.text(str(s.editor));
        const text = color(s.text_color);
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
      case 'image': {
        const image = this.image(s.image);
        if (!image) return [];
        const linkTo = str(s.link_to);
        const href =
          linkTo === 'custom' ? this.url(s.link) : linkTo === 'file' ? image.url : undefined;
        const caption = str(s.caption_source) === 'custom' ? str(s.caption) : '';
        return [
          this.block('core/image', {
            ...(image.id ? { id: image.id } : {}),
            url: image.url,
            ...(str(obj(s.image).alt) ? { alt: str(obj(s.image).alt) } : {}),
            ...(align && align !== 'left' ? { align } : {}),
            ...(href ? { href } : {}),
            ...(caption ? { caption: htmlToInline(caption) } : {}),
          }),
        ];
      }
      case 'button':
        return [this.buttons([{ text: str(s.text) || 'Click here', link: s.link, s }], align)];
      case 'spacer':
        return [this.block('core/spacer', { height: size(s.space) ?? '50px' })];
      case 'divider':
        return [this.block('core/separator', {})];
      case 'icon-box':
      case 'image-box': {
        const out: CxdBlock[] = [];
        if (type === 'image-box') {
          const image = this.image(s.image);
          if (image)
            out.push(
              this.block('core/image', { ...(image.id ? { id: image.id } : {}), url: image.url }),
            );
        }
        if (str(s.title_text)) {
          out.push(
            this.heading(str(s.title_text), 3, align ? { textAlign: align } : {}, {
              url: this.url(s.link),
              newTab: this.newTab(s.link),
            }),
          );
        }
        out.push(...this.text(str(s.description_text)));
        return [this.block('core/group', {}, undefined, out)];
      }
      case 'icon-list':
        return [
          this.block(
            'core/list',
            {},
            undefined,
            list(s.icon_list).map((item) => {
              const url = this.url(item.link);
              let content = htmlToInline(str(item.text));
              if (url) content = linkTo(content, url);
              return this.block('core/list-item', {}, content);
            }),
          ),
        ];
      case 'video': {
        const url =
          str(s.video_type) === 'vimeo'
            ? str(s.vimeo_url)
            : str(s.video_type) === 'hosted'
              ? str(obj(s.hosted_url).url)
              : str(s.youtube_url);
        return url ? [this.block('core/embed', { url })] : [];
      }
      case 'testimonial':
        return [
          this.block(
            'core/quote',
            {
              citation: htmlToInline(
                [str(s.testimonial_name), str(s.testimonial_job)].filter(Boolean).join(', '),
              ),
            },
            undefined,
            this.text(str(s.testimonial_content)),
          ),
        ];
      case 'html':
        return str(s.html).trim() ? [this.block('core/html', { content: str(s.html) })] : [];
      case 'shortcode':
        this.warn('shortcode', 'shortcode');
        return str(s.shortcode) ? [this.paragraph(str(s.shortcode))] : [];
      case 'tabs':
      case 'accordion':
      case 'toggle': {
        this.warn('simplified', type);
        return list(s.tabs).flatMap((tab) => [
          this.heading(str(tab.tab_title), 3),
          ...this.text(str(tab.tab_content)),
        ]);
      }
      case 'nested-tabs':
      case 'nested-accordion': {
        this.warn('simplified', type);
        const titles = list(s.tabs ?? s.items).map((item) =>
          str(item.tab_title ?? item.item_title),
        );
        return (element.elements ?? []).flatMap((child, i) => [
          ...(titles[i] ? [this.heading(titles[i]!, 3)] : []),
          ...this.convert(child),
        ]);
      }
      case 'image-gallery':
      case 'image-carousel':
      case 'gallery': {
        if (type !== 'image-gallery') this.warn('simplified', type);
        const items = list(s.wp_gallery ?? s.carousel ?? s.gallery);
        const images = items
          .map((item) => this.image(item))
          .filter((i): i is { id?: string; url: string } => !!i);
        return images.length
          ? [
              this.block(
                'core/gallery',
                {},
                undefined,
                images.map((i) =>
                  this.block('core/image', { ...(i.id ? { id: i.id } : {}), url: i.url }),
                ),
              ),
            ]
          : [];
      }
      case 'counter': {
        this.warn('simplified', type);
        const number = `${str(s.prefix)}${str(s.ending_number)}${str(s.suffix)}`;
        return [
          this.heading(number, 3, { textAlign: 'center' }),
          ...(str(s.title) ? [this.paragraph(str(s.title), { align: 'center' })] : []),
        ];
      }
      case 'progress':
        this.warn('simplified', type);
        return [this.paragraph(`${str(s.title)} — ${str(obj(s.percent).size) || '0'}%`)];
      case 'alert':
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
              ...(str(s.alert_title)
                ? [this.paragraph(`<strong>${str(s.alert_title)}</strong>`)]
                : []),
              ...this.text(str(s.alert_description)),
            ],
          ),
        ];
      case 'star-rating':
        this.warn('simplified', type);
        return [
          this.paragraph(
            `${'★'.repeat(Math.round(Number.parseFloat(str(s.rating)) || 5))} ${str(s.title)}`.trim(),
          ),
        ];
      case 'call-to-action': {
        this.warn('simplified', type);
        return [
          this.block('core/group', {}, undefined, [
            ...(str(s.title) ? [this.heading(str(s.title), 2)] : []),
            ...this.text(str(s.description)),
            ...(str(s.button)
              ? [this.buttons([{ text: str(s.button), link: s.link, s: {} }], 'left')]
              : []),
          ]),
        ];
      }
      case 'price-table': {
        this.warn('simplified', type);
        const features = list(s.features_list);
        return [
          this.block('core/group', {}, undefined, [
            ...(str(s.heading) ? [this.heading(str(s.heading), 3, { textAlign: 'center' })] : []),
            ...(str(s.price)
              ? [
                  this.paragraph(
                    `<strong>${str(s.currency_symbol_custom) || ''}${str(s.price)}</strong> ${str(s.period)}`.trim(),
                    { align: 'center' },
                  ),
                ]
              : []),
            ...(features.length
              ? [
                  this.block(
                    'core/list',
                    {},
                    undefined,
                    features.map((f) =>
                      this.block('core/list-item', {}, htmlToInline(str(f.item_text))),
                    ),
                  ),
                ]
              : []),
            ...(str(s.button_text)
              ? [this.buttons([{ text: str(s.button_text), link: s.link, s: {} }], 'center')]
              : []),
          ]),
        ];
      }
      case 'blockquote':
        return [
          this.block(
            'core/quote',
            { citation: htmlToInline(str(s.author_name)) },
            undefined,
            this.text(str(s.blockquote_content)),
          ),
        ];
      // Atomic elements (settings are { $$type, value }).
      case 'e-heading':
        return [
          this.heading(
            str(obj(s.title).value),
            Number.parseInt(str(obj(s.tag).value).replace(/^h/, ''), 10) || 2,
          ),
        ];
      case 'e-paragraph':
        return this.text(`<p>${str(obj(s.paragraph).value)}</p>`);
      case 'e-button':
        return [
          this.buttons(
            [
              {
                text: str(obj(s.text).value) || 'Click here',
                link: obj(obj(s.link).value).destination,
                s: {},
              },
            ],
            undefined,
          ),
        ];
      case 'e-image': {
        const src = obj(obj(obj(s.image).value).src);
        const image = this.image({ url: str(obj(src.value).url ?? obj(src).url) });
        return image
          ? [this.block('core/image', { ...(image.id ? { id: image.id } : {}), url: image.url })]
          : [];
      }
      case 'e-divider':
        return [this.block('core/separator', {})];
      case 'global':
      case 'template':
        this.warn('skipped', type === 'global' ? 'global widget' : 'template');
        return [];
      default:
        // Forms, maps, menus, lists of posts, sliders…: no native block.
        this.warn('skipped', type || 'unknown');
        return [];
    }
  }

  buttons(
    items: { text: string; link: unknown; s: Settings }[],
    align: string | undefined,
  ): CxdBlock {
    return this.block(
      'core/buttons',
      align && align !== 'left'
        ? { layout: { type: 'flex', justifyContent: align === 'right' ? 'right' : 'center' } }
        : {},
      undefined,
      items.map(({ text, link, s }) => {
        const url = this.url(link);
        const style = this.style({
          background: color(s.background_color),
          text: color(s.button_text_color),
        });
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
}

/** A JSON layout (the `_elementor_data` of a page) as native blocks. */
export function convertJsonLayout(
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
  const converter = new JsonConverter(maps, options.newId ?? blockId);
  const blocks = (Array.isArray(data) ? (data as Element[]) : []).flatMap((element) =>
    converter.convert(element),
  );
  return { blocks, warnings: converter.warnings() };
}
