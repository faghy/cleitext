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
   * archive, or the person of an author archive.
   */
  of?: 'entry' | 'term' | 'author';
  /** The field group, when fields of two groups share the name (`group.name` works too). */
  group?: string;
  /** The value as stored: media as ids, nothing formatted. */
  raw?: boolean;
}

/** The stored and formatted values of the object a template reads. */
function source(
  page: PageContext,
  of: FieldReadOptions['of'],
): { raw?: Record<string, unknown>; formatted?: Record<string, unknown> } {
  const view = page.view;
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
  const { raw, formatted } = source(page, options.of);
  const key = options.group ? `${options.group}.${name}` : name;
  if (!options.raw && formatted && key in formatted) return formatted[key] as T;
  // Older cores (or a value of a field no longer defined): as stored.
  return rawValue(raw, name, options.group) as T | undefined;
}

/** A media value as formatted for templates. */
function isMedia(
  value: unknown,
): value is { url: string; alt?: string; width?: number | null; height?: number | null } {
  return (
    !!value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string'
  );
}

/**
 * Shows a field's value: text and numbers as text (escaped), yes/no as ✓,
 * a media field as an image, lists of texts joined with commas. `fallback`
 * shows when it has no value.
 */
export function Field({
  name,
  fallback = null,
  className,
  ...options
}: FieldReadOptions & { name: string; fallback?: ReactNode; className?: string }) {
  const value = useField(name, options);
  if (value === undefined || value === null || value === '') return <>{fallback}</>;
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
