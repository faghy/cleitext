import { currentCompletions, startCompletion } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeEditor, type CodeEditorProps } from '../src/code-editor.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout: CodeMirror measures text ranges after rendering, so give
// ranges empty rectangles instead of letting a late measurement throw.
const emptyRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects ??= emptyRects;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const roots: { root: Root; element: HTMLElement }[] = [];
afterEach(() => {
  for (const { root, element } of roots.splice(0)) {
    act(() => root.unmount());
    element.remove();
  }
  document.documentElement.removeAttribute('data-theme');
});

function mount(node: React.ReactNode, parent: HTMLElement = document.body): HTMLElement {
  const element = document.createElement('div');
  parent.append(element);
  const root = createRoot(element);
  act(() => root.render(node));
  roots.push({ root, element });
  return element;
}

/** Waits for CodeMirror (loaded lazily) to replace the textarea. */
async function ready(element: HTMLElement): Promise<EditorView> {
  await vi.waitFor(
    () => {
      expect(element.querySelector('[data-state="ready"] .cm-editor')).not.toBeNull();
    },
    { timeout: 10_000 },
  );
  return EditorView.findFromDOM(element.querySelector<HTMLElement>('.cm-editor')!)!;
}

function Controlled(props: Partial<CodeEditorProps> & { seen?: (v: string) => void }) {
  const [value, setValue] = useState(props.value ?? '');
  return (
    <>
      <CodeEditor
        language="css"
        label="Custom CSS"
        {...props}
        value={value}
        onChange={(next) => {
          setValue(next);
          props.seen?.(next);
        }}
      />
      <output>{value.length}</output>
      <button type="button" onClick={() => setValue('.reset{}')}>
        Reset
      </button>
    </>
  );
}

describe('CodeEditor', () => {
  it('shows a labelled textarea first, then CodeMirror with line numbers', async () => {
    const element = mount(<Controlled value={'a {\n  color: red;\n}'} describedBy="help" />);
    const textarea = element.querySelector('textarea')!;
    expect(textarea.getAttribute('aria-label')).toBe('Custom CSS');
    expect(textarea.value).toBe('a {\n  color: red;\n}');
    const view = await ready(element);
    expect(element.querySelector('textarea')).toBeNull();
    const content = element.querySelector('.cm-content')!;
    expect(content.getAttribute('aria-label')).toBe('Custom CSS');
    expect(content.getAttribute('aria-describedby')).toBe('help');
    expect(content.getAttribute('aria-multiline')).toBe('true');
    expect(element.querySelectorAll('.cm-lineNumbers .cm-gutterElement').length).toBeGreaterThan(0);
    expect(view.state.doc.toString()).toBe('a {\n  color: red;\n}');
    // Highlighted: the property is a token of its own.
    expect(element.querySelector('.cm-line span')).not.toBeNull();
  });

  it('keeps the focus and the caret of typing begun before CodeMirror came', async () => {
    const element = mount(<Controlled value="a{}" />);
    const textarea = element.querySelector('textarea')!;
    textarea.focus();
    textarea.setSelectionRange(2, 2);
    const view = await ready(element);
    await vi.waitFor(() => expect(view.hasFocus).toBe(true));
    expect(view.state.selection.main.head).toBe(2);
  });

  it('reports typing, follows the value given, and keeps Tab for the focus', async () => {
    const seen = vi.fn();
    const element = mount(<Controlled seen={seen} />);
    const view = await ready(element);
    act(() => view.dispatch({ changes: { from: 0, insert: 'body{}' } }));
    expect(seen).toHaveBeenLastCalledWith('body{}');
    expect(element.querySelector('output')!.textContent).toBe('6');
    // A value set from outside (e.g. Discard) shows without calling onChange again.
    seen.mockClear();
    act(() => element.querySelector('button')!.click());
    expect(view.state.doc.toString()).toBe('.reset{}');
    expect(seen).not.toHaveBeenCalled();
    // Tab is not bound by default: the browser moves the focus on.
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    view.contentDOM.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(view.state.doc.toString()).toBe('.reset{}');
  });

  it('indents with Tab only when asked', async () => {
    const element = mount(<Controlled tabIndents value="a{}" />);
    const view = await ready(element);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => {
      view.contentDOM.dispatchEvent(tab);
    });
    expect(tab.defaultPrevented).toBe(true);
  });

  it('completes CSS properties', async () => {
    const element = mount(<Controlled value="a { backgr" />);
    const view = await ready(element);
    act(() => {
      view.dispatch({ selection: { anchor: view.state.doc.length } });
      startCompletion(view);
    });
    await vi.waitFor(() => {
      expect(currentCompletions(view.state).map((c) => c.label)).toContain('background-color');
    });
  });

  it('follows the admin’s dark theme, and stays light in light areas', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const element = mount(<Controlled />);
    const view = await ready(element);
    expect(view.state.facet(EditorView.darkTheme)).toBe(true);
    act(() => document.documentElement.setAttribute('data-theme', 'light'));
    await vi.waitFor(() => expect(view.state.facet(EditorView.darkTheme)).toBe(false));

    const light = document.createElement('div');
    light.className = 'light-palette';
    document.body.append(light);
    document.documentElement.setAttribute('data-theme', 'dark');
    const inside = mount(<Controlled theme="auto" />, light);
    const insideView = await ready(inside);
    await vi.waitFor(() => expect(insideView.state.facet(EditorView.darkTheme)).toBe(false));
    light.remove();
  });

  it('marks invalid code, is read-only when asked, and loads HTML and JavaScript too', async () => {
    const element = mount(<Controlled invalid readOnly />);
    const view = await ready(element);
    expect(element.querySelector('.cm-content')!.getAttribute('aria-invalid')).toBe('true');
    expect(element.querySelector('.cm-editor')!.getAttribute('data-invalid')).toBe('true');
    expect(view.state.readOnly).toBe(true);
    for (const language of ['html', 'js'] as const) {
      const other = mount(<Controlled language={language} value="<p>" />);
      expect((await ready(other)).state.doc.toString()).toBe('<p>');
      expect(other.querySelector(`[data-code-editor="${language}"]`)).not.toBeNull();
    }
  });
});
