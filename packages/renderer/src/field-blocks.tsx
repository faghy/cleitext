import {
  blockStyleCss,
  BOUND,
  boundMedia,
  boundText,
  FIELD_BLOCK,
  FIELD_ROW_BLOCK,
  FIELD_ROWS_BLOCK,
  type BoundBlockData,
  type CxdBlock,
} from '@cleitext/blocks';
import type { CSSProperties, ReactNode } from 'react';
import { registerBlockRenderer, ResponsiveImage } from './blocks.js';
import { useRenderContext, type RenderContext } from './context.js';
import { safeUrl } from './url.js';

/**
 * The Field and Field rows blocks (plugin API 1.48). Their values are
 * resolved by the server before rendering (`applyBindings`); without them
 * (a document rendered without that pass) they show nothing.
 */

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

function classes(...names: (string | false | null | undefined)[]): string | undefined {
  const value = names.filter(Boolean).join(' ');
  return value || undefined;
}

function bound(block: CxdBlock): BoundBlockData | undefined {
  return (block as unknown as Record<symbol, BoundBlockData | undefined>)[BOUND];
}

const TAGS = new Set(['p', 'div', 'span', 'h2', 'h3', 'h4', 'h5', 'h6']);

type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : null;

/** A related record or a link: its address and text. */
function linkOf(value: unknown, locale: string): { href?: string; text: string; blank: boolean } {
  const object = rec(value);
  return {
    ...(safeUrl(object?.url) ? { href: safeUrl(object?.url)! } : {}),
    text: boundText({ value }, locale),
    blank: object?.target === '_blank',
  };
}

function Link({ value, locale }: { value: unknown; locale: string }): ReactNode {
  const link = linkOf(value, locale);
  if (!link.text) return null;
  return link.href ? (
    <a href={link.href} {...(link.blank ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {link.text}
    </a>
  ) : (
    link.text
  );
}

/** A value as the Field block shows it; null when there is nothing to show. */
function valueNode(
  data: BoundBlockData,
  context: RenderContext,
): { node: ReactNode; block: boolean } | null {
  const { value, kind, locale } = data;
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) {
    const items = value.filter((v) => v !== null && v !== undefined && v !== '');
    if (items.length === 0) return null;
    if (items.every((item) => rec(item) && typeof rec(item)!.url === 'string')) {
      return {
        block: true,
        node: (
          <ul className="wp-block-cleitext-field__list">
            {items.map((item, i) => (
              <li key={i}>
                <Link value={item} locale={locale} />
              </li>
            ))}
          </ul>
        ),
      };
    }
    const text = boundText({ value: items }, locale);
    return text ? { node: text, block: false } : null;
  }
  const media = kind === 'media' || kind === 'file' ? boundMedia(value) : undefined;
  if (media) {
    const known = media.id ? context.media.get(media.id) : undefined;
    return {
      block: true,
      node: (
        <ResponsiveImage
          media={known}
          src={known?.url ?? media.url}
          alt={media.alt}
          eager={false}
        />
      ),
    };
  }
  if (kind === 'richtext' && typeof value === 'string') {
    // Cleaned when saved and again when formatted (sanitizeRichText).
    return {
      block: true,
      node: (
        <div
          className="wp-block-cleitext-field__text"
          dangerouslySetInnerHTML={{ __html: value }}
        />
      ),
    };
  }
  if (rec(value)) {
    const link = <Link value={value} locale={locale} />;
    return linkOf(value, locale).text ? { node: link, block: false } : null;
  }
  if (kind === 'url' && typeof value === 'string' && safeUrl(value)) {
    return { node: <a href={safeUrl(value)}>{value}</a>, block: false };
  }
  const text = boundText({ value, ...(kind ? { kind } : {}) }, locale);
  return text ? { node: text, block: false } : null;
}

registerBlockRenderer(FIELD_BLOCK, ({ block }) => <FieldBlock block={block} />);

function FieldBlock({ block }: { block: CxdBlock }): ReactNode {
  const context = useRenderContext();
  const data = bound(block);
  if (!data) return null;
  const shown = valueNode(data, context);
  const fallback = str(block.attrs.fallback);
  if (!shown && !fallback) return null;
  const tag = str(block.attrs.tagName);
  // Paragraphs and headings cannot hold lists, images or rich text.
  const Tag = (shown?.block ? 'div' : tag && TAGS.has(tag) ? tag : 'p') as 'div';
  const label = str(block.attrs.label);
  const align = str(block.attrs.textAlign);
  return (
    <Tag
      id={str(block.attrs.anchor)}
      className={classes(
        'wp-block-cleitext-field',
        data.kind && /^[a-z]+$/.test(data.kind) && `is-${data.kind}`,
        !shown && 'is-empty',
        align && `has-text-align-${align}`,
        str(block.attrs.className),
      )}
      style={blockStyleCss(block.attrs.style) as CSSProperties | undefined}
    >
      {label && <span className="wp-block-cleitext-field__label">{label} </span>}
      {shown ? shown.node : fallback}
    </Tag>
  );
}

registerBlockRenderer(FIELD_ROWS_BLOCK, ({ block, children }) => {
  const data = bound(block);
  if (!data) return null;
  const empty = str(block.attrs.emptyText);
  if (!data.value) {
    return empty ? (
      <p
        className={classes('wp-block-cleitext-field-rows', 'is-empty', str(block.attrs.className))}
      >
        {empty}
      </p>
    ) : null;
  }
  const grid = block.attrs.layout === 'grid';
  const columns = Number(block.attrs.columns);
  const style = blockStyleCss(block.attrs.style, { flex: grid }) as CSSProperties | undefined;
  return (
    <div
      id={str(block.attrs.anchor)}
      className={classes(
        'wp-block-cleitext-field-rows',
        grid && 'is-layout-grid',
        str(block.attrs.className),
      )}
      style={
        grid
          ? {
              display: 'grid',
              gridTemplateColumns: `repeat(${columns >= 1 && columns <= 6 ? columns : 3}, minmax(0, 1fr))`,
              ...style,
            }
          : style
      }
    >
      {children}
    </div>
  );
});

registerBlockRenderer(FIELD_ROW_BLOCK, ({ children }) => (
  <div className="wp-block-cleitext-field-row">{children}</div>
));
