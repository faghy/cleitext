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
import type { EditorMedia } from '@cleitext/admin-sdk';
import { attachFileDrop } from './file-drop.js';
import { disableForeignStyles } from './availability.js';
import { documentCss, withDefaults } from '../core/css.js';
import { kitCss, pageLayout, safeSelector, usedGoogleFonts } from '../core/kit.js';
import { canvasFontLinks, elementsGoogleFonts, renderedGoogleFonts } from './canvas-fonts.js';
import { pageCss } from '../core/page-css.js';
import {
  activeDevices,
  deviceRange,
  type Breakpoints,
  type Device,
  type FrescoNode,
  type MenuItem,
  type RenderContext,
  type Settings,
  type RenderMediaItem,
} from '../core/model.js';
import { getElement } from '../core/registry.js';
import { plainText, sanitizeRich } from '../core/sanitize.js';
import { dropTarget, trackPointer, type DropTarget } from './dnd.js';
import { PluginBlockPreview } from './plugin-blocks.js';
import { useStore, type Store } from './store.js';
import {
  buildStructure,
  columnWidth,
  FLEX_PRESETS,
  GRID_PRESETS,
  type FlexPreset,
  type Preset,
} from './structures.js';
import { find, placeOf } from './tree.js';
import { api as coreApi, t } from '@cleitext/admin-sdk';
import type { BlockPage } from '@cleitext/plugin-sdk';
import { extensions } from '../core/extensions.js';
import { askText, notify } from './dialogs.js';
import { documentKind } from './document-kind.js';
import { CONTENT_ATTRIBUTE, editorKitCss, editorPageCss, hiddenOn } from './frame-css.js';
import {
  inlineChange,
  inlineControl,
  inlineValue,
  markInlineFields,
  parseInlineKey,
  typedText,
} from './inline.js';
import { formatShortcut } from './format-keys.js';
import { BLOCK_FORMATS, currentBlock, isListCommand, listCommand } from './rich-text.js';
import { DEVICE_NAMES } from '../core/common.js';

export interface CanvasApi {
  frame: HTMLIFrameElement | null;
  doc: Document | null;
  root: HTMLElement | null;
}

/**
 * Width of a device preview (px), or null for desktop (the whole canvas):
 * tablet and mobile as common devices (never wider than their breakpoint),
 * the other smaller devices at their breakpoint, widescreen at its start.
 */
export function previewWidth(device: Device, breakpoints: Breakpoints): number | null {
  if (device === 'desktop') return null;
  if (device === 'tablet') return Math.min(768, breakpoints.tablet);
  if (device === 'mobile') return Math.min(375, breakpoints.mobile);
  return breakpoints[device] ?? null;
}

/** The widths a device preview can be dragged to: the device's own range. */
export function previewLimits(
  device: Device,
  breakpoints: Breakpoints,
): { min: number; max: number } {
  const range = deviceRange(device, breakpoints) ?? {};
  const min = range.min ?? 320;
  return { min, max: range.max ?? Math.max(min, 5000) };
}

