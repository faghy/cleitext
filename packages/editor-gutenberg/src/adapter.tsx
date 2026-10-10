import { createCoreRegistry, newBlockId, type CxdDocument } from '@cleitext/blocks';
import type { EditorAdapter, EditorInstance, EditorMountOptions } from '@cleitext/editor-core';
import {
  BlockCanvas,
  BlockEditorKeyboardShortcuts,
  BlockEditorProvider,
  BlockInspector,
  Inserter,
} from '@wordpress/block-editor';
import type { Block } from '@wordpress/blocks';
import { Button, Modal, Popover, SlotFillProvider } from '@wordpress/components';
import { useStateWithHistory } from '@wordpress/compose';
import { useDispatch } from '@wordpress/data';
import { store as keyboardShortcutsStore, useShortcut } from '@wordpress/keyboard-shortcuts';
import { keyboard, plus, redo as redoIcon, undo as undoIcon } from '@wordpress/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { fromGutenberg, toGutenberg } from './convert';
import { buildBlocks, defaultsOf, isRegistered } from './gutenberg-tree';
import { registerMediaUpload, setMediaServices } from './media-upload';
import { registerFieldBlocks } from './field-blocks';
import { registerCoreBlocks } from './register-blocks';
import { EDITOR_SHORTCUTS, ShortcutsHelp } from './shortcuts';
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

/**
 * Gutenberg implementation of the editor contract (docs/ARCHITECTURE.md §10).
 * The canvas runs in an iframe, isolated from the admin's styles.
 */
export const gutenbergAdapter: EditorAdapter = {
  id: 'gutenberg',
  mount(options: EditorMountOptions): EditorInstance {
    registerCoreBlocks();
    registerMediaUpload();
    setMediaServices(options.services);
    registerFieldBlocks(options.fieldBlocks ?? [], registry, options.locale);
    const controller: Controller = { current: () => options.document, replace: () => {} };
    const root = createRoot(options.targets.canvas);
    root.render(<GutenbergEditor options={options} controller={controller} />);
    return {
      getDocument: () => controller.current(),
      setDocument: (document) => controller.replace(document),
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
  useEffect(() => {
    if (first.current || skipChange.current) {
      first.current = false;
      skipChange.current = false;
      return;
    }
    onChangeRef.current(toCxd(value.blocks));
  }, [value.blocks]);

  const [helpOpen, setHelpOpen] = useState(false);
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

  const settings = useMemo(
    () => ({
      hasFixedToolbar: false,
      focusMode: false,
      bodyPlaceholder: 'Type / to choose a block',
      __unstableResolvedAssets: options.styles
        ? {
            ...RESOLVED_ASSETS,
            // The theme's editor styles (RF-THM-03), after the defaults.
            styles: `${RESOLVED_ASSETS.styles}<style>${options.styles.replace(/<\/style/gi, '<\\/style')}</style>`,
          }
        : RESOLVED_ASSETS,
      ...(options.services.uploadMedia ? { mediaUpload: makeMediaUpload(options) } : {}),
    }),
    [options],
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
            <Button
              icon={keyboard}
              label="Keyboard shortcuts"
              onClick={() => setHelpOpen(true)}
              size="compact"
            />
          </div>
          <div className="cleitext-gutenberg__canvas">
            <BlockCanvas height="100%" />
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

/** Gutenberg's upload hook, backed by Cleitext's media service. */
function makeMediaUpload(options: EditorMountOptions) {
  return ({
    filesList,
    onFileChange,
    onError,
  }: {
    filesList: FileList | File[];
    onFileChange: (files: { id: string; url: string; alt?: string }[]) => void;
    onError?: (message: string) => void;
  }) => {
    const files = Array.from(filesList);
    void Promise.all(files.map((file) => options.services.uploadMedia!(file)))
      .then((uploaded) =>
        onFileChange(uploaded.map((m) => ({ id: m.id, url: m.url, alt: m.alt ?? '' }))),
      )
      .catch((error: unknown) =>
        onError?.(error instanceof Error ? error.message : 'Upload failed'),
      );
  };
}
