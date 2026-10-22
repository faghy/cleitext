/**
 * The rich text field of the panel (Text editor and other rich texts), as a
 * small word processor: block format (paragraph, headings, preformatted,
 * quote), bold, italic, underline, strikethrough, alignment, lists, links,
 * images from the media library ("Add media"), clear formatting, and the
 * HTML source.
 */
import { t, type EditorMedia } from '@cleitext/admin-sdk';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { askText } from './dialogs.js';
import { formatShortcut } from './format-keys.js';
import { MediaPicker, Svg, type ControlEnv } from './controls.js';

/** The block formats offered, as `formatBlock` takes them. */
export const BLOCK_FORMATS: { tag: string; label: string }[] = [
  { tag: 'p', label: 'Paragraph' },
  { tag: 'h1', label: 'Heading 1' },
  { tag: 'h2', label: 'Heading 2' },
  { tag: 'h3', label: 'Heading 3' },
  { tag: 'h4', label: 'Heading 4' },
  { tag: 'h5', label: 'Heading 5' },
  { tag: 'h6', label: 'Heading 6' },
  { tag: 'pre', label: 'Preformatted' },
  { tag: 'blockquote', label: 'Quote' },
];

/** The block format around the caret (`p`, `h2`…), as the browser reports it. */
export function currentBlock(doc: Document): string {
  const value = String(doc.queryCommandValue('formatBlock') || '')
    .toLowerCase()
    .replace(/[<>]/g, '');
  // Some browsers say "normal" or nothing in a plain paragraph.
  return BLOCK_FORMATS.some((f) => f.tag === value) ? value : value === 'div' ? 'p' : value || 'p';
}

/** Escapes text for an HTML attribute. */
const attr = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** An image of the media library as HTML for the text (its size kept, scaled down by CSS). */
export function imageHtml(item: Pick<EditorMedia, 'url' | 'alt' | 'width' | 'height'>): string {
  const size = item.width && item.height ? ` width="${item.width}" height="${item.height}"` : '';
  return `<img src="${attr(item.url)}" alt="${attr(item.alt ?? '')}"${size}>`;
}

export const isListCommand = (name: string) =>
  name === 'insertUnorderedList' || name === 'insertOrderedList';

/**
 * A bulleted or numbered list from the selection in `root`. Browsers put the
 * new list inside the paragraph (`<p><ul>`, not valid HTML) and the caret at
 * its start: the list takes the paragraph's place, the caret goes back where it was.
 */
export function listCommand(root: HTMLElement, name: string): void {
  const caret = saveCaret(root);
  root.ownerDocument.execCommand(name, false);
  unwrapLists(root);
  if (caret) restoreCaret(root, caret);
}

/** Lists the browser left inside a paragraph (`<p><ul>…</ul></p>`) take the paragraph's place. */
export function unwrapLists(root: HTMLElement): void {
  for (const list of root.querySelectorAll('p > ul, p > ol')) {
    const p = list.parentElement!;
    const alone = [...p.childNodes].every(
      (n) => n === list || n.nodeName === 'BR' || (n.nodeType === 3 && !n.textContent?.trim()),
    );
    if (alone) p.replaceWith(list);
  }
}

interface Caret {
  start: number;
  end: number;
  /** At the start of a text: it stays there, not at the end of the text before. */
  startsNode: boolean;
}

/** The selection in `root` as offsets in its text (they survive the nodes being replaced). */
function saveCaret(root: HTMLElement): Caret | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  const offset = (node: Node, at: number) => {
    const r = root.ownerDocument.createRange();
    r.setStart(root, 0);
    r.setEnd(node, at);
    return r.toString().length;
  };
  return {
    start: offset(range.startContainer, range.startOffset),
    end: offset(range.endContainer, range.endOffset),
    startsNode: range.startOffset === 0,
  };
}

