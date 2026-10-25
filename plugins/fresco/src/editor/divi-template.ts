/**
 * Divi's layout files (Divi Library → Export, or a layout pack's `.json`):
 * their shortcodes are converted by the WordPress importer's converter
 * (`@cleitext/blocks/divi`). A single file has no media library behind it:
 * images keep their addresses, the file's global colors become plain colors
 * and its presets are applied. Nothing is downloaded.
 */
import { diviPresets, diviToFresco, isDiviLayout, type DiviContext } from '@cleitext/blocks/divi';
import type { FrescoNode } from '../core/model.js';
import { externalImages } from './elementor-template.js';

/** A Divi layout file, as exported. */
export interface DiviLayoutFile {
  context: string;
  data: Record<string, unknown>;
  presets?: unknown;
  global_colors?: unknown;
}

/** Whether some JSON is a Divi layout file (Divi Builder or Divi Library export). */
export function isDiviTemplate(data: unknown): data is DiviLayoutFile {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const file = data as Record<string, unknown>;
  return (
    typeof file.context === 'string' &&
    file.context.startsWith('et_builder') &&
    Boolean(file.data) &&
    typeof file.data === 'object'
  );
}

export interface DiviConversion {
  title: string;
  kind: 'page' | 'section';
  blocks: FrescoNode[];
  /** Modules with no Fresco counterpart: only their text was kept. */
  unconverted: number;
  externalImages: number;
}

/** The layouts of a file: the shortcodes, with their titles when the Library export has them. */
function layoutsOf(file: DiviLayoutFile): { title: string; content: string }[] {
  return Object.values(file.data).flatMap((value) => {
    if (typeof value === 'string')
      return isDiviLayout(value) ? [{ title: '', content: value }] : [];
    const item = (value ?? {}) as Record<string, unknown>;
    const content = typeof item.post_content === 'string' ? item.post_content : '';
    return isDiviLayout(content)
      ? [{ title: typeof item.post_title === 'string' ? item.post_title : '', content }]
      : [];
  });
}

/** The file's global colors (`[[id, { color }]]` or `{ id: { color } }`) by id. */
function fileColors(value: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const entries = Array.isArray(value)
    ? (value as unknown[]).map((pair) => (Array.isArray(pair) ? pair : []))
    : Object.entries((value ?? {}) as Record<string, unknown>);
  for (const [id, entry] of entries) {
    const color = (entry as { color?: unknown } | undefined)?.color;
    if (typeof id === 'string' && typeof color === 'string' && /^#[0-9a-f]{3,8}$/i.test(color))
      out.set(id.toLowerCase().split('-').slice(0, 2).join('-'), color);
  }
  return out;
}

/** A Divi layout file → Fresco elements, with what could not be converted exactly. */
export function convertDiviTemplate(file: DiviLayoutFile): DiviConversion {
  let unconverted = 0;
  const context: DiviContext = {
    warn: () => undefined,
    unconverted: (_type, count) => {
      unconverted += count;
    },
    presets: diviPresets(file.presets),
  };
  const layouts = layoutsOf(file);
  let blocks = layouts.flatMap(
    (layout) => (diviToFresco(layout.content, context) ?? []) as FrescoNode[],
  );
  // The file's global colors are not the site's: their values.
  const colors = fileColors(file.global_colors);
  if (colors.size) {
    blocks = JSON.parse(
      JSON.stringify(blocks).replace(
        /var\(--fr-c-(gcid-[a-z0-9]+)\)/g,
        (whole, id: string) => colors.get(id) ?? whole,
      ),
    ) as FrescoNode[];
  }
  const sections = layouts.reduce(
    (n, l) => n + (l.content.match(/\[et_pb_section\b/g)?.length ?? 0),
    0,
  );
  return {
    title: layouts[0]?.title.trim() ?? '',
    kind: sections > 1 ? 'page' : 'section',
    blocks,
    unconverted,
    externalImages: externalImages(blocks).size,
  };
}
