/**
 * The canvas: the page in the site's own layout (an iframe of the preview in
 * frame mode), with the elements rendered live into its
 * `[data-cx-editor-canvas]` through a React portal, the selection outlines,
 * drop lines and inline text editing.
 */
import {
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
import type { FrescoNode, RenderContext, RenderMediaItem } from '../core/model.js';
import { getElement } from '../core/registry.js';
import { plainText, sanitizeRich } from '../core/sanitize.js';
import { dropTarget, trackPointer, type DropTarget } from './dnd.js';
import { useStore, type Store } from './store.js';
import { find } from './tree.js';

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
.fre-tree:empty::after,.fre-tree>.fre-start{display:flex;align-items:center;justify-content:center;min-height:160px;margin:24px auto;max-width:var(--fr-container-width,1140px);border:2px dashed #94a3b8;border-radius:8px;color:#64748b;font:14px system-ui,sans-serif}
.fre-tree:empty::after{content:'Drag an element here from the panel'}
.fr-empty{display:flex;align-items:center;justify-content:center;min-height:80px;border:1px dashed #94a3b8;border-radius:4px;flex:1 1 auto;width:100%}
.fr-empty::after{content:'+';font:300 28px/1 system-ui,sans-serif;color:#94a3b8}
[data-fr-inline][contenteditable]{outline:none;cursor:text}
.fre-tree a{cursor:default}
.fre-tree .fr-anim{opacity:1!important}
.fre-unknown{padding:12px;border:1px dashed #f59e0b;color:#92400e;font:13px system-ui,sans-serif;background:#fffbeb}
`;

/** What elements need to render in the canvas. */
export interface CanvasContext {
  media: Map<string, RenderMediaItem>;
  locale: string;
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
  return (
    <>
      <link rel="stylesheet" href={`${assetsBase}/fresco.css`} />
      {fonts && <link rel="stylesheet" href={fonts} />}
      <style>{kitCss(kit)}</style>
      <style>{css}</style>
      <style>{FRAME_STYLE}</style>
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
  // Elements edited inline are mounted again after the edit (their DOM was changed by hand).
  const [epoch, setEpoch] = useState<Record<string, number>>({});
  const renderContext: RenderContext = {
    media: context.media,
    locale: context.locale,
    editing: true,
    site: { title: '', tagline: '', home: '/' },
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
      const finish = () => {
        field.removeEventListener('blur', finish);
        field.removeEventListener('keydown', keys);
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
    [readOnly, store],
  );

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest('[contenteditable]')) return;
    const element = elementAt(event.target);
    if (!element) return;
    // Links and buttons of the page do nothing while editing.
    event.preventDefault();
    store.actions.select(element.dataset.frId!);
  };

  return (
    <div
      className="fre-tree"
      onPointerDown={onPointerDown}
      onClick={(event) => {
        if (!(event.target as Element).closest('[contenteditable]')) event.preventDefault();
      }}
      onDoubleClick={(event) => {
        const field = (event.target as Element).closest<HTMLElement>('[data-fr-inline]');
        const element = elementAt(event.target);
        if (field && element && element.contains(field)) startInline(element, field);
      }}
      onMouseOver={(event) => store.actions.hover(elementAt(event.target)?.dataset.frId ?? null)}
      onMouseLeave={() => store.actions.hover(null)}
      onContextMenu={(event) => {
        const element = elementAt(event.target);
        if (!element) return;
        event.preventDefault();
        const rect = frame.current!.getBoundingClientRect();
        store.actions.select(element.dataset.frId!);
        onContextMenu(element.dataset.frId!, {
          x: rect.left + event.clientX,
          y: rect.top + event.clientY,
        });
      }}
    >
      {blocks.map((node) => (
        <NodeView
          key={`${node.id}:${epoch[node.id] ?? 0}`}
          node={node}
          context={renderContext}
          epoch={epoch}
        />
      ))}
    </div>
  );
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

/** The current drop line, shared by the canvas overlay and the drag code. */
let dropLine: { set: (box: Box | null) => void } = { set: () => {} };

export function showDropLine(box: Box | null): void {
  dropLine.set(box);
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
  const [boxes, setBoxes] = useState<{ selected: Box | null; hovered: Box | null }>({
    selected: null,
    hovered: null,
  });
  const [line, setLine] = useState<Box | null>(null);

  useLayoutEffect(() => {
    dropLine = { set: setLine };
    return () => {
      dropLine = { set: () => {} };
    };
  }, []);

  // Positions follow layout changes, scrolling and resizing: measured every frame.
  useEffect(() => {
    let raf = 0;
    const win = doc.defaultView!;
    const measure = (id: string | null): Box | null => {
      if (!id) return null;
      const element = doc.querySelector(`[data-fr-id="${CSS.escape(id)}"]`);
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: r.left + win.scrollX, y: r.top + win.scrollY, width: r.width, height: r.height };
    };
    const same = (a: Box | null, b: Box | null) =>
      a === b ||
      (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);
    const tick = () => {
      const next = {
        selected: measure(selected),
        hovered: hovered !== selected ? measure(hovered) : null,
      };
      setBoxes((prev) =>
        same(prev.selected, next.selected) && same(prev.hovered, next.hovered) ? prev : next,
      );
      raf = win.requestAnimationFrame(tick);
    };
    tick();
    return () => win.cancelAnimationFrame(raf);
  }, [doc, selected, hovered, blocks]);

  const node = selected ? find(blocks, selected) : null;
  const definition = node ? getElement(node.type) : null;
  const color = definition?.container ? CONTAINER : ACCENT;

  const startMove = (event: React.PointerEvent) => {
    if (!node || !frame.current || readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    startDrag(event, frame.current, store, {
      kind: 'move',
      id: node.id,
      label: definition?.title ?? node.type,
    });
  };

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, zIndex: 2147483000 }}>
      {boxes.hovered && (
        <div
          style={{
            position: 'absolute',
            left: boxes.hovered.x,
            top: boxes.hovered.y,
            width: boxes.hovered.width,
            height: boxes.hovered.height,
            outline: `1px dashed ${CONTAINER}`,
            pointerEvents: 'none',
          }}
        />
      )}
      {boxes.selected && node && (
        <>
          <div
            style={{
              position: 'absolute',
              left: boxes.selected.x,
              top: boxes.selected.y,
              width: boxes.selected.width,
              height: boxes.selected.height,
              outline: `2px solid ${color}`,
              outlineOffset: -1,
              pointerEvents: 'none',
            }}
          />
          {!readOnly && (
            <div
              style={{
                position: 'absolute',
                left: boxes.selected.x,
                top: Math.max(0, boxes.selected.y - 24),
                display: 'flex',
                height: 24,
                background: color,
                color: '#fff',
                font: '500 12px/24px system-ui, sans-serif',
                borderRadius: '4px 4px 0 0',
                overflow: 'hidden',
                pointerEvents: 'auto',
                userSelect: 'none',
              }}
            >
              <span
                title="Drag to move"
                onPointerDown={startMove}
                style={{
                  padding: '0 8px',
                  cursor: 'grab',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden="true"
                >
                  <path d="M9 5h.01 M15 5h.01 M9 12h.01 M15 12h.01 M9 19h.01 M15 19h.01" />
                </svg>
                {definition?.title ?? node.type}
              </span>
              <HandleButton
                title="Duplicate"
                path="M8 8h12v12H8z M4 16V4h12"
                onClick={() => store.actions.duplicate(node.id)}
              />
              <HandleButton
                title="Delete"
                path="M5 7h14 M10 7V4h4v3 M7 7l1 13h8l1-13"
                onClick={() => store.actions.remove(node.id)}
              />
            </div>
          )}
        </>
      )}
      {line && (
        <div
          style={{
            position: 'absolute',
            left: line.x,
            top: line.y,
            width: Math.max(line.width, 3),
            height: Math.max(line.height, 3),
            background: ACCENT,
            borderRadius: 2,
            boxShadow: '0 0 0 2px rgba(255,255,255,.8)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
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
      title={title}
      aria-label={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        border: 0,
        background: 'transparent',
        color: '#fff',
        padding: '0 6px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={path} />
      </svg>
    </button>
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
