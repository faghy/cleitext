/**
 * "Add Media": the media library in a window, to upload files and insert a
 * picture (with its text, caption, alignment, size and link) or a link to a
 * file where the cursor is.
 */
import type { EditorMedia, EditorProps } from '@cleitext/admin-sdk';
import type { CxdBlock } from '@cleitext/blocks';
import { useEffect, useRef, useState } from 'react';
import { newId } from './convert.js';
import { fill, type Labels } from './i18n.js';

export type Insertion = { block: CxdBlock } | { html: string };

const SIZES = [
  { slug: 'thumbnail', width: 150 },
  { slug: 'medium', width: 300 },
  { slug: 'large', width: 1024 },
] as const;

const isImage = (item: EditorMedia) => item.mime.startsWith('image/');
const fileName = (url: string) => decodeURIComponent(url.split(/[?#]/)[0]!.split('/').pop() ?? url);
const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function MediaModal({
  t,
  media,
  onInsert,
  onClose,
}: {
  t: Labels;
  media: EditorProps['media'];
  onInsert: (insertion: Insertion) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<EditorMedia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<EditorMedia | null>(null);
  const [alt, setAlt] = useState('');
  const [caption, setCaption] = useState('');
  const [align, setAlign] = useState<'none' | 'left' | 'center' | 'right'>('none');
  const [link, setLink] = useState<'none' | 'file' | 'custom'>('none');
  const [customUrl, setCustomUrl] = useState('');
  const [size, setSize] = useState('full');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      media
        .list(search.trim() ? { search: search.trim() } : {})
        .then((list) => current && setItems(list))
        .catch((e: unknown) => current && setError(String((e as Error)?.message ?? e)));
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [media, search]);

  useEffect(() => {
    box.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const select = (item: EditorMedia) => {
    setSelected(item);
    setAlt(item.alt ?? '');
    setCaption('');
    setSize('full');
  };

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      let last: EditorMedia | null = null;
      for (const file of Array.from(files)) last = await media.upload(file);
      const list = await media.list({});
      setItems(list);
      setSearch('');
      setTab('library');
      if (last) select(last);
    } catch (e) {
      setError(fill(t.uploadFailed, { message: String((e as Error)?.message ?? e) }));
    } finally {
      setUploading(false);
    }
  };

  const insert = () => {
    if (!selected) return;
    const href =
      link === 'file'
        ? selected.url
        : link === 'custom' && customUrl.trim()
          ? customUrl.trim()
          : '';
    if (!isImage(selected)) {
      onInsert({
        html: `<a href="${escape(selected.url)}">${escape(fileName(selected.url))}</a>`,
      });
      return;
    }
    const chosen = SIZES.find((s) => s.slug === size);
    let width = selected.width;
    let height = selected.height;
    if (chosen && width && height && width > chosen.width) {
      height = Math.round((height * chosen.width) / width);
      width = chosen.width;
    }
    onInsert({
      block: {
        id: newId(),
        type: 'core/image',
        v: 1,
        attrs: {
          id: selected.id,
          url: selected.url,
          alt: alt.trim(),
          ...(align !== 'none' ? { align } : {}),
          ...(width ? { width } : {}),
          ...(height ? { height } : {}),
          sizeSlug: chosen ? chosen.slug : 'full',
          ...(href ? { href } : {}),
          ...(caption.trim() ? { caption: [{ text: caption.trim() }] } : {}),
        },
      },
    });
  };

  const sizes = selected?.width ? SIZES.filter((s) => s.width < (selected.width ?? 0)) : [];

  return (
    <div
      className="ce-modal"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={box}
        className="ce-modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ce-media-title"
        tabIndex={-1}
      >
        <div className="ce-modal-head">
          <h2 id="ce-media-title">{t.insertMedia}</h2>
          <button type="button" className="ce-modal-x" aria-label={t.close} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="ce-modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className="ce-modal-tab"
            aria-selected={tab === 'upload'}
            onClick={() => setTab('upload')}
          >
            {t.uploadFiles}
          </button>
          <button
            type="button"
            role="tab"
            className="ce-modal-tab"
            aria-selected={tab === 'library'}
            onClick={() => setTab('library')}
          >
            {t.mediaLibrary}
          </button>
        </div>
        <div className="ce-modal-body">
          {tab === 'upload' ? (
            <div className="ce-upload">
              <p>{uploading ? t.uploading : t.dropHint}</p>
              <label className="ce-button ce-button-primary">
                {t.selectFiles}
                <input
                  type="file"
                  multiple
                  hidden
                  disabled={uploading}
                  onChange={(event) => void upload(event.target.files)}
                />
              </label>
              {error && <p className="ce-error">{error}</p>}
            </div>
          ) : (
            <>
              <div className="ce-library">
                <input
                  type="search"
                  value={search}
                  placeholder={t.search}
                  aria-label={t.search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {error && <p className="ce-error">{error}</p>}
                {items === null ? (
                  <p>{t.loading}</p>
                ) : items.length === 0 ? (
                  <p>{t.noMedia}</p>
                ) : (
                  <ul className="ce-grid">
                    {items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="ce-thumb"
                          aria-pressed={selected?.id === item.id}
                          title={item.alt || fileName(item.url)}
                          onClick={() => select(item)}
                        >
                          {isImage(item) ? (
                            <img
                              src={item.thumbnailUrl ?? item.url}
                              alt={item.alt ?? ''}
                              loading="lazy"
                            />
                          ) : (
                            <span>{fileName(item.url)}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {selected && (
                <div className="ce-details">
                  <h3>{t.attachmentDetails}</h3>
                  {isImage(selected) && <img src={selected.thumbnailUrl ?? selected.url} alt="" />}
                  <p>
                    {fileName(selected.url)}
                    {selected.width && selected.height
                      ? ` · ${selected.width} × ${selected.height}`
                      : ''}
                  </p>
                  {isImage(selected) && (
                    <>
                      <label className="ce-field">
                        <span>{t.altText}</span>
                        <input value={alt} onChange={(event) => setAlt(event.target.value)} />
                      </label>
                      <label className="ce-field">
                        <span>{t.caption}</span>
                        <textarea
                          rows={2}
                          value={caption}
                          onChange={(event) => setCaption(event.target.value)}
                        />
                      </label>
                      <h3>{t.displaySettings}</h3>
                      <label className="ce-field">
                        <span>{t.alignment}</span>
                        <select
                          value={align}
                          onChange={(event) => setAlign(event.target.value as typeof align)}
                        >
                          <option value="none">{t.none}</option>
                          <option value="left">{t.left}</option>
                          <option value="center">{t.center}</option>
                          <option value="right">{t.right}</option>
                        </select>
                      </label>
                      <label className="ce-field">
                        <span>{t.linkTo}</span>
                        <select
                          value={link}
                          onChange={(event) => setLink(event.target.value as typeof link)}
                        >
                          <option value="none">{t.none}</option>
                          <option value="file">{t.mediaFile}</option>
                          <option value="custom">{t.customUrl}</option>
                        </select>
                      </label>
                      {link === 'custom' && (
                        <label className="ce-field">
                          <span>URL</span>
                          <input
                            type="url"
                            value={customUrl}
                            onChange={(event) => setCustomUrl(event.target.value)}
                          />
                        </label>
                      )}
                      <label className="ce-field">
                        <span>{t.size}</span>
                        <select value={size} onChange={(event) => setSize(event.target.value)}>
                          {sizes.map((s) => (
                            <option key={s.slug} value={s.slug}>
                              {t[s.slug]} – {s.width} ×{' '}
                              {Math.round(
                                ((selected.height ?? 0) * s.width) / (selected.width ?? 1),
                              )}
                            </option>
                          ))}
                          <option value="full">
                            {t.full}
                            {selected.width && selected.height
                              ? ` – ${selected.width} × ${selected.height}`
                              : ''}
                          </option>
                        </select>
                      </label>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <div className="ce-modal-foot">
          <button
            type="button"
            className="ce-button ce-button-primary"
            disabled={!selected || tab !== 'library'}
            onClick={insert}
          >
            {t.insertIntoPost}
          </button>
        </div>
      </div>
    </div>
  );
}
