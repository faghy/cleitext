/**
 * The canvas: the page in the site's own layout (an iframe of the preview in
 * frame mode), with the elements rendered live into its
 * `[data-cx-editor-canvas]` through a React portal, the selection outlines,
 * drop lines and inline text editing.
 */
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { documentCss, withDefaults } from '../core/css.js';
import { googleFontsUrl, kitCss } from '../core/kit.js';
import type { FrescoNode, MenuItem, RenderContext, RenderMediaItem } from '../core/model.js';
import { getElement } from '../core/registry.js';
import { plainText, sanitizeRich } from '../core/sanitize.js';
import { dropTarget, trackPointer, type DropTarget } from './dnd.js';
import { PluginBlockPreview } from './plugin-blocks.js';
import { useStore, type Store } from './store.js';
import { buildStructure, FLEX_PRESETS, GRID_PRESETS, type Preset } from './structures.js';
import { find, placeOf } from './tree.js';
import { t } from '@cleitext/admin-sdk';

export interface CanvasApi {
  frame: HTMLIFrameElement | null;
  doc: Document | null;
  root: HTMLElement | null;
}

/** Widths of the device previews (never wider than the kit's breakpoints). */
function frameWidth(device: string, breakpoints: { tablet: number; mobile: number }): string {
  if (device === 'tablet') return `${Math.min(768, breakpoints.tablet)}px`;
  if (device === 'mobile') return `${Math.min(375, breakpoints.mobile)}px`;
  return '100%';
}

