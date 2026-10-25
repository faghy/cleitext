/**
 * The CodeMirror 6 side of `CodeEditor` (core 0.80): loaded only when a code
 * editor is shown (`import()` from code-editor.tsx), so CodeMirror never
 * weighs on the admin's first load. Each language's grammar is a chunk of
 * its own too.
 */
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
  type LanguageSupport,
} from '@codemirror/language';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as placeholderText,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';

export type CodeLanguage = 'css' | 'html' | 'js';

export interface CodeEditorViewOptions {
  value: string;
  language: CodeLanguage;
  onChange: (value: string) => void;
  /** Accessible name of the editing area. */
  label: string;
  id?: string | undefined;
  describedBy?: string | undefined;
  invalid?: boolean | undefined;
  readOnly?: boolean | undefined;
  placeholder?: string | undefined;
  dark: boolean;
  /** Tab indents (Esc, then Tab, leaves the editor); off: Tab moves the focus on. */
  tabIndents?: boolean | undefined;
  /** Height of the editing area, in lines (it grows up to twice that, then scrolls). */
  rows: number;
}

export interface CodeEditorHandle {
  view: EditorView;
  setValue(value: string): void;
  update(
    options: Pick<CodeEditorViewOptions, 'dark' | 'readOnly' | 'invalid' | 'describedBy'>,
  ): void;
  destroy(): void;
}

/** The grammar of a language (lazy: only the one in use is loaded). */
export async function languageSupport(language: CodeLanguage): Promise<LanguageSupport> {
  if (language === 'css') return (await import('@codemirror/lang-css')).css();
  if (language === 'html') return (await import('@codemirror/lang-html')).html();
  return (await import('@codemirror/lang-javascript')).javascript();
}

/** Colors of the code, readable on both backgrounds (WCAG AA against them). */
function highlight(dark: boolean): HighlightStyle {
  const c = dark
    ? {
        keyword: '#c4a7ff',
        name: '#7dd3fc',
        property: '#93c5fd',
        string: '#86efac',
        number: '#fdba74',
        comment: '#94a3b8',
        tag: '#f9a8d4',
        meta: '#fcd34d',
      }
    : {
        keyword: '#7c3aed',
        name: '#0e7490',
        property: '#1d4ed8',
        string: '#15803d',
        number: '#b45309',
        comment: '#64748b',
        tag: '#be185d',
        meta: '#a16207',
      };
  return HighlightStyle.define([
    { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: c.keyword },
    { tag: [tags.className, tags.labelName, tags.typeName], color: c.name },
    { tag: [tags.propertyName, tags.attributeName], color: c.property },
    { tag: [tags.string, tags.special(tags.string), tags.regexp], color: c.string },
    { tag: [tags.number, tags.unit, tags.bool, tags.atom, tags.color], color: c.number },
    {
      tag: [tags.comment, tags.lineComment, tags.blockComment],
      color: c.comment,
      fontStyle: 'italic',
    },
    { tag: [tags.tagName, tags.angleBracket], color: c.tag },
    { tag: [tags.definitionKeyword, tags.meta, tags.processingInstruction], color: c.meta },
    { tag: tags.invalid, color: '#dc2626' },
  ]);
}

