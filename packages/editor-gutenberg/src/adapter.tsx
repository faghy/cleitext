import { createCoreRegistry, newBlockId, type CxdDocument } from '@cleitext/blocks';
import type {
  EditorAdapter,
  EditorInstance,
  EditorMountOptions,
  PatternRef,
} from '@cleitext/editor-core';
import type { QueryClient } from '@tanstack/react-query';
import {
  BlockCanvas,
  BlockEditorKeyboardShortcuts,
  BlockEditorProvider,
  BlockInspector,
  Inserter,
  store as blockEditorStore,
  __experimentalListView as ListView,
} from '@wordpress/block-editor';
import type { Block } from '@wordpress/blocks';
import { Button, Modal, Popover, SlotFillProvider } from '@wordpress/components';
import { useStateWithHistory } from '@wordpress/compose';
import { select, useDispatch, useSelect } from '@wordpress/data';
import { store as keyboardShortcutsStore, useShortcut } from '@wordpress/keyboard-shortcuts';
import {
  desktop as desktopIcon,
  keyboard,
  listView,
  mobile as mobileIcon,
  plus,
  tablet as tabletIcon,
  redo as redoIcon,
  symbol,
  undo as undoIcon,
} from '@wordpress/icons';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { fromGutenberg, toGutenberg } from './convert';
import { mountEditorRoot } from './editor-root';
import { buildBlocks, defaultsOf, isRegistered } from './gutenberg-tree';
import { registerMediaUpload, setMediaServices } from './media-upload';
import { registerFieldBlocks } from './field-blocks';
import { canvasStyles } from './canvas-styles';
import { registerCoreBlocks } from './register-blocks';
import { BINDINGS_SUPPORTED_ATTRIBUTES, refreshBindings, setBindingsLanguage } from './bindings';
import { DEVICE_WIDTHS, editorStore, registerEditorStore, type DeviceType } from './device';
import { EDITOR_SHORTCUTS, ShortcutsHelp } from './shortcuts';
import { inserterPatterns, PATTERN_CATEGORIES, setPatterns } from './patterns';
import blockEditorContentCss from '@wordpress/block-editor/build-style/content.css?inline';
import blockLibraryEditorCss from '@wordpress/block-library/build-style/editor.css?inline';
import componentsCss from '@wordpress/components/build-style/style.css?inline';
import blockLibraryCss from '@wordpress/block-library/build-style/style.css?inline';
import blockLibraryThemeCss from '@wordpress/block-library/build-style/theme.css?inline';
import './style.css';

const registry = createCoreRegistry();

/** Base typography inside the editing canvas, until themes provide editor styles. */
const CANVAS_CSS = `
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 18px; line-height: 1.6; color: #1e1e1e; background: #fff; }
  .editor-styles-wrapper { padding: 32px 24px 120px; }
  .is-root-container { max-width: 760px; margin: 0 auto; }
  .is-root-container > .alignwide { max-width: 1100px; }
  .is-root-container > .alignfull { max-width: none; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; }
  a { color: #0369a1; }
  /* Responsive embeds, as in a theme supporting "responsive-embeds": without
     them the preview of a video has no height. */
  .wp-has-aspect-ratio .wp-block-embed__wrapper::before { content: ""; display: block; padding-top: 50%; }
  .wp-has-aspect-ratio .wp-block-embed__wrapper iframe { position: absolute; inset: 0; width: 100%; height: 100%; }
  .wp-embed-aspect-21-9 .wp-block-embed__wrapper::before { padding-top: 42.85%; }
  .wp-embed-aspect-16-9 .wp-block-embed__wrapper::before { padding-top: 56.25%; }
  .wp-embed-aspect-4-3 .wp-block-embed__wrapper::before { padding-top: 75%; }
  .wp-embed-aspect-1-1 .wp-block-embed__wrapper::before { padding-top: 100%; }
  .wp-embed-aspect-9-16 .wp-block-embed__wrapper::before { padding-top: 177.77%; }
  .wp-embed-aspect-1-2 .wp-block-embed__wrapper::before { padding-top: 200%; }
  /* Vertical players (YouTube Shorts) as on the page: at most 360px wide. */
  :is(.wp-embed-aspect-9-16, .wp-embed-aspect-1-2).wp-block-embed:not(.alignwide, .alignfull) { max-width: min(100%, 360px); }
  :is(.wp-embed-aspect-9-16, .wp-embed-aspect-1-2).wp-block-embed.aligncenter { margin-left: auto; margin-right: auto; }
  /* Frames with a fixed height and link cards: the size the page gives them
     (embed-size.tsx), Gutenberg's own sizing script being blocked by the CSP. */
  .cx-embed-fixed .wp-block-embed__wrapper > iframe, .cx-embed-card .wp-block-embed__wrapper > iframe { display: block; width: min(100%, var(--cx-embed-width)); height: var(--cx-embed-height); }
`;

