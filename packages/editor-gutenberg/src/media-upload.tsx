import type { EditorServices, MediaRef } from '@cleitext/editor-core';
import { Button, Modal, SearchControl, Spinner } from '@wordpress/components';
import { addFilter } from '@wordpress/hooks';
import { type ReactNode, useEffect, useState } from 'react';

/**
 * Replaces Gutenberg's "Media Library" picker (`editor.MediaUpload`, which in
 * WordPress talks to /wp-json) with one backed by Cleitext's media service.
 */
let services: EditorServices = {};

export function setMediaServices(next: EditorServices): void {
  services = next;
}

/** Services of the mounted editor, for global handlers (e.g. apiFetch). */
export function currentServices(): EditorServices {
  return services;
}

let registered = false;

export function registerMediaUpload(): void {
  if (registered) return;
  registered = true;
  addFilter('editor.MediaUpload', 'cleitext/media-upload', () => CleitextMediaUpload);
}

interface SelectedMedia {
  id: string;
  url: string;
  alt: string;
  type: 'image' | 'video';
}

interface MediaUploadProps {
  onSelect: (media: SelectedMedia | SelectedMedia[]) => void;
  multiple?: boolean;
  render: (args: { open: () => void }) => ReactNode;
}

function CleitextMediaUpload({ onSelect, multiple = false, render }: MediaUploadProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {render({ open: () => setOpen(true) })}
      {open && (
        <MediaLibraryModal
          multiple={multiple}
          onClose={() => setOpen(false)}
          onSelect={(items) => {
            // `type` as WordPress's media objects: Media & Text tells images from videos by it.
            const selected = items.map((m) => ({
              id: m.id,
              url: m.url,
              alt: m.alt ?? '',
              type: m.mime.startsWith('video/') ? ('video' as const) : ('image' as const),
            }));
            onSelect(multiple ? selected : selected[0]!);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function MediaLibraryModal({
  multiple,
  onClose,
  onSelect,
}: {
  multiple: boolean;
  onClose: () => void;
  onSelect: (items: MediaRef[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<MediaRef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MediaRef[]>([]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      services
        .listMedia?.({ kind: 'image', search })
        .then((result) => !cancelled && setItems(result))
        .catch(() => !cancelled && setError('The media library could not be loaded.'));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  const toggle = (item: MediaRef) =>
    setSelected((current) =>
      current.some((m) => m.id === item.id)
        ? current.filter((m) => m.id !== item.id)
        : multiple
          ? [...current, item]
          : [item],
    );

  return (
    <Modal title="Media Library" onRequestClose={onClose} size="large">
      <SearchControl value={search} onChange={setSearch} label="Search media" />
      {error && <p role="alert">{error}</p>}
      {!items && !error && <Spinner />}
      {items && items.length === 0 && <p>No images yet. Upload one from the image block.</p>}
      {items && items.length > 0 && (
        <ul
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 12,
            listStyle: 'none',
            padding: 0,
            margin: '16px 0',
          }}
        >
          {items.map((item) => {
            const isSelected = selected.some((m) => m.id === item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggle(item)}
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    padding: 0,
                    border: isSelected ? '3px solid #3858e9' : '1px solid #ddd',
                    background: '#f0f0f0',
                    cursor: 'pointer',
                  }}
                >
                  <img
                    src={item.thumbnailUrl ?? item.url}
                    alt={item.alt ?? ''}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="tertiary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={selected.length === 0}
          onClick={() => onSelect(selected)}
        >
          Select
        </Button>
      </div>
    </Modal>
  );
}
