/**
 * Which elements the editor's panel offers: not those switched off in the
 * Element manager, not Fresco Pro's elements that free Fresco now has with
 * the same settings, not plugin blocks that their plugin gives as elements,
 * and in Safe mode only Fresco's and Fresco Pro's.
 */
import type { ElementDefinition } from '../core/model.js';
import { getElement } from '../core/registry.js';

/**
 * Fresco Pro's elements that free Fresco has too (Fresco 2.4, as Elementor
 * made them free): pages keep the Pro ones, drawn and edited by Fresco Pro;
 * the panel offers the free ones, with the same settings.
 */
export const REPLACED_BY_FREE: Readonly<Record<string, string>> = {
  'fresco-pro/floating-buttons': 'fresco/floating-buttons',
  'fresco-pro/link-in-bio': 'fresco/link-in-bio',
};

/** The hash of the editor's address that opens it in Safe mode. */
export const SAFE_MODE_HASH = '#fresco-safe';

/** Elements of Fresco and Fresco Pro (in Safe mode, the only ones offered). */
export function isFrescoElement(type: string): boolean {
  return /^fresco(-pro)?\//.test(type) && !type.startsWith('fresco/block:');
}

/** Whether the panel (and the Finder) offer an element. */
export function offered(
  definition: Pick<ElementDefinition, 'type' | 'hidden'>,
  options: { disabled: readonly string[]; safeMode: boolean },
): boolean {
  if (definition.hidden) return false;
  if (options.disabled.includes(definition.type)) return false;
  if (options.safeMode && !isFrescoElement(definition.type)) return false;
  const free = REPLACED_BY_FREE[definition.type];
  if (free && getElement(free)) return false;
  // A plugin block that its plugin also gives as an element of its own (e.g. Diorama's
  // slider) is offered once, as that element.
  const block = /^fresco\/block:(.+)$/.exec(definition.type)?.[1];
  return !(block && getElement(block));
}

/** The settings of the Element manager, as saved (unknown values dropped). */
export function normalizeElementManager(value: unknown): { disabled: string[] } {
  const list = (value as { disabled?: unknown } | null)?.disabled;
  if (!Array.isArray(list)) return { disabled: [] };
  const disabled = [
    ...new Set(
      list.filter(
        (type): type is string =>
          typeof type === 'string' &&
          /^[a-z0-9-]+\/[\w:/-]{1,120}$/.test(type) &&
          // The container is what every page is made of: never switched off.
          type !== 'fresco/container',
      ),
    ),
  ];
  return { disabled: disabled.slice(0, 500) };
}

const SAFE_KEY = 'fresco:safe-mode';

/**
 * Whether the editor opens in Safe mode: asked by the address (`#fresco-safe`,
 * then taken away), and kept for this browser tab until it is switched off.
 */
export function readSafeMode(): boolean {
  try {
    if (window.location.hash === SAFE_MODE_HASH) {
      sessionStorage.setItem(SAFE_KEY, '1');
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    return sessionStorage.getItem(SAFE_KEY) === '1';
  } catch {
    return window.location.hash === SAFE_MODE_HASH;
  }
}

/** Switches Safe mode on for this tab (the editor is then opened again). */
export function enterSafeMode(): void {
  try {
    sessionStorage.setItem(SAFE_KEY, '1');
  } catch {
    // Without storage, the address asks for it.
    window.location.hash = SAFE_MODE_HASH;
  }
}

/** Switches Safe mode off for this tab (the editor is then opened again). */
export function leaveSafeMode(): void {
  try {
    sessionStorage.removeItem(SAFE_KEY);
  } catch {
    // Nothing kept.
  }
}

/**
 * Safe mode in the canvas: the styles of the theme and of other plugins are
 * switched off; Fresco's own (its styles, the kit, the page's) stay.
 */
export function disableForeignStyles(doc: Document): number {
  let count = 0;
  const own = (href: string) => /\/plugin-assets\/fresco(-pro)?\//.test(href);
  for (const link of doc.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]')) {
    if (own(link.getAttribute('href') ?? '') || link.hasAttribute('data-fre-font')) continue;
    link.disabled = true;
    link.setAttribute('data-fre-safe-off', '');
    count++;
  }
  for (const style of doc.querySelectorAll<HTMLStyleElement>('style')) {
    // Fresco's (the kit, the page settings) and those the editor adds in the canvas.
    // `data-cx-blocks`: the CSS of the plugin blocks drawn by the server (Fresco's templates too).
    if (
      /^fr-|^frp-/.test(style.id) ||
      style.hasAttribute('data-cx-blocks') ||
      style.closest('[data-fre-ui], .fre-tree')
    )
      continue;
    style.media = 'not all';
    style.setAttribute('data-fre-safe-off', '');
    count++;
  }
  return count;
}