const FRAME_STYLE = `
[data-cx-editor-canvas],.fre-tree{display:contents}
/* Embeds (videos, maps) take no clicks: a click selects their element, as in other builders. */
.fr-e iframe{pointer-events:none}
.fr-empty{display:flex;align-items:center;justify-content:center;min-height:80px;border:1px dashed #9da5ae;border-radius:3px;flex:1 1 auto;width:100%;cursor:pointer}
.fr-empty::after{content:'+';display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#e6e8ea;font:400 20px/1 system-ui,sans-serif;color:#515962}
.fr-empty:hover::after{background:#c2410c;color:#fff}
.fre-overlay{position:absolute;left:0;top:0;width:0;height:0;z-index:2147483000;font:13px/1 system-ui,sans-serif}
.fre-outline{position:absolute;pointer-events:none;outline-offset:-1px}
.fre-drag-source{opacity:.35}
.fre-dropline{position:absolute;background:#c2410c;border-radius:3px;box-shadow:0 0 0 2px rgba(255,255,255,.8);pointer-events:none;transition:left .08s,top .08s,width .08s,height .08s}
.fre-dropline--box{background:rgba(194,65,12,.08);border:2px dashed #c2410c;box-shadow:none}
.fre-hiddenbadge{position:absolute;padding:3px 7px;border-radius:0 0 3px 0;background:#515962;color:#fff;font:600 11px/1.2 system-ui,sans-serif;pointer-events:none;white-space:nowrap}
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
.fre-add__presets{max-height:none}
.fre-add__preset{display:flex;gap:3px;height:52px;padding:4px;border:2px solid #d5d8dc;border-radius:3px;background:#fff;cursor:pointer}
.fre-add__preset:hover{border-color:#c2410c}
.fre-add__preset i{flex:1 1 0;background:#d5d8dc;border-radius:2px}
.fre-add__preset--cols i,.fre-add__preset--wrap i{flex-grow:0;flex-shrink:0}
.fre-add__preset--wrap{flex-wrap:wrap;align-content:stretch}
.fre-add__preset--wrap i{height:calc(50% - 2px)}
.fre-add__preset--row i,.fre-add__preset--column i{display:flex;align-items:center;justify-content:center;color:#818a96}
.fre-add__preset--split span{display:flex;flex:1 1 0;flex-direction:column;gap:3px}
.fre-add__preset:has(style){display:grid}
.fre-add__back,.fre-add__close{position:absolute;top:10px;border:0;background:none;color:#818a96;cursor:pointer;font:inherit}
.fre-add__back{left:14px}
.fre-add__close{right:14px;font-size:20px;line-height:1}
.fre-pen{position:absolute;z-index:2147483001;display:flex;padding:0 4px;border-radius:3px;background:#1f2124;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.fre-pen::after{content:'';position:absolute;left:18px;bottom:-6px;border:6px solid transparent;border-bottom:0;border-top-color:#1f2124}
.fre-pen button{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border:0;background:none;color:#e6e8ea;cursor:pointer}
.fre-pen button:hover{color:#fff;background:#3f444b}
.fre-pen .fre-pen__format{width:auto;min-width:96px;padding:0 10px;font:600 12px/1 system-ui,sans-serif;justify-content:space-between;border-right:1px solid #3f444b}
.fre-pen__formats{position:absolute;left:0;top:100%;display:flex;flex-direction:column;min-width:150px;padding:4px 0;border-radius:3px;background:#1f2124;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.fre-pen__formats[hidden]{display:none}
.fre-pen .fre-pen__formats button{width:100%;height:30px;justify-content:flex-start;padding:0 12px;font:13px/1 system-ui,sans-serif}
[data-fr-inline][contenteditable]{outline:none;cursor:text}
.fre-tree a{cursor:default}
.fre-tree .fr-anim{opacity:1!important}
[data-fre-title-box]{display:none!important}
html[data-fre-layout="canvas"] .cx-location-header,html[data-fre-layout="canvas"] .cx-location-footer{display:none!important}
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
  frozen,
}: {
  node: FrescoNode;
  context: RenderContext;
  epoch: Record<string, number>;
  /** The element whose text is being typed in place: its markup stays as the user changes it. */
  frozen: string | null;
}): ReactNode {
  const last = useRef<ReactNode>(null);
  if (frozen === node.id && last.current) return last.current;
  last.current = renderNode(node, context, epoch, frozen);
  return last.current;
});

function renderNode(
  node: FrescoNode,
  context: RenderContext,
  epoch: Record<string, number>,
  frozen: string | null,
): ReactNode {
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
      frozen={frozen}
    />
  ));
  try {
    return definition.render({
      node,
      settings: withDefaults(definition, node.attrs),
      children,
      // One node per child, as on the page: tabs and accordions wrap them one by one.
      ...(children ? { items: children } : {}),
      context,
    });
  } catch (error) {
    return (
      <div className="fre-unknown" data-fr-id={node.id}>
        {`${t(definition.title)}: ${String(error)}`}
      </div>
    );
  }
}

export function Canvas({
  store,
  frameUrl,
  assetsBase,
  context,
  onContextMenu,
  api,
  title,
  saved = false,
  upload,
}: {
  store: Store;
  /** Uploads to the media library: image files dropped from the desktop become Image elements. */
  upload?: (file: File) => Promise<EditorMedia>;
  /** The page has no unsaved changes (after a save): the canvas may be drawn again. */
  saved?: boolean;
  /** The entry's title, shown live in the theme's title (renamed from the top bar). */
  title?: string;
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
  // A width dragged by hand in responsive mode, and the zoom; both reset with the device.
  const [custom, setCustom] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setCustom(null);
    // A preview wider than the canvas (widescreen) starts zoomed out to fit.
    const wanted = previewWidth(device, breakpoints);
    const room = (canvasRef.current?.clientWidth ?? 0) - 40;
    setZoom(
      wanted && room > 0 && wanted > room
        ? Math.max(0.25, Math.floor((room / wanted) * 100) / 100)
        : 1,
    );
  }, [device]);
  // A device switched off in the site settings: back to desktop.
  useEffect(() => {
    if (!activeDevices(breakpoints).includes(device)) store.actions.setDevice('desktop');
  }, [breakpoints, device, store]);

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
    // The wrappers take no room (the elements sit in the theme's column, as on
    // the site), from the first layout: WebKit lays the page out before the
    // canvas's style sheet applies.
    root.style.display = 'contents';
    // The theme's element holding the content: the page settings' padding goes there.
    root.parentElement?.setAttribute(CONTENT_ATTRIBUTE, '');
    // Popups never open over the page being edited (older versions of Fresco Pro sent them).
    const popups = doc.querySelectorAll('.cx-location-overlay, .frp-popup');
    if (popups.length) {
      popups.forEach((popup) => popup.remove());
      doc.documentElement.classList.remove('frp-no-scroll');
      doc.defaultView?.scrollTo(0, 0);
    }
    // The site's kit, when the theme's parts drawn by the server use Fresco: its
    // elements hidden on a device stay in the canvas, faded, as with the editor's kit.
    const siteKit = doc.querySelector<HTMLStyleElement>('style#fr-kit');
    if (siteKit?.textContent) siteKit.textContent = editorKitCss(siteKit.textContent);
    doc.documentElement.classList.add('fr-editing');
    // Safe mode: the theme's and other plugins' styles are off (Fresco's stay).
    if (store.get().safeMode) {
      disableForeignStyles(doc);
      doc.documentElement.classList.add('fre-safe-mode');
    }
    api.current = { frame: frameRef.current, doc, root };
    setMount({ doc, root });
  };

  // Image files dropped from the desktop (to the media library, then Image elements).
  const uploadRef = useRef(upload);
  uploadRef.current = upload;
  useEffect(() => {
    if (!mount) return;
    return attachFileDrop(mount.doc, mount.root, store, {
      upload: (file) =>
        uploadRef.current
          ? uploadRef.current(file)
          : Promise.reject(new Error(t('The media library is not available here.'))),
      notify,
      showDropLine,
    });
  }, [mount, store]);

  // The theme's title follows the one typed in the top bar.
  const titleSelector = useStore(store, (s) => s.kit.titleSelector);
  const shownTitle = useRef<string | null>(null);
  useEffect(() => {
    if (!mount || title === undefined) return;
    const before = shownTitle.current;
    shownTitle.current = title;
    if (before === null || before === title) return;
    const heading = themeTitle(mount.doc, titleSelector, before);
    if (heading) heading.textContent = title;
  }, [mount, title, titleSelector]);

  // The page settings the theme reads when it draws the page (title, layout)
  // show at once, before the page is saved and drawn again.
  const page = useStore(store, (s) => s.page);
  const hideTitle = page.hideTitle === true;
  // The page's layout, else the site's default (Site settings → Layout).
  const siteLayout = useStore(store, (s) => s.kit.layout?.pageLayout);
  const layout = pageLayout(page, { layout: siteLayout ? { pageLayout: siteLayout } : undefined });
  useEffect(() => {
    if (!mount) return;
    const { doc } = mount;
    if (layout) doc.documentElement.setAttribute('data-fre-layout', layout);
    else doc.documentElement.removeAttribute('data-fre-layout');
    for (const box of doc.querySelectorAll('[data-fre-title-box]'))
      box.removeAttribute('data-fre-title-box');
    if (!hideTitle) return;
    const heading = themeTitle(doc, titleSelector, null);
    if (heading) titleBox(heading).setAttribute('data-fre-title-box', '');
  }, [mount, hideTitle, layout, titleSelector]);
  // Once saved, the page is drawn again by the theme when those settings changed.
  const drawn = useRef<string | null>(null);
  const shape = JSON.stringify([hideTitle, layout, page.hideFeatured === true]);
  useEffect(() => {
    if (!mount) return;
    if (drawn.current === null) drawn.current = shape;
    else if (saved && drawn.current !== shape) {
      drawn.current = shape;
      mount.doc.defaultView?.location.reload();
    }
  }, [mount, saved, shape]);

  const responsive = device !== 'desktop';
  // Limits of the device being previewed: between the next smaller breakpoint and its own.
  const limits = previewLimits(device, breakpoints);
  const preview = previewWidth(device, breakpoints);
  const width = responsive && custom ? `${custom}px` : preview ? `${preview}px` : '100%';
  const frameBox = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const box = frameBox.current;
    if (!box) return;
    const observer = new ResizeObserver(() => setHeight(Math.round(box.offsetHeight)));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  /** Drags a side of the frame: the width changes on both sides, within the device's limits. */
  const resize = (event: React.PointerEvent, side: 1 | -1) => {
    if (event.button !== 0 || !frameBox.current) return;
    event.preventDefault();
    const start = { x: event.clientX, width: frameBox.current.offsetWidth };
    // The iframe would swallow the pointer while dragging.
    frameBox.current.classList.add('is-resizing');
    const onMove = (e: PointerEvent) => {
      const next = start.width + side * (e.clientX - start.x) * 2;
      setCustom(Math.round(Math.min(limits.max, Math.max(limits.min, next))));
    };
    const onUp = () => {
      frameBox.current?.classList.remove('is-resizing');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div ref={canvasRef} className={`fre-canvas${responsive ? ' is-device' : ''}`}>
      {error && <p className="fre-error">{error}</p>}
      {responsive && (
        <div className="fre-rbar">
          <label>
            <span>W</span>
            <input
              type="number"
              min={limits.min}
              max={limits.max}
              value={custom ?? preview ?? limits.max}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (value) setCustom(Math.min(limits.max, Math.max(limits.min, value)));
              }}
              aria-label={t('Width')}
            />
          </label>
          <label>
            <span>H</span>
            <input type="number" value={height} readOnly aria-label={t('Height')} />
          </label>
          <span className="fre-rbar__sep" />
          <button
            type="button"
            aria-label={t('Zoom out')}
            onClick={() => setZoom((z) => Math.max(0.25, Math.round((z - 0.1) * 100) / 100))}
          >
            −
          </button>
          <span className="fre-rbar__zoom">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            aria-label={t('Zoom in')}
            onClick={() => setZoom((z) => Math.min(1, Math.round((z + 0.1) * 100) / 100))}
          >
            +
          </button>
          <button
            type="button"
            className="fre-rbar__text"
            onClick={() => {
              setZoom(1);
              setCustom(null);
            }}
          >
            {t('Reset')}
          </button>
          <span className="fre-rbar__sep" />
          <button
            type="button"
            className="fre-rbar__text"
            onClick={() => store.actions.setView('site')}
          >
            {t('Manage breakpoints')}
          </button>
          <button
            type="button"
            aria-label={t('Close responsive mode')}
            title={t('Close responsive mode')}
            onClick={() => store.actions.setDevice('desktop')}
          >
            ×
          </button>
        </div>
      )}
      <div
        ref={frameBox}
        className="fre-frame"
        style={{ width, ...(responsive && zoom !== 1 ? { zoom } : {}) }}
      >
        {src && (
          <iframe
            ref={frameRef}
            src={src}
            title={t('Page')}
            onLoad={onLoad}
            className="fre-iframe"
          />
        )}
        {responsive && (
          <>
            <span
              className="fre-frame__handle fre-frame__handle--left"
              onPointerDown={(e) => resize(e, -1)}
            />
            <span
              className="fre-frame__handle fre-frame__handle--right"
              onPointerDown={(e) => resize(e, 1)}
            />
          </>
        )}
      </div>
      {mount &&
        createPortal(
          <FrameHead store={store} assetsBase={assetsBase} doc={mount.doc} />,
          mount.doc.head,
        )}
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

/**
 * The theme's title of the page in the canvas: the first node matching the
 * kit's title selector, outside Fresco's elements and the theme's header and
 * footer, that shows `text`.
 */
function themeTitle(
  doc: Document,
  selector: string | undefined,
  text: string | null,
): HTMLElement | null {
  const safe = safeSelector(selector);
  if (!safe) return null;
  let nodes: HTMLElement[];
  try {
    nodes = [...doc.querySelectorAll<HTMLElement>(safe)];
  } catch {
    return null;
  }
  return (
    nodes.find(
      (node) =>
        !node.closest('.fr-e, .cx-location, [data-fre-ui]') &&
        (text === null || node.textContent?.trim() === text.trim()),
    ) ?? null
  );
}

/**
 * What hiding the theme's title takes away: the title, and the wrappers
 * holding nothing else (a page header with its padding), as themes that
 * leave out their header when the title is hidden.
 */
function titleBox(heading: HTMLElement): HTMLElement {
  let box = heading;
  while (
    box.parentElement &&
    box.parentElement.children.length === 1 &&
    !box.parentElement.matches('body, main, article, [data-fre-content]') &&
    !box.parentElement.querySelector('[data-cx-editor-canvas]')
  ) {
    box = box.parentElement;
  }
  return box;
}

/** Styles inside the canvas: Fresco's, the kit's and the page's own, live. */
/**
 * The Google families the canvas shows that no CSS of Fresco names (looked
 * up a moment after the page changes; the list grows, it is never emptied).
 */
function useRenderedFonts(doc: Document, blocks: unknown): string[] {
  const [found, setFound] = useState<string[]>([]);
  useEffect(() => {
    const timer = setTimeout(() => {
      const root = doc.querySelector('[data-cx-editor-canvas]') ?? doc.body;
      const more = renderedGoogleFonts(root).filter((f) => !found.includes(f));
      if (more.length) setFound((list) => [...list, ...more]);
    }, 700);
    return () => clearTimeout(timer);
  }, [doc, blocks, found]);
  return found;
}

function FrameHead({
  store,
  assetsBase,
  doc,
}: {
  store: Store;
  assetsBase: string;
  doc: Document;
}) {
  const kit = useStore(store, (s) => s.kit);
  const blocks = useStore(store, (s) => s.blocks);
  const css = documentCss(blocks, getElement, kit.breakpoints);
  const kitStyle = editorKitCss(kitCss(kit));
  // The fonts the page uses: those its CSS and its elements' settings name (as
  // the site loads them), and those the canvas shows (styles of templates,
  // other plugins' blocks, the site's custom CSS…). One stylesheet per family:
  // a family Google refuses never keeps the others from loading.
  const rendered = useRenderedFonts(doc, blocks);
  const fonts = canvasFontLinks(kit, [
    ...usedGoogleFonts(css + kitStyle),
    ...elementsGoogleFonts(blocks),
    ...rendered,
  ]);
  const hidden = useStore(store, (s) => s.hidden);
  // The page settings (background, padding, title, layout), live.
  const page = useStore(store, (s) => s.page);
  const effective = pageLayout(page, kit);
  const pageStyle = editorPageCss(
    pageCss(effective === (page.layout ?? '') ? page : { ...page, layout: effective }, {
      titleSelector: safeSelector(kit.titleSelector),
      breakpoints: kit.breakpoints,
    }),
  );
  const hiddenCss = Object.keys(hidden)
    .map((id) => `[data-fr-id="${CSS.escape(id)}"]{display:none!important}`)
    .join('');
  // Documents edited in another frame than a page (a popup's box), as plugins say.
  const kindCss = documentKind(
    useStore(store, (s) => s.entry.type),
    page,
  ).frameCss;
  return (
    <>
      <link rel="stylesheet" href={`${assetsBase}/fresco.css`} />
      {fonts.map((href) => (
        <link key={href} rel="stylesheet" href={href} data-fre-font="" />
      ))}
      <style>{kitStyle}</style>
      <style>{css}</style>
      {pageStyle && <style>{pageStyle}</style>}
      <style>{FRAME_STYLE}</style>
      {hiddenCss && <style>{hiddenCss}</style>}
      {kindCss && <style>{kindCss}</style>}
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
  const safeMode = useStore(store, (s) => s.safeMode);
  const active = useStore(store, (s) => s.active);
  const adding = useStore(store, (s) => s.adding);
  // Elements edited inline are mounted again after the edit (their DOM was changed by hand).
  const [epoch, setEpoch] = useState<Record<string, number>>({});
  const entry = useStore(store, (s) => s.entry);
  const page = useStore(store, (s) => s.page);
  const site = useSite();
  const previewPage = usePreviewPage(entry.type, page, context.locale, site);
  const renderContext: RenderContext = {
    media: context.media,
    locale: context.locale,
    menus: context.menus,
    editing: true,
    site,
    ...(previewPage ? { page: previewPage } : {}),
    ui: { active: (id) => active[id] },
    // Safe mode: other plugins' blocks are not drawn (their settings stay).
    pluginBlock: (block) =>
      safeMode ? (
        <div className="fre-unknown">{t('{block}: off in Safe mode.', { block: block.type })}</div>
      ) : (
        <PluginBlockPreview block={block} entry={entry} />
      ),
  };

  const elementAt = (target: EventTarget | null) =>
    target instanceof doc.defaultView!.Element ? target.closest<HTMLElement>('[data-fr-id]') : null;

  // The text being typed in place: its element keeps the markup the user is changing.
  const [frozen, setFrozen] = useState<string | null>(null);
  const editing = useRef<{ id: string; field: HTMLElement } | null>(null);
  // The press was on the title of the item already shown: the click edits it.
  const editTitle = useRef(false);

  // Texts of the elements that do not mark them themselves (icon boxes, tabs…).
  useLayoutEffect(() => {
    const tree = doc.querySelector('.fre-tree');
    if (tree) markInlineFields(tree, getElement, (id) => find(store.get().blocks, id)?.type);
  });

  /**
   * Starts typing in a text of an element, once the canvas has settled: the
   * text typed before (if any) has just ended, and its element is drawn
   * again, so the nodes are looked up afresh.
   */
  const startInlineSoon = (
    element: HTMLElement,
    field: HTMLElement,
    point: { x: number; y: number },
  ) => {
    const id = element.dataset.frId!;
    const key = field.dataset.frInline!;
    setTimeout(() => {
      const now = doc.querySelector<HTMLElement>(`[data-fr-id="${CSS.escape(id)}"]`);
      // The one shown (tabs have their titles twice, for wide and narrow screens).
      const text = now
        ? [...now.querySelectorAll<HTMLElement>(`[data-fr-inline="${CSS.escape(key)}"]`)].find(
            (node) => node.closest('[data-fr-id]') === now && node.getClientRects().length > 0,
          )
        : null;
      if (now && text) startInline(now, text, point);
    }, 0);
  };

  const startInline = useCallback(
    (element: HTMLElement, field: HTMLElement, point?: { x: number; y: number }) => {
      if (readOnly || field.isContentEditable || !field.isConnected) return;
      const id = element.dataset.frId!;
      const key = parseInlineKey(field.dataset.frInline!);
      const node = find(store.get().blocks, id);
      const definition = node && getElement(node.type);
      const control = definition && key ? inlineControl(definition, key) : null;
      if (!node || !definition || !key || !control) return;
      const rich = control.type === 'richtext';
      const read = () =>
        rich ? sanitizeRich(field.innerHTML) : typedText(field).replace(/\n+$/, '');
      const current = () => {
        const now = find(store.get().blocks, id);
        if (!now) return undefined;
        const value = inlineValue(now, withDefaults(definition, now.attrs), key);
        return rich ? sanitizeRich(value) : plainText(value);
      };
      editing.current = { id, field };
      setFrozen(id);
      field.contentEditable = rich ? 'true' : 'plaintext-only';
      field.focus();
      // The caret goes where the text was clicked.
      if (point) placeCaret(doc, field, point);
      const toolbar = rich ? formatBar(doc, field) : null;
      // The panel follows the typing: one undo step for the whole edit.
      const write = () => {
        const now = find(store.get().blocks, id);
        const value = read();
        if (!now || value === current()) return;
        const change = inlineChange(now, withDefaults(definition, now.attrs), key, value);
        if (change)
          store.actions.setSettings(change.id, change.changes, `inline:${field.dataset.frInline}`);
      };
      let done = false;
      const finish = () => {
        // A dialog of the formatting bar (the link's address) keeps the typing going.
        if (done || field.hasAttribute(HOLD)) return;
        done = true;
        field.removeEventListener('blur', finish);
        field.removeEventListener('keydown', keys);
        field.removeEventListener('input', write);
        win?.removeEventListener('blur', finish);
        toolbar?.remove();
        write();
        field.removeAttribute('contenteditable');
        if (editing.current?.field === field) editing.current = null;
        setFrozen((f) => (f === id ? null : f));
        // Its markup was changed by hand: it is drawn again from its settings.
        setEpoch((e) => ({ ...e, [id]: (e[id] ?? 0) + 1 }));
      };
      const keys = (event: KeyboardEvent) => {
        const format = rich ? formatShortcut(event) : null;
        if (format) {
          event.preventDefault();
          doc.execCommand(format, false);
          return;
        }
        // In a button (titles of tabs) or a summary, the space would press it.
        if (event.key === ' ' && field.closest('button, summary')) {
          event.preventDefault();
          doc.execCommand('insertText', false, ' ');
          return;
        }
        if (event.key === 'Escape' || (event.key === 'Enter' && !rich && control.type === 'text')) {
          event.preventDefault();
          // Escape ends the typing only: the element stays selected.
          event.stopPropagation();
          field.blur();
        }
      };
      field.addEventListener('blur', finish);
      field.addEventListener('keydown', keys);
      field.addEventListener('input', write);
      // The focus going to the panel ends the typing too: Firefox does not blur
      // the text when the focus leaves the canvas, and the panel's changes would
      // be mixed with the text typed.
      const win = doc.defaultView;
      win?.addEventListener('blur', finish);
    },
    [readOnly, store, doc],
  );

  // Outside the content (the theme's header and footer) the page's menu opens too.
  useEffect(() => {
    const onMenu = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target || target.closest('.fre-tree') || target.closest('[data-fre-ui]')) return;
      event.preventDefault();
      const rect = frame.current?.getBoundingClientRect();
      if (rect) onContextMenu('', { x: rect.left + event.clientX, y: rect.top + event.clientY });
    };
    doc.addEventListener('contextmenu', onMenu);
    return () => doc.removeEventListener('contextmenu', onMenu);
  }, [doc, frame, onContextMenu]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest('[data-fre-ui]')) return;
    // A press elsewhere ends the text being typed (the press itself keeps the focus).
    const typing = editing.current;
    if (typing && !typing.field.contains(target)) {
      typing.field.blur();
      // Its element is drawn again at once, so the click would land on a node
      // that is gone: another text pressed starts its typing from here.
      const field = target.closest<HTMLElement>('[data-fr-inline]');
      const owner = elementAt(target);
      if (
        field &&
        owner &&
        owner.contains(field) &&
        !target.closest('[data-fr-tab]') &&
        !(event.metaKey || event.ctrlKey)
      ) {
        startInlineSoon(owner, field, { x: event.clientX, y: event.clientY });
      }
    }
    // In the text being typed: the caret moves, and its element is the one the panel edits.
    if (typing && typing.field.contains(target)) {
      if (!(event.metaKey || event.ctrlKey)) store.actions.select(typing.id);
      return;
    }
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
    // ⌘/Ctrl-click adds the element to the selection, or takes it out.
    if (event.metaKey || event.ctrlKey) {
      store.actions.toggleSelect(element.dataset.frId!);
      return;
    }
    // Titles of tabs and accordions switch the item shown; the title of the
    // item already shown is edited instead (as in Elementor).
    const tab = target.closest<HTMLElement>('[data-fr-tab]');
    editTitle.current = !!tab && isShown(tab) && !!target.closest('[data-fr-inline]');
    if (tab && element.contains(tab) && !editTitle.current) {
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
      style={{ display: 'contents' }}
      onPointerDown={onPointerDown}
      onClick={(event) => {
        const target = event.target as Element;
        if (target.closest('[contenteditable]')) return;
        event.preventDefault();
        if (event.metaKey || event.ctrlKey) return;
        // Texts are edited where they are, with one click (as in other builders).
        // (Titles of tabs: the one shown; the others are shown first.)
        const field = target.closest<HTMLElement>('[data-fr-inline]');
        const element = elementAt(event.target);
        const title = !!target.closest('[data-fr-tab]');
        if (field && element && element.contains(field) && (!title || editTitle.current)) {
          startInlineSoon(element, field, { x: event.clientX, y: event.clientY });
        }
      }}
      onDoubleClick={(event) => {
        const field = (event.target as Element).closest<HTMLElement>('[data-fr-inline]');
        const element = elementAt(event.target);
        if (field && element && element.contains(field)) {
          // A summary would open or close its item.
          event.preventDefault();
          startInlineSoon(element, field, { x: event.clientX, y: event.clientY });
        }
      }}
      onMouseOver={(event) => store.actions.hover(elementAt(event.target)?.dataset.frId ?? null)}
      onMouseLeave={() => store.actions.hover(null)}
      onContextMenu={(event) => {
        if ((event.target as Element).closest('[contenteditable]')) return;
        const element = elementAt(event.target);
        event.preventDefault();
        const rect = frame.current!.getBoundingClientRect();
        // On an element its menu; elsewhere the page's (paste, delete all).
        // A right click inside the selection keeps it, for actions on all of it.
        if (element && !store.get().selection.includes(element.dataset.frId!))
          store.actions.select(element.dataset.frId!);
        onContextMenu(element?.dataset.frId ?? '', {
          x: rect.left + event.clientX,
          y: rect.top + event.clientY,
        });
      }}
    >
      {blocks.map((node, index) => (
        <Fragment key={`${node.id}:${epoch[node.id] ?? 0}`}>
          {adding?.index === index && !readOnly && <AddArea store={store} index={index} />}
          <NodeView node={node} context={renderContext} epoch={epoch} frozen={frozen} />
        </Fragment>
      ))}
      {!readOnly && <AddArea store={store} index={blocks.length} />}
    </div>
  );
}

/** The site's title and tagline (for elements showing them), once known. */
let siteInfo: Promise<RenderContext['site']> | null = null;
function useSite(): RenderContext['site'] {
  const [site, setSite] = useState<RenderContext['site']>({ title: '', tagline: '', home: '/' });
  useEffect(() => {
    let live = true;
    siteInfo ??= coreApi<{ title: string; tagline: string }>('GET', '/settings/core')
      .then((s) => ({ title: s.title ?? '', tagline: s.tagline ?? '', home: '/' }))
      .catch(() => ({ title: '', tagline: '', home: '/' }));
    void siteInfo.then((value) => live && setSite(value));
    return () => {
      live = false;
    };
  }, []);
  return site;
}

/**
 * The page the canvas shows the document as, from the plugins that give one
 * (e.g. a template previewed with a chosen entry); none: no page, as before.
 */
function usePreviewPage(
  type: string,
  page: Settings,
  locale: string,
  site: RenderContext['site'],
): BlockPage | null {
  const [found, setFound] = useState<BlockPage | null>(null);
  const key = JSON.stringify([type, page, locale, site]);
  useEffect(() => {
    const providers = extensions().previewPages;
    if (!providers.length) return;
    let live = true;
    void (async () => {
      for (const provider of providers) {
        try {
          const result = await provider({ type, page, locale, site });
          if (result) {
            if (live) setFound(result);
            return;
          }
        } catch {
          // A failing plugin gives no page.
        }
      }
      if (live) setFound(null);
    })();
    return () => {
      live = false;
    };
    // The key holds every input.
  }, [key]);
  return found;
}

/** Whether the title of a tab or accordion item belongs to the item shown. */
function isShown(tab: HTMLElement): boolean {
  if (tab.tagName === 'SUMMARY') return tab.parentElement?.hasAttribute('open') === true;
  return (
    tab.getAttribute('aria-selected') === 'true' || tab.getAttribute('aria-expanded') === 'true'
  );
}

/** Puts the caret at a point of a text (where it was clicked), when the point is in it. */
function placeCaret(doc: Document, field: HTMLElement, point: { x: number; y: number }): void {
  const at = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let range: Range | null;
  const position = at.caretPositionFromPoint?.(point.x, point.y);
  if (position) {
    range = doc.createRange();
    range.setStart(position.offsetNode, position.offset);
  } else {
    range = at.caretRangeFromPoint?.(point.x, point.y) ?? null;
  }
  if (!range || !field.contains(range.startContainer)) return;
  range.collapse(true);
  const selection = doc.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

// ---- Formatting bar of rich texts edited in place ---------------------------------------------

/** On a text being typed while a dialog of its formatting bar is open: the typing does not end. */
const HOLD = 'data-fre-hold';

const FORMATS: {
  command: string;
  title: string;
  path: string;
  value?: () => Promise<string | null>;
}[] = [
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
    value: () => askText({ title: t('Link address'), value: 'https://' }),
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

/** A dark bar above a rich text being edited: block format, bold, italic, lists, links. */
function formatBar(doc: Document, field: HTMLElement): HTMLElement {
  const bar = doc.createElement('div');
  bar.className = 'fre-pen';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', t('Formatting'));
  bar.setAttribute('data-fre-ui', '');
  // The block's format (paragraph, headings…), as the caret moves; a click lists them.
  const format = doc.createElement('button');
  format.type = 'button';
  format.className = 'fre-pen__format';
  format.setAttribute('aria-haspopup', 'menu');
  format.setAttribute('aria-label', t('Format'));
  const list = doc.createElement('div');
  list.className = 'fre-pen__formats';
  list.setAttribute('role', 'menu');
  list.hidden = true;
  const label = (tag: string) => t(BLOCK_FORMATS.find((f) => f.tag === tag)?.label ?? 'Paragraph');
  const showBlock = () => {
    const selection = doc.getSelection();
    if (selection?.anchorNode && field.contains(selection.anchorNode))
      format.textContent = `${label(currentBlock(doc))} ▾`;
  };
  format.textContent = `${label('p')} ▾`;
  format.addEventListener('mousedown', (event) => event.preventDefault());
  format.addEventListener('click', () => {
    list.hidden = !list.hidden;
    format.setAttribute('aria-expanded', String(!list.hidden));
  });
  for (const block of BLOCK_FORMATS) {
    const item = doc.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.dataset.format = block.tag;
    item.textContent = t(block.label);
    item.addEventListener('mousedown', (event) => event.preventDefault());
    item.addEventListener('click', () => {
      doc.execCommand('formatBlock', false, `<${block.tag}>`);
      list.hidden = true;
      field.focus();
      field.dispatchEvent(new Event('input', { bubbles: true }));
      showBlock();
    });
    list.append(item);
  }
  bar.append(format, list);
  doc.addEventListener('selectionchange', showBlock);
  const stopWatching = new MutationObserver(() => {
    if (!bar.isConnected) {
      doc.removeEventListener('selectionchange', showBlock);
      stopWatching.disconnect();
    }
  });
  stopWatching.observe(doc.body, { childList: true });
  for (const format of FORMATS) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.title = t(format.title);
    button.setAttribute('aria-label', t(format.title));
    button.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${format.path}"/></svg>`;
    // Keeps the text focused and its selection.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      if (!format.value) {
        if (isListCommand(format.command)) listCommand(field, format.command);
        else doc.execCommand(format.command, false);
        field.focus();
        return;
      }
      // The dialog takes the focus: the typing goes on, the selection is put back before applying.
      const selection = doc.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
      field.setAttribute(HOLD, '');
      void format.value().then((value) => {
        field.removeAttribute(HOLD);
        field.focus();
        if (range) {
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
        if (value) doc.execCommand(format.command, false, value);
      });
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
  /** The drop line as a box: the inside of an empty container. */
  box?: boolean;
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
  const selection = useStore(store, (s) => s.selection);
  const hovered = useStore(store, (s) => s.hovered);
  const blocks = useStore(store, (s) => s.blocks);
  const readOnly = useStore(store, (s) => s.readOnly);
  const device = useStore(store, (s) => s.device);
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
      [...selection, selected, shown, shown ? sectionOf(blocks, shown) : null].filter(
        (id): id is string => !!id,
      ),
    ),
  ];
  // Elements hidden on this device stay in the canvas, faded, with a badge (as in Elementor).
  const hiddenHere = hiddenIds(blocks, device);
  const boxes = useBoxes(doc, [...new Set([...ids, ...hiddenHere])], blocks);

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
        const isSelected = id === selected || selection.includes(id);
        // The other selected elements get their outline only.
        const handles =
          !readOnly && (id === selected || id === shown || id === sectionOf(blocks, shown ?? ''));
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
            {handles && kind === 'section' && (
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
            {handles && kind === 'nested' && (
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
            {handles && kind === 'widget' && (
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
      {hiddenHere.map((id) => {
        const box = boxes[id];
        return box ? (
          <div key={`hidden:${id}`} className="fre-hiddenbadge" style={{ left: box.x, top: box.y }}>
            {t('Hidden on {device}', { device: t(DEVICE_NAMES[device]).toLowerCase() })}
          </div>
        ) : null;
      })}
      {line && (
        <div
          className={`fre-dropline${line.box ? ' fre-dropline--box' : ''}`}
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

/** The elements hidden on a device by their settings (not those inside one of them). */
function hiddenIds(blocks: FrescoNode[], device: Device): string[] {
  const out: string[] = [];
  const visit = (nodes: FrescoNode[]) => {
    for (const node of nodes) {
      if (hiddenOn(node.attrs, device)) out.push(node.id);
      else if (node.children) visit(node.children);
    }
  };
  visit(blocks);
  return out;
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
                className={`fre-add__preset${preset.kind === 'flex' ? ` fre-add__preset--${presetShape(preset)}` : ''}`}
                title={presetTitle(preset)}
                aria-label={presetTitle(preset)}
                data-preset={
                  preset.kind === 'flex' ? preset.id : `grid-${preset.columns}x${preset.rows}`
                }
                onClick={() => insert(preset)}
              >
                {preset.kind === 'flex'
                  ? presetThumb(preset)
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

/** How a structure's thumbnail is drawn. */
function presetShape(preset: FlexPreset): string {
  if (preset.id === 'c100-c50-50') return 'split';
  if (preset.columns.length === 0) return preset.direction === 'row' ? 'row' : 'column';
  return preset.columns.reduce((sum, n) => sum + n, 0) > 100 ? 'wrap' : 'cols';
}

/** "50% + 50%", "Column", "Row"… */
function presetTitle(preset: Preset): string {
  if (preset.kind === 'grid') return `${preset.columns} × ${preset.rows}`;
  if (preset.id === 'c100-c50-50') return t('A column beside two stacked ones');
  if (preset.columns.length === 0)
    return preset.direction === 'row' ? t('Row (items side by side)') : t('Column (items stacked)');
  return preset.columns.map((c) => `${Math.round(columnWidth(c))}%`).join(' + ');
}

/** The boxes of a structure's thumbnail. */
function presetThumb(preset: FlexPreset): ReactNode {
  if (preset.id === 'c100-c50-50') {
    return (
      <>
        <i />
        <span>
          <i />
          <i />
        </span>
      </>
    );
  }
  if (preset.columns.length === 0) {
    return (
      <i>
        <Svg
          path={preset.direction === 'row' ? 'M5 12h14 M15 8l4 4-4 4' : 'M12 5v14 M8 15l4 4 4-4'}
        />
      </i>
    );
  }
  return preset.columns.map((c, j) => (
    <i key={j} style={{ flexBasis: `calc(${columnWidth(c)}% - 3px)` }} />
  ));
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
    | { kind: 'new'; type: string; label: string }
    | { kind: 'move'; id: string; label: string }
    | { kind: 'node'; make: () => FrescoNode; label: string },
): void {
  const doc = frame.contentDocument;
  const root = doc?.querySelector<HTMLElement>('[data-cx-editor-canvas]') ?? doc?.body;
  if (!doc || !root) return;
  let label: ReturnType<typeof ghost> | null = null;
  let target: DropTarget | null = null;
  const moved =
    source.kind === 'move'
      ? doc.querySelector<HTMLElement>(`[data-fr-id="${CSS.escape(source.id)}"]`)
      : null;
  // A ready-made element (a global widget) is made once, when the drag starts.
  const made = source.kind === 'node' ? source.make() : null;
  const type =
    source.kind === 'new'
      ? source.type
      : source.kind === 'node'
        ? made!.type
        : (find(store.get().blocks, source.id)?.type ?? '');
  // The page never moves while dragging: the place is shown by a line over
  // it (as in Elementor), so the element under the pointer is the one the
  // user sees, and the drop goes where the line is.
  const decide = (canvas: { x: number; y: number } | null) => {
    target = canvas
      ? dropTarget(
          doc,
          root,
          store.get().blocks,
          canvas.x,
          canvas.y,
          source.kind === 'move' ? source.id : null,
          type,
        )
      : null;
    showDropLine(target ? { ...target.line, ...(target.empty ? { box: true } : {}) } : null);
  };
  trackPointer(event, frame, {
    onStart: () => {
      label = ghost(source.label);
      doc.documentElement.style.cursor = 'grabbing';
      document.documentElement.style.cursor = 'grabbing';
      moved?.classList.add('fre-drag-source');
    },
    onMove: (canvas, screen) => {
      label?.move(screen.x, screen.y);
      decide(canvas);
    },
    onDrop: () => {
      finish();
      if (!target) return;
      if (source.kind === 'new') store.actions.add(source.type, target.place);
      else if (source.kind === 'node') store.actions.addNode(made!, target.place);
      else store.actions.move(source.id, target.place);
    },
    onCancel: finish,
  });
  function finish() {
    label?.remove();
    moved?.classList.remove('fre-drag-source');
    showDropLine(null);
    doc!.documentElement.style.cursor = '';
    document.documentElement.style.cursor = '';
  }
}
