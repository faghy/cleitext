/**
 * MetaSlider's slideshows (`ml-slider` posts, their slides `ml-slide`) →
 * Diorama's sliders, in the import's plugin data (`plugins.diorama`): each
 * slide's picture, caption, link and alternative text, and the slider's
 * effect, timing, autoplay, arrows, dots and size. MetaSlider's four
 * libraries (Flex, Nivo, Responsive, Coin) all become Diorama's slider; its
 * pages find them by the alias `metaslider-<id>` (Diorama's
 * `import.shortcode`, `import.block`). Slides of other kinds (posts feed,
 * videos, layers) are left out and counted. The meta keys are a data
 * format: they appear here only to be read.
 */
import { metaValue } from './php.js';

type Node = Record<string, unknown>;

export const METASLIDER_TYPES = new Set(['ml-slider', 'ml-slide']);

function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    const node = value as Node;
    return '#text' in node ? String(node['#text']) : '';
  }
  return String(value).trim();
}

function meta(item: Node, key: string): string | undefined {
  const entry = ((item['wp:postmeta'] as Node[] | undefined) ?? []).find(
    (m) => text(m['wp:meta_key']) === key,
  );
  return entry ? text(entry['wp:meta_value']) : undefined;
}

const yes = (value: unknown) => value === true || value === 'true' || value === 'on' || value === 1;

export interface MetasliderContext {
  /** WordPress attachment id → `{ id: media ref, url }`, and its caption and alternative text. */
  media(
    attachment: number,
  ): { id: string; url: string; caption?: string; alt?: string } | undefined;
  /** An address of the old site → the new site's (paths for its own pages). */
  link(url: string): string;
}

export interface MetasliderResult {
  /** `plugins.diorama`, when there is any slider. */
  data: { version: 1; sliders: Record<string, unknown>[] } | null;
  warnings: string[];
}

