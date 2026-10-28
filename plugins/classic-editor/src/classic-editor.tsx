/**
 * The classic editing screen: "Add Media" above the editor, the Visual tab
 * (TinyMCE with two rows of buttons) and the Text tab (the HTML, with quick
 * tag buttons), and the word count below. Every change is converted to
 * blocks and sent to the admin a moment later.
 */
import type { EditorProps } from '@cleitext/admin-sdk';
import type { CxdDocument } from '@cleitext/blocks';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor as TinyEditor } from 'tinymce';
import {
  cxdToHtml,
  documentWords,
  EDITOR_ID,
  htmlToCxd,
  MORE_TAG,
  type ToHtmlOptions,
} from './convert.js';
import { BLOCK_TITLES_IT, fill, isItalian, labels } from './i18n.js';
import { MediaModal, type Insertion } from './media.js';
import { applyTag, closeTags, TAG_BUTTONS, type TagButton } from './quicktags.js';
import { CONTENT_CSS, SCREEN_CSS } from './styles.js';
import tinymce from './tinymce.js';

type Mode = 'visual' | 'text';

const DELAY = 300;
const MODE_KEY = 'cleitext-classic-editor-mode';
const TOOLBAR_KEY = 'cleitext-classic-editor-toolbar2';

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows: the preference is not remembered.
  }
}

function useScreenStyles(): void {
  useEffect(() => {
    if (document.getElementById('ce-screen-css')) return;
    const style = document.createElement('style');
    style.id = 'ce-screen-css';
    style.textContent = SCREEN_CSS;
    document.head.append(style);
  }, []);
}

const withEditor = (document: CxdDocument): CxdDocument =>
  document.editor?.id === EDITOR_ID ? document : { ...document, editor: { id: EDITOR_ID } };

