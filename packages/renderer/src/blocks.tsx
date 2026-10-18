import { resolveEmbed, type CxdBlock, type CxdDocument, type CxdInline } from '@cleitext/blocks';
import type { CSSProperties, ReactNode } from 'react';
import {
  RenderContextReact,
  useRenderContext,
  type RenderContext,
  type RenderMedia,
} from './context.js';
import { hasText, Inline } from './inline.js';
import { safeUrl } from './url.js';

/**
 * Server rendering of CXD blocks (docs/ARCHITECTURE.md §12.3). The markup
 * follows Gutenberg's front-end output (`wp-block-*` classes) so that block
 * styles and existing theme CSS work unchanged.
 */
export type BlockRenderer = (props: { block: CxdBlock; children: ReactNode }) => ReactNode;

const renderers = new Map<string, BlockRenderer>();

/** Registers (or replaces) the server renderer of a block type. */
export function registerBlockRenderer(type: string, renderer: BlockRenderer): void {
  renderers.set(type, renderer);
}

export function Blocks({
  document,
  context,
}: {
  document: CxdDocument | null | undefined;
  context?: RenderContext;
}): ReactNode {
  const inherited = useRenderContext();
  if (!document) return null;
  return (
    <RenderContextReact.Provider value={{ ...(context ?? inherited), imageCounter: { n: 0 } }}>
      <BlockList blocks={document.blocks} />
    </RenderContextReact.Provider>
  );
}

function BlockList({ blocks }: { blocks: CxdBlock[] }): ReactNode {
  return blocks.map((block) => <Block key={block.id} block={block} />);
}

/** One block (with its children), in the current render context. */
export function Block({ block }: { block: CxdBlock }): ReactNode {
  const context = useRenderContext();
  const renderer = context.renderers?.get(block.type) ?? renderers.get(block.type);
  // Unknown blocks (e.g. from a disabled plugin) render nothing.
  if (!renderer) return null;
  const children = block.children ? <BlockList blocks={block.children} /> : null;
  return renderer({ block, children });
}

// ---- Helpers ---------------------------------------------------------------------

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

function classes(...names: (string | false | null | undefined)[]): string | undefined {
  const value = names.filter(Boolean).join(' ');
  return value || undefined;
}

function alignClass(block: CxdBlock): string | undefined {
  const align = str(block.attrs.align);
  return align ? `align${align}` : undefined;
}

function textAlignClass(block: CxdBlock, key = 'textAlign'): string | undefined {
  const align = str(block.attrs[key]);
  return align ? `has-text-align-${align}` : undefined;
}

const anchor = (block: CxdBlock) => str(block.attrs.anchor);
const extraClass = (block: CxdBlock) => str(block.attrs.className);
const rich = (block: CxdBlock, key: string) => block.attrs[key] as CxdInline[] | undefined;

