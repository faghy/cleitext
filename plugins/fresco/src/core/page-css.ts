/**
 * The page settings of a Fresco page as CSS: the hidden title, the full
 * width layout, the page background (solid or gradient) and the padding
 * around the content. The same rules go into the live page (server) and the
 * editor's canvas.
 */
import { printSheet, settingsSheet } from '@cleitext/design';
import type { Breakpoints, Control, GroupControl, Settings } from './model.js';

/**
 * The element holding the page's top-level Fresco elements (the theme's
 * content column, or the editor's canvas); never a Fresco element, nor the
 * theme's header and footer.
 */
export const PAGE_CONTENT =
  ':has(> .fr-e):not(.fr-e):not(.fr-e *):not(.cx-location):not(.cx-location *)';

/** The controls of the Style tab of the page settings. */
export const PAGE_STYLE_CONTROLS: Control[] = [
  {
    name: 'bg',
    type: 'background',
    label: 'Background',
    tab: 'style',
    section: 'Background',
    selector: 'body',
  } as GroupControl,
  {
    name: 'padding',
    type: 'box',
    label: 'Padding',
    tab: 'style',
    section: 'Padding',
    responsive: true,
    units: ['px', 'em', 'rem', '%', 'vw'],
    selectors: { [PAGE_CONTENT]: 'padding: {{top}} {{right}} {{bottom}} {{left}}' },
  },
];

/**
 * Page settings saved before the Style tab kept the background as one
 * color (`background`): as the Style tab sees them.
 */
export function pageStyleSettings(data: Settings): Settings {
  if (data.bg_type === undefined && typeof data.background === 'string' && data.background) {
    return { ...data, bg_type: 'classic', bg_color: data.background };
  }
  return data;
}

export interface PageCssOptions {
  /** The theme's title, hidden with `hideTitle` (the kit's `titleSelector`), when safe. */
  titleSelector: string | null;
  breakpoints: Breakpoints;
}

/** The CSS of a page's settings (`document.editor.data`), or '' when there is none. */
export function pageCss(data: Settings, options: PageCssOptions): string {
  const rules: string[] = [];
  if (data.hideTitle === true && options.titleSelector) {
    // Never headings of Fresco's elements.
    const scoped = options.titleSelector
      .split(',')
      .map((part) => `${part.trim()}:not(.fr-e *)`)
      .join(',');
    rules.push(`${scoped}{display:none!important}`);
  }
  if (data.layout === 'full' || data.layout === 'canvas') {
    // Top-level containers break out of the theme's content column.
    rules.push(
      '.fr-container:not(.fr-container .fr-container):not(.cx-location .fr-container){width:100vw;max-width:100vw;margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw)}html,body{overflow-x:clip}',
    );
  }
  const settings = pageStyleSettings(data);
  // A gradient is painted on the whole page, also below short content.
  if (settings.bg_type === 'gradient') rules.push('body{min-height:100vh}');
  const style = printSheet(
    settingsSheet(PAGE_STYLE_CONTROLS, settings, settings, ''),
    options.breakpoints,
  );
  return (rules.join('') + style).replace(/<\/?style/gi, '');
}
