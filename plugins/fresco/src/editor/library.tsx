/**
 * Templates: whole pages or sections saved for reuse, kept as the site's
 * patterns (document.editor = fresco). Inserting one copies it with new ids;
 * templates can be exported to a file and imported on another site, and
 * Elementor's template files (`.json`) are imported too.
 */
import { api as coreApi, t } from '@cleitext/admin-sdk';
import { askText, confirmAction } from './dialogs.js';
import { useCallback, useEffect, useState } from 'react';
import type { FrescoNode } from '../core/model.js';
import { extensions, type LibraryItem } from '../core/extensions.js';
import { getElement } from '../core/registry.js';
import { Svg } from './controls.js';
import { convertElementorTemplate, isElementorTemplate } from './elementor-template.js';
import { create, useStore, type Store } from './store.js';
import { TemplatePreview } from './template-preview.js';
import { cloneWithNewIds, find, placeOf, walk } from './tree.js';

export interface Template {
  id: string;
  title: string;
  kind: 'page' | 'section';
  blocks: FrescoNode[];
  updatedAt: string;
}

export interface PatternView {
  id: string;
  title: string;
  document: { blocks?: FrescoNode[]; editor?: { id: string; data?: { kind?: string } } } | null;
  updatedAt: string;
}

/** The format of exported files. */
export interface TemplateFile {
  format: 'fresco-template';
  version: 1;
  title: string;
  kind: 'page' | 'section';
  blocks: FrescoNode[];
}

export function toTemplate(pattern: PatternView): Template | null {
  if (pattern.document?.editor?.id !== 'fresco') return null;
  return {
    id: pattern.id,
    title: pattern.title,
    kind: pattern.document.editor.data?.kind === 'page' ? 'page' : 'section',
    blocks: pattern.document.blocks ?? [],
    updatedAt: pattern.updatedAt,
  };
}

export async function saveTemplate(
  title: string,
  kind: 'page' | 'section',
  blocks: FrescoNode[],
): Promise<void> {
  await coreApi('POST', '/patterns', {
    title,
    synced: false,
    document: { schema: 1, blocks, editor: { id: 'fresco', data: { kind } } },
  });
}

/** A template file read for import, with what was left out or kept as it was. */
export interface ImportedTemplate {
  file: TemplateFile;
  source: 'fresco' | 'elementor';
  /** Elements this site does not have (left out). */
  skipped: number;
  /** Elementor widgets with no Fresco counterpart (their text was kept). */
  unconverted: number;
  /** Images still loaded from their original address. */
  externalImages: number;
}

/** Only elements this site has are kept; the others are counted. */
function knownElements(list: FrescoNode[]): { blocks: FrescoNode[]; skipped: number } {
  let skipped = 0;
  const keep = (nodes: FrescoNode[]): FrescoNode[] =>
    nodes
      .filter((node) => {
        const ok = typeof node?.type === 'string' && Boolean(getElement(node.type));
        if (!ok) skipped++;
        return ok;
      })
      .map((node) => ({
        id: String(node.id),
        type: node.type,
        v: Number(node.v) || 1,
        attrs: node.attrs && typeof node.attrs === 'object' ? node.attrs : {},
        ...(Array.isArray(node.children) ? { children: keep(node.children) } : {}),
      }));
  return { blocks: keep(list), skipped };
}

const templateTitle = (title: unknown): string =>
  typeof title === 'string' && title.trim() ? title.trim().slice(0, 200) : t('Imported template');

/**
 * A Fresco template file (made by `templateFile`) or an Elementor template
 * file (`.json`, exported from Elementor's Templates), checked: only known
 * elements are kept.
 */