const RESOLVED_ASSETS = {
  // Content styles of the blocks, plus the editing UI rendered inside the canvas
  // (placeholders, variation pickers…).
  styles: `<style>${componentsCss}\n${blockEditorContentCss}\n${blockLibraryCss}\n${blockLibraryThemeCss}\n${blockLibraryEditorCss}\n${CANVAS_CSS}</style>`,
  scripts: '',
};

interface EditorState {
  blocks: Block[];
  selection?: unknown;
}

/** Typed view of @wordpress/compose's useStateWithHistory. */
interface EditorHistory {
  value: EditorState;
  /** `isStaging`: true while typing, merged into the next undo step. */
  setValue(value: EditorState, isStaging?: boolean): void;
  hasUndo: boolean;
  hasRedo: boolean;
  undo(): void;
  redo(): void;
}

interface Controller {
  /** Converts the current Gutenberg blocks to CXD. */
  current: () => CxdDocument;
  replace: (document: CxdDocument) => void;
}

/** Options of the Gutenberg editor: the common ones, plus what the admin shares with it. */
export interface GutenbergMountOptions extends EditorMountOptions {
  /**
   * The admin's TanStack Query client, used by the forms of plugin blocks
   * (media and relation fields). Without it, the editor creates its own.
   */
  queryClient?: QueryClient;
}

/**
 * Gutenberg implementation of the editor contract (docs/ARCHITECTURE.md §10).
 * The canvas runs in an iframe, isolated from the admin's styles.
 */
export const gutenbergAdapter: EditorAdapter & {
  mount(options: GutenbergMountOptions): EditorInstance;
} = {
  id: 'gutenberg',
  mount(options: GutenbergMountOptions): EditorInstance {
    setMediaServices(options.services);
    setBindingsLanguage(options.uiLanguage ?? options.locale);
    registerCoreBlocks();
    registerEditorStore();
    registerMediaUpload();
    registerFieldBlocks(options.fieldBlocks ?? [], registry, options.locale);
    const controller: Controller = { current: () => options.document, replace: () => {} };
    const root = mountEditorRoot(
      options.targets.canvas,
      <GutenbergEditor options={options} controller={controller} />,
      options.queryClient,
    );
    return {
      getDocument: () => controller.current(),
      setDocument: (document) => controller.replace(document),
      refreshDynamic: () => refreshBindings(),
      // Deferred: the host may destroy the editor while React is rendering.
      destroy: () => setTimeout(() => root.unmount(), 0),
    };
  },
};

