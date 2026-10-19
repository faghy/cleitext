/**
 * Templates: whole pages or sections saved for reuse, kept as the site's
 * patterns (document.editor = fresco). Inserting one copies it with new ids;
 * templates can be exported to a file and imported on another site.
 */
import { api as coreApi, t } from '@cleitext/admin-sdk';
import { askText, confirmAction } from './dialogs.js';
import { useCallback, useEffect, useState } from 'react';
import type { FrescoNode } from '../core/model.js';
import { getElement } from '../core/registry.js';
import { Svg } from './controls.js';
import { create, useStore, type Store } from './store.js';
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

/** A file made by `exportTemplate`, checked: only known elements are kept. */
export function parseTemplateFile(text: string): TemplateFile {
  const data = JSON.parse(text) as Partial<TemplateFile>;
  if (data.format !== 'fresco-template' || !Array.isArray(data.blocks)) {
    throw new Error(t('This is not a Fresco template file.'));
  }
  let unknown = 0;
  const keep = (nodes: FrescoNode[]): FrescoNode[] =>
    nodes
      .filter((node) => {
        const ok = typeof node?.type === 'string' && Boolean(getElement(node.type));
        if (!ok) unknown++;
        return ok;
      })
      .map((node) => ({
        id: String(node.id),
        type: node.type,
        v: Number(node.v) || 1,
        attrs: node.attrs && typeof node.attrs === 'object' ? node.attrs : {},
        ...(Array.isArray(node.children) ? { children: keep(node.children) } : {}),
      }));
  const blocks = keep(data.blocks);
  if (unknown > 0 && blocks.length === 0)
    throw new Error(t('The template uses elements this site does not have.'));
  return {
    format: 'fresco-template',
    version: 1,
    title:
      typeof data.title === 'string' && data.title.trim()
        ? data.title.trim().slice(0, 200)
        : t('Imported template'),
    kind: data.kind === 'page' ? 'page' : 'section',
    blocks,
  };
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

export function LibraryView({ store }: { store: Store }) {
  const blocks = useStore(store, (s) => s.blocks);
  const selected = useStore(store, (s) => s.selected);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'page' | 'section'>('all');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    coreApi<PatternView[]>('GET', '/patterns')
      .then((list) => setTemplates(list.map(toTemplate).filter((t): t is Template => t !== null)))
      .catch((e: unknown) =>
        setMessage({ kind: 'error', text: String(e instanceof Error ? e.message : e) }),
      );
  }, []);
  useEffect(load, [load]);

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

  const insert = (template: Template) => {
    const copies = template.blocks.map(cloneWithNewIds);
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
    setMessage({ kind: 'ok', text: t('“{name}” inserted.', { name: template.title }) });
  };

  const selectedNode = selected ? find(blocks, selected) : null;
  const count = (list: FrescoNode[]) => {
    let n = 0;
    walk(list, () => n++);
    return n;
  };
  const shown = (templates ?? []).filter((t) => filter === 'all' || t.kind === filter);

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
              await run(
                async () => {
                  const parsed = parseTemplateFile(await file.text());
                  await saveTemplate(parsed.title, parsed.kind, parsed.blocks);
                },
                t('“{name}” imported.', { name: file.name }),
              );
            }}
          />
        </label>
      </div>
      {message && (
        <p className={message.kind === 'error' ? 'fre-error' : 'fre-ok'}>{message.text}</p>
      )}
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
      {templates === null ? (
        <p className="fre-empty-note">{t('Loading…')}</p>
      ) : shown.length === 0 ? (
        <p className="fre-empty-note">
          {t('No templates yet. Save a page or a section to reuse it.')}
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
                className="fre-button fre-button--primary"
                disabled={busy}
                onClick={() => insert(template)}
              >
                {t('Insert')}
              </button>
              <button
                type="button"
                className="fre-iconbtn"
                title={t('Export to a file')}
                onClick={() =>
                  download({
                    format: 'fresco-template',
                    version: 1,
                    title: template.title,
                    kind: template.kind,
                    blocks: template.blocks,
                  })
                }
              >
                <Svg path="M12 16V4 M7 9l5-5 5 5 M5 20h14" size={14} />
              </button>
              <button
                type="button"
                className="fre-iconbtn"
                title={t('Delete')}
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
    </div>
  );
}
