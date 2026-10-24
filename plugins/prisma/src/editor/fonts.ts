import { select, subscribe } from '@wordpress/data';
import { fontItem, fontWeights, googleCssUrl, googleFonts } from '../lib/extensions';
import type { Attrs } from '../lib/types';

/**
 * The Google fonts of Prisma's blocks in the editor's canvas, loaded as the
 * site loads them (Settings → Prisma → Google Fonts): the site's copies
 * (`local`, asked to the server, which copies a family picked for the first
 * time in a few seconds), Google's (`google`), or none. The editor, too,
 * talks to Google only when the site does.
 */

interface EditorBlock {
  name: string;
  attributes: Attrs;
  innerBlocks: EditorBlock[];
}

/** The `Family:weight` items of Prisma's blocks, as their `data-pr-fonts` on the site. */
export function blockFontItems(blocks: readonly EditorBlock[], out = new Set<string>()): string[] {
  for (const block of blocks) {
    if (block.name.startsWith('prisma/'))
      for (const item of googleFonts(block.attributes)) out.add(item);
    blockFontItems(block.innerBlocks ?? [], out);
  }
  return [...out];
}

/** The stylesheets of the canvas, as the site loads them: `local` maps family → site's copy. */
export function canvasSheets(
  mode: string,
  items: readonly string[],
  local: Readonly<Record<string, string | null>>,
): string[] {
  const weights = fontWeights(items);
  if (mode === 'google') {
    const url = googleCssUrl([...weights].map(([family, w]) => fontItem(family, w)));
    return url ? [url] : [];
  }
  if (mode !== 'local') return [];
  return [...weights.keys()]
    .map((family) => local[family])
    .filter((href): href is string => !!href);
}

/** The canvas's document: the editor's iframe, or the page itself without one. */
function canvasDocument(): Document {
  return (
    document.querySelector<HTMLIFrameElement>('iframe[name="editor-canvas"]')?.contentDocument ??
    document
  );
}

function apply(sheets: readonly string[]): void {
  const doc = canvasDocument();
  if (!doc.head) return;
  const wanted = new Set(sheets);
  for (const link of doc.head.querySelectorAll<HTMLLinkElement>('link[data-pr-font]')) {
    if (!wanted.has(link.getAttribute('href') ?? '')) link.remove();
    else wanted.delete(link.getAttribute('href') ?? '');
  }
  for (const href of wanted) {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-pr-font', '');
    doc.head.append(link);
  }
}

/** Follows the blocks of the editor and keeps the canvas's font stylesheets up to date. */
export function followCanvasFonts(): void {
  if (typeof document === 'undefined') return;
  let key = '';
  let mode = 'local';
  let local: Record<string, string | null> = {};
  let sheets: string[] = [];
  let asked = '';
  let rounds = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const ask = (items: string[]) => {
    const query = items.join('|');
    asked = query;
    fetch(`/api/v1/ext/prisma/fonts/local?fonts=${encodeURIComponent(query)}`, {
      credentials: 'same-origin',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((answer: { mode?: string; fonts?: Record<string, string | null> } | null) => {
        if (!answer || asked !== query) return;
        mode = answer.mode ?? 'local';
        local = { ...local, ...answer.fonts };
        sheets = canvasSheets(mode, items, local);
        apply(sheets);
        // Copies not ready yet: asked again for a while.
        const missing = Object.values(answer.fonts ?? {}).some((href) => !href);
        if (mode === 'local' && missing && rounds++ < 8) {
          setTimeout(() => asked === query && ask(items), 4000);
        }
      })
      .catch(() => {});
  };

  const check = () => {
    timer = undefined;
    const editor = select('core/block-editor') as unknown as { getBlocks(): EditorBlock[] };
    const items = blockFontItems(editor.getBlocks());
    const next = items.sort().join('|');
    if (next !== key) {
      key = next;
      rounds = 0;
      if (items.length) ask(items);
      else apply((sheets = []));
    } else {
      // The canvas may have been drawn again (a new iframe): its links are put back.
      apply(sheets);
    }
  };
  subscribe(() => {
    if (!timer) timer = setTimeout(check, 600);
  });
}