const FRAME_STYLE = `
.fre-tree{min-height:120px}
.fr-empty{display:flex;align-items:center;justify-content:center;min-height:80px;border:1px dashed #9da5ae;border-radius:3px;flex:1 1 auto;width:100%;cursor:pointer}
.fr-empty::after{content:'+';display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#e6e8ea;font:400 20px/1 system-ui,sans-serif;color:#515962}
.fr-empty:hover::after{background:#c2410c;color:#fff}
.fre-overlay{position:absolute;left:0;top:0;width:0;height:0;z-index:2147483000;font:13px/1 system-ui,sans-serif}
.fre-outline{position:absolute;pointer-events:none;outline-offset:-1px}
.fre-dropline{position:absolute;background:#c2410c;border-radius:3px;box-shadow:0 0 0 2px rgba(255,255,255,.8);pointer-events:none;animation:fre-grow .15s ease-out}
@keyframes fre-grow{from{opacity:.2;transform:scale(.6)}}
.fre-handle{position:absolute;display:flex;align-items:stretch;height:24px;color:#fff;pointer-events:auto;user-select:none;white-space:nowrap}
.fre-handle--section{transform:translateX(-50%);background:#0e7490;border-radius:5px 5px 0 0;padding:0 2px}
.fre-handle--section::before,.fre-handle--section::after{content:'';position:absolute;bottom:0;border-bottom:24px solid #0e7490}
.fre-handle--section::before{left:-11px;border-left:12px solid transparent}
.fre-handle--section::after{right:-11px;border-right:12px solid transparent}
.fre-handle--nested{background:#818a96;border-radius:0 0 3px 0;overflow:hidden;max-width:24px;transition:max-width .2s}
.fre-handle--nested:hover{max-width:120px}
.fre-handle--widget{transform:translateX(-100%);background:#c2410c;border-radius:0 0 0 3px}
.fre-handle__btn,.fre-handle__grip{display:inline-flex;align-items:center;justify-content:center;flex:0 0 24px;width:24px;padding:0;border:0;background:none;color:inherit;cursor:pointer}
.fre-handle__grip{cursor:grab}
.fre-handle__btn:hover,.fre-handle__grip:hover{background:rgba(0,0,0,.18)}
.fre-handle--widget .fre-handle__grip{width:26px}
.fre-add{margin:24px auto;max-width:min(1160px,calc(100% - 40px));font:13px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;color:#515962}
.fre-add>div{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:150px;padding:40px 20px;border:2px dashed #d5d8dc;background:rgba(255,255,255,.6);text-align:center}
.fre-add__start{flex-direction:row!important;flex-wrap:wrap}
.fre-add__start p{flex-basis:100%;margin:6px 0 0;font-style:italic;color:#818a96}
.fre-add__round{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;margin:0 5px;border:0;border-radius:50%;background:#515962;color:#fff;cursor:pointer;transition:transform .15s}
.fre-add__round--add{background:#c2410c}
.fre-add__round:hover{transform:scale(1.08)}
.fre-add__round svg{width:18px;height:18px}
.fre-add__title{margin:0 0 6px;font-size:15px;font-weight:600;color:#0c0d0e}
.fre-add__kinds{display:flex;gap:20px}
.fre-add__kinds button{display:flex;flex-direction:column;align-items:center;gap:8px;padding:0;border:0;background:none;color:#515962;cursor:pointer;font:inherit}
.fre-add__kind{display:flex;gap:4px;width:90px;height:60px;padding:6px;border:2px solid #d5d8dc;border-radius:3px;background:#fff}
.fre-add__kinds button:hover .fre-add__kind{border-color:#c2410c}
.fre-add__kind i{flex:1;background:#d5d8dc;border-radius:2px}
.fre-add__kind--grid{display:grid;grid-template-columns:1fr 1fr}
.fre-add__grid{display:grid;grid-template-columns:repeat(3,110px);gap:14px}
.fre-add__preset{display:flex;gap:3px;height:52px;padding:4px;border:2px solid #d5d8dc;border-radius:3px;background:#fff;cursor:pointer}
.fre-add__preset:hover{border-color:#c2410c}
.fre-add__preset i{flex:1 1 0;background:#d5d8dc;border-radius:2px}
.fre-add__preset:has(style){display:grid}
.fre-add__back,.fre-add__close{position:absolute;top:10px;border:0;background:none;color:#818a96;cursor:pointer;font:inherit}
.fre-add__back{left:14px}
.fre-add__close{right:14px;font-size:20px;line-height:1}
.fre-pen{position:absolute;z-index:2147483001;display:flex;padding:0 4px;border-radius:3px;background:#1f2124;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.fre-pen::after{content:'';position:absolute;left:18px;bottom:-6px;border:6px solid transparent;border-bottom:0;border-top-color:#1f2124}
.fre-pen button{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border:0;background:none;color:#e6e8ea;cursor:pointer}
.fre-pen button:hover{color:#fff;background:#3f444b}
[data-fr-inline][contenteditable]{outline:none;cursor:text}
.fre-tree a{cursor:default}
.fre-tree .fr-anim{opacity:1!important}
.fre-unknown{padding:12px;border:1px dashed #f59e0b;color:#92400e;font:13px system-ui,sans-serif;background:#fffbeb}
`;

/** What elements need to render in the canvas. */
export interface CanvasContext {
  media: Map<string, RenderMediaItem>;
  locale: string;
  menus: Record<string, MenuItem[]>;
}

const NodeView = memo(function NodeView({
  node,
  context,
  epoch,
}: {
  node: FrescoNode;
  context: RenderContext;
  epoch: Record<string, number>;
}): ReactNode {
  const definition = getElement(node.type);
  if (!definition) {
    return (
      <div className="fre-unknown" data-fr-id={node.id}>
        {`Unavailable element (${node.type}): its plugin is not active.`}
      </div>
    );
  }
  const children = node.children?.map((child) => (
    <NodeView
      key={`${child.id}:${epoch[child.id] ?? 0}`}
      node={child}
      context={context}
      epoch={epoch}
    />
  ));
  try {
    return definition.render({
      node,
      settings: withDefaults(definition, node.attrs),
      children,
      context,
    });
  } catch (error) {
    return (
      <div className="fre-unknown" data-fr-id={node.id}>
        {`${definition.title}: ${String(error)}`}
      </div>
    );
  }
});

