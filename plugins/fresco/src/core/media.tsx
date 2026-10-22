import type { MediaValue, RenderContext, RenderMediaItem } from './model.js';

export function isMedia(value: unknown): value is MediaValue {
  return (
    typeof value === 'object' && value !== null && typeof (value as MediaValue).url === 'string'
  );
}

/** Ids of the media in some settings values (images, galleries). */
export function mediaIds(...values: unknown[]): string[] {
  const ids: string[] = [];
  for (const value of values) {
    if (Array.isArray(value)) ids.push(...mediaIds(...value));
    else if (isMedia(value) && typeof value.id === 'string' && value.id) ids.push(value.id);
  }
  return ids;
}

const SAFE_SRC = /^(https?:\/\/|\/(?!\/))[^\s"'<>]*$/i;

/**
 * The address of an image for a CSS background: its `large` variant when the
 * library has one (WebP first), else the file. Null when it is not safe to use.
 */
export function mediaUrl(value: unknown, context: RenderContext, size = 'large'): string | null {
  if (!isMedia(value)) return null;
  const item = value.id ? context.media.get(value.id) : undefined;
  const variant = item?.variants
    .filter((v) => v.variant === size)
    .sort((a, b) => (a.format === 'webp' ? -1 : 1) - (b.format === 'webp' ? -1 : 1))[0];
  const url = variant?.url ?? item?.url ?? value.url;
  return SAFE_SRC.test(url) ? url : null;
}

/** Sizes offered by the image controls, by their widest variant. */
export const IMAGE_SIZES = [
  { value: 'thumb', label: 'Thumbnail' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'full', label: 'Full' },
];

function srcset(item: RenderMediaItem, size: string) {
  const webp = item.variants.filter((v) => v.format === 'webp');
  const list = (webp.length ? webp : item.variants).filter(
    (v) => v.variant !== 'thumb' || size === 'thumb',
  );
  return list
    .sort((a, b) => a.width - b.width)
    .map((v) => `${v.url} ${v.width}w`)
    .join(', ');
}

/** An image from the library (with its variants) or from an address. */
export function FrImage({
  value,
  context,
  size = 'large',
  className,
  alt,
  sizes = '(max-width: 1024px) 100vw, 1024px',
}: {
  value: unknown;
  context: RenderContext;
  size?: string;
  className?: string;
  alt?: string;
  sizes?: string;
}) {
  if (!isMedia(value)) return null;
  const item = value.id ? context.media.get(value.id) : undefined;
  if (item) {
    const variant =
      size === 'full'
        ? null
        : item.variants
            .filter((v) => v.variant === size)
            .sort((a, b) => (a.format === 'webp' ? -1 : 1) - (b.format === 'webp' ? -1 : 1))[0];
    const set = size === 'thumb' ? '' : srcset(item, size);
    return (
      <img
        className={className}
        src={variant?.url ?? item.url}
        {...(set ? { srcSet: set, sizes } : {})}
        width={variant?.width ?? item.width ?? undefined}
        height={variant?.height ?? item.height ?? undefined}
        alt={alt ?? value.alt ?? item.alt ?? ''}
        loading="lazy"
        decoding="async"
      />
    );
  }
  if (!SAFE_SRC.test(value.url)) return null;
  return (
    <img
      className={className}
      src={value.url}
      alt={alt ?? value.alt ?? ''}
      loading="lazy"
      decoding="async"
    />
  );
}
