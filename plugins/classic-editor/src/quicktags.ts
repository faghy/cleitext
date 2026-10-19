/**
 * The Text tab's buttons: they wrap the selected text in tags or, without a
 * selection, insert the opening tag and then the closing one on the next
 * click, as WordPress's quick tags do.
 */
import type { Labels } from './i18n.js';

export interface TagButton {
  id: string;
  /** Text of the button. */
  display: string;
  title: keyof Labels;
  open: string;
  close: string;
  /** A tag-less insertion (e.g. the More tag), or one that asks for values. */
  kind?: 'insert' | 'link' | 'img';
  accessKey?: string;
}

const now = () => new Date().toISOString().replace(/\.\d+Z$/, '+00:00');

export const TAG_BUTTONS: TagButton[] = [
  {
    id: 'strong',
    display: 'b',
    title: 'qtBold',
    open: '<strong>',
    close: '</strong>',
    accessKey: 'b',
  },
  { id: 'em', display: 'i', title: 'qtItalic', open: '<em>', close: '</em>', accessKey: 'i' },
  {
    id: 'link',
    display: 'link',
    title: 'qtLink',
    open: '',
    close: '</a>',
    kind: 'link',
    accessKey: 'a',
  },
  {
    id: 'block',
    display: 'b-quote',
    title: 'qtQuote',
    open: '\n\n<blockquote>',
    close: '</blockquote>\n\n',
    accessKey: 'q',
  },
  {
    id: 'del',
    display: 'del',
    title: 'qtDel',
    open: '<del datetime="{now}">',
    close: '</del>',
    accessKey: 'd',
  },
  {
    id: 'ins',
    display: 'ins',
    title: 'qtIns',
    open: '<ins datetime="{now}">',
    close: '</ins>',
    accessKey: 's',
  },
  { id: 'img', display: 'img', title: 'qtImg', open: '', close: '', kind: 'img', accessKey: 'm' },
  { id: 'ul', display: 'ul', title: 'qtUl', open: '<ul>\n', close: '</ul>\n\n', accessKey: 'u' },
  { id: 'ol', display: 'ol', title: 'qtOl', open: '<ol>\n', close: '</ol>\n\n', accessKey: 'o' },
  { id: 'li', display: 'li', title: 'qtLi', open: '\t<li>', close: '</li>\n', accessKey: 'l' },
  {
    id: 'code',
    display: 'code',
    title: 'qtCode',
    open: '<code>',
    close: '</code>',
    accessKey: 'c',
  },
  {
    id: 'more',
    display: 'more',
    title: 'qtMore',
    open: '<!--more-->',
    close: '',
    kind: 'insert',
    accessKey: 't',
  },
];

/** The text area's state: its value and selection. */
export interface TextState {
  value: string;
  start: number;
  end: number;
}

export interface TagResult extends TextState {
  /** Ids of the tags left open (shown as `/b`…), in order. */
  open: string[];
}

const fillNow = (text: string) => text.replace('{now}', now());

/**
 * Applies a tag button. `values` holds what the link and image buttons asked
 * for (`href`; `src` and `alt`); without them, nothing changes.
 */
export function applyTag(
  state: TextState,
  button: TagButton,
  open: string[],
  values: { href?: string; src?: string; alt?: string } = {},
): TagResult {
  const { value, start, end } = state;
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);
  const insert = (text: string, nextOpen = open): TagResult => ({
    value: before + text + after,
    start: start + text.length,
    end: start + text.length,
    open: nextOpen,
  });

  if (button.kind === 'insert') return insert(button.open);
  if (button.kind === 'img') {
    if (!values.src) return { ...state, open };
    return insert(`<img src="${attribute(values.src)}" alt="${attribute(values.alt ?? '')}" />`);
  }

  const isOpen = open.includes(button.id);
  let openTag = fillNow(button.open);
  if (button.kind === 'link') {
    if (!isOpen || selected) {
      if (!values.href) return { ...state, open };
      openTag = `<a href="${attribute(values.href)}">`;
    }
  }

  if (selected) {
    const text = openTag + selected + button.close;
    return {
      value: before + text + after,
      start,
      end: start + text.length,
      open,
    };
  }
  if (isOpen)
    return insert(
      button.close,
      open.filter((id) => id !== button.id),
    );
  return insert(openTag, [...open, button.id]);
}

/** Closes every open tag, the last opened first. */
export function closeTags(state: TextState, open: string[]): TagResult {
  const closing = [...open]
    .reverse()
    .map((id) => TAG_BUTTONS.find((b) => b.id === id)?.close ?? '')
    .join('');
  const value = state.value.slice(0, state.end) + closing + state.value.slice(state.end);
  const position = state.end + closing.length;
  return { value, start: position, end: position, open: [] };
}

function attribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