function cssLength(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`;
  if (typeof value === 'string' && /^\d+(\.\d+)?(px|%|em|rem|vh|vw)?$/.test(value.trim())) {
    return /\d$/.test(value.trim()) ? `${value.trim()}px` : value.trim();
  }
  return undefined;
}

// ---- Core block renderers ------------------------------------------------------------

registerBlockRenderer('core/paragraph', ({ block }) => {
  if (!hasText(block.content)) return null;
  return (
    <p
      id={anchor(block)}
      className={classes(
        textAlignClass(block, 'align'),
        block.attrs.dropCap === true && 'has-drop-cap',
        extraClass(block),
      )}
    >
      <Inline nodes={block.content} />
    </p>
  );
});

registerBlockRenderer('core/heading', ({ block }) => {
  const level = Number(block.attrs.level);
  const Tag = `h${level >= 1 && level <= 6 ? level : 2}` as 'h2';
  return (
    <Tag
      id={anchor(block)}
      className={classes('wp-block-heading', textAlignClass(block), extraClass(block))}
    >
      <Inline nodes={block.content} />
    </Tag>
  );
});

registerBlockRenderer('core/list', ({ block, children }) => {
  const ordered = block.attrs.ordered === true;
  const start = typeof block.attrs.start === 'number' ? block.attrs.start : undefined;
  const className = classes('wp-block-list', extraClass(block));
  return ordered ? (
    <ol
      id={anchor(block)}
      className={className}
      start={start}
      reversed={block.attrs.reversed === true || undefined}
    >
      {children}
    </ol>
  ) : (
    <ul id={anchor(block)} className={className}>
      {children}
    </ul>
  );
});

registerBlockRenderer('core/list-item', ({ block, children }) => (
  <li className={extraClass(block)}>
    <Inline nodes={block.content} />
    {children}
  </li>
));

registerBlockRenderer('core/quote', ({ block, children }) => (
  <blockquote id={anchor(block)} className={classes('wp-block-quote', extraClass(block))}>
    {children}
    {hasText(rich(block, 'citation')) && (
      <cite>
        <Inline nodes={rich(block, 'citation')} />
      </cite>
    )}
  </blockquote>
));

registerBlockRenderer('core/code', ({ block }) => (
  <pre id={anchor(block)} className={classes('wp-block-code', extraClass(block))}>
    <code>
      <Inline nodes={block.content} />
    </code>
  </pre>
));

/**
 * Raw HTML, as saved: it was sanitized on save unless its author could
 * publish unfiltered HTML.
 */
registerBlockRenderer('core/html', ({ block }) => {
  const html = str(block.attrs.content);
  return html ? <div className="wp-block-html" dangerouslySetInnerHTML={{ __html: html }} /> : null;
});

/** Known providers become a lazy iframe; any other address stays a link. */
registerBlockRenderer('core/embed', ({ block }) => {
  const url = safeUrl(str(block.attrs.url));
  if (!url) return null;
  const embed = resolveEmbed(url);
  const caption = rich(block, 'caption');
  return (
    <figure
      id={anchor(block)}
      className={classes(
        'wp-block-embed',
        alignClass(block),
        embed && `is-type-${embed.type}`,
        embed && `is-provider-${embed.provider}`,
        embed && `wp-block-embed-${embed.provider}`,
        embed?.type === 'video' && 'wp-embed-aspect-16-9 wp-has-aspect-ratio',
        extraClass(block),
      )}
    >
      <div className="wp-block-embed__wrapper">
        {embed ? (
          <iframe
            src={embed.src}
            title={embed.providerName}
            width={embed.width}
            height={embed.height}
            loading="lazy"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            style={{ border: 0 }}
          />
        ) : (
          <a href={url}>{url}</a>
        )}
      </div>
      {hasText(caption) && (
        <figcaption className="wp-element-caption">
          <Inline nodes={caption} />
        </figcaption>
      )}
    </figure>
  );
});

/** A synced pattern: its blocks, from the pattern itself (one level deep). */
registerBlockRenderer('cleitext/pattern', ({ block }) => <PatternBlock block={block} />);

/** The content of the entry shown, inside a theme builder's template. */
registerBlockRenderer('cleitext/entry-content', () => <EntryContentBlock />);

function EntryContentBlock(): ReactNode {
  const context = useRenderContext();
  if (context.editorFrame && context.entry) return <div data-cx-editor-canvas="" />;
  const document = context.entry?.document;
  if (!document) return null;
  // Without `entry`, so an entry-content block inside the entry renders nothing.
  const rest = { ...context };
  delete rest.entry;
  return (
    <RenderContextReact.Provider value={{ ...rest, imageCounter: { n: 0 } }}>
      <BlockList blocks={document.blocks.filter((b) => b.type !== 'cleitext/entry-content')} />
      {context.afterEntryContent}
    </RenderContextReact.Provider>
  );
}

function PatternBlock({ block }: { block: CxdBlock }): ReactNode {
  const context = useRenderContext();
  const document =
    typeof block.attrs.ref === 'string' ? context.patterns?.get(block.attrs.ref) : undefined;
  if (!document) return null;
  // Patterns inside a pattern are not expanded again.
  const blocks = document.blocks.filter((b) => b.type !== 'cleitext/pattern');
  return (
    <RenderContextReact.Provider value={context}>
      <BlockList blocks={blocks} />
    </RenderContextReact.Provider>
  );
}

registerBlockRenderer('core/image', ({ block }) => <ImageBlock block={block} />);

// ---- Tables and galleries -------------------------------------------------------------

interface TableCell {
  content?: CxdInline[];
  tag?: string;
  scope?: string;
  align?: string;
  colspan?: number;
  rowspan?: number;
}

const SCOPES = new Set(['row', 'col', 'rowgroup', 'colgroup']);
const ALIGNS = new Set(['left', 'center', 'right']);

function tableRows(block: CxdBlock, section: 'head' | 'body' | 'foot'): ReactNode[] {
  const rows = block.attrs[section];
  if (!Array.isArray(rows)) return [];
  return rows.map((row, r) => (
    <tr key={r}>
      {((row as { cells?: TableCell[] }).cells ?? []).map((cell, c) => {
        const Tag = cell.tag === 'th' ? 'th' : 'td';
        return (
          <Tag
            key={c}
            scope={Tag === 'th' && cell.scope && SCOPES.has(cell.scope) ? cell.scope : undefined}
            colSpan={Number.isInteger(cell.colspan) && cell.colspan! > 1 ? cell.colspan : undefined}
            rowSpan={Number.isInteger(cell.rowspan) && cell.rowspan! > 1 ? cell.rowspan : undefined}
            className={
              cell.align && ALIGNS.has(cell.align) ? `has-text-align-${cell.align}` : undefined
            }
          >
            <Inline nodes={Array.isArray(cell.content) ? cell.content : []} />
          </Tag>
        );
      })}
    </tr>
  ));
}

registerBlockRenderer('core/table', ({ block }) => {
  const head = tableRows(block, 'head');
  const body = tableRows(block, 'body');
  const foot = tableRows(block, 'foot');
  if (head.length + body.length + foot.length === 0) return null;
  const caption = rich(block, 'caption');
  return (
    <figure
      id={anchor(block)}
      className={classes('wp-block-table', alignClass(block), extraClass(block))}
    >
      <table className={block.attrs.hasFixedLayout !== false ? 'has-fixed-layout' : undefined}>
        {head.length > 0 && <thead>{head}</thead>}
        {body.length > 0 && <tbody>{body}</tbody>}
        {foot.length > 0 && <tfoot>{foot}</tfoot>}
      </table>
      {hasText(caption) && (
        <figcaption className="wp-element-caption">
          <Inline nodes={caption} />
        </figcaption>
      )}
    </figure>
  );
});

/** A gallery: its images (core/image children) in a grid. */
registerBlockRenderer('core/gallery', ({ block, children }) => {
  if (!block.children?.length) return null;
  const columns = Number(block.attrs.columns);
  const caption = rich(block, 'caption');
  return (
    <figure
      id={anchor(block)}
      className={classes(
        'wp-block-gallery',
        'has-nested-images',
        columns >= 1 && columns <= 8 ? `columns-${columns}` : 'columns-default',
        block.attrs.imageCrop !== false && 'is-cropped',
        alignClass(block),
        extraClass(block),
      )}
    >
      {children}
      {hasText(caption) && (
        <figcaption className="blocks-gallery-caption wp-element-caption">
          <Inline nodes={caption} />
        </figcaption>
      )}
    </figure>
  );
});

/**
 * Base styles of tables and galleries, added to pages that have one (themes
 * may restyle them): borders and room in tables, a grid in galleries.
 */
export const CORE_BLOCK_CSS = [
  '.wp-block-table{overflow-x:auto;margin:1.5em 0}',
  '.wp-block-table table{border-collapse:collapse;width:100%}',
  '.wp-block-table .has-fixed-layout{table-layout:fixed}',
  '.wp-block-table th,.wp-block-table td{border:1px solid rgb(127 127 127/.35);padding:.5em .75em;text-align:left;vertical-align:top}',
  '.wp-block-table thead{border-bottom:2px solid rgb(127 127 127/.6)}',
  '.wp-block-table .has-text-align-center{text-align:center}.wp-block-table .has-text-align-right{text-align:right}',
  '.wp-block-table figcaption,.wp-block-gallery>figcaption{font-size:.875em;opacity:.8;margin-top:.5em;text-align:center}',
  '.wp-block-gallery{--cx-gallery-columns:3;display:grid;gap:.75em;grid-template-columns:repeat(var(--cx-gallery-columns),minmax(0,1fr));margin:1.5em 0;padding:0}',
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(
    (n) => `.wp-block-gallery.columns-${n}{--cx-gallery-columns:${n}}`,
  ),
  '@media (max-width:600px){.wp-block-gallery:not(.columns-1){--cx-gallery-columns:2}}',
  '.wp-block-gallery>.wp-block-image{margin:0}',
  '.wp-block-gallery>.wp-block-image img{width:100%;height:auto;display:block}',
  '.wp-block-gallery.is-cropped>.wp-block-image img{aspect-ratio:1;height:100%;object-fit:cover}',
  '.wp-block-gallery>figcaption{grid-column:1/-1}',
].join('');

/** Adds the base styles of tables and galleries to a page that has one, before the theme's. */
export function withCoreBlockCss(html: string): string {
  if (!/class="wp-block-(table|gallery)\b/.test(html)) return html;
  // Before the theme's styles, which may restyle them.
  const head = html.indexOf('</head>');
  const first = html.search(/<style|<link[^>]+rel="stylesheet"/);
  const at = first !== -1 && (head === -1 || first < head) ? first : head;
  const style = `<style data-cx-core-blocks>${CORE_BLOCK_CSS}</style>`;
  return at === -1 ? style + html : html.slice(0, at) + style + html.slice(at);
}

function ImageBlock({ block }: { block: CxdBlock }): ReactNode {
  const context = useRenderContext();
  const media = typeof block.attrs.id === 'string' ? context.media.get(block.attrs.id) : undefined;
  const src = media?.url ?? safeUrl(block.attrs.url);
  if (!src) return null;

  const counter = context.imageCounter ?? { n: 0 };
  const eager = counter.n === 0 && context.eagerFirstImage !== false;
  counter.n++;

  const alt = str(block.attrs.alt) ?? media?.alt ?? '';
  const href = safeUrl(block.attrs.href);
  const sizeSlug = str(block.attrs.sizeSlug);
  const image = (
    <ResponsiveImage
      media={media}
      src={src}
      alt={alt}
      eager={eager}
      width={block.attrs.width}
      height={block.attrs.height}
    />
  );
  const caption = rich(block, 'caption');
  return (
    <figure
      id={anchor(block)}
      className={classes(
        'wp-block-image',
        alignClass(block),
        sizeSlug && `size-${sizeSlug}`,
        extraClass(block),
      )}
    >
      {href ? <a href={href}>{image}</a> : image}
      {hasText(caption) && (
        <figcaption className="wp-element-caption">
          <Inline nodes={caption} />
        </figcaption>
      )}
    </figure>
  );
}

/** `<picture>` with AVIF and WebP variants and the original as fallback. */
export function ResponsiveImage({
  media,
  src,
  alt,
  eager,
  width,
  height,
  sizes = '(max-width: 800px) 100vw, 800px',
}: {
  media: RenderMedia | undefined;
  src: string;
  alt: string;
  eager: boolean;
  width?: unknown;
  height?: unknown;
  sizes?: string;
}): ReactNode {
  const style: CSSProperties = {};
  const w = cssLength(width);
  const h = cssLength(height);
  if (w) style.width = w;
  if (h) style.height = h;
  // Crops made by the theme keep the chosen point in view (RF-MED-05).
  if (media?.focalPoint) {
    style.objectPosition = `${Math.round(media.focalPoint.x * 100)}% ${Math.round(media.focalPoint.y * 100)}%`;
  }
  const loading = eager ? undefined : 'lazy';
  const img = (
    <img
      src={src}
      alt={alt}
      width={media?.width ?? undefined}
      height={media?.height ?? undefined}
      loading={loading}
      decoding={eager ? undefined : 'async'}
      fetchPriority={eager ? 'high' : undefined}
      style={Object.keys(style).length ? style : undefined}
    />
  );
  if (!media || media.variants.length === 0) return img;
  const srcset = (format: string) =>
    media.variants
      .filter((v) => v.format === format)
      .sort((a, b) => a.width - b.width)
      .map((v) => `${v.url} ${v.width}w`)
      .join(', ');
  const avif = srcset('avif');
  const webp = srcset('webp');
  return (
    <picture>
      {avif && <source type="image/avif" srcSet={avif} sizes={sizes} />}
      {webp && <source type="image/webp" srcSet={webp} sizes={sizes} />}
      {img}
    </picture>
  );
}

registerBlockRenderer('core/buttons', ({ block, children }) => (
  <div id={anchor(block)} className={classes('wp-block-buttons', extraClass(block))}>
    {children}
  </div>
));

registerBlockRenderer('core/button', ({ block }) => {
  const href = safeUrl(block.attrs.url);
  const newTab = block.attrs.linkTarget === '_blank';
  const rel = [str(block.attrs.rel), newTab ? 'noopener noreferrer' : undefined]
    .filter(Boolean)
    .join(' ');
  const content = <Inline nodes={block.content} />;
  return (
    <div className={classes('wp-block-button', extraClass(block))}>
      {href ? (
        <a
          className="wp-block-button__link wp-element-button"
          href={href}
          target={newTab ? '_blank' : undefined}
          rel={rel || undefined}
        >
          {content}
        </a>
      ) : (
        <span className="wp-block-button__link wp-element-button">{content}</span>
      )}
    </div>
  );
});

registerBlockRenderer('core/columns', ({ block, children }) => (
  <div
    id={anchor(block)}
    className={classes(
      'wp-block-columns',
      alignClass(block),
      block.attrs.isStackedOnMobile !== false && 'is-stacked-on-mobile',
      extraClass(block),
    )}
  >
    {children}
  </div>
));

registerBlockRenderer('core/column', ({ block, children }) => {
  const basis = cssLength(block.attrs.width);
  return (
    <div
      className={classes('wp-block-column', extraClass(block))}
      style={basis ? { flexBasis: basis } : undefined}
    >
      {children}
    </div>
  );
});

const GROUP_TAGS = new Set(['div', 'section', 'article', 'aside', 'header', 'footer', 'main']);

registerBlockRenderer('core/group', ({ block, children }) => {
  const tag = str(block.attrs.tagName);
  const Tag = (tag && GROUP_TAGS.has(tag) ? tag : 'div') as 'div';
  return (
    <Tag
      id={anchor(block)}
      className={classes('wp-block-group', alignClass(block), extraClass(block))}
    >
      {children}
    </Tag>
  );
});

registerBlockRenderer('core/separator', ({ block }) => (
  <hr className={classes('wp-block-separator', 'has-alpha-channel-opacity', extraClass(block))} />
));

registerBlockRenderer('core/spacer', ({ block }) => (
  <div
    className={classes('wp-block-spacer', extraClass(block))}
    style={{ height: cssLength(block.attrs.height) ?? '100px' }}
    aria-hidden="true"
  />
));
