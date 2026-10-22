/**
 * How a kind of document is edited, as plugins say (Fresco Pro: a popup is
 * edited as a box over a dark background, not as a page). Plugins push to
 * `extensions().documentKinds`; the first answer counts.
 */
import { extensions } from '../core/extensions.js';

export interface DocumentKind {
  /** False: none of the theme's page settings (hide title, layout, featured image). */
  pageFields?: boolean;
  /** CSS added to the canvas, live (e.g. the popup's width and position). */
  frameCss?: string;
}

export type DocumentKindProvider = (doc: {
  type: string;
  page: Record<string, unknown>;
}) => DocumentKind | undefined;

export function documentKind(type: string, page: Record<string, unknown>): DocumentKind {
  const providers =
    (extensions() as unknown as { documentKinds?: DocumentKindProvider[] }).documentKinds ?? [];
  for (const provider of providers) {
    try {
      const kind = provider({ type, page });
      if (kind) return kind;
    } catch {
      // A failing plugin never breaks the editor.
    }
  }
  return {};
}