export function readTemplateFile(text: string): ImportedTemplate {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      t('This file is neither a Fresco template nor an Elementor template (.json file).'),
    );
  }
  const fresco = data as Partial<TemplateFile> | null;
  if (fresco?.format === 'fresco-template') {
    if (!Array.isArray(fresco.blocks)) throw new Error(t('This is not a Fresco template file.'));
    const { blocks, skipped } = knownElements(fresco.blocks);
    if (skipped > 0 && blocks.length === 0)
      throw new Error(t('The template uses elements this site does not have.'));
    return {
      file: {
        format: 'fresco-template',
        version: 1,
        title: templateTitle(fresco.title),
        kind: fresco.kind === 'page' ? 'page' : 'section',
        blocks,
      },
      source: 'fresco',
      skipped,
      unconverted: 0,
      externalImages: 0,
    };
  }
  if (isElementorTemplate(data)) {
    const converted = convertElementorTemplate(data);
    const { blocks, skipped } = knownElements(converted.blocks);
    if (blocks.length === 0)
      throw new Error(
        skipped > 0
          ? t('The template uses elements this site does not have.')
          : t('The Elementor template is empty.'),
      );
    return {
      file: {
        format: 'fresco-template',
        version: 1,
        title: templateTitle(converted.title),
        kind: converted.kind,
        blocks,
      },
      source: 'elementor',
      skipped,
      unconverted: converted.unconverted,
      externalImages: converted.externalImages,
    };
  }
  throw new Error(
    t('This file is neither a Fresco template nor an Elementor template (.json file).'),
  );
}

/** A file made by `templateFile` (or an Elementor template), checked: only known elements are kept. */
export function parseTemplateFile(text: string): TemplateFile {
  return readTemplateFile(text).file;
}

/** What an import left out or kept as it was, to tell the user. */
export function importNotes(imported: ImportedTemplate): string[] {
  const notes: string[] = [];
  if (imported.skipped > 0)
    notes.push(
      t('{count} elements this site does not have were left out.', { count: imported.skipped }),
    );
  if (imported.unconverted > 0)
    notes.push(
      t('{count} Elementor widgets have no Fresco counterpart: only their text was kept.', {
        count: imported.unconverted,
      }),
    );
  if (imported.externalImages > 0)
    notes.push(
      t(
        '{count} images are still loaded from their original address: upload them to the media library and replace them to keep them.',
        { count: imported.externalImages },
      ),
    );
  return notes;
}

export function download(file: TemplateFile): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${file.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'template'}.fresco.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Templates whose title has the words searched (any case, any order). */
export function searchTemplates<T extends { title: string }>(list: T[], search: string): T[] {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((item) => {
    const title = item.title.toLowerCase();
    return words.every((word) => title.includes(word));
  });
}

/** Renames a saved template. */
export async function renameTemplate(id: string, title: string): Promise<void> {
  await coreApi('PATCH', `/patterns/${encodeURIComponent(id)}`, { title });
}

/** Imports a template file (see `readTemplateFile`) as a new template of the site. */
export async function importTemplateFile(file: File): Promise<ImportedTemplate> {
  const imported = readTemplateFile(await file.text());
  await saveTemplate(imported.file.title, imported.file.kind, imported.file.blocks);
  return imported;
}

/** The file a template is exported as. */
export const templateFile = (
  template: Pick<Template, 'title' | 'kind' | 'blocks'>,
): TemplateFile => ({
  format: 'fresco-template',
  version: 1,
  title: template.title,
  kind: template.kind,
  blocks: template.blocks,
});

