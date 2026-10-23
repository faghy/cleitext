/**
 * Elementor template files (Templates → Export in Elementor, or the `.json`
 * files of template sites): their `content` is Elementor's data, converted by
 * the WordPress importer's converter (`@cleitext/blocks/elementor`). A single
 * file has no media library or kit behind it: images keep their addresses,
 * global colors and fonts point to the site's own, and links to other
 * templates or posts are left out. Nothing is downloaded.
 */
import {
  elementorToFresco,
  takeStretched,
  type ElementorContext,
  type ElementorNode,
} from '@cleitext/blocks/elementor';
import type { FrescoNode } from '../core/model.js';

/** An Elementor template file, as exported. */
export interface ElementorTemplateFile {
  version?: string;
  title?: string;
  type?: string;
  content: ElementorNode[];
  page_settings?: unknown;
}

/** Whether some JSON is an Elementor template file (not a kit or a Fresco file). */
export function isElementorTemplate(data: unknown): data is ElementorTemplateFile {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const file = data as Record<string, unknown>;
  return (
    Array.isArray(file.content) &&
    (typeof file.version === 'string' || typeof file.type === 'string')
  );
}

export interface ElementorConversion {
  title: string;
  kind: 'page' | 'section';
  blocks: FrescoNode[];
  /** Widgets with no Fresco counterpart: only their text was kept. */
  unconverted: number;
  /** Images (distinct addresses) still loaded from where they were. */
  externalImages: number;
}

/** Placeholder of a shortcode (see `@cleitext/blocks/html`): only the import pipeline resolves it. */
const IMPORTED = 'core/imported';

/** Shortcode placeholders become the elements they stand for (the text of the shortcode). */
function withoutPlaceholders(nodes: FrescoNode[]): FrescoNode[] {
  return nodes.flatMap((node) => {
    if (node.type === IMPORTED) {
      const fallback = node.attrs.fallback;
      return Array.isArray(fallback) ? withoutPlaceholders(fallback as FrescoNode[]) : [];
    }
    return [node.children ? { ...node, children: withoutPlaceholders(node.children) } : node];
  });
}

/** Addresses of the images (media values without a library id) a tree uses. */
export function externalImages(nodes: FrescoNode[]): Set<string> {
  const found = new Set<string>();
  const scan = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(scan);
    else if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>;
      if (v.id === null && typeof v.url === 'string' && /^(https?:)?\/\//i.test(v.url))
        found.add(v.url);
      Object.values(v).forEach(scan);
    }
  };
  for (const node of nodes) {
    scan(node.attrs);
    if (node.children) externalImages(node.children).forEach((url) => found.add(url));
  }
  return found;
}

/** An Elementor template file → Fresco elements, with what could not be converted exactly. */
export function convertElementorTemplate(file: ElementorTemplateFile): ElementorConversion {
  let unconverted = 0;
  const context: ElementorContext = {
    // Not in this site's media library: images keep their addresses.
    mediaRef: () => undefined,
    // The converter's notes are for the import report; counts are enough here.
    warn: () => undefined,
    unconverted: (_type, count) => {
      unconverted += count;
    },
  };
  const converted = (elementorToFresco(JSON.stringify(file.content), context) ??
    []) as FrescoNode[];
  // Stretched sections only matter inside a theme's content column.
  takeStretched(converted);
  const blocks = withoutPlaceholders(converted);
  return {
    title: typeof file.title === 'string' ? file.title.trim() : '',
    kind: file.type === 'page' ? 'page' : 'section',
    blocks,
    unconverted,
    externalImages: externalImages(blocks).size,
  };
}
