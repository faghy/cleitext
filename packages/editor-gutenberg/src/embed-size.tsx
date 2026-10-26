/**
 * Sizes of embed previews that have no aspect ratio (TikTok, Instagram,
 * Facebook and X frames, link cards). Gutenberg sizes its preview frame
 * with a script written inside it, which the admin's Content Security Policy
 * blocks (only hashed inline scripts run): the frame would stay 0×0, a blank
 * canvas. The block gets the size the page gives it instead, from the
 * address, and the canvas CSS (`CANVAS_CSS`) applies it.
 */
import { resolveEmbed } from '@cleitext/blocks';
import { createHigherOrderComponent } from '@wordpress/compose';
import { addFilter } from '@wordpress/hooks';
import type { ComponentType } from 'react';

interface BlockListBlockProps {
  name: string;
  attributes: { url?: string };
  wrapperProps?: { style?: Record<string, string> } & Record<string, unknown>;
  className?: string;
}

/** Height of a link card's preview (provider, name and address). */
const CARD_HEIGHT = 110;

/** Size of the preview of an embed address, or null when the block sizes it (videos). */
export function embedPreviewSize(
  url: string | undefined,
): { className: string; width: number; height: number } | null {
  const embed = url ? resolveEmbed(url) : null;
  if (!embed || embed.layout === 'aspect') return null;
  return embed.layout === 'card'
    ? { className: 'cx-embed-card', width: 480, height: CARD_HEIGHT }
    : { className: 'cx-embed-fixed', width: embed.width, height: embed.height };
}

const withEmbedSize = createHigherOrderComponent(
  (BlockListBlock: ComponentType<BlockListBlockProps>) => (props: BlockListBlockProps) => {
    const size = props.name === 'core/embed' ? embedPreviewSize(props.attributes.url) : null;
    if (!size) return <BlockListBlock {...props} />;
    return (
      <BlockListBlock
        {...props}
        className={[props.className, size.className].filter(Boolean).join(' ')}
        wrapperProps={{
          ...props.wrapperProps,
          style: {
            ...props.wrapperProps?.style,
            '--cx-embed-width': `${size.width}px`,
            '--cx-embed-height': `${size.height}px`,
          },
        }}
      />
    );
  },
  'withCleitextEmbedSize',
);

export function registerEmbedSize(): void {
  addFilter('editor.BlockListBlock', 'cleitext/embed-size', withEmbedSize);
}
