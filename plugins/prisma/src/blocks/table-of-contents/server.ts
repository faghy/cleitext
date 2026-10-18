import { parse, type HTMLElement } from 'node-html-parser';
import { HIDE_CLASS, renderList, slug } from './build';

/**
 * Tables of contents built on the site, in the page's HTML: each heading gets
 * its anchor and each table its list, so they work without JavaScript and
 * search engines see them. Only those two edits are made (by position in the
 * HTML): the rest of the page stays byte for byte as it was. The rules match
 * table-of-contents.js, which then only adds the behaviours.
 */
export function buildTablesOfContents(html: string): string {
  if (!html.includes('data-pr-table-of-contents')) return html;
  const doc = parse(html, {
    comment: false,
    blockTextElements: { script: true, style: true, pre: true, noscript: true, textarea: true },
  });
  const edits: { at: number; end: number; text: string }[] = [];
  const anchored = new Set<number>();
  const ids = new Set(doc.querySelectorAll('[id]').map((e) => e.getAttribute('id')));

  for (const wrap of doc.querySelectorAll('[data-pr-table-of-contents]')) {
    let config: { mapping?: unknown; list?: boolean; depth?: number };
    try {
      config = JSON.parse(wrap.getAttribute('data-pr-table-of-contents') ?? '{}');
    } catch {
      continue;
    }
    const listWrap = wrap.querySelector('.pr-toc__list-wrap');
    if (!listWrap || listWrap.innerHTML.trim()) continue;
    const block = (wrap.closest('.pr-toc') as HTMLElement | null) ?? wrap;
    const body = doc.querySelector('body') ?? doc;
    const root =
      (block.closest('.entry-content, .wp-block-post-content') as HTMLElement | null) ??
      (block.closest('main, [role="main"]') as HTMLElement | null) ??
      doc.querySelector('main, [role="main"]') ??
      body;
    const levels = Array.isArray(config.mapping)
      ? config.mapping
      : [true, true, true, true, true, true];
    const selector = [1, 2, 3, 4, 5, 6]
      .filter((l) => levels[l - 1] !== false)
      .map((l) => `h${l}`)
      .join(',');
    if (!selector) continue;
    const used = new Map<string, number>();
    const headings: { level: number; text: string; id: string }[] = [];
    for (const element of root.querySelectorAll(selector)) {
      if (element.classList.contains(HIDE_CLASS) || element.closest('template')) continue;
      if (element.closest('.pr-toc')) continue;
      if (root === body && element.closest('header, footer, nav, aside')) continue;
      const text = element.text.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const base = slug(text) || 'toc';
      const n = (used.get(base) ?? 0) + 1;
      used.set(base, n);
      const id = n === 1 ? base : `${base}-${n}`;
      headings.push({ level: Number(element.tagName[1]), text, id });
      // Its anchor, right after the opening tag (once, even with two tables).
      const start = element.range[0];
      if (anchored.has(start) || ids.has(id)) continue;
      const open = /^<h[1-6](?:[^>"']|"[^"]*"|'[^']*')*>/i.exec(
        html.slice(start, element.range[1]),
      );
      if (!open) continue;
      anchored.add(start);
      const at = start + open[0].length;
      edits.push({ at, end: at, text: `<span id="${id}" class="pr-toc__anchor"></span>` });
    }
    if (headings.length === 0) continue;
    const [from, to] = listWrap.range;
    const outer = html.slice(from, to);
    const openEnd = outer.indexOf('>') + 1;
    const closeStart = outer.lastIndexOf('</');
    if (openEnd <= 0 || closeStart < openEnd) continue;
    edits.push({
      at: from + openEnd,
      end: from + closeStart,
      text: renderList(headings, {
        collapsible: Boolean(config.list),
        depth: Number(config.depth) || 5,
      }),
    });
  }
  let out = html;
  for (const edit of edits.sort((a, b) => b.at - a.at)) {
    out = out.slice(0, edit.at) + edit.text + out.slice(edit.end);
  }
  return out;
}