export function ClassicEditor(props: EditorProps) {
  const { readOnly, media, user } = props;
  const t = labels(user.locale);
  const italian = isItalian(user.locale);
  useScreenStyles();

  const htmlOptions: ToHtmlOptions = {
    placeholderLabel: (title) =>
      fill(t.block, { title: italian ? (BLOCK_TITLES_IT[title] ?? title) : title }),
    moreLabel: t.more,
  };
  const htmlOptionsRef = useRef(htmlOptions);
  htmlOptionsRef.current = htmlOptions;

  const documentRef = useRef<CxdDocument>(withEditor(props.document));
  const onChangeRef = useRef(props.onChange);
  onChangeRef.current = props.onChange;

  const [mode, setMode] = useState<Mode>(() => (stored(MODE_KEY) === 'text' ? 'text' : 'visual'));
  const modeRef = useRef(mode);
  const [text, setText] = useState(() =>
    cxdToHtml(documentRef.current, { ...htmlOptions, text: true }),
  );
  const textRef = useRef(text);
  const [words, setWords] = useState(() => documentWords(documentRef.current));
  const [mediaOpen, setMediaOpen] = useState(false);
  const [openTags, setOpenTags] = useState<string[]>([]);
  const [row2, setRow2] = useState(() => stored(TOOLBAR_KEY) === '1');

  const host = useRef<HTMLTextAreaElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<TinyEditor | null>(null);
  const lastHtml = useRef<string | null>(null);
  const lastText = useRef(text);

  // ---- Changes: converted to blocks a moment after the last one ----
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<(() => CxdDocument | null) | null>(null);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const compute = pending.current;
    pending.current = null;
    const next = compute?.();
    if (!next) return;
    documentRef.current = next;
    setWords(documentWords(next));
    onChangeRef.current(next);
  }, []);

  const schedule = useCallback(
    (compute: () => CxdDocument | null) => {
      pending.current = compute;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, DELAY);
    },
    [flush],
  );

  const visualChanged = useCallback(() => {
    schedule(() => {
      const editor = editorRef.current;
      if (!editor || modeRef.current !== 'visual') return null;
      const html = editor.getContent();
      if (html === lastHtml.current) return null;
      lastHtml.current = html;
      return htmlToCxd(html, documentRef.current);
    });
  }, [schedule]);

  const textChanged = useCallback(() => {
    schedule(() => {
      const value = textRef.current;
      if (value === lastText.current) return null;
      lastText.current = value;
      return htmlToCxd(value, documentRef.current, { text: true });
    });
  }, [schedule]);

  // The last change is kept when the editor closes (e.g. switching to the block editor).
  useEffect(() => () => flush(), [flush]);

  // ---- The visual editor ----
  useEffect(() => {
    const target = host.current;
    if (!target) return;
    let removed = false;
    const heading = (n: number) => fill(t.heading, { n });
    void tinymce
      .init({
        target,
        // TinyMCE used under its open-source license (GPL-2.0-or-later).
        license_key: 'gpl',
        language: italian ? 'it' : 'en',
        // Skin and content styles come from the bundle (registered resources).
        skin_url: 'default',
        content_css: 'default',
        content_style: CONTENT_CSS,
        menubar: false,
        branding: false,
        promotion: false,
        statusbar: true,
        elementpath: true,
        resize: true,
        height: 520,
        min_height: 260,
        plugins: 'lists link charmap fullscreen help',
        toolbar: [
          'blocks bold italic bullist numlist blockquote alignleft aligncenter alignright link unlink ce_more fullscreen ce_toolbar',
          'strikethrough hr forecolor pastetext removeformat charmap outdent indent undo redo help',
        ],
        toolbar_mode: 'wrap',
        block_formats: [
          `${t.paragraph}=p`,
          ...[1, 2, 3, 4, 5, 6].map((n) => `${heading(n)}=h${n}`),
          `${t.preformatted}=pre`,
        ].join(';'),
        formats: {
          alignleft: [
            { selector: 'p,h1,h2,h3,h4,h5,h6,td,th,li,pre', styles: { textAlign: 'left' } },
            { selector: 'img,figure', classes: 'alignleft' },
          ],
          aligncenter: [
            { selector: 'p,h1,h2,h3,h4,h5,h6,td,th,li,pre', styles: { textAlign: 'center' } },
            { selector: 'img,figure', classes: 'aligncenter' },
          ],
          alignright: [
            { selector: 'p,h1,h2,h3,h4,h5,h6,td,th,li,pre', styles: { textAlign: 'right' } },
            { selector: 'img,figure', classes: 'alignright' },
          ],
          underline: { inline: 'u' },
        },
        help_tabs: ['shortcuts', 'keyboardnav'],
        link_title: false,
        link_default_protocol: 'https',
        convert_urls: false,
        relative_urls: false,
        entity_encoding: 'raw',
        browser_spellcheck: true,
        contextmenu: false,
        noneditable_class: 'mceNonEditable',
        readonly: readOnly,
        setup: (editor) => {
          editor.ui.registry.addButton('ce_more', {
            icon: 'page-break',
            tooltip: t.readMore,
            onAction: () => editor.insertContent(cxdToHtml(moreDocument(), htmlOptionsRef.current)),
          });
          editor.ui.registry.addToggleButton('ce_toolbar', {
            icon: 'more-drawer',
            tooltip: t.toolbarToggle,
            onAction: (api) => {
              const next = !api.isActive();
              api.setActive(next);
              setRow2(next);
            },
            onSetup: (api) => {
              api.setActive(stored(TOOLBAR_KEY) === '1');
              return () => {};
            },
          });
          editor.on('init', () => {
            if (removed) return;
            editor.getContainer().classList.toggle('ce-row2-hidden', stored(TOOLBAR_KEY) !== '1');
            editor.setContent(cxdToHtml(documentRef.current, htmlOptionsRef.current));
            editor.undoManager.clear();
            lastHtml.current = editor.getContent();
          });
          editor.on('input change undo redo ExecCommand', visualChanged);
        },
      })
      .then(([editor]) => {
        if (removed) editor?.remove();
        else editorRef.current = editor ?? null;
      });
    return () => {
      removed = true;
      flush();
      editorRef.current?.remove();
      editorRef.current = null;
    };
    // The editor is made once; language and labels do not change while it is open.
  }, []);

  useEffect(() => {
    editorRef.current?.mode.set(readOnly ? 'readonly' : 'design');
  }, [readOnly]);

  useEffect(() => {
    const container = editorRef.current?.getContainer();
    container?.classList.toggle('ce-row2-hidden', !row2);
    store(TOOLBAR_KEY, row2 ? '1' : '0');
  }, [row2, mode]);

  // ---- Tabs ----
  const switchTo = (next: Mode) => {
    if (next === modeRef.current) return;
    flush();
    if (next === 'text') {
      const value = cxdToHtml(documentRef.current, { ...htmlOptions, text: true });
      textRef.current = value;
      lastText.current = value;
      setText(value);
      setOpenTags([]);
    } else {
      const editor = editorRef.current;
      if (editor) {
        editor.setContent(cxdToHtml(documentRef.current, htmlOptions));
        lastHtml.current = editor.getContent();
        // The cursor at the end, where Add Media inserts.
        editor.selection.select(editor.getBody(), true);
        editor.selection.collapse(false);
      }
    }
    modeRef.current = next;
    setMode(next);
    store(MODE_KEY, next);
  };

  // ---- Text tab ----
  const setTextValue = (value: string, start: number, end: number) => {
    textRef.current = value;
    setText(value);
    textChanged();
    requestAnimationFrame(() => {
      const area = textarea.current;
      if (!area) return;
      area.focus();
      area.setSelectionRange(start, end);
    });
  };

  const selection = () => {
    const area = textarea.current;
    return {
      value: textRef.current,
      start: area?.selectionStart ?? textRef.current.length,
      end: area?.selectionEnd ?? textRef.current.length,
    };
  };

  const tagButton = (button: TagButton) => {
    const values: { href?: string; src?: string; alt?: string } = {};
    const state = selection();
    if (button.kind === 'link' && (!openTags.includes('link') || state.start !== state.end)) {
      const href = window.prompt(t.qtLinkPrompt, 'https://');
      if (!href || href === 'https://') return;
      values.href = href;
    }
    if (button.kind === 'img') {
      const src = window.prompt(t.qtImgSrc, 'https://');
      if (!src || src === 'https://') return;
      values.src = src;
      values.alt = window.prompt(t.qtImgAlt, '') ?? '';
    }
    const result = applyTag(state, button, openTags, values);
    setOpenTags(result.open);
    setTextValue(result.value, result.start, result.end);
  };

  // ---- Add Media ----
  const closeMediaModal = useCallback(() => setMediaOpen(false), []);
  const insertMedia = (insertion: Insertion) => {
    setMediaOpen(false);
    const block = 'block' in insertion ? insertion.block : null;
    if (modeRef.current === 'visual') {
      const editor = editorRef.current;
      if (!editor) return;
      const html = block
        ? cxdToHtml({ schema: 1, blocks: [block] }, htmlOptions)
        : 'html' in insertion
          ? insertion.html
          : '';
      editor.focus();
      editor.insertContent(html);
      visualChanged();
    } else {
      const html = block
        ? cxdToHtml({ schema: 1, blocks: [block] }, { ...htmlOptions, text: true })
        : 'html' in insertion
          ? insertion.html
          : '';
      const state = selection();
      const value = state.value.slice(0, state.start) + html + state.value.slice(state.end);
      const position = state.start + html.length;
      setTextValue(value, position, position);
    }
  };

  return (
    <div className="ce-screen">
      <div className="ce-wrap">
        {readOnly && <p className="ce-notice">{t.readOnly}</p>}
        <div className="ce-tools">
          <button
            type="button"
            className="ce-button"
            disabled={readOnly}
            onClick={() => setMediaOpen(true)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">
              <path d="M13 11V4c0-.55-.45-1-1-1h-1.67L9 1H5L3.67 3H2c-.55 0-1 .45-1 1v7c0 .55.45 1 1 1h10c.55 0 1-.45 1-1zM7 4.5c1.38 0 2.5 1.12 2.5 2.5S8.38 9.5 7 9.5 4.5 8.38 4.5 7 5.62 4.5 7 4.5zM14 6h5v10.5c0 1.38-1.12 2.5-2.5 2.5S14 17.88 14 16.5s1.12-2.5 2.5-2.5c.17 0 .34.02.5.05V9h-3V6zm-4 8.05V13h2v3.5c0 1.38-1.12 2.5-2.5 2.5S7 17.88 7 16.5 8.12 14 9.5 14c.17 0 .34.02.5.05z" />
            </svg>
            {t.addMedia}
          </button>
          <div className="ce-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              className="ce-tab"
              aria-selected={mode === 'visual'}
              onClick={() => switchTo('visual')}
            >
              {t.visual}
            </button>
            <button
              type="button"
              role="tab"
              className="ce-tab"
              aria-selected={mode === 'text'}
              onClick={() => switchTo('text')}
            >
              {t.text}
            </button>
          </div>
        </div>
        <div className="ce-area">
          <div className={mode === 'visual' ? 'ce-visual' : 'ce-visual ce-hidden'}>
            <textarea ref={host} defaultValue="" hidden />
          </div>
          {mode === 'text' && (
            <div>
              <div className="ce-quicktags" role="toolbar" aria-label={t.text}>
                {TAG_BUTTONS.map((button) => (
                  <button
                    key={button.id}
                    type="button"
                    className={`ce-qt ce-qt-${button.display}`}
                    title={t[button.title]}
                    disabled={readOnly}
                    onClick={() => tagButton(button)}
                  >
                    {openTags.includes(button.id) ? `/${button.display}` : button.display}
                  </button>
                ))}
                <button
                  type="button"
                  className="ce-qt"
                  title={t.qtClose}
                  disabled={readOnly || openTags.length === 0}
                  onClick={() => {
                    const result = closeTags(selection(), openTags);
                    setOpenTags([]);
                    setTextValue(result.value, result.start, result.end);
                  }}
                >
                  {t.qtCloseTags}
                </button>
              </div>
              <textarea
                ref={textarea}
                className="ce-textarea"
                value={text}
                readOnly={readOnly}
                spellCheck
                aria-label={t.text}
                onChange={(event) => {
                  textRef.current = event.target.value;
                  setText(event.target.value);
                  textChanged();
                }}
              />
            </div>
          )}
          <div className="ce-status">
            <span>{fill(t.wordCount, { n: words })}</span>
          </div>
        </div>
      </div>
      {mediaOpen && (
        <MediaModal t={t} media={media} onInsert={insertMedia} onClose={closeMediaModal} />
      )}
    </div>
  );
}

function moreDocument(): CxdDocument {
  return {
    schema: 1,
    blocks: [{ id: 'more', type: 'core/html', v: 1, attrs: { content: MORE_TAG } }],
  };
}