export function Canvas({
  store,
  frameUrl,
  assetsBase,
  context,
  onContextMenu,
  api,
}: {
  store: Store;
  frameUrl: () => Promise<string>;
  /** `/plugin-assets/fresco/<version>`. */
  assetsBase: string;
  context: CanvasContext;
  onContextMenu: (id: string, position: { x: number; y: number }) => void;
  api: React.MutableRefObject<CanvasApi>;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mount, setMount] = useState<{ doc: Document; root: HTMLElement } | null>(null);
  const device = useStore(store, (s) => s.device);
  const breakpoints = useStore(store, (s) => s.kit.breakpoints);

  // The frame's address is asked once: the host passes a new function on every render.
  const frameUrlRef = useRef(frameUrl);
  useEffect(() => {
    let cancelled = false;
    frameUrlRef
      .current()
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onLoad = () => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    let root = doc.querySelector<HTMLElement>('[data-cx-editor-canvas]');
    if (!root) {
      // A theme without the canvas element: the content goes at the end of <main>, or of <body>.
      root = doc.createElement('div');
      (doc.querySelector('main') ?? doc.body).append(root);
    }
    root.replaceChildren();
    doc.documentElement.classList.add('fr-editing');
    api.current = { frame: frameRef.current, doc, root };
    setMount({ doc, root });
  };

  return (
    <div className="fre-canvas">
      {error && <p className="fre-error">{error}</p>}
      <div className="fre-frame" style={{ width: frameWidth(device, breakpoints) }}>
        {src && (
          <iframe ref={frameRef} src={src} title="Page" onLoad={onLoad} className="fre-iframe" />
        )}
      </div>
      {mount && createPortal(<FrameHead store={store} assetsBase={assetsBase} />, mount.doc.head)}
      {mount &&
        createPortal(
          <FrameTree
            store={store}
            doc={mount.doc}
            root={mount.root}
            context={context}
            onContextMenu={onContextMenu}
            frame={frameRef}
          />,
          mount.root,
        )}
      {mount &&
        createPortal(<Overlay store={store} doc={mount.doc} frame={frameRef} />, mount.doc.body)}
    </div>
  );
}

/** Styles inside the canvas: Fresco's, the kit's and the page's own, live. */
function FrameHead({ store, assetsBase }: { store: Store; assetsBase: string }) {
  const kit = useStore(store, (s) => s.kit);
  const blocks = useStore(store, (s) => s.blocks);
  const fonts = googleFontsUrl(kit);
  const css = documentCss(blocks, getElement, kit.breakpoints);
  const hidden = useStore(store, (s) => s.hidden);
  const hiddenCss = Object.keys(hidden)
    .map((id) => `[data-fr-id="${CSS.escape(id)}"]{display:none!important}`)
    .join('');
  return (
    <>
      <link rel="stylesheet" href={`${assetsBase}/fresco.css`} />
      {fonts && <link rel="stylesheet" href={fonts} />}
      <style>{kitCss(kit)}</style>
      <style>{css}</style>
      <style>{FRAME_STYLE}</style>
      {hiddenCss && <style>{hiddenCss}</style>}
    </>
  );
}

function FrameTree({
  store,
  doc,
  context,
  onContextMenu,
  frame,
}: {
  store: Store;
  doc: Document;
  root: HTMLElement;
  context: CanvasContext;
  onContextMenu: (id: string, position: { x: number; y: number }) => void;
  frame: React.RefObject<HTMLIFrameElement | null>;
}) {
  const blocks = useStore(store, (s) => s.blocks);
  const readOnly = useStore(store, (s) => s.readOnly);
  const active = useStore(store, (s) => s.active);
  const adding = useStore(store, (s) => s.adding);
  // Elements edited inline are mounted again after the edit (their DOM was changed by hand).
  const [epoch, setEpoch] = useState<Record<string, number>>({});
  const entry = useStore(store, (s) => s.entry);
  const renderContext: RenderContext = {
    media: context.media,
    locale: context.locale,
    menus: context.menus,
    editing: true,
    site: { title: '', tagline: '', home: '/' },
    ui: { active: (id) => active[id] },
    pluginBlock: (block) => <PluginBlockPreview block={block} entry={entry} />,
  };

  const elementAt = (target: EventTarget | null) =>
    target instanceof doc.defaultView!.Element ? target.closest<HTMLElement>('[data-fr-id]') : null;

  const startInline = useCallback(
    (element: HTMLElement, field: HTMLElement) => {
      if (readOnly) return;
      const id = element.dataset.frId!;
      const key = field.dataset.frInline!;
      const node = find(store.get().blocks, id);
      const definition = node && getElement(node.type);
      const control = definition?.controls.find((c) => c.name === key);
      if (!node || !control) return;
      const rich = control.type === 'richtext';
      field.contentEditable = rich ? 'true' : 'plaintext-only';
      field.focus();
      const toolbar = rich ? formatBar(doc, field) : null;
      const finish = () => {
        field.removeEventListener('blur', finish);
        field.removeEventListener('keydown', keys);
        toolbar?.remove();
        const value = rich ? sanitizeRich(field.innerHTML) : field.innerText.replace(/\n+$/, '');
        field.removeAttribute('contenteditable');
        if (
          value !==
          (rich
            ? sanitizeRich(node.attrs[key])
            : plainText(node.attrs[key] ?? withDefaults(definition!, node.attrs)[key]))
        ) {
          store.actions.setSettings(id, { [key]: value });
        }
        setEpoch((e) => ({ ...e, [id]: (e[id] ?? 0) + 1 }));
      };
      const keys = (event: KeyboardEvent) => {
        if (event.key === 'Escape' || (event.key === 'Enter' && !rich && control.type === 'text')) {
          event.preventDefault();
          field.blur();
        }
      };
      field.addEventListener('blur', finish);
      field.addEventListener('keydown', keys);
    },
    [readOnly, store, doc],
  );

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest('[contenteditable]') || target.closest('[data-fre-ui]')) return;
    // The + of an empty container: the elements panel, to fill it.
    if (target.closest('.fr-empty')) {
      const holder = elementAt(event.target);
      event.preventDefault();
      if (holder) store.actions.select(holder.dataset.frId!);
      store.actions.setView('elements');
      return;
    }
    const element = elementAt(event.target);
    if (!element) return;
    // Links and buttons of the page do nothing while editing.
    event.preventDefault();
    // Titles of tabs and accordions switch the item shown.
    const tab = target.closest<HTMLElement>('[data-fr-tab]');
    if (tab && element.contains(tab)) {
      const index = Number(tab.dataset.frTab);
      const id = element.dataset.frId!;
      const current = store.get().active[id];
      store.actions.setActive(id, tab.tagName === 'SUMMARY' && current === index ? -1 : index);
    }
    store.actions.select(element.dataset.frId!);
  };

  return (
    <div
      className="fre-tree"
      onPointerDown={onPointerDown}
      onClick={(event) => {
        const target = event.target as Element;
        if (target.closest('[contenteditable]')) return;
        event.preventDefault();
        // Texts are edited where they are, with one click (as in other builders).
        const field = target.closest<HTMLElement>('[data-fr-inline]');
        const element = elementAt(event.target);
        if (field && element && element.contains(field) && !target.closest('[data-fr-tab]')) {
          startInline(element, field);
        }
      }}
      onDoubleClick={(event) => {
        const field = (event.target as Element).closest<HTMLElement>('[data-fr-inline]');
        const element = elementAt(event.target);
        if (field && element && element.contains(field)) startInline(element, field);
      }}
      onMouseOver={(event) => store.actions.hover(elementAt(event.target)?.dataset.frId ?? null)}
      onMouseLeave={() => store.actions.hover(null)}
      onContextMenu={(event) => {
        if ((event.target as Element).closest('[contenteditable]')) return;
        const element = elementAt(event.target);
        event.preventDefault();
        const rect = frame.current!.getBoundingClientRect();
        // On an element its menu; elsewhere the page's (paste, delete all).
        if (element) store.actions.select(element.dataset.frId!);
        onContextMenu(element?.dataset.frId ?? '', {
          x: rect.left + event.clientX,
          y: rect.top + event.clientY,
        });
      }}
    >
      {blocks.map((node, index) => (
        <Fragment key={`${node.id}:${epoch[node.id] ?? 0}`}>
          {adding?.index === index && !readOnly && <AddArea store={store} index={index} />}
          <NodeView node={node} context={renderContext} epoch={epoch} />
        </Fragment>
      ))}
      {!readOnly && <AddArea store={store} index={blocks.length} />}
    </div>
  );
}

