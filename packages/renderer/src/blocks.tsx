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

function Block({ block }: { block: CxdBlock }): ReactNode {
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

registerBlockRenderer('core/image', ({ block }) => <ImageBlock block={block} />);

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
