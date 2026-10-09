import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Renders a full page (`<html>…</html>`) to a string. No hydration markers:
 * public pages ship no JavaScript by default (docs/ARCHITECTURE.md §12.3).
 */
export function renderHtmlDocument(element: ReactElement): string {
  return `<!doctype html>${renderToStaticMarkup(element)}`;
}
