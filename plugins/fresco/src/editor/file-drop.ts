/**
 * Image files dropped from the desktop onto the canvas, as in Elementor: they
 * go to the media library and become Image elements where they are dropped;
 * dropped onto an Image element, the first one replaces its image.
 */
import type { EditorMedia } from '@cleitext/admin-sdk';
import { t } from '@cleitext/admin-sdk';
import type { FrescoNode } from '../core/model.js';
import { dropTarget } from './dnd.js';
import { create, type Store } from './store.js';
import { find } from './tree.js';
import type { Place } from './tree.js';

/** At most this many files are uploaded from one drop. */
export const MAX_DROPPED_FILES = 20;

/** Whether a drag carries files (from the desktop, not elements of the page). */
export function hasFiles(data: DataTransfer | null): boolean {
  return Boolean(data && [...data.types].includes('Files'));
}

/** The image files of a drop, in order (others are left out). */
export function imageFiles(files: Iterable<File>): File[] {
  return [...files].filter((file) => /^image\//.test(file.type)).slice(0, MAX_DROPPED_FILES);
}

/** An image control's value for an uploaded file. */
export function mediaValue(media: EditorMedia): { id: string; url: string; alt?: string } {
  return { id: media.id, url: media.url, ...(media.alt ? { alt: media.alt } : {}) };
}

/** A new Image element showing an uploaded file. */
export function imageNode(media: EditorMedia): FrescoNode {
  const node = create('fresco/image')!;
  node.attrs = { ...node.attrs, image: mediaValue(media) };
  return node;
}

/** Where a drop at a point goes: onto an Image element (replace), or a place for new ones. */
export type FileDrop = { kind: 'replace'; id: string } | { kind: 'insert'; place: Place };

/**
 * The Image element under a point, when there is one: dropping there
 * replaces its picture instead of adding new elements.
 */
function imageAt(doc: Document, root: HTMLElement, blocks: FrescoNode[], x: number, y: number) {
  const element = doc.elementFromPoint(x, y)?.closest<HTMLElement>('[data-fr-id]');
  if (!element || !root.contains(element)) return null;
  const node = find(blocks, element.dataset.frId ?? '');
  return node?.type === 'fresco/image' ? { node, element } : null;
}

/** Inserts the elements of uploaded files at a place: at the top, inside one new container. */
export function insertImages(store: Store, uploaded: EditorMedia[], place: Place): void {
  if (!uploaded.length) return;
  const nodes = uploaded.map(imageNode);
  if (place.parent === null) {
    const wrapper = create('fresco/container')!;
    wrapper.children = nodes;
    store.actions.insertNodes([wrapper], place);
  } else {
    store.actions.insertNodes(nodes, place);
  }
  store.actions.select(nodes[0]!.id);
}

/**
 * Listens for files dragged over the canvas's document. Returns the cleanup.
 */
export function attachFileDrop(
  doc: Document,
  root: HTMLElement,
  store: Store,
  options: {
    upload: (file: File) => Promise<EditorMedia>;
    notify: (text: string, kind?: 'info' | 'success' | 'error') => void;
    /** The canvas's drop line (a box around an Image element to replace). */
    showDropLine: (
      box: { x: number; y: number; width: number; height: number; box?: boolean } | null,
    ) => void;
  },
): () => void {
  const { upload, notify, showDropLine } = options;
  let target: FileDrop | null = null;
  const decide = (x: number, y: number): FileDrop | null => {
    const state = store.get();
    const scroll = { x: doc.defaultView?.scrollX ?? 0, y: doc.defaultView?.scrollY ?? 0 };
    const image = imageAt(doc, root, state.blocks, x, y);
    if (image) {
      const r = image.element.getBoundingClientRect();
      showDropLine({
        x: r.left + scroll.x,
        y: r.top + scroll.y,
        width: r.width,
        height: r.height,
        box: true,
      });
      return { kind: 'replace', id: image.node.id };
    }
    // Only images can be replaced by a user who may change contents only.
    if (state.contentOnly) {
      showDropLine(null);
      return null;
    }
    const drop = dropTarget(doc, root, state.blocks, x, y, null, 'fresco/image');
    showDropLine(drop ? { ...drop.line, ...(drop.empty ? { box: true } : {}) } : null);
    return drop ? { kind: 'insert', place: drop.place } : null;
  };
  const over = (event: DragEvent) => {
    if (!hasFiles(event.dataTransfer)) return;
    // Never opened by the browser in the canvas, even where it cannot be dropped.
    event.preventDefault();
    if (store.get().readOnly) {
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
      return;
    }
    target = decide(event.clientX, event.clientY);
    if (event.dataTransfer) event.dataTransfer.dropEffect = target ? 'copy' : 'none';
  };
  const leave = (event: DragEvent) => {
    // Leaving the document (not only one of its elements).
    if (!event.relatedTarget) {
      target = null;
      showDropLine(null);
    }
  };
  const drop = (event: DragEvent) => {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    showDropLine(null);
    const at = target ?? decide(event.clientX, event.clientY);
    showDropLine(null);
    target = null;
    if (!at || store.get().readOnly) return;
    const files = imageFiles(event.dataTransfer?.files ?? []);
    if (!files.length) {
      notify(t('Only images can be dropped onto the page.'), 'error');
      return;
    }
    void (async () => {
      notify(
        files.length === 1
          ? t('Uploading the image…')
          : t('Uploading {count} images…', { count: String(files.length) }),
        'info',
      );
      const uploaded: EditorMedia[] = [];
      let failed = 0;
      for (const file of at.kind === 'replace' ? files.slice(0, 1) : files) {
        try {
          uploaded.push(await upload(file));
        } catch {
          failed++;
        }
      }
      if (failed)
        notify(t('{count} images could not be uploaded.', { count: String(failed) }), 'error');
      if (!uploaded.length) return;
      if (at.kind === 'replace') {
        if (find(store.get().blocks, at.id)) {
          store.actions.setSettings(at.id, { image: mediaValue(uploaded[0]!) });
          store.actions.select(at.id);
        }
      } else {
        insertImages(store, uploaded, at.place);
      }
    })();
  };
  doc.addEventListener('dragover', over);
  doc.addEventListener('dragleave', leave);
  doc.addEventListener('drop', drop);
  return () => {
    doc.removeEventListener('dragover', over);
    doc.removeEventListener('dragleave', leave);
    doc.removeEventListener('drop', drop);
    showDropLine(null);
  };
}
