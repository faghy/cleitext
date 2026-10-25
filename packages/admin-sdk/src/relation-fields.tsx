import {
  type EntryRelationField,
  type FileField,
  type LinkValue,
  type MediaListResponse,
  type MediaView,
  type TermRelationField,
  type UserRelationField,
} from '@cleitext/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useT } from './i18n.js';

/**
 * Editors of the core's basic field types added in plugin API 1.48:
 * relations to entries, terms and members, rich text, files and links.
 */

const inputClass =
  'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600';
const buttonClass =
  'rounded border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50 disabled:opacity-50';

/** A record a picker offers (`/field-pickers/<kind>`). */
interface PickerItem {
  id: string;
  label: string;
  hint: string;
}

type RelationField = EntryRelationField | TermRelationField | UserRelationField;

function pickerPath(field: RelationField, params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  if (field.type === 'entry' && field.types?.length) query.set('types', field.types.join(','));
  if (field.type === 'term' && field.taxonomy) query.set('taxonomy', field.taxonomy);
  if (field.type === 'user' && field.roles?.length) query.set('roles', field.roles.join(','));
  return `/field-pickers/${field.type}?${query}`;
}

/** Entries, terms or members chosen one by one (several, in order, with `multiple`). */
export function RelationPicker({
  id,
  field,
  value,
  disabled,
  onChange,
}: {
  id: string;
  field: RelationField;
  value: unknown;
  disabled: boolean;
  onChange: (value: string | string[] | null) => void;
}) {
  const { t } = useT();
  const multiple = field.multiple === true;
  const ids = (
    Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : []
  ).filter((v): v is string => typeof v === 'string');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const q = search.trim();
  const chosen = useQuery({
    queryKey: ['field-picker', field.type, 'ids', ids.join(',')],
    queryFn: () => api<PickerItem[]>('GET', pickerPath(field, { ids: ids.join(',') })),
    enabled: ids.length > 0,
  });
  const found = useQuery({
    queryKey: ['field-picker', field.type, pickerPath(field, {}), q],
    queryFn: () => api<PickerItem[]>('GET', pickerPath(field, q ? { q } : {})),
    enabled: open,
  });
  const labelOf = (itemId: string) => chosen.data?.find((item) => item.id === itemId);
  const set = (next: string[]) =>
    onChange(multiple ? (next.length ? next : null) : (next[next.length - 1] ?? null));
  const max = multiple ? (field.max ?? 50) : 1;
  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length) return;
    const next = [...ids];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    set(next);
  };
  const add = t(
    field.type === 'entry'
      ? multiple
        ? 'Add an entry'
        : 'Choose an entry'
      : field.type === 'term'
        ? multiple
          ? 'Add a term'
          : 'Choose a term'
        : multiple
          ? 'Add a person'
          : 'Choose a person',
  );
  return (
    <div className="space-y-2">
      {ids.length > 0 && (
        <ul className="space-y-1">
          {ids.map((itemId, index) => {
            const item = labelOf(itemId);
            return (
              <li
                key={itemId}
                className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-slate-800">
                    {item?.label ?? (chosen.isPending ? '…' : t('(not found)'))}
                  </span>
                  {item?.hint && <span className="ml-2 text-xs text-slate-500">{item.hint}</span>}
                </span>
                {multiple && (
                  <>
                    <button
                      type="button"
                      disabled={disabled || index === 0}
                      aria-label={t('Move up')}
                      className="px-1 text-slate-500 disabled:opacity-30"
                      onClick={() => move(index, index - 1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={disabled || index === ids.length - 1}
                      aria-label={t('Move down')}
                      className="px-1 text-slate-500 disabled:opacity-30"
                      onClick={() => move(index, index + 1)}
                    >
                      ↓
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={disabled}
                  className="text-sm text-red-700 hover:underline"
                  aria-label={`${t('Remove')} ${item?.label ?? ''}`.trim()}
                  onClick={() => set(ids.filter((v) => v !== itemId))}
                >
                  {t('Remove')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {ids.length < max || !multiple ? (
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={buttonClass}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {!multiple && ids.length > 0 ? t('Change') : add}
        </button>
      ) : null}
      {open && (
        <div className="space-y-2 rounded border border-slate-200 p-2">
          <input
            type="search"
            value={search}
            placeholder={t('Search')}
            aria-label={t('Search')}
            className={inputClass}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {(found.data ?? [])
              .filter((item) => !ids.includes(item.id))
              .map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="w-full rounded px-2 py-1 text-left hover:bg-slate-100"
                    onClick={() => {
                      set(multiple ? [...ids, item.id] : [item.id]);
                      if (!multiple || ids.length + 1 >= max) setOpen(false);
                    }}
                  >
                    <span className="font-medium text-slate-800">{item.label}</span>
                    {item.hint && <span className="ml-2 text-xs text-slate-500">{item.hint}</span>}
                  </button>
                </li>
              ))}
            {found.isSuccess && found.data.length === 0 && (
              <li className="text-sm text-slate-500">{t('Nothing found.')}</li>
            )}
            {found.error && (
              <li className="text-sm text-red-700">{t('The list cannot be loaded.')}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

const TOOLS: { command: string; arg?: string; label: string; text: string }[] = [
  { command: 'bold', label: 'Bold', text: 'B' },
  { command: 'italic', label: 'Italic', text: 'I' },
  { command: 'insertUnorderedList', label: 'Bulleted list', text: '•' },
  { command: 'insertOrderedList', label: 'Numbered list', text: '1.' },
  { command: 'formatBlock', arg: 'h3', label: 'Heading', text: 'H' },
  { command: 'formatBlock', arg: 'p', label: 'Paragraph', text: '¶' },
];

/**
 * Formatted text (`richtext`): bold, italic, lists, headings and links,
 * written as HTML that the server cleans when saving.
 */
export function RichTextControl({
  id,
  value,
  disabled,
  describedBy,
  onChange,
}: {
  id: string;
  value: unknown;
  disabled: boolean;
  describedBy: string | undefined;
  onChange: (value: string | null) => void;
}) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const html = typeof value === 'string' ? value : '';
  // Written into the box only when it changed from outside (typing keeps the caret).
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html;
  }, [html]);
  const emit = () => {
    const current = ref.current?.innerHTML ?? '';
    const text = ref.current?.textContent?.trim() ?? '';
    onChange(text === '' && !/<(img|li)\b/i.test(current) ? null : current);
  };
  const run = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };
  return (
    <div className="rounded border border-slate-300 bg-white focus-within:border-sky-600">
      <div
        role="toolbar"
        aria-label={t('Formatting')}
        className="flex gap-1 border-b border-slate-200 p-1"
      >
        {TOOLS.map((tool) => (
          <button
            key={`${tool.command}-${tool.arg ?? ''}`}
            type="button"
            disabled={disabled}
            title={t(tool.label)}
            aria-label={t(tool.label)}
            className="min-w-7 rounded px-1.5 py-0.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(tool.command, tool.arg)}
          >
            {tool.text}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          title={t('Link')}
          aria-label={t('Link')}
          className="rounded px-1.5 py-0.5 text-sm text-slate-700 underline hover:bg-slate-100"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = window.prompt(t('Address of the link'), 'https://');
            if (url) run('createLink', url);
          }}
        >
          {t('Link')}
        </button>
      </div>
      <div
        id={id}
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-describedby={describedBy}
        contentEditable={!disabled}
        suppressContentEditableWarning
        className="prose prose-sm min-h-24 max-w-none px-2 py-1.5 text-sm focus:outline-none"
        onInput={emit}
        onBlur={emit}
      />
    </div>
  );
}

/** Whether a media file's type is one a file field accepts. */
function accepts(field: FileField, mime: string): boolean {
  if (!field.accept?.length) return true;
  return field.accept.some((type) => (type.endsWith('/') ? mime.startsWith(type) : mime === type));
}

/** A file of the media library, of any kind (`file`). */
export function FilePicker({
  id,
  field,
  value,
  disabled,
  onChange,
}: {
  id: string;
  field: FileField;
  value: string | null;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const q = search.trim();
  const files = useInfiniteQuery({
    queryKey: ['media', 'files', q],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '60' });
      if (q) params.set('q', q);
      if (pageParam) params.set('cursor', pageParam);
      return api<MediaListResponse>('GET', `/media?${params}`);
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: open,
  });
  const selected = useQuery({
    queryKey: ['media', value],
    queryFn: () => api<MediaView>('GET', `/media/${value}`),
    enabled: value !== null,
  }).data;
  const items = (files.data?.pages.flatMap((page) => page.items) ?? []).filter((m) =>
    accepts(field, m.mime),
  );
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {selected && (
          <a
            href={selected.url}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 truncate text-sm text-sky-700 hover:underline"
          >
            {selected.filename}
          </a>
        )}
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={buttonClass}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {value ? t('Change file') : t('Choose file')}
        </button>
        {value && (
          <button
            type="button"
            disabled={disabled}
            className="text-sm text-red-700 hover:underline"
            onClick={() => onChange(null)}
          >
            {t('Remove')}
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-2 rounded border border-slate-200 p-2">
          <input
            type="search"
            value={search}
            placeholder={t('Search media')}
            aria-label={t('Search media')}
            className={inputClass}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {items.map((media) => (
              <li key={media.id}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-slate-100 ${media.id === value ? 'bg-sky-50' : ''}`}
                  onClick={() => {
                    onChange(media.id);
                    setOpen(false);
                  }}
                >
                  {media.kind === 'image' ? (
                    <img src={media.url} alt="" className="h-8 w-8 rounded object-cover" />
                  ) : (
                    <span aria-hidden="true" className="w-8 text-center text-xs text-slate-500">
                      {media.filename.split('.').pop()?.toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 truncate">{media.filename}</span>
                </button>
              </li>
            ))}
            {files.isSuccess && items.length === 0 && (
              <li className="text-sm text-slate-500">
                {q ? t('Nothing found.') : t('The media library is empty.')}
              </li>
            )}
            {files.hasNextPage && (
              <li className="text-center">
                <button
                  type="button"
                  disabled={files.isFetchingNextPage}
                  className={buttonClass}
                  onClick={() => void files.fetchNextPage()}
                >
                  {t('Load more')}
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A link: its address, its text and whether it opens in a new tab (`link`). */
export function LinkControl({
  id,
  value,
  disabled,
  describedBy,
  onChange,
}: {
  id: string;
  value: unknown;
  disabled: boolean;
  describedBy: string | undefined;
  onChange: (value: LinkValue | null) => void;
}) {
  const { t } = useT();
  const link = (value && typeof value === 'object' ? value : {}) as Partial<LinkValue>;
  const update = (patch: Partial<LinkValue>) => {
    const next = { ...link, ...patch };
    if (!next.url && !next.label) return onChange(null);
    onChange({
      url: next.url ?? '',
      ...(next.label ? { label: next.label } : {}),
      ...(next.target === '_blank' ? { target: '_blank' } : {}),
    });
  };
  return (
    <div className="space-y-1.5">
      <input
        id={id}
        type="url"
        className={inputClass}
        placeholder="https://"
        aria-describedby={describedBy}
        disabled={disabled}
        value={link.url ?? ''}
        onChange={(e) => update({ url: e.target.value })}
      />
      <input
        className={inputClass}
        placeholder={t('Text of the link')}
        aria-label={t('Text of the link')}
        disabled={disabled}
        value={link.label ?? ''}
        onChange={(e) => update({ label: e.target.value })}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          disabled={disabled}
          checked={link.target === '_blank'}
          onChange={(e) => update({ target: e.target.checked ? '_blank' : undefined })}
        />
        {t('Open in a new tab')}
      </label>
    </div>
  );
}
