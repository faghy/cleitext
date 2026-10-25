import { sanitizeRichText } from '@cleitext/shared';
import { Fragment, type ReactNode } from 'react';
import { usePage } from './context.js';
import type { PageContext } from './types.js';

/**
 * Readers of custom fields for templates (plugin API 1.47), like ACF's
 * `get_field`, `the_field` and `have_rows`. Values are formatted on the
 * server: a media field gives `{ id, url, alt, width, height, sizes }`, list
 * rows come formatted too (each with its stable `_id`), other values as
 * they are stored.
 */
export interface FieldReadOptions {
  /**
   * Whose fields: the entry shown (default), the term of a category or tag
   * archive, the person of an author archive, or an options page (`option`,
   * plugin API 1.48, with `page`).
   */
  of?: 'entry' | 'term' | 'author' | 'option';
  /** The options page (its slug), with `of: 'option'`. */
  page?: string;
  /** The field group, when fields of two groups share the name (`group.name` works too). */
  group?: string;
  /** The value as stored: media as ids, nothing formatted. */
  raw?: boolean;
}

/** The stored and formatted values of the object a template reads. */
function source(
  page: PageContext,
  of: FieldReadOptions['of'],
  options: FieldReadOptions = {},
): { raw?: Record<string, unknown>; formatted?: Record<string, unknown> } {
  const view = page.view;
  if (of === 'option') {
    return { formatted: options.page ? page.options?.[options.page] : undefined };
  }
  if (of === 'term') {
    const term = view?.kind === 'archive' ? view.term : undefined;
    return { formatted: term?.fieldValues };
  }
  if (of === 'author') {
    const author = view?.kind === 'archive' ? view.author : undefined;
    return { formatted: author?.fieldValues };
  }
  const entry = page.entry ?? (view?.kind === 'entry' ? view.entry : undefined);
  return { raw: entry?.fields, formatted: entry?.fieldValues };
}

/** A stored value by name, `group.name`, or name inside a group. */
function rawValue(
  values: Record<string, unknown> | undefined,
  key: string,
  group: string | undefined,
): unknown {
  if (!values) return undefined;
  const [first, second] = group ? [group, key] : key.split('.', 2);
  if (second === undefined) return values[first!];
  const nested = values[first!];
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)[second]
    : undefined;
}

/**
 * The value of a custom field of the entry shown (or of the archive's term
 * or person, with `of`): by name, or `group.name`. Undefined when it has none.
 */
export function useField<T = unknown>(name: string, options: FieldReadOptions = {}): T | undefined {
  const page = usePage();
  const { raw, formatted } = source(page, options.of, options);
  const key = options.group ? `${options.group}.${name}` : name;
  if (!options.raw && formatted && key in formatted) return formatted[key] as T;
  // Older cores (or a value of a field no longer defined): as stored.
  return rawValue(raw, name, options.group) as T | undefined;
}

/**
 * The value of a field of an options page (plugin API 1.48), like ACF's
 * `get_field('name', 'option')`: by name or `group.name`, formatted as
 * `useField` gives them, in the page's language. Undefined when it has none.
 *
 * ```tsx
 * const phone = useOption<string>('phone', { page: 'contacts' });
 * ```
 */
export function useOption<T = unknown>(
  name: string,
  options: { page: string; group?: string },
): T | undefined {
  return useField<T>(name, { ...options, of: 'option' });
}

/**
 * An image as formatted for templates: a media file whose type is an image
 * (links, related records and other files have an address too).
 */
function isMedia(
  value: unknown,
): value is { url: string; alt?: string; width?: number | null; height?: number | null } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.url !== 'string') return false;
  if (typeof v.mime === 'string') return v.mime.startsWith('image/');
  // Older formats without a type: no name, title or label.
  return 'width' in v && !('name' in v || 'title' in v || 'label' in v);
}

/** A related record or a link as formatted for templates: its address and text. */
function linkOf(value: unknown): { href: string | null; text: string; blank: boolean } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const text = ['label', 'title', 'name', 'filename', 'url']
    .map((key) => v[key])
    .find((t): t is string => typeof t === 'string' && t !== '');
  if (!text) return null;
  return {
    href: typeof v.url === 'string' && v.url ? v.url : null,
    text,
    blank: v.target === '_blank',
  };
}

function LinkView({ link }: { link: NonNullable<ReturnType<typeof linkOf>> }) {
  return link.href ? (
    <a href={link.href} {...(link.blank ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {link.text}
    </a>
  ) : (
    <>{link.text}</>
  );
}

/**
 * Shows a field's value: text and numbers as text (escaped), yes/no as ✓,
 * a media field as an image, links and related entries, terms or people as
 * links (plugin API 1.48), lists joined with commas. A `richtext` field
 * shows as formatted text with `html` (cleaned again here). `fallback`
 * shows when it has no value.
 */
export function Field({
  name,
  fallback = null,
  className,
  html = false,
  ...options
}: FieldReadOptions & {
  name: string;
  fallback?: ReactNode;
  className?: string;
  /** The value is rich text (a `richtext` field): shown as HTML (plugin API 1.48). */
  html?: boolean;
}) {
  const value = useField(name, options);
  if (value === undefined || value === null || value === '') return <>{fallback}</>;
  if (html && typeof value === 'string') {
    return (
      <div
        {...(className ? { className } : {})}
        dangerouslySetInnerHTML={{ __html: sanitizeRichText(value) }}
      />
    );
  }
  if (isMedia(value)) {
    return (
      <img
        src={value.url}
        alt={value.alt ?? ''}
        {...(value.width ? { width: value.width } : {})}
        {...(value.height ? { height: value.height } : {})}
        loading="lazy"
        {...(className ? { className } : {})}
      />
    );
  }
  const link = linkOf(value);
  if (link) {
    return className ? (
      <span className={className}>
        <LinkView link={link} />
      </span>
    ) : (
      <LinkView link={link} />
    );
  }
  if (Array.isArray(value) && value.some((v) => linkOf(v))) {
    const links = value.map(linkOf).filter((l) => l !== null);
    const list = links.map((l, i) => (
      <Fragment key={i}>
        {i > 0 && ', '}
        <LinkView link={l} />
      </Fragment>
    ));
    return className ? <span className={className}>{list}</span> : <>{list}</>;
  }
  let text: string;
  if (typeof value === 'boolean') text = value ? '✓' : '';
  else if (Array.isArray(value))
    text = value.filter((v) => typeof v === 'string' || typeof v === 'number').join(', ');
  else if (typeof value === 'object') return <>{fallback}</>;
  else text = String(value);
  if (!text) return <>{fallback}</>;
  return className ? <span className={className}>{text}</span> : <>{text}</>;
}

/**
 * The rows of a list field, each given to `children` (like ACF's
 * `have_rows`/`the_row`): `<Rows name="team">{(row) => <h3>{row.name}</h3>}</Rows>`.
 * `empty` shows when there are none.
 */
export function Rows<Row extends Record<string, unknown> = Record<string, unknown>>({
  name,
  children,
  empty = null,
  ...options
}: FieldReadOptions & {
  name: string;
  children: (row: Row, index: number) => ReactNode;
  empty?: ReactNode;
}) {
  const value = useField<unknown>(name, options);
  const rows = Array.isArray(value)
    ? (value.filter((r) => r && typeof r === 'object') as Row[])
    : [];
  if (rows.length === 0) return <>{empty}</>;
  return (
    <>
      {rows.map((row, index) => (
        <Fragment key={typeof row._id === 'string' ? row._id : index}>
          {children(row, index)}
        </Fragment>
      ))}
    </>
  );
}
