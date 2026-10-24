/**
 * The media library in a dialog: pictures (or videos) of the site, newest
 * first, with a search, uploads by click or drop, and one or several chosen
 * in the order they are clicked.
 */
import { api, uploadFile, useT } from '@cleitext/admin-sdk';
import { useEffect, useRef, useState } from 'react';
import type { MediaRef } from '../model/types';
import { messageOf } from './api';
import { Btn, Dialog, ICON, Svg } from './ui';

/** A file of the library, as `GET /api/v1/media` lists it. */
export interface MediaItem {
  id: string;
  url: string;
  filename: string;
  mime: string;
  width: number | null;
  height: number | null;
  alt: Record<string, string>;
  focalPoint: { x: number; y: number } | null;
  variants: { variant: string; format: string; url: string; width: number }[];
}

/** A small copy of a picture for lists, when the library has one. */
export function thumbOf(item: Pick<MediaItem, 'url' | 'variants'>, width = 400): string {
  const small = [...(item.variants ?? [])]
    .filter((v) => v.format === 'webp' && v.width >= width)
    .sort((a, b) => a.width - b.width)[0];
  return small?.url ?? item.url;
}

export const refOf = (item: MediaItem): MediaRef => ({ id: item.id, url: item.url });

export function MediaDialog({
  title,
  multiple,
  kind = 'image',
  onClose,
  onChoose,
}: {
  title: string;
  multiple?: boolean;
  kind?: 'image' | 'video';
  onClose: () => void;
  onChoose: (items: MediaItem[]) => void;
}) {
  const { t } = useT();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = async (q: string, after: string | null) => {
    const params = new URLSearchParams({ kind, limit: '60' });
    if (q.trim()) params.set('q', q.trim());
    if (after) params.set('cursor', after);
    const page = await api<{ items: MediaItem[]; nextCursor: string | null }>(
      'GET',
      `/media?${params}`,
    );
    setItems((list) => (after ? [...list, ...page.items] : page.items));
    setCursor(page.nextCursor);
  };

  useEffect(() => {
    const timer = window.setTimeout(
      () => void load(search, null).catch((e) => setError(messageOf(e))),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  const toggle = (item: MediaItem) => {
    if (!multiple) {
      setChosen([item]);
      return;
    }
    setChosen((list) =>
      list.some((c) => c.id === item.id) ? list.filter((c) => c.id !== item.id) : [...list, item],
    );
  };

  const upload = async (files: FileList | File[]) => {
    setBusy(true);
    setError('');
    try {
      const added: MediaItem[] = [];
      for (const file of [...files]) {
        if (kind === 'image' ? !file.type.startsWith('image/') : file.type !== 'video/mp4')
          continue;
        added.push(await uploadFile<MediaItem>(file));
      }
      setItems((list) => [...added, ...list.filter((i) => !added.some((a) => a.id === i.id))]);
      setChosen((list) =>
        multiple
          ? [...list, ...added.filter((a) => !list.some((c) => c.id === a.id))]
          : added.slice(-1),
      );
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={title}
      onClose={onClose}
      size="wide"
      footer={
        <>
          <span className="dst-help dst-grow">
            {multiple ? t('{n} chosen', { n: chosen.length }) : ''}
          </span>
          <Btn onClick={onClose}>{t('Cancel')}</Btn>
          <Btn
            kind="primary"
            disabled={chosen.length === 0}
            onClick={() => onChoose(chosen)}
            data-testid="dio-media-choose"
          >
            {multiple ? t('Use these pictures') : t('Choose')}
          </Btn>
        </>
      }
    >
      <div className="dst-row" style={{ marginBottom: 14 }}>
        <input
          className="dst-input dst-grow"
          type="search"
          placeholder={t('Search the library')}
          aria-label={t('Search the library')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Btn icon={ICON.upload} disabled={busy} onClick={() => input.current?.click()}>
          {busy ? t('Uploading…') : t('Upload')}
        </Btn>
        <input
          ref={input}
          type="file"
          hidden
          multiple={multiple}
          accept={kind === 'image' ? 'image/*' : 'video/mp4'}
          onChange={(e) => e.target.files && void upload(e.target.files)}
        />
      </div>
      {error && (
        <p role="alert" style={{ color: '#b91c1c', margin: '0 0 12px' }}>
          {error}
        </p>
      )}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
        }}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 10,
          minHeight: 200,
          padding: 4,
          borderRadius: 12,
          outline: over ? '2px dashed #6366f1' : 'none',
        }}
      >
        {items.length === 0 && (
          <div className="dst-empty" style={{ gridColumn: '1 / -1' }}>
            {kind === 'image'
              ? t('No pictures yet: upload some, or drop them here.')
              : t('No videos yet: upload an MP4 file, or drop it here.')}
          </div>
        )}
        {items.map((item) => {
          const n = chosen.findIndex((c) => c.id === item.id);
          return (
            <button
              key={item.id}
              type="button"
              className="dst-card"
              aria-pressed={n >= 0}
              aria-label={item.alt?.[Object.keys(item.alt ?? {})[0] ?? ''] || item.filename}
              onClick={() => toggle(item)}
              data-testid="dio-media-item"
              style={{
                position: 'relative',
                aspectRatio: '4 / 3',
                borderColor: n >= 0 ? '#4f46e5' : undefined,
                boxShadow: n >= 0 ? '0 0 0 3px #a5b4fc' : undefined,
              }}
            >
              {kind === 'image' ? (
                <img
                  src={thumbOf(item, 300)}
                  alt=""
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <span
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    height: '100%',
                    padding: 8,
                    fontSize: 12.5,
                    wordBreak: 'break-all',
                  }}
                >
                  <Svg path={ICON.play} />
                  {item.filename}
                </span>
              )}
              {n >= 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    minWidth: 24,
                    height: 24,
                    padding: '0 6px',
                    borderRadius: 999,
                    background: '#4f46e5',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {multiple ? n + 1 : '✓'}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {cursor && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Btn onClick={() => void load(search, cursor)}>{t('Load more')}</Btn>
        </div>
      )}
    </Dialog>
  );
}