function theme(dark: boolean, rows: number): Extension {
  const line = 18;
  return [
    EditorView.theme(
      {
        '&': {
          backgroundColor: dark ? '#0f172a' : '#ffffff',
          color: dark ? '#e2e8f0' : '#1e293b',
          border: `1px solid ${dark ? '#475569' : '#8c8f94'}`,
          borderRadius: '3px',
          fontSize: '12px',
        },
        '&.cm-focused': { outline: '2px solid #2271b1', outlineOffset: '1px' },
        '&[data-invalid="true"]': { borderColor: '#d63638' },
        '.cm-scroller': {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          lineHeight: `${line}px`,
          minHeight: `${rows * line + 8}px`,
          maxHeight: `${rows * line * 2 + 8}px`,
          overflow: 'auto',
        },
        '.cm-content': { caretColor: dark ? '#f8fafc' : '#0f172a', padding: '4px 0' },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: dark ? '#f8fafc' : '#0f172a' },
        '.cm-gutters': {
          backgroundColor: dark ? '#1e293b' : '#f6f7f7',
          color: dark ? '#94a3b8' : '#646970',
          border: 'none',
          borderRight: `1px solid ${dark ? '#334155' : '#dcdcde'}`,
        },
        '.cm-activeLine': { backgroundColor: dark ? '#1e293b80' : '#f0f6fc' },
        '.cm-activeLineGutter': { backgroundColor: dark ? '#334155' : '#e5eef7' },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
          backgroundColor: dark ? '#1e40af' : '#bfdbfe',
        },
        '.cm-matchingBracket': {
          backgroundColor: dark ? '#334155' : '#dbeafe',
          outline: `1px solid ${dark ? '#64748b' : '#93c5fd'}`,
        },
        '.cm-tooltip': {
          backgroundColor: dark ? '#1e293b' : '#ffffff',
          color: dark ? '#e2e8f0' : '#1e293b',
          border: `1px solid ${dark ? '#475569' : '#c3c4c7'}`,
        },
        '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
          backgroundColor: '#2271b1',
          color: '#ffffff',
        },
        '.cm-placeholder': { color: dark ? '#94a3b8' : '#646970' },
      },
      { dark },
    ),
    syntaxHighlighting(highlight(dark)),
  ];
}

function attributes(
  options: Pick<CodeEditorViewOptions, 'label' | 'id' | 'describedBy' | 'invalid'>,
): Extension {
  return [
    EditorView.editorAttributes.of({ 'data-invalid': options.invalid ? 'true' : 'false' }),
    EditorView.contentAttributes.of({
      'aria-label': options.label,
      'aria-multiline': 'true',
      ...(options.id ? { id: options.id } : {}),
      ...(options.describedBy ? { 'aria-describedby': options.describedBy } : {}),
      ...(options.invalid ? { 'aria-invalid': 'true' } : {}),
      spellcheck: 'false',
      autocapitalize: 'off',
      autocorrect: 'off',
    }),
  ];
}

/** A code editor in `parent`, with line numbers, bracket matching and completions. */
export async function createCodeEditor(
  parent: HTMLElement,
  options: CodeEditorViewOptions,
): Promise<CodeEditorHandle> {
  const language = await languageSupport(options.language);
  const looks = new Compartment();
  const access = new Compartment();
  const editable = new Compartment();
  let current = { ...options };
  let silent = false;
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: options.value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        language,
        EditorView.lineWrapping,
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
          ...(options.tabIndents ? [indentWithTab] : []),
        ]),
        ...(options.placeholder ? [placeholderText(options.placeholder)] : []),
        looks.of(theme(options.dark, options.rows)),
        access.of(attributes(options)),
        editable.of([
          EditorState.readOnly.of(Boolean(options.readOnly)),
          EditorView.editable.of(!options.readOnly),
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !silent) current.onChange(update.state.doc.toString());
        }),
      ],
    }),
  });
  return {
    view,
    setValue(value) {
      if (value === view.state.doc.toString()) return;
      silent = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
      silent = false;
    },
    update(next) {
      const changed = { ...current, ...next };
      const effects = [];
      if (changed.dark !== current.dark) {
        effects.push(looks.reconfigure(theme(changed.dark, changed.rows)));
      }
      if (changed.invalid !== current.invalid || changed.describedBy !== current.describedBy) {
        effects.push(access.reconfigure(attributes(changed)));
      }
      if (changed.readOnly !== current.readOnly) {
        effects.push(
          editable.reconfigure([
            EditorState.readOnly.of(Boolean(changed.readOnly)),
            EditorView.editable.of(!changed.readOnly),
          ]),
        );
      }
      current = changed;
      if (effects.length) view.dispatch({ effects });
    },
    destroy: () => view.destroy(),
  };
}
