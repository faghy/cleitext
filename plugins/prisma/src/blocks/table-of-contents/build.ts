/**
 * The list of a table of contents, built from the headings of the page
 * (on the site by table-of-contents.js, in the editor by the block): the
 * same nesting rules as the block it replaces.
 */

export interface Heading {
  level: number;
  text: string;
  id: string;
}

export interface ListOptions {
  /** Toggles on the items that hold sub-lists (`enableCollapsableList`). */
  collapsible: boolean;
  /** Down to which nesting level the toggles are drawn (`collapsibleListDepth`). */
  depth: number;
}

/** Headings that never enter a table of contents. */
export const HIDE_CLASS = 'pr-toc-hide-heading';

/** An anchor from a heading's text: lowercase letters, digits and dashes. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/…+/g, '')
    .replace(/[–—]/g, '')
    .replace(/[^a-z0-9À-ſ _-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/_+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The headings of a part of the page, levels chosen by `mapping` (h1…h6), with unique anchors. */
export function collectHeadings(
  root: ParentNode,
  mapping: unknown,
  skip?: (element: Element) => boolean,
): { heading: Heading; element: HTMLElement }[] {
  const levels = Array.isArray(mapping) ? mapping : [true, true, true, true, true, true];
  const selector = [1, 2, 3, 4, 5, 6]
    .filter((l) => levels[l - 1] !== false)
    .map((l) => `h${l}`)
    .join(',');
  if (!selector) return [];
  const used = new Map<string, number>();
  const out: { heading: Heading; element: HTMLElement }[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    if (element.classList.contains(HIDE_CLASS) || element.closest('template')) continue;
    if (skip?.(element)) continue;
    const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const base = slug(text) || 'toc';
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    out.push({
      heading: { level: Number(element.tagName[1]), text, id: n === 1 ? base : `${base}-${n}` },
      element,
    });
  }
  return out;
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The nested list as HTML: an `<ol>` with `<ul>` sub-lists, headings above
 * the first one's level left out, sub-lists closed as levels go back up.
 */
export function renderList(headings: Heading[], options: ListOptions): string {
  const count = headings.length;
  const hasChildren: boolean[] = new Array<boolean>(count).fill(false);
  const depthOf: number[] = new Array<number>(count).fill(0);
  if (options.collapsible) {
    const stack: number[] = [];
    headings.forEach((h, i) => {
      while (stack.length && stack[stack.length - 1]! >= h.level) stack.pop();
      depthOf[i] = stack.length + 1;
      stack.push(h.level);
      const following = headings[i + 1];
      hasChildren[i] = following !== undefined && following.level > h.level;
    });
  }
  let html = '<ol class="pr-toc__list">';
  let lastLevel = 0;
  let parentLevel = 0;
  let firstLevel = 0;
  let depth = 0;
  const depthAt: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  headings.forEach((h, i) => {
    const level = h.level;
    if (i === 0) firstLevel = level;
    if (level < firstLevel) return;
    if (!parentLevel || level < parentLevel) parentLevel = level;
    if (lastLevel) {
      if (level > lastLevel) {
        html += '<ul class="pr-toc__list">';
        depth++;
        depthAt[level] = depth;
      } else if (level === lastLevel && level !== parentLevel) {
        // The open item closes when the next one starts (as browsers read lists).
        depthAt[level] = depth;
      } else if (level < lastLevel) {
        const closing = Math.abs(depth - (depthAt[level] ?? 0));
        if (level > parentLevel) {
          html += '</li></ul>'.repeat(closing);
          depth = Math.abs(depth - closing);
        } else if (level === parentLevel) {
          html += '</li></ul>'.repeat(closing);
          html += '</li>';
          // Back at the top level: no sub-list stays open.
          depth = Math.abs(depth - closing);
        }
      }
    }
    const expandable = options.collapsible && hasChildren[i] && depthOf[i]! <= options.depth;
    html += `<li class="pr-toc__item${expandable ? ' pr-toc__item--expandable' : ''}">${
      expandable
        ? '<span class="pr-toc__toggle" role="button" tabindex="0" aria-expanded="true" aria-label="Toggle"></span>'
        : ''
    }<a href="#${escape(h.id)}" class="pr-toc__link">${escape(h.text)}</a>`;
    lastLevel = level;
  });
  html += '</ul>'.repeat(depth);
  html += '</ol>';
  return html;
}
