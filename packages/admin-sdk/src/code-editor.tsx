/**
 * CodeEditor (core 0.80): a code field with syntax highlighting, line
 * numbers, bracket matching and completions (CSS properties, HTML tags), for
 * the admin and for plugins. CodeMirror 6 is loaded only when an editor is
 * shown; until then, and if it cannot load, a plain textarea does the job.
 *
 *   <CodeEditor language="css" label="Custom CSS" value={css} onChange={setCss} />
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CodeEditorHandle, CodeLanguage } from './code-editor-view.js';

export type { CodeLanguage } from './code-editor-view.js';

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: CodeLanguage;
  /** Accessible name of the editing area (shown by the caller as its label, or read by screen readers only). */
  label: string;
  /** Id of the editing area, for a `<label htmlFor>` (it gets focus on click). */
  id?: string;
  /** Ids of the help or error texts describing the field. */
  describedBy?: string;
  invalid?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  /** Height in lines (it grows up to twice that, then scrolls). Default 10. */
  rows?: number;
  /**
   * Tab indents instead of moving the focus on. Off by default, so the
   * keyboard never gets stuck; when on, Esc and then Tab leave the editor.
   */
  tabIndents?: boolean;
  /** Colors: following the admin's light or dark theme (default), or fixed. */
  theme?: 'auto' | 'light' | 'dark';
  className?: string;
}

/** Whether the admin shows its dark theme (chosen in the profile, or the system's). */
function adminDark(): boolean {
  if (typeof document === 'undefined') return false;
  const chosen = document.documentElement.getAttribute('data-theme');
  if (chosen === 'dark' || chosen === 'light') return chosen === 'dark';
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

function subscribeTheme(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const media =
    typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  media?.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    media?.removeEventListener('change', onChange);
  };
}

/** The admin's color theme, updated when the user or the system changes it. */
export function useAdminDark(): boolean {
  return useSyncExternalStore(subscribeTheme, adminDark, () => false);
}

export function CodeEditor({
  value,
  onChange,
  language,
  label,
  id,
  describedBy,
  invalid,
  readOnly,
  placeholder,
  rows = 10,
  tabIndents = false,
  theme = 'auto',
  className,
}: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<CodeEditorHandle | null>(null);
  const fallback = useRef<HTMLTextAreaElement>(null);
  /** Where the caret was in the textarea, when it had the focus as CodeMirror came. */
  const caret = useRef<number | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const admin = useAdminDark();
  // Areas that keep the light palette (the block editor) keep a light editor.
  const [inLight, setInLight] = useState(false);
  useLayoutEffect(() => {
    setInLight(Boolean(host.current?.closest('.light-palette')));
  }, []);
  const dark = theme === 'dark' || (theme === 'auto' && admin && !inLight);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  // Created once per language; the other props follow below.
  useEffect(() => {
    let cancelled = false;
    let created: CodeEditorHandle | null = null;
    setState('loading');
    import('./code-editor-view.js')
      .then(({ createCodeEditor }) =>
        createCodeEditor(host.current!, {
          value: latest.current.value,
          language,
          label,
          id,
          describedBy,
          invalid,
          readOnly,
          placeholder,
          dark,
          tabIndents,
          rows,
          onChange: (next) => latest.current.onChange(next),
        }),
      )
      .then((editor) => {
        created = editor;
        if (cancelled) return editor.destroy();
        // Text typed in the textarea while CodeMirror was loading.
        editor.setValue(latest.current.value);
        handle.current = editor;
        // Typing that began in the textarea goes on in the editor, at the same place.
        const textarea = fallback.current;
        caret.current =
          textarea && document.activeElement === textarea ? textarea.selectionStart : null;
        setState('ready');
      })
      .catch((error: unknown) => {
        console.error('The code editor could not load', error);
        if (!cancelled) setState('failed');
      });
    return () => {
      cancelled = true;
      created?.destroy();
      handle.current = null;
    };
    // Recreated only for what CodeMirror cannot change in place; the rest follows below.
  }, [language, label, id, tabIndents, placeholder, rows]);

  useEffect(() => {
    handle.current?.setValue(value);
  }, [value, state]);
  useEffect(() => {
    const editor = handle.current;
    if (state !== 'ready' || !editor || caret.current === null) return;
    const anchor = Math.min(caret.current, editor.view.state.doc.length);
    caret.current = null;
    editor.view.focus();
    editor.view.dispatch({ selection: { anchor } });
  }, [state]);
  useEffect(() => {
    handle.current?.update({ dark, readOnly, invalid, describedBy });
  }, [dark, readOnly, invalid, describedBy, state]);

  return (
    <div className={className} data-code-editor={language} data-state={state}>
      <div ref={host} hidden={state !== 'ready'} />
      {state !== 'ready' && (
        <textarea
          ref={fallback}
          id={id}
          aria-label={label}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          readOnly={readOnly}
          placeholder={placeholder}
          rows={rows}
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="block w-full rounded-[3px] border border-slate-400 bg-white px-2 py-1 font-mono text-[12px] text-slate-900"
        />
      )}
    </div>
  );
}