/** The ids of the sliders a text shows: `[metaslider id=…]`, `[ml-slider id=…]`, MetaSlider's block. */
export function metasliderIds(content: string): number[] {
  const out: number[] = [];
  for (const m of content.matchAll(/\[(?:metaslider|ml-slider)\b[^\]]*?\bid\s*=\s*["']?(\d+)/gi))
    out.push(Number(m[1]));
  for (const m of content.matchAll(/<!--\s*wp:metaslider\/slider\s+(\{[^]*?\})\s*\/?-->/g)) {
    try {
      const id = Number((JSON.parse(m[1]!) as { slideshowId?: unknown }).slideshowId);
      if (id > 0) out.push(id);
    } catch {
      // Not JSON: no slider.
    }
  }
  return out;
}

/** MetaSlider's effects → Diorama's transitions (Nivo's and Coin's many become the closest). */
function transition(effect: string, type: string): string {
  if (effect === 'slide') return 'slide-left';
  if (/^slide(In|Up|Down)/i.test(effect)) return 'slide-up';
  if (type === 'flex' || type === 'responsive' || effect === 'fade') return 'fade';
  return 'crossfade';
}

export function metasliderToDiorama(
  items: Node[],
  used: Set<number>,
  ctx: MetasliderContext,
): MetasliderResult {
  const warnings: string[] = [];
  const sliders = items.filter(
    (item) =>
      text(item['wp:post_type']) === 'ml-slider' &&
      !['trash', 'auto-draft'].includes(text(item['wp:status'])),
  );
  if (!sliders.length) return { data: null, warnings };
  // Slides belong to their slider through the `ml-slider` term named after its id;
  // old versions made attachments the slides.
  const slidesOf = new Map<number, Node[]>();
  for (const item of items) {
    const type = text(item['wp:post_type']);
    if (type !== 'ml-slide' && type !== 'attachment') continue;
    if (['trash', 'auto-draft'].includes(text(item['wp:status']))) continue;
    for (const c of (item.category as Node[] | undefined) ?? []) {
      if (String(c['@_domain'] ?? '') !== 'ml-slider') continue;
      const owner = Number(String(c['@_nicename'] ?? ''));
      if (owner > 0) slidesOf.set(owner, [...(slidesOf.get(owner) ?? []), item]);
    }
  }
  const skipped = new Map<string, number>();
  const types = new Map<string, number>();
  const out: Record<string, unknown>[] = [];
  const unused: string[] = [];
  // The sliders pages show come first (Diorama keeps as many as the site may have).
  const ordered = [...sliders].sort(
    (a, b) =>
      Number(used.has(Number(text(b['wp:post_id'])))) -
      Number(used.has(Number(text(a['wp:post_id'])))),
  );
  for (const slider of ordered) {
    const id = Number(text(slider['wp:post_id']));
    const title = text(slider.title) || `MetaSlider ${id}`;
    const s = (metaValue(meta(slider, 'ml-slider_settings')) ?? {}) as Record<string, unknown>;
    const type = String(s.type ?? 'flex');
    types.set(type, (types.get(type) ?? 0) + 1);
    const width = Number(s.width) || 700;
    const height = Number(s.height) || 300;
    const slides = (slidesOf.get(id) ?? [])
      .sort((a, b) => Number(text(a['wp:menu_order'])) - Number(text(b['wp:menu_order'])))
      .flatMap((slide) => {
        const isAttachment = text(slide['wp:post_type']) === 'attachment';
        const kind = isAttachment ? 'image' : (meta(slide, 'ml-slider_type') ?? 'image');
        if (kind !== 'image') {
          skipped.set(kind, (skipped.get(kind) ?? 0) + 1);
          return [];
        }
        const found = ctx.media(
          isAttachment ? Number(text(slide['wp:post_id'])) : Number(meta(slide, '_thumbnail_id')),
        );
        if (!found) {
          skipped.set('image', (skipped.get('image') ?? 0) + 1);
          return [];
        }
        const picture = { id: found.id, url: found.url };
        // "Use the image's caption / alt" (MetaSlider 3.x): the media library's.
        const caption = (
          yes(Number(meta(slide, 'ml-slider_inherit_image_caption')))
            ? (found.caption ?? '')
            : text(slide['excerpt:encoded'])
        )
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .trim();
        const url = (meta(slide, 'ml-slider_url') ?? '').trim();
        const alt =
          (yes(Number(meta(slide, 'ml-slider_inherit_image_alt')))
            ? found.alt
            : meta(slide, '_wp_attachment_image_alt')) ?? '';
        return [
          {
            name: (meta(slide, 'ml-slider_title') ?? text(slide.title)).slice(0, 120),
            background: {
              kind: 'image',
              image: picture,
              alt,
              decorative: !alt && !caption,
            },
            overlay: { color: '#000000', opacity: 0 },
            ...(url
              ? {
                  link: {
                    kind: 'url',
                    value: ctx.link(url),
                    newTab: yes(meta(slide, 'ml-slider_new_window')),
                  },
                }
              : {}),
            layers: caption
              ? [
                  {
                    type: 'text',
                    name: 'Caption',
                    content: { text: caption, tag: 'p' },
                    // MetaSlider's caption: a dark band along the bottom.
                    pos: { base: { x: 50, y: 100, w: 100, h: 0, anchor: 'b' } },
                    style: {
                      base: {
                        fontSize: 16,
                        color: '#ffffff',
                        background: 'rgba(0,0,0,0.7)',
                        textAlign: 'left',
                        paddingX: 14,
                        paddingY: 10,
                        radius: 0,
                      },
                    },
                    motion: { in: { preset: 'fade', delay: 0, duration: 400, easing: 'ease' } },
                  },
                ]
              : [],
          },
        ];
      });
    const arrows = s.links === undefined ? true : yes(s.links);
    const dots =
      s.navigation === undefined ? true : s.navigation !== 'false' && s.navigation !== false;
    const fullWidth = yes(s.fullWidth);
    const scaled = (w: number) => Math.max(120, Math.round((height * w) / width));
    out.push({
      id: '',
      title,
      alias: `metaslider-${id}`,
      from: 'metaslider',
      used: used.has(id),
      data: {
        v: 1,
        type: 'slider',
        layout: fullWidth ? 'fullwidth' : 'auto',
        // MetaSlider keeps its proportions: the height follows the width on each device.
        size: {
          base: { height, offset: 0 },
          ...(width > 768 ? { tablet: { height: scaled(768) } } : {}),
          ...(width > 390 ? { mobile: { height: scaled(390) } } : {}),
        },
        maxWidth: fullWidth ? 0 : width,
        transition: {
          effect: transition(String(s.effect ?? 'fade'), type),
          duration: Number(s.animationSpeed) || 600,
          easing: 'ease',
        },
        autoplay: {
          enabled: s.autoPlay === undefined ? true : yes(s.autoPlay),
          delay: Number(s.delay) || 3000,
          pauseOnHover: s.hoverPause === undefined ? true : yes(s.hoverPause),
          loop: true,
        },
        navigation: { arrows, bullets: dots, progress: false, style: 'minimal' },
        source: { kind: 'manual' },
        slides,
      },
    });
    if (!used.has(id)) unused.push(title);
  }
  warnings.push(
    `${out.length} MetaSlider slider(s) were converted for Diorama (${[...types].map(([t, n]) => `${n} ${t}`).join(', ')}), with their pictures, captions, links, effect, timing and navigation: activate Diorama before importing to keep them.`,
  );
  if (unused.length)
    warnings.push(
      `${unused.length} MetaSlider slider(s) are not shown by any imported content (they may be in a theme's options or a widget): ${unused.join(', ')}.`,
    );
  if (types.has('nivo') || types.has('coin'))
    warnings.push(
      "Nivo and Coin sliders' effects became Diorama's closest transitions (fade or slide).",
    );
  for (const [kind, n] of skipped)
    warnings.push(
      kind === 'image'
        ? `${n} MetaSlider slide(s) were left out: their picture is not in the export.`
        : `${n} MetaSlider slide(s) of the kind "${kind}" were left out: Diorama has no counterpart yet.`,
    );
  return { data: { version: 1, sliders: out }, warnings };
}
