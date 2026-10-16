import { errorMessage, uploadFile, useT } from '@cleitext/admin-sdk';
import { useRef, useState } from 'react';

export interface ImageItem {
  id: string;
  url: string;
  caption: string;
}

/**
 * The product's images: several uploaded at once (with progress), dragged
 * to change the order, a caption each. The first is the main image.
 */
export function ImagesEditor({
  images,
  onChange,
}: {
  images: ImageItem[];
  onChange: (images: ImageItem[]) => void;
}) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<{ name: string; progress: number; error?: string }[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [dropping, setDropping] = useState(false);
  // The latest list, for uploads that finish one after the other.
  const latest = useRef(images);
  latest.current = images;

  const upload = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    const start = uploads.length;
    setUploads((current) => [...current, ...list.map((f) => ({ name: f.name, progress: 0 }))]);
    await Promise.all(
      list.map(async (file, index) => {
        const at = start + index;
        try {
          const media = await uploadFile<{ id: string; url: string }>(file, {
            onProgress: (progress) =>
              setUploads((current) => current.map((u, i) => (i === at ? { ...u, progress } : u))),
          });
          latest.current = [...latest.current, { id: media.id, url: media.url, caption: '' }];
          onChange(latest.current);
          setUploads((current) => current.map((u, i) => (i === at ? { ...u, progress: 1 } : u)));
        } catch (error) {
          setUploads((current) =>
            current.map((u, i) => (i === at ? { ...u, error: errorMessage(error) } : u)),
          );
        }
      }),
    );
    // Keep only the failed ones in view.
    setUploads((current) => current.filter((u) => u.error));
  };

  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };

  return (
    <div className="sh-stack">
      {images.length > 0 && (
        <div className="sh-gallery">
          {images.map((image, index) => (
            <figure
              key={image.id}
              className={[index === 0 ? 'is-main' : '', over === index ? 'is-over' : ''].join(' ')}
              draggable
              onDragStart={() => setDragging(index)}
              onDragOver={(e) => {
                if (dragging === null) return;
                e.preventDefault();
                setOver(index);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging !== null) move(dragging, index);
                setDragging(null);
                setOver(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
            >
              <img src={image.url} alt={image.caption} />
              <input
                type="text"
                aria-label={t('Caption of image {n}', { n: index + 1 })}
                placeholder={t('Caption')}
                value={image.caption}
                onChange={(e) =>
                  onChange(
                    images.map((x, i) => (i === index ? { ...x, caption: e.target.value } : x)),
                  )
                }
              />
              <div className="sh-row sh-between sh-small">
                {index === 0 ? (
                  <span className="sh-muted">{t('Main image')}</span>
                ) : (
                  <button type="button" className="sh-link" onClick={() => move(index, 0)}>
                    {t('Make main')}
                  </button>
                )}
                <button
                  type="button"
                  className="sh-link sh-btn-danger"
                  aria-label={t('Remove image {n}', { n: index + 1 })}
                  onClick={() => onChange(images.filter((_, i) => i !== index))}
                >
                  ✕
                </button>
              </div>
            </figure>
          ))}
        </div>
      )}
      <div
        className={`sh-drop${dropping ? ' is-over' : ''}`}
        onDragOver={(e) => {
          if (dragging !== null) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          if (dragging !== null) return;
          e.preventDefault();
          setDropping(false);
          void upload(e.dataTransfer.files);
        }}
      >
        <p style={{ margin: '0 0 .5rem' }}>{t('Drop images here, or')}</p>
        <button type="button" className="sh-btn" onClick={() => input.current?.click()}>
          {t('Choose images')}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void upload(e.target.files);
            e.target.value = '';
          }}
        />
        <p className="sh-small sh-muted" style={{ margin: '.5rem 0 0' }}>
          {t('Drag the images to change their order: the first one is the main image.')}
        </p>
      </div>
      {uploads.map((u, i) => (
        <div key={`${u.name}-${i}`} className="sh-small">
          {u.name}
          {u.error ? (
            <span className="sh-error"> — {u.error}</span>
          ) : (
            <div
              className="sh-progress"
              role="progressbar"
              aria-valuenow={Math.round(u.progress * 100)}
            >
              <i style={{ width: `${Math.round(u.progress * 100)}%` }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
