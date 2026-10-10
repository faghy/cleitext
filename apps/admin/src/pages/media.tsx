import type { MediaListResponse, MediaView } from '@cleitext/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useT } from '@cleitext/admin-sdk';
import { type DragEvent, useRef, useState } from 'react';
import { api, errorMessage, uploadFile } from '../api';
import { useMe } from '../auth';
import { Alert, Button, Card, TextField } from '../components/ui';

/** Media library (RF-MED-01, RF-MED-04): grid, upload, details. */
export function MediaPage() {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const library = useInfiniteQuery({
    queryKey: ['media'],
    queryFn: ({ pageParam }) =>
      api<MediaListResponse>('GET', `/media?limit=40${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = library.data?.pages.flatMap((p) => p.items) ?? [];
  const selected = items.find((m) => m.id === selectedId) ?? null;

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const errors: string[] = [];
      for (const file of files) {
        try {
          await uploadFile<MediaView>(file);
        } catch (error) {
          errors.push(`${file.name}: ${errorMessage(error)}`);
        }
      }
      setUploadErrors(errors);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['media'] }),
  });

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) upload.mutate([...event.dataTransfer.files]);
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
          onChange={(e) => e.target.files && upload.mutate([...e.target.files])}
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
      {uploadErrors.map((message) => (
        <Alert key={message}>{message}</Alert>
      ))}

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <Card>
            {library.isPending && <p className="text-sm text-slate-600">{t('Loading…')}</p>}
            {library.error && <Alert>{errorMessage(library.error)}</Alert>}
            {!library.isPending && items.length === 0 && (
              <p className="text-sm text-slate-600">{t('No files yet.')}</p>
            )}
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
                      <span className="p-2 text-xs break-all text-slate-700">{item.filename}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
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

  const save = useMutation({
    mutationFn: () => api<MediaView>('PATCH', `/media/${media.id}`, { alt }),
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
      {media.kind === 'image' && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {me.site.locales.map((locale) => (
            <TextField
              key={locale.code}
              label={t('Alternative text ({language})', { language: locale.name })}
              value={alt[locale.code] ?? ''}
              onChange={(e) => setAlt({ ...alt, [locale.code]: e.target.value })}
            />
          ))}
          {save.isSuccess && <Alert kind="success">{t('Saved.')}</Alert>}
          {save.error && <Alert>{errorMessage(save.error)}</Alert>}
          <Button type="submit" disabled={save.isPending}>
            {t('Save')}
          </Button>
        </form>
      )}
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