export function LibraryView({ store }: { store: Store }) {
  const blocks = useStore(store, (s) => s.blocks);
  const selected = useStore(store, (s) => s.selected);
  const kit = useStore(store, (s) => s.kit);
  const locale = useStore(store, (s) => s.entry.locale);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'page' | 'section'>('all');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ title: string; blocks: FrescoNode[] } | null>(null);
  // Other sources of templates (a remote library), when a plugin adds one.
  const sources = extensions().librarySources;
  const [source, setSource] = useState('');
  const remote = sources.find((s) => s.id === source) ?? null;
  const [remoteItems, setRemoteItems] = useState<LibraryItem[] | null>(null);

  const load = useCallback(() => {
    coreApi<PatternView[]>('GET', '/patterns')
      .then((list) => setTemplates(list.map(toTemplate).filter((t): t is Template => t !== null)))
      .catch((e: unknown) =>
        setMessage({ kind: 'error', text: String(e instanceof Error ? e.message : e) }),
      );
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    if (!remote) return;
    let cancelled = false;
    setRemoteItems(null);
    const timer = setTimeout(() => {
      remote
        .list({ search, kind: filter })
        .then((items) => !cancelled && setRemoteItems(items))
        .catch((e: unknown) => {
          if (cancelled) return;
          setRemoteItems([]);
          setMessage({ kind: 'error', text: String(e instanceof Error ? e.message : e) });
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [remote, search, filter]);

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ kind: 'ok', text: done });
      load();
    } catch (e) {
      setMessage({ kind: 'error', text: String(e instanceof Error ? e.message : e) });
    } finally {
      setBusy(false);
    }
  };

  const insertBlocks = (title: string, list: FrescoNode[]) => {
    const copies = list.map(cloneWithNewIds);
    // After the selected top-level element, or at the end of the page.
    let index = blocks.length;
    if (selected) {
      let id = selected;
      let place = placeOf(blocks, id);
      while (place && place.parent !== null) {
        id = place.parent;
        place = placeOf(blocks, id);
      }
      if (place) index = place.index + 1;
    }
    // Widgets at the top go into a container, as everywhere else.
    const nodes = copies.map((node) => {
      if (getElement(node.type)?.container) return node;
      const wrapper = create('fresco/container')!;
      wrapper.children = [node];
      return wrapper;
    });
    store.actions.insertNodes(nodes, { parent: null, index });
    setMessage({ kind: 'ok', text: t('“{name}” inserted.', { name: title }) });
  };
  const insert = (template: Template) => insertBlocks(template.title, template.blocks);
  const fromSource = async (item: LibraryItem, then: (nodes: FrescoNode[]) => void) => {
    if (!remote) return;
    setBusy(true);
    try {
      then(await remote.load(item.id));
    } catch (e) {
      setMessage({ kind: 'error', text: String(e instanceof Error ? e.message : e) });
    } finally {
      setBusy(false);
    }
  };

  const selectedNode = selected ? find(blocks, selected) : null;
  const count = (list: FrescoNode[]) => {
    let n = 0;
    walk(list, () => n++);
    return n;
  };
  const shown = searchTemplates(
    (templates ?? []).filter((t) => filter === 'all' || t.kind === filter),
    search,
  );
  const rename = (template: Template) =>
    void askText({ title: t('Rename the template'), label: t('Name'), value: template.title }).then(
      (title) => {
        const name = title?.trim();
        if (name && name !== template.title)
          void run(() => renameTemplate(template.id, name), t('Template renamed.'));
      },
    );

  return (
    <div className="fre-library">
      <h3 className="fre-view-title">{t('Templates')}</h3>
      <div className="fre-library__save">
        <button
          type="button"
          className="fre-button"
          disabled={busy || blocks.length === 0}
          onClick={() =>
            void askText({ title: t('Save the page as a template'), label: t('Name') }).then(
              (title) => {
                if (title)
                  void run(
                    () => saveTemplate(title, 'page', blocks),
                    t('Page saved as “{name}”.', { name: title }),
                  );
              },
            )
          }
        >
          <Svg path="M5 4h11l3 3v13H5z M8 4v5h7V4 M8 20v-6h8v6" size={14} />
          {t('Save the page')}
        </button>
        <button
          type="button"
          className="fre-button"
          disabled={busy || !selectedNode}
          title={selectedNode ? undefined : t('Select an element first')}
          onClick={() => {
            if (!selectedNode) return;
            void askText({
              title: t('Save the section as a template'),
              label: t('Name'),
              value: t(getElement(selectedNode.type)?.title ?? ''),
            }).then((title) => {
              if (title)
                void run(
                  () => saveTemplate(title, 'section', [selectedNode]),
                  t('Section saved as “{name}”.', { name: title }),
                );
            });
          }}
        >
          <Svg path="M4 6h16v12H4z M4 10h16" size={14} />
          {t('Save the selection')}
        </button>
        <label className="fre-button">
          <Svg path="M12 4v12 M7 11l5 5 5-5 M5 20h14" size={14} />
          {t('Import')}
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              let notes: string[] = [];
              await run(
                async () => void (notes = importNotes(await importTemplateFile(file))),
                t('“{name}” imported.', { name: file.name }),
              );
              if (notes.length)
                setMessage((current) =>
                  current?.kind === 'ok'
                    ? { kind: 'ok', text: [current.text, ...notes].join(' ') }
                    : current,
                );
            }}
          />
        </label>
      </div>
      {message && (
        <p className={message.kind === 'error' ? 'fre-error' : 'fre-ok'}>{message.text}</p>
      )}
      {sources.length > 0 && (
        <select
          className="fre-input fre-library__source"
          aria-label={t('Templates from')}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="">{t('This site')}</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {t(s.title)}
            </option>
          ))}
        </select>
      )}
      <div className="fre-searchbox fre-library__search">
        <Svg path="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3" size={14} />
        <input
          type="search"
          placeholder={t('Search templates…')}
          aria-label={t('Search templates')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="fre-states" role="tablist">
        {(['all', 'page', 'section'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={filter === f ? 'is-on' : ''}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? t('All') : f === 'page' ? t('Pages') : t('Sections')}
          </button>
        ))}
      </div>
      {remote ? (
        remoteItems === null ? (
          <p className="fre-empty-note">{t('Loading…')}</p>
        ) : remoteItems.length === 0 ? (
          <p className="fre-empty-note">{t('No templates found.')}</p>
        ) : (
          <ul className="fre-library__list">
            {remoteItems.map((item) => (
              <li key={item.id} className="fre-library__item">
                {item.thumbnail && (
                  <img className="fre-library__thumb" src={item.thumbnail} alt="" />
                )}
                <div className="fre-library__info">
                  <strong>{item.title}</strong>
                  <span>{item.kind === 'page' ? t('Page') : t('Section')}</span>
                </div>
                <button
                  type="button"
                  className="fre-iconbtn"
                  title={t('Preview')}
                  aria-label={t('Preview')}
                  disabled={busy}
                  onClick={() =>
                    void fromSource(item, (nodes) =>
                      setPreview({ title: item.title, blocks: nodes }),
                    )
                  }
                >
                  <Svg
                    path="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
                    size={14}
                  />
                </button>
                <button
                  type="button"
                  className="fre-button fre-button--primary"
                  disabled={busy}
                  onClick={() => void fromSource(item, (nodes) => insertBlocks(item.title, nodes))}
                >
                  {t('Insert')}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : templates === null ? (
        <p className="fre-empty-note">{t('Loading…')}</p>
      ) : shown.length === 0 ? (
        <p className="fre-empty-note">
          {search.trim() || templates.length > 0
            ? t('No templates found.')
            : t('No templates yet. Save a page or a section to reuse it.')}
        </p>
      ) : (
        <ul className="fre-library__list">
          {shown.map((template) => (
            <li key={template.id} className="fre-library__item">
              <div className="fre-library__info">
                <strong>{template.title}</strong>
                <span>
                  {template.kind === 'page' ? t('Page') : t('Section')} ·{' '}
                  {t('{count} elements', { count: count(template.blocks) })}
                </span>
              </div>
              <button
                type="button"
                className="fre-iconbtn"
                title={t('Preview')}
                aria-label={t('Preview of “{name}”', { name: template.title })}
                onClick={() => setPreview({ title: template.title, blocks: template.blocks })}
              >
                <Svg
                  path="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
                  size={14}
                />
              </button>
              <button
                type="button"
                className="fre-button fre-button--primary"
                disabled={busy}
                onClick={() => insert(template)}
              >
                {t('Insert')}
              </button>
              <button
                type="button"
                className="fre-iconbtn"
                title={t('Rename')}
                aria-label={t('Rename “{name}”', { name: template.title })}
                disabled={busy}
                onClick={() => rename(template)}
              >
                <Svg path="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z M13.5 6.5l3 3" size={14} />
              </button>
              <button
                type="button"
                className="fre-iconbtn"
                title={t('Export to a file')}
                aria-label={t('Export to a file')}
                onClick={() => download(templateFile(template))}
              >
                <Svg path="M12 16V4 M7 9l5-5 5 5 M5 20h14" size={14} />
              </button>
              <button
                type="button"
                className="fre-iconbtn"
                title={t('Delete')}
                aria-label={t('Delete “{name}”', { name: template.title })}
                onClick={() =>
                  void confirmAction({
                    title: t('Delete the template “{name}”?', { name: template.title }),
                    action: t('Delete'),
                    danger: true,
                  }).then((ok) => {
                    if (ok)
                      void run(
                        () => coreApi('DELETE', `/patterns/${template.id}`),
                        t('Template deleted.'),
                      );
                  })
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {preview && (
        <TemplatePreview
          title={preview.title}
          blocks={preview.blocks}
          kit={kit}
          locale={locale}
          onClose={() => setPreview(null)}
          onInsert={
            store.get().readOnly || store.get().contentOnly
              ? undefined
              : () => {
                  insertBlocks(preview.title, preview.blocks);
                  setPreview(null);
                }
          }
        />
      )}
    </div>
  );
}