// ---- Formatting bar of rich texts edited in place ---------------------------------------------

const FORMATS: { command: string; title: string; path: string; value?: () => string | null }[] = [
  {
    command: 'bold',
    title: 'Bold',
    path: 'M7 5h6a3.5 3.5 0 0 1 0 7H7z M7 12h7a3.5 3.5 0 0 1 0 7H7z',
  },
  { command: 'italic', title: 'Italic', path: 'M11 5h6 M7 19h6 M14 5l-4 14' },
  { command: 'underline', title: 'Underline', path: 'M7 5v6a5 5 0 0 0 10 0V5 M5 20h14' },
  {
    command: 'strikeThrough',
    title: 'Strikethrough',
    path: 'M5 12h14 M16 6.5A4 4 0 0 0 12 5c-2.2 0-4 1.3-4 3 0 3.5 8 2.5 8 7 0 1.8-1.8 3-4 3a4.5 4.5 0 0 1-4.3-2.5',
  },
  {
    command: 'insertUnorderedList',
    title: 'Bulleted list',
    path: 'M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01',
  },
  {
    command: 'insertOrderedList',
    title: 'Numbered list',
    path: 'M10 6h10 M10 12h10 M10 18h10 M4 5l1-1v4 M4 14h2l-2 2.5h2',
  },
  {
    command: 'createLink',
    title: 'Link',
    path: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    value: () => window.prompt(t('Link address'), 'https://'),
  },
  {
    command: 'unlink',
    title: 'Remove link',
    path: 'M10 14a4 4 0 0 0 5.7 0l1-1 M14 10a4 4 0 0 0-5.7 0l-1 1 M4 4l16 16',
  },
  {
    command: 'removeFormat',
    title: 'Clear formatting',
    path: 'M6 5h12 M10 5l-3 14 M14 5l-1 5 M15 15l5 5 M20 15l-5 5',
  },
];

