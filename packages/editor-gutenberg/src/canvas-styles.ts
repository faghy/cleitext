import type { EditorMountOptions } from '@cleitext/editor-core';

/** CSS inside a `<style>` of the canvas, never closing it. */
const styleElement = (css: string, id: string) =>
  css.trim()
    ? `<style id="${id}">${css.replace(/<(\/?\s*(?:style|script))/gi, '\\3C $1')}</style>`
    : '';

/**
 * What the canvas iframe gets after the editor's own styles, in the pages'
 * order: the theme's editor styles (RF-THM-03), the plugins' block styles
 * (plugin API 1.23), then the site's Additional CSS (core 0.80). All of it
 * stays inside the iframe, away from the admin's interface.
 */
export function canvasStyles(
  options: Pick<EditorMountOptions, 'styles' | 'styleUrls' | 'additionalCss'>,
): string {
  return [
    styleElement(options.styles ?? '', 'cx-editor-theme-css'),
    ...(options.styleUrls ?? []).map(
      (url) => `<link rel="stylesheet" href="${url.replace(/["<>]/g, '')}">`,
    ),
    styleElement(options.additionalCss ?? '', 'cx-additional-css'),
  ].join('');
}