function restoreCaret(root: HTMLElement, caret: Caret): void {
  const doc = root.ownerDocument;
  const point = (n: number, next: boolean): [Node, number] => {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let last: Text | null = null;
    for (
      let node = walker.nextNode() as Text | null;
      node;
      node = walker.nextNode() as Text | null
    ) {
      last = node;
      if (n < node.length || (n === node.length && !next)) return [node, n];
      n -= node.length;
    }
    return last ? [last, last.length] : [root, 0];
  };
  const range = doc.createRange();
  range.setStart(...point(caret.start, caret.startsNode));
  range.setEnd(...point(caret.end, caret.startsNode && caret.end === caret.start));
  const selection = doc.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

const ICONS = {
  bold: 'M7 5h6a3.5 3.5 0 0 1 0 7H7z M7 12h7a3.5 3.5 0 0 1 0 7H7z',
  italic: 'M11 5h6 M7 19h6 M14 5l-4 14',
  underline: 'M7 5v6a5 5 0 0 0 10 0V5 M5 20h14',
  strike:
    'M5 12h14 M16 6.5A4 4 0 0 0 12 5c-2.2 0-4 1.3-4 3 0 3.5 8 2.5 8 7 0 1.8-1.8 3-4 3a4.5 4.5 0 0 1-4.3-2.5',
  left: 'M4 6h16 M4 12h10 M4 18h13',
  center: 'M4 6h16 M7 12h10 M5.5 18h13',
  right: 'M4 6h16 M10 12h10 M7 18h13',
  justify: 'M4 6h16 M4 12h16 M4 18h16',
  bullets: 'M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01',
  numbers: 'M10 6h10 M10 12h10 M10 18h10 M4 6h1v4 M4 10h2 M4 14h2l-2 3h2',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  unlink: 'M10 14a4 4 0 0 0 5.7 0l1-1 M14 10a4 4 0 0 0-5.7 0l-1 1 M4 4l16 16',
  media: 'M3 5h18v14H3z M3 15l5-5 4 4 3-3 6 6 M15.5 9.5h.01',
  clear: 'M6 5h12 M10 5l-3 14 M14 5l-1 5 M15 15l5 5 M20 15l-5 5',
};

export function RichText({
  value,
  onChange,
  readOnly,
  media,
}: {
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  media?: ControlEnv['media'];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState(false);
  const [block, setBlock] = useState('p');
  const [picking, setPicking] = useState(false);
  // The selection when a dialog took the focus, put back before inserting.
  const saved = useRef<Range | null>(null);
  // Written only when the value changes from outside, so the caret stays put.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value && document.activeElement !== ref.current) {
      ref.current.innerHTML = value;
    }
  }, [value, source]);
  // The format bar follows the caret.
  useEffect(() => {
    const update = () => {
      const selection = document.getSelection();
      if (ref.current && selection?.anchorNode && ref.current.contains(selection.anchorNode))
        setBlock(currentBlock(document));
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, []);
  const changed = () => {
    if (ref.current) onChange(ref.current.innerHTML);
  };
  const command = (name: string, argument?: string) => {
    ref.current?.focus();
    // Alignments as styles (kept by the page), not `align` attributes.
    document.execCommand('styleWithCSS', false, name.startsWith('justify') ? 'true' : 'false');
    if (ref.current && isListCommand(name)) listCommand(ref.current, name);
    else document.execCommand(name, false, argument);
    changed();
    setBlock(currentBlock(document));
  };
  const keep = () => {
    const selection = window.getSelection();
    saved.current =
      selection?.rangeCount && ref.current?.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : null;
  };
  const restore = () => {
    ref.current?.focus();
    const selection = window.getSelection();
    if (saved.current && selection) {
      selection.removeAllRanges();
      selection.addRange(saved.current);
    }
    // Used once: a later change starts from where the caret is then.
    saved.current = null;
  };
  const button = (title: string, path: string, run: () => void) => (
    <button
      type="button"
      title={t(title)}
      aria-label={t(title)}
      disabled={readOnly || source}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      <Svg path={path} size={14} />
    </button>
  );
  const group = (children: ReactNode) => <span className="fre-rich__group">{children}</span>;
  return (
    <div className="fre-rich">
      <div className="fre-rich__bar" role="toolbar" aria-label={t('Formatting')}>
        <select
          className="fre-rich__format"
          aria-label={t('Format')}
          value={BLOCK_FORMATS.some((f) => f.tag === block) ? block : 'p'}
          disabled={readOnly || source}
          onMouseDown={keep}
          onFocus={keep}
          onChange={(e) => {
            restore();
            command('formatBlock', `<${e.target.value}>`);
          }}
        >
          {BLOCK_FORMATS.map((f) => (
            <option key={f.tag} value={f.tag}>
              {t(f.label)}
            </option>
          ))}
        </select>
        {group(
          <>
            {button('Bold', ICONS.bold, () => command('bold'))}
            {button('Italic', ICONS.italic, () => command('italic'))}
            {button('Underline', ICONS.underline, () => command('underline'))}
            {button('Strikethrough', ICONS.strike, () => command('strikeThrough'))}
          </>,
        )}
        {group(
          <>
            {button('Align left', ICONS.left, () => command('justifyLeft'))}
            {button('Align center', ICONS.center, () => command('justifyCenter'))}
            {button('Align right', ICONS.right, () => command('justifyRight'))}
            {button('Justify', ICONS.justify, () => command('justifyFull'))}
          </>,
        )}
        {group(
          <>
            {button('Bulleted list', ICONS.bullets, () => command('insertUnorderedList'))}
            {button('Numbered list', ICONS.numbers, () => command('insertOrderedList'))}
          </>,
        )}
        {group(
          <>
            {button('Link', ICONS.link, () => {
              keep();
              void askText({ title: t('Link address'), value: 'https://' }).then((url) => {
                // Also when cancelled: the caret goes back where it was.
                restore();
                if (url) command('createLink', url);
              });
            })}
            {button('Remove link', ICONS.unlink, () => command('unlink'))}
            {media &&
              button('Add media', ICONS.media, () => {
                keep();
                setPicking(true);
              })}
            {button('Clear formatting', ICONS.clear, () => {
              command('removeFormat');
              command('formatBlock', '<p>');
            })}
          </>,
        )}
        <button
          type="button"
          title={t('HTML')}
          aria-label={t('HTML')}
          aria-pressed={source}
          className={source ? 'is-on' : ''}
          onClick={() => setSource((s) => !s)}
        >
          {'</>'}
        </button>
      </div>
      {source ? (
        <textarea
          className="fre-input fre-code"
          rows={8}
          value={value}
          aria-label="HTML"
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
        />
      ) : (
        <div
          ref={ref}
          className="fre-rich__area"
          role="textbox"
          aria-multiline="true"
          aria-label={t('Text')}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          onInput={changed}
          onKeyDown={(e) => {
            const format = formatShortcut(e);
            if (!format) return;
            e.preventDefault();
            command(format);
          }}
        />
      )}
      {picking && media && (
        <MediaPicker
          env={{ media } as ControlEnv}
          kind="image"
          onClose={() => {
            setPicking(false);
            restore();
          }}
          onPick={(items) => {
            setPicking(false);
            const item = items[0];
            if (!item) return;
            restore();
            command('insertHTML', imageHtml(item));
          }}
        />
      )}
    </div>
  );
}