/** A dark bar above a rich text being edited: bold, italic, lists, links. */
function formatBar(doc: Document, field: HTMLElement): HTMLElement {
  const bar = doc.createElement('div');
  bar.className = 'fre-pen';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('data-fre-ui', '');
  for (const format of FORMATS) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.title = t(format.title);
    button.setAttribute('aria-label', t(format.title));
    button.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${format.path}"/></svg>`;
    // Keeps the text focused and its selection.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      const value = format.value ? format.value() : null;
      if (format.value && !value) return;
      doc.execCommand(format.command, false, value ?? undefined);
      field.focus();
    });
    bar.append(button);
  }
  doc.body.append(bar);
  const place = () => {
    const r = field.getBoundingClientRect();
    const win = doc.defaultView!;
    bar.style.left = `${Math.max(4, r.left + win.scrollX)}px`;
    bar.style.top = `${Math.max(4, r.top + win.scrollY - bar.offsetHeight - 8)}px`;
  };
  place();
  field.addEventListener('input', place);
  return bar;
}

// ---- Overlay: outlines, handles, drop line ------------------------------------------------

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ACCENT = '#c2410c';
const CONTAINER = '#0e7490';
const NESTED = '#818a96';

/** The current drop line, shared by the canvas overlay and the drag code. */
let dropLine: { set: (box: Box | null) => void } = { set: () => {} };

export function showDropLine(box: Box | null): void {
  dropLine.set(box);
}

const ICON = {
  add: 'M12 5v14 M5 12h14',
  grip: 'M9 5h.01 M15 5h.01 M9 12h.01 M15 12h.01 M9 19h.01 M15 19h.01',
  edit: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z',
  duplicate: 'M8 8h12v12H8z M4 16V4h12',
  remove: 'M6 6l12 12 M18 6L6 18',
  folder: 'M3 6h6l2 2h10v11H3z',
};

type Kind = 'section' | 'nested' | 'widget';

/** Which handles an element shows, from its place in the page. */
function kindOf(blocks: FrescoNode[], id: string): Kind {
  const node = find(blocks, id);
  if (!node || !getElement(node.type)?.container) return 'widget';
  return blocks.some((b) => b.id === id) ? 'section' : 'nested';
}