function GutenbergEditor({
  options,
  controller,
}: {
  options: EditorMountOptions;
  controller: Controller;
}) {
  // clientId → CXD id: ids stay stable across conversions and loads.
  const ids = useRef(new Map<string, string>()).current;
  const load = (document: CxdDocument): Block[] =>
    buildBlocks(toGutenberg(document, { registry, isKnown: isRegistered }), ids);

  const initialBlocks = useMemo(() => load(options.document), []);
  const { value, setValue, hasUndo, hasRedo, undo, redo } = useStateWithHistory({
    blocks: initialBlocks,
  }) as unknown as EditorHistory;

  const toCxd = (blocks: Block[]): CxdDocument =>
    fromGutenberg(blocks, {
      registry,
      defaultsOf,
      idOf: (clientId) => {
        let id = ids.get(clientId);
        if (!id) {
          id = newBlockId();
          ids.set(clientId, id);
        }
        return id;
      },
    });

  // Replacements from the host (setDocument) are not user changes: no onChange.
  const skipChange = useRef(false);
  controller.current = () => toCxd(value.blocks);
  controller.replace = (document) => {
    skipChange.current = true;
    setValue({ blocks: load(document) }, false);
  };

  const onChangeRef = useRef(options.onChange);
  onChangeRef.current = options.onChange;
  const first = useRef(true);
  // Blocks may adjust their own attributes when they load (derived data, defaults):
  // until the person types, clicks or drags, those are not edits. They are kept in the
  // document anyway (getDocument) and saved with the first real change.
  const acted = useRef(false);
  useEffect(() => {
    const act = () => {
      acted.current = true;
    };
    const targets: EventTarget[] = [document];
    const frame = () =>
      document.querySelector<HTMLIFrameElement>('iframe[name="editor-canvas"]')?.contentDocument;
    const attach = () => {
      const inner = frame();
      if (inner && !targets.includes(inner)) targets.push(inner);
      for (const t of targets) {
        t.addEventListener('keydown', act, true);
        t.addEventListener('pointerdown', act, true);
        t.addEventListener('drop', act, true);
        t.addEventListener('paste', act, true);
      }
    };
    attach();
    // The canvas iframe appears after the first render.
    const timer = setTimeout(attach, 1500);
    return () => {
      clearTimeout(timer);
      for (const t of targets) {
        t.removeEventListener('keydown', act, true);
        t.removeEventListener('pointerdown', act, true);
        t.removeEventListener('drop', act, true);
        t.removeEventListener('paste', act, true);
      }
    };
  }, []);
  useEffect(() => {
    if (first.current || skipChange.current) {
      first.current = false;
      skipChange.current = false;
      return;
    }
    if (!acted.current) return;
    onChangeRef.current(toCxd(value.blocks));
  }, [value.blocks]);

  const [helpOpen, setHelpOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  // Saved patterns (RF-EDT-07), offered by the inserter.
  const [patterns, setPatternsState] = useState<PatternRef[]>([]);
  const loadPatterns = () =>
    options.services
      .listPatterns?.()
      .then((list) => {
        setPatterns(list);
        setPatternsState(list);
      })
      // Without the list the inserter simply offers no saved patterns.
      .catch(() => undefined);
  useEffect(() => {
    void loadPatterns();
  }, []);
  const selectedClientIds = useSelect(
    (choose) =>
      (
        choose(blockEditorStore) as unknown as { getSelectedBlockClientIds(): string[] }
      ).getSelectedBlockClientIds(),
    [],
  );
  const hasSelection = selectedClientIds.length > 0;
  useEffect(() => {
    options.onSelectionChange?.(hasSelection);
  }, [hasSelection]);
  const saveAsPattern = async () => {
    const editor = select(blockEditorStore) as unknown as {
      getBlocksByClientId(ids: string[]): Block[];
    };
    const blocks = editor.getBlocksByClientId(selectedClientIds).filter(Boolean);
    if (blocks.length === 0 || !options.services.savePattern) return;
    const title = window.prompt('Name of the pattern');
    if (!title?.trim()) return;
    const synced = window.confirm(
      'Keep it synced? OK: every use follows changes made to the pattern. Cancel: insert copies.',
    );
    await options.services.savePattern({ title: title.trim(), document: toCxd(blocks), synced });
    await loadPatterns();
  };
  const { registerShortcut } = useDispatch(keyboardShortcutsStore) as unknown as {
    registerShortcut(shortcut: unknown): void;
  };
  useEffect(() => {
    for (const shortcut of EDITOR_SHORTCUTS) registerShortcut(shortcut);
  }, []);
  // Shortcuts listen on the whole page: undo and redo apply only to keys
  // pressed in the editor (the canvas bubbles its events to its iframe), so
  // other fields keep their own undo.
  const inEditor = (event: KeyboardEvent) =>
    event.target instanceof Node && options.targets.canvas.contains(event.target);
  useShortcut('cleitext/undo', (event: KeyboardEvent) => {
    if (!inEditor(event)) return;
    event.preventDefault();
    undo();
  });
  useShortcut('cleitext/redo', (event: KeyboardEvent) => {
    if (!inEditor(event)) return;
    event.preventDefault();
    redo();
  });
  useShortcut('cleitext/keyboard-shortcuts', () => setHelpOpen((open) => !open));
  // Escape closes the help even when the browser left the focus outside the
  // modal (Firefox, after opening it from the canvas).
  useEffect(() => {
    if (!helpOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHelpOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [helpOpen]);

  const settings = useMemo(
    () => ({
      hasFixedToolbar: false,
      focusMode: false,
      bodyPlaceholder: 'Type / to choose a block',
      __experimentalBlockPatterns: inserterPatterns(patterns),
      __experimentalBlockPatternCategories: PATTERN_CATEGORIES,
      // Bound attributes show their field's value (plugin API 1.48).
      __experimentalBlockBindingsSupportedAttributes: BINDINGS_SUPPORTED_ATTRIBUTES,
      __unstableResolvedAssets: {
        ...RESOLVED_ASSETS,
        styles: RESOLVED_ASSETS.styles + canvasStyles(options),
      },
      ...(options.services.uploadMedia ? { mediaUpload: makeMediaUpload(options) } : {}),
    }),
    [options, patterns],
  );

  return (
    <SlotFillProvider>
      <BlockEditorProvider
        value={value.blocks}
        selection={value.selection}
        onInput={(blocks: Block[], { selection }: { selection?: unknown }) =>
          setValue({ blocks, selection }, true)
        }
        onChange={(blocks: Block[], { selection }: { selection?: unknown }) =>
          setValue({ blocks, selection }, false)
        }
        settings={settings}
        useSubRegistry={false}
      >
        <BlockEditorKeyboardShortcuts.Register />
        <div className="cleitext-gutenberg">
          <div className="cleitext-gutenberg__toolbar" role="toolbar" aria-label="Document tools">
            <Inserter
              rootClientId={undefined}
              isAppender={false}
              renderToggle={({ onToggle, isOpen }: { onToggle: () => void; isOpen: boolean }) => (
                <Button
                  variant="primary"
                  icon={plus}
                  label={isOpen ? 'Close block inserter' : 'Add block'}
                  aria-expanded={isOpen}
                  onClick={onToggle}
                  size="compact"
                />
              )}
            />
            <Button
              icon={undoIcon}
              label="Undo"
              onClick={undo}
              disabled={!hasUndo}
              size="compact"
            />
            <Button
              icon={redoIcon}
              label="Redo"
              onClick={redo}
              disabled={!hasRedo}
              size="compact"
            />
            {options.services.savePattern && (
              <Button
                icon={symbol}
                label="Save as pattern"
                disabled={selectedClientIds.length === 0}
                onClick={() => void saveAsPattern()}
                size="compact"
              />
            )}
            <Button
              icon={listView}
              label="Document outline"
              isPressed={listOpen}
              aria-expanded={listOpen}
              onClick={() => setListOpen((open) => !open)}
              size="compact"
            />
            <Button
              icon={keyboard}
              label="Keyboard shortcuts"
              onClick={() => setHelpOpen(true)}
              size="compact"
            />
            <DeviceSwitcher />
          </div>
          <div className="cleitext-gutenberg__body">
            {listOpen && (
              // Tree of the blocks (RF-EDT-05): select, move and nest them.
              <aside className="cleitext-gutenberg__listview" aria-label="Document outline">
                <ListView />
              </aside>
            )}
            <DeviceCanvas>
              <BlockCanvas height="100%" />
            </DeviceCanvas>
          </div>
        </div>
        {options.targets.inspector && createPortal(<BlockInspector />, options.targets.inspector)}
        {helpOpen && (
          <Modal title="Keyboard shortcuts" onRequestClose={() => setHelpOpen(false)} size="medium">
            <ShortcutsHelp hostShortcuts={options.hostShortcuts ?? []} />
          </Modal>
        )}
        <Popover.Slot />
      </BlockEditorProvider>
    </SlotFillProvider>
  );
}

const DEVICES: { type: DeviceType; label: string; icon: typeof desktopIcon }[] = [
  { type: 'Desktop', label: 'Desktop preview', icon: desktopIcon },
  { type: 'Tablet', label: 'Tablet preview', icon: tabletIcon },
  { type: 'Mobile', label: 'Mobile preview', icon: mobileIcon },
];

/** Preview on desktop, tablet or mobile: responsive settings follow (plugin API 1.23). */
function DeviceSwitcher() {
  const deviceType = useSelect(
    (s) => (s(editorStore) as { getDeviceType(): DeviceType }).getDeviceType(),
    [],
  );
  const { setDeviceType } = useDispatch(editorStore) as {
    setDeviceType(type: DeviceType): void;
  };
  return (
    <div className="cleitext-gutenberg__devices" role="group" aria-label="Preview device">
      {DEVICES.map((device) => (
        <Button
          key={device.type}
          icon={device.icon}
          label={device.label}
          isPressed={deviceType === device.type}
          onClick={() => setDeviceType(device.type)}
          size="compact"
        />
      ))}
    </div>
  );
}

/** The canvas at the width of the preview device, so its media queries apply. */
function DeviceCanvas({ children }: { children: ReactNode }) {
  const deviceType = useSelect(
    (s) => (s(editorStore) as { getDeviceType(): DeviceType }).getDeviceType(),
    [],
  );
  return (
    <div className="cleitext-gutenberg__canvas" data-device={deviceType.toLowerCase()}>
      <div className="cleitext-gutenberg__frame" style={{ width: DEVICE_WIDTHS[deviceType] }}>
        {children}
      </div>
    </div>
  );
}

/** Gutenberg's upload hook, backed by Cleitext's media service. */
function makeMediaUpload(options: EditorMountOptions) {
  return ({
    filesList,
    onFileChange,
    onError,
  }: {
    filesList: FileList | File[];
    onFileChange: (files: { id: string; url: string; alt?: string; type?: string }[]) => void;
    onError?: (message: string) => void;
  }) => {
    const files = Array.from(filesList);
    void Promise.all(files.map((file) => options.services.uploadMedia!(file)))
      .then((uploaded) =>
        onFileChange(
          // `type`: Media & Text tells images from videos by it.
          uploaded.map((m) => ({
            id: m.id,
            url: m.url,
            alt: m.alt ?? '',
            type: m.mime.startsWith('video/') ? 'video' : 'image',
          })),
        ),
      )
      .catch((error: unknown) =>
        onError?.(error instanceof Error ? error.message : 'Upload failed'),
      );
  };
}
