import { fileTypeFromBuffer } from 'file-type';
import sanitizeHtml from 'sanitize-html';

/**
 * Accepted uploads (RF-MED-02), checked against the file's magic bytes, not
 * its name or the browser-declared type. SVG is refused (RF-MED-09, 1.0).
 */
export const ALLOWED_TYPES: Record<
  string,
  { ext: string; kind: 'image' | 'video' | 'audio' | 'document' }
> = {
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/gif': { ext: 'gif', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'image/avif': { ext: 'avif', kind: 'image' },
  'application/pdf': { ext: 'pdf', kind: 'document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: 'docx',
    kind: 'document',
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    ext: 'xlsx',
    kind: 'document',
  },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    ext: 'pptx',
    kind: 'document',
  },
  'application/vnd.oasis.opendocument.text': { ext: 'odt', kind: 'document' },
  'video/mp4': { ext: 'mp4', kind: 'video' },
  'audio/mpeg': { ext: 'mp3', kind: 'audio' },
  // Only with MEDIA_ALLOW_SVG, after sanitizing (never returned by detectType).
  'image/svg+xml': { ext: 'svg', kind: 'image' },
};

/** Image types for which resized variants are generated. */
export const RESIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export async function detectType(data: Buffer): Promise<string | null> {
  const type = await fileTypeFromBuffer(data);
  return type && type.mime in ALLOWED_TYPES && type.mime !== 'image/svg+xml' ? type.mime : null;
}

/** An SVG file, recognized from its first bytes (file-type does not detect text formats). */
export function looksLikeSvg(data: Buffer): boolean {
  const head = data.subarray(0, 1024).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  return /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head);
}

const SVG_TAGS = [
  'svg',
  'g',
  'defs',
  'symbol',
  'use',
  'title',
  'desc',
  'path',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'rect',
  'text',
  'tspan',
  'textPath',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
];

const SVG_ATTRIBUTES = [
  'xmlns',
  'xmlns:xlink',
  'version',
  'viewBox',
  'preserveAspectRatio',
  'width',
  'height',
  'id',
  'class',
  'role',
  'aria-label',
  'aria-hidden',
  'display',
  'visibility',
  'opacity',
  'transform',
  'd',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'dx',
  'dy',
  'points',
  'pathLength',
  'offset',
  'href',
  'xlink:href',
  'fill',
  'fill-opacity',
  'fill-rule',
  'clip-rule',
  'clip-path',
  'mask',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-opacity',
  'stop-color',
  'stop-opacity',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'fx',
  'fy',
  'patternUnits',
  'patternContentUnits',
  'patternTransform',
  'clipPathUnits',
  'maskUnits',
  'maskContentUnits',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'letter-spacing',
  'word-spacing',
];

/** Only references inside the file (`#id`): no external resources, no scripts. */
const internalHref = (tagName: string, attribs: Record<string, string>) => {
  for (const name of ['href', 'xlink:href']) {
    if (attribs[name] !== undefined && !attribs[name]!.startsWith('#')) delete attribs[name];
  }
  return { tagName, attribs };
};

/**
 * SVG uploads (RF-MED-09): drawing elements and presentation attributes only —
 * no scripts, event handlers, styles, foreign content or external links.
 */
export function sanitizeSvg(svg: string): string {
  return sanitizeHtml(svg, {
    allowedTags: SVG_TAGS,
    allowedAttributes: { '*': SVG_ATTRIBUTES },
    allowedSchemes: [],
    allowProtocolRelative: false,
    parser: { xmlMode: true, lowerCaseTags: false, lowerCaseAttributeNames: false },
    transformTags: Object.fromEntries(
      ['use', 'textPath', 'linearGradient', 'radialGradient', 'pattern'].map((tag) => [
        tag,
        internalHref,
      ]),
    ),
    disallowedTagsMode: 'discard',
  });
}