/** The top-level container holding an element. */
function sectionOf(blocks: FrescoNode[], id: string): string | null {
  for (const block of blocks) if (block.id === id || find([block], id)) return block.id;
  return null;
}

function Overlay({
  store,
  doc,
  frame,
}: {
  store: Store;
  doc: Document;
  frame: React.RefObject<HTMLIFrameElement | null>;
}) {
  const selected = useStore(store, (s) => s.selected);
  const hovered = useStore(store, (s) => s.hovered);
  const blocks = useStore(store, (s) => s.blocks);
  const readOnly = useStore(store, (s) => s.readOnly);
  const [line, setLine] = useState<Box | null>(null);
  // The element under the pointer stays "hovered" while the pointer is on its handle.
  const [shown, setShown] = useState<string | null>(null);
  const onHandle = useRef(false);
  const leave = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(leave.current);
    if (hovered) setShown(hovered);
    else
      leave.current = setTimeout(() => {
        if (!onHandle.current) setShown(null);
      }, 350);
  }, [hovered]);

  useLayoutEffect(() => {
    dropLine = { set: setLine };
    return () => {
      dropLine = { set: () => {} };
    };
  }, []);

  // What gets an outline and a handle: the element under the pointer and its section, and the selection.
  const ids = [
    ...new Set(
      [selected, shown, shown ? sectionOf(blocks, shown) : null].filter((id): id is string => !!id),
    ),
  ];
  const boxes = useBoxes(doc, ids, blocks);

  const startMove = (event: React.PointerEvent, id: string) => {
    const node = find(blocks, id);
    if (!node || !frame.current || readOnly || event.button !== 0) return;
    event.stopPropagation();
    startDrag(event, frame.current, store, {
      kind: 'move',
      id,
      label: t(getElement(node.type)?.title ?? node.type),
    });
  };
  const handleProps = {
    onMouseEnter: () => {
      onHandle.current = true;
      clearTimeout(leave.current);
    },
    onMouseLeave: () => {
      onHandle.current = false;
      leave.current = setTimeout(() => setShown(store.get().hovered), 250);
    },
  };

  return (
    <div className="fre-overlay">
      {ids.map((id) => {
        const box = boxes[id];
        const node = find(blocks, id);
        if (!box || !node) return null;
        const kind = kindOf(blocks, id);
        const isSelected = id === selected;
        const color = kind === 'section' ? CONTAINER : kind === 'nested' ? NESTED : ACCENT;
        const title = t(getElement(node.type)?.title ?? node.type);
        const place = placeOf(blocks, id);
        return (
          <Fragment key={id}>
            <div
              className="fre-outline"
              style={{
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
                outline: `${isSelected ? 2 : 1}px ${kind === 'nested' && !isSelected ? 'dashed' : 'solid'} ${color}`,
              }}
            />
            {!readOnly && kind === 'section' && (
              <div
                className="fre-handle fre-handle--section"
                style={{ left: box.x + box.width / 2, top: Math.max(0, box.y - 24) }}
                {...handleProps}
              >
                <HandleButton
                  title={t('Add container')}
                  path={ICON.add}
                  onClick={() =>
                    store.actions.setAdding({ index: place?.index ?? 0, step: 'choose' })
                  }
                />
                <span
                  className="fre-handle__grip"
                  title={t('Edit {element}', { element: title }) + ' · ' + t('Drag to move')}
                  onPointerDown={(e) => startMove(e, id)}
                  onClick={() => store.actions.select(id)}
                >
                  <Svg path={ICON.grip} />
                </span>
                <HandleButton
                  title={t('Duplicate')}
                  path={ICON.duplicate}
                  onClick={() => store.actions.duplicate(id)}
                />
                <HandleButton
                  title={t('Delete')}
                  path={ICON.remove}
                  onClick={() => store.actions.remove(id)}
                />
              </div>
            )}
            {!readOnly && kind === 'nested' && (
              <div
                className="fre-handle fre-handle--nested"
                style={{ left: box.x, top: box.y }}
                {...handleProps}
              >
                <span
                  className="fre-handle__grip"
                  title={t('Edit {element}', { element: title }) + ' · ' + t('Drag to move')}
                  onPointerDown={(e) => startMove(e, id)}
                  onClick={() => store.actions.select(id)}
                >
                  <Svg path={ICON.grip} />
                </span>
                <HandleButton
                  title={t('Duplicate')}
                  path={ICON.duplicate}
                  onClick={() => store.actions.duplicate(id)}
                />
                <HandleButton
                  title={t('Delete')}
                  path={ICON.remove}
                  onClick={() => store.actions.remove(id)}
                />
              </div>
            )}
            {!readOnly && kind === 'widget' && (
              <div
                className="fre-handle fre-handle--widget"
                style={{ left: box.x + box.width, top: box.y }}
                {...handleProps}
              >
                <span
                  className="fre-handle__grip"
                  title={t('Edit {element}', { element: title }) + ' · ' + t('Drag to move')}
                  onPointerDown={(e) => startMove(e, id)}
                  onClick={() => store.actions.select(id)}
                >
                  <Svg path={ICON.edit} />
                </span>
              </div>
            )}
          </Fragment>
        );
      })}
      {line && (
        <div
          className="fre-dropline"
          style={{
            left: line.x,
            top: line.y,
            width: Math.max(line.width, 4),
            height: Math.max(line.height, 4),
          }}
        />
      )}
    </div>
  );
}

