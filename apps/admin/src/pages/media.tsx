import type { MediaListResponse, MediaView } from '@cleitext/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useT } from '@cleitext/admin-sdk';
import { type DragEvent, Fragment, useRef, useState } from 'react';
import { api, errorMessage, uploadFile } from '../api';
import { useMe } from '../auth';
import { Alert, Button, Card, TextField } from '../components/ui';

type Kind = MediaView['kind'];
type View = 'grid' | 'list';

const KINDS: { value: Kind; label: string }[] = [
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'document', label: 'Documents' },
];

const VIEW_KEY = 'cleitext.media.view';

function storedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

interface UploadState {
  id: number;
  name: string;
  progress: number;
  error?: string;
}

let uploadCounter = 0;

/** Media library (RF-MED-01, RF-MED-04): grid or list, search, upload, details. */
export function MediaPage() {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [kind, setKind] = useState<Kind | ''>('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>(storedView);
  const inputRef = useRef<HTMLInputElement>(null);

  const library = useInfiniteQuery({
    queryKey: ['media', kind, query],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '40' });
      if (kind) params.set('kind', kind);
      if (query) params.set('q', query);
      if (pageParam) params.set('cursor', pageParam);
      return api<MediaListResponse>('GET', `/media?${params}`);
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = library.data?.pages.flatMap((p) => p.items) ?? [];
  const selected = items.find((m) => m.id === selectedId) ?? null;

  const update = (id: number, change: Partial<UploadState>) =>
    setUploads((current) => current.map((u) => (u.id === id ? { ...u, ...change } : u)));

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const queued = files.map((file) => ({ id: ++uploadCounter, name: file.name, progress: 0 }));
      setUploads((current) => [...current.filter((u) => u.error), ...queued]);
      for (const [index, file] of files.entries()) {
        const id = queued[index]!.id;
        try {
          await uploadFile<MediaView>(file, { onProgress: (progress) => update(id, { progress }) });
          setUploads((current) => current.filter((u) => u.id !== id));
        } catch (error) {
          update(id, { error: errorMessage(error) });
        }
        await queryClient.invalidateQueries({ queryKey: ['media'] });
      }
    },
  });

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) upload.mutate([...event.dataTransfer.files]);
  };

  const changeView = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not remembered: the choice still applies to this visit.
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{t('Media Library')}</h1>
        <Button
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? t('Uploading…') : t('Add New')}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept="image/*,.pdf,.docx,.xlsx,.pptx,.odt,.mp4,.mp3"
          onChange={(e) => {
            if (e.target.files) upload.mutate([...e.target.files]);
            e.target.value = '';
          }}
        />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded border-2 border-dashed p-4 text-center text-sm ${dragging ? 'border-sky-600 bg-sky-50' : 'border-slate-300 text-slate-600'}`}
      >
        {t('Drop files here to upload them.')}
      </div>
      {uploads.length > 0 && (
        <ul className="space-y-2" aria-label={t('Uploads')}>
          {uploads.map((item) =>
            item.error ? (
              <li key={item.id}>
                <Alert>
                  {item.name}: {item.error}
                </Alert>
              </li>
            ) : (
              <li key={item.id} className="text-sm">
                <label className="flex items-center gap-3">
                  <span className="w-48 truncate">{item.name}</span>
                  <progress className="h-2 flex-1" max={1} value={item.progress} />
                  <span className="w-10 text-right text-slate-600">
                    {Math.round(item.progress * 100)}%
                  </span>
                </label>
              </li>
            ),
          )}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div role="group" aria-label={t('View')} className="flex">
            {(['grid', 'list'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => changeView(option)}
                className={`border border-slate-300 px-2 py-1 text-sm first:rounded-l last:rounded-r ${view === option ? 'bg-slate-800 text-white' : 'bg-white'}`}
              >
                {option === 'grid' ? t('Grid') : t('List')}
              </button>
            ))}
          </div>
          <select
            aria-label={t('Filter by type')}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind | '')}
          >
            <option value="">{t('All media items')}</option>
            {KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
        </div>
        <form
          role="search"
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
          }}
        >
          <label className="sr-only" htmlFor="media-search">
            {t('Search media')}
          </label>
          <input
            id="media-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <Button variant="secondary" type="submit">
            {t('Search')}
          </Button>
        </form>
      </div>

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <Card>
            {library.isPending && <p className="text-sm text-slate-600">{t('Loading…')}</p>}
            {library.error && <Alert>{errorMessage(library.error)}</Alert>}
            {!library.isPending && items.length === 0 && (
              <p className="text-sm text-slate-600">
                {kind || query ? t('Nothing found.') : t('No files yet.')}
              </p>
            )}
            {view === 'grid' ? (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      aria-pressed={item.id === selectedId}
                      className={`flex aspect-square w-full items-center justify-center overflow-hidden rounded border bg-slate-100 ${item.id === selectedId ? 'border-sky-700 ring-2 ring-sky-700' : 'border-slate-200'}`}
                    >
                      {item.kind === 'image' ? (
                        <img
                          src={thumbnail(item)}
                          alt={item.filename}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="p-2 text-xs break-all text-slate-700">
                          {item.filename}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              items.length > 0 && (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="w-14 py-2">
                        <span className="sr-only">{t('Preview')}</span>
                      </th>
                      <th className="py-2 font-medium">{t('File')}</th>
                      <th className="py-2 font-medium">{t('Author')}</th>
                      <th className="py-2 font-medium">{t('Size')}</th>
                      <th className="py-2 font-medium">{t('Date')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        className={`border-b border-slate-100 ${item.id === selectedId ? 'bg-sky-50' : ''}`}
                      >
                        <td className="py-1">
                          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded bg-slate-100 text-xs text-slate-500 uppercase">
                            {item.kind === 'image' ? (
                              <img
                                src={thumbnail(item)}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              (item.filename.split('.').pop() ?? '')
                            )}
                          </div>
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            className="font-medium break-all text-sky-700 hover:underline"
                            aria-pressed={item.id === selectedId}
                            onClick={() => setSelectedId(item.id)}
                          >
                            {item.filename}
                          </button>
                          <div className="text-xs text-slate-500">{item.mime}</div>
                        </td>
                        <td className="py-2">{item.uploadedBy?.displayName ?? '—'}</td>
                        <td className="py-2">{formatBytes(item.sizeBytes)}</td>
                        <td className="py-2 text-slate-600">
                          {new Date(item.createdAt).toLocaleDateString(undefined, {
                            dateStyle: 'medium',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
            {library.hasNextPage && (
              <div className="mt-3">
                <Button variant="secondary" onClick={() => library.fetchNextPage()}>
                  {t('Load more')}
                </Button>
              </div>
            )}
          </Card>
        </div>
        {selected && (
          <MediaDetails key={selected.id} media={selected} onDeleted={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  );
}

function MediaDetails({ media, onDeleted }: { media: MediaView; onDeleted: () => void }) {
  const { t } = useT();
  const me = useMe();
  const queryClient = useQueryClient();
  const [alt, setAlt] = useState<Record<string, string>>(media.alt);
  const [caption, setCaption] = useState<Record<string, string>>(media.caption);

  const save = useMutation({
    mutationFn: () =>
      api<MediaView>('PATCH', `/media/${media.id}`, {
        caption,
        ...(media.kind === 'image' ? { alt } : {}),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['media'] }),
  });
  const remove = useMutation({
    mutationFn: () => api<void>('DELETE', `/media/${media.id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['media'] });
      onDeleted();
    },
  });

  return (
    <aside
      className="w-80 shrink-0 space-y-3 rounded border border-slate-200 bg-white p-4 text-sm"
      aria-label={t('File details')}
    >
      {media.kind === 'image' && (
        <img src={media.url} alt="" className="w-full rounded border border-slate-200" />
      )}
      <dl className="space-y-1">
        <div>
          <dt className="inline font-medium">{t('File:')} </dt>
          <dd className="inline break-all">{media.filename}</dd>
        </div>
        <div>
          <dt className="inline font-medium">{t('Type:')} </dt>
          <dd className="inline">{media.mime}</dd>
        </div>
        <div>
          <dt className="inline font-medium">{t('Size:')} </dt>
          <dd className="inline">
            {formatBytes(media.sizeBytes)}
            {media.width && ` · ${media.width} × ${media.height}`}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium">{t('URL:')} </dt>
          <dd className="inline break-all">{media.url}</dd>
        </div>
      </dl>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {me.site.locales.map((locale) => (
          <Fragment key={locale.code}>
            {media.kind === 'image' && (
              <TextField
                label={t('Alternative text ({language})', { language: locale.name })}
                value={alt[locale.code] ?? ''}
                onChange={(e) => setAlt({ ...alt, [locale.code]: e.target.value })}
              />
            )}
            <TextField
              label={t('Caption ({language})', { language: locale.name })}
              value={caption[locale.code] ?? ''}
              onChange={(e) => setCaption({ ...caption, [locale.code]: e.target.value })}
            />
          </Fragment>
        ))}
        {save.isSuccess && <Alert kind="success">{t('Saved.')}</Alert>}
        {save.error && <Alert>{errorMessage(save.error)}</Alert>}
        <Button type="submit" disabled={save.isPending}>
          {t('Save')}
        </Button>
      </form>
      {remove.error && <Alert>{errorMessage(remove.error)}</Alert>}
      <button
        type="button"
        className="text-red-700 hover:underline"
        disabled={remove.isPending}
        onClick={() => {
          if (
            window.confirm(
              t('Delete this file permanently? Pages using it will show a broken image.'),
            )
          ) {
            remove.mutate();
          }
        }}
      >
        {t('Delete permanently')}
      </button>
    </aside>
  );
}

function thumbnail(media: MediaView): string {
  return media.variants.find((v) => v.variant === 'thumb' && v.format === 'webp')?.url ?? media.url;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