/** Boxes of elements in the frame's coordinates, measured every frame (layout, scroll, resize). */
function useBoxes(doc: Document, ids: string[], blocks: FrescoNode[]): Record<string, Box> {
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const key = ids.join(',');
  useEffect(() => {
    let raf = 0;
    const win = doc.defaultView!;
    const tick = () => {
      const next: Record<string, Box> = {};
      for (const id of key ? key.split(',') : []) {
        const element = doc.querySelector(`[data-fr-id="${CSS.escape(id)}"]`);
        if (!element) continue;
        const r = element.getBoundingClientRect();
        next[id] = {
          x: r.left + win.scrollX,
          y: r.top + win.scrollY,
          width: r.width,
          height: r.height,
        };
      }
      setBoxes((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      raf = win.requestAnimationFrame(tick);
    };
    tick();
    return () => win.cancelAnimationFrame(raf);
  }, [doc, key, blocks]);
  return boxes;
}

function Svg({ path }: { path: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

function HandleButton({
  title,
  path,
  onClick,
}: {
  title: string;
  path: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="fre-handle__btn"
      title={title}
      aria-label={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Svg path={path} />
    </button>
  );
}

// ---- The "add" area -----------------------------------------------------------------------

/** At the end of the page (and above a container, from its +): new containers and templates. */
function AddArea({ store, index }: { store: Store; index: number }) {
  const adding = useStore(store, (s) => s.adding);
  const open = adding?.index === index ? adding : null;
  const insert = (preset: Preset) => {
    const node = buildStructure(preset);
    if (!node) return;
    store.actions.insertNodes([node], { parent: null, index });
    store.actions.setAdding(null);
    // The first column (or the container) waits for elements.
    store.actions.select(node.children?.[0]?.id ?? node.id);
    store.actions.setView('elements');
  };
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  return (
    <div className="fre-add" onPointerDown={stop} onClick={stop} data-fre-ui="">
      {open && open.step !== 'choose' ? (
        <div className="fre-add__presets">
          <button
            type="button"
            className="fre-add__back"
            onClick={() => store.actions.setAdding({ index, step: 'choose' })}
          >
            ‹ {t('Back')}
          </button>
          <p className="fre-add__title">{t('Select your structure')}</p>
          <div className="fre-add__grid">
            {(open.step === 'flex' ? FLEX_PRESETS : GRID_PRESETS).map((preset, i) => (
              <button
                key={i}
                type="button"
                className="fre-add__preset"
                title={
                  preset.kind === 'flex'
                    ? preset.columns.map((c) => `${Math.round(c)}%`).join(' + ')
                    : `${preset.columns} × ${preset.rows}`
                }
                onClick={() => insert(preset)}
              >
                {preset.kind === 'flex'
                  ? preset.columns.map((c, j) => <i key={j} style={{ flexGrow: c }} />)
                  : Array.from({ length: preset.columns * preset.rows }, (_, j) => <i key={j} />)}
                {preset.kind === 'grid' && (
                  <style>{`.fre-add__preset:nth-child(${i + 1}){grid-template-columns:repeat(${preset.columns},1fr)}`}</style>
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="fre-add__close"
            onClick={() => store.actions.setAdding(null)}
          >
            ×
          </button>
        </div>
      ) : open ? (
        <div className="fre-add__choose">
          <p className="fre-add__title">{t('Which layout would you like to use?')}</p>
          <div className="fre-add__kinds">
            <button type="button" onClick={() => store.actions.setAdding({ index, step: 'flex' })}>
              <span className="fre-add__kind fre-add__kind--flex">
                <i />
                <i />
              </span>
              {t('Flexbox')}
            </button>
            <button type="button" onClick={() => store.actions.setAdding({ index, step: 'grid' })}>
              <span className="fre-add__kind fre-add__kind--grid">
                <i />
                <i />
                <i />
                <i />
              </span>
              {t('Grid')}
            </button>
          </div>
          <button
            type="button"
            className="fre-add__close"
            onClick={() => store.actions.setAdding(null)}
          >
            ×
          </button>
        </div>
      ) : (
        <div className="fre-add__start">
          <button
            type="button"
            className="fre-add__round fre-add__round--add"
            title={t('Add new container')}
            aria-label={t('Add new container')}
            onClick={() => store.actions.setAdding({ index, step: 'choose' })}
          >
            <Svg path={ICON.add} />
          </button>
          <button
            type="button"
            className="fre-add__round"
            title={t('Add template')}
            aria-label={t('Add template')}
            onClick={() => store.actions.setView('library')}
          >
            <Svg path={ICON.folder} />
          </button>
          <p>{t('Drag widget here')}</p>
        </div>
      )}
    </div>
  );
}

// ---- Dragging ------------------------------------------------------------------------------

/** The label following the pointer during a drag (in the admin's document). */
function ghost(label: string): { move: (x: number, y: number) => void; remove: () => void } {
  const element = document.createElement('div');
  element.className = 'fre-ghost';
  element.textContent = label;
  document.body.append(element);
  return {
    move: (x, y) => {
      element.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
    },
    remove: () => element.remove(),
  };
}

/** Starts dragging a new element (from the panel) or an element of the page. */
export function startDrag(
  event: PointerEvent | React.PointerEvent,
  frame: HTMLIFrameElement,
  store: Store,
  source:
    { kind: 'new'; type: string; label: string } | { kind: 'move'; id: string; label: string },
): void {
  const doc = frame.contentDocument;
  const root = doc?.querySelector<HTMLElement>('[data-cx-editor-canvas]') ?? doc?.body;
  if (!doc || !root) return;
  let label: ReturnType<typeof ghost> | null = null;
  let target: DropTarget | null = null;
  trackPointer(event, frame, {
    onStart: () => {
      label = ghost(source.label);
      doc.documentElement.style.cursor = 'grabbing';
      document.documentElement.style.cursor = 'grabbing';
    },
    onMove: (canvas, screen) => {
      label?.move(screen.x, screen.y);
      target = canvas
        ? dropTarget(
            doc,
            root,
            store.get().blocks,
            canvas.x,
            canvas.y,
            source.kind === 'move' ? source.id : null,
            source.kind === 'new' ? source.type : (find(store.get().blocks, source.id)?.type ?? ''),
          )
        : null;
      showDropLine(target?.line ?? null);
    },
    onDrop: () => {
      finish();
      if (!target) return;
      if (source.kind === 'new') store.actions.add(source.type, target.place);
      else store.actions.move(source.id, target.place);
    },
    onCancel: finish,
  });
  function finish() {
    label?.remove();
    showDropLine(null);
    doc!.documentElement.style.cursor = '';
    document.documentElement.style.cursor = '';
  }
}
