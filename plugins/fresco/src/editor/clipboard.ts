/**
 * Copy and paste through the system clipboard, also between sites (as
 * Elementor's "Paste from other site"): copied elements go into the clipboard
 * as JSON (a stable format, with its own media type and as plain text), with
 * the address of the site they come from. Pasted on another site, their
 * images are copied into this site's media library when the other site lets
 * them be read; otherwise they keep pointing to it.
 */
import type { EditorMedia } from '@cleitext/admin-sdk';
import type { FrescoNode } from '../core/model.js';

/** The clipboard's media type of Fresco elements. */
export const CLIPBOARD_TYPE = 'application/x-fresco+json';
/** The marker of the format (and its version) in the JSON. */
const FORMAT = 'cleitext/fresco';

export interface ClipboardPayload {
  /** The site the elements were copied from (`https://example.com`). */
  origin: string;
  nodes: FrescoNode[];
}

const isNode = (value: unknown): value is FrescoNode =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as FrescoNode).id === 'string' &&
  typeof (value as FrescoNode).type === 'string' &&
  /^[\w-]+\/[\w:/.-]+$/.test((value as FrescoNode).type) &&
  (value as FrescoNode).attrs !== null &&
  typeof (value as FrescoNode).attrs === 'object' &&
  ((value as FrescoNode).children === undefined || Array.isArray((value as FrescoNode).children));

/** Elements as the clipboard's text. */
export function encodeClipboard(nodes: FrescoNode[], origin: string): string {
  return JSON.stringify({ [FORMAT]: 1, origin, nodes });
}

/** Fresco elements in some clipboard text, or null when it is anything else. */
export function decodeClipboard(text: string | null | undefined): ClipboardPayload | null {
  if (!text || text.length > 5_000_000 || !text.trimStart().startsWith('{')) return null;
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    if (data[FORMAT] !== 1 || !Array.isArray(data.nodes)) return null;
    const valid = (node: unknown): boolean =>
      isNode(node) && (node.children ?? []).every((child) => valid(child));
    const nodes = data.nodes.filter(valid) as FrescoNode[];
    if (nodes.length === 0) return null;
    return { origin: typeof data.origin === 'string' ? data.origin : '', nodes };
  } catch {
    return null;
  }
}

/** A media value of the settings: an object with an address (and an id in the library). */
interface MediaLike {
  url: string;
  id?: string;
  [key: string]: unknown;
}

const isMediaLike = (value: unknown): value is MediaLike =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  typeof (value as MediaLike).url === 'string';

/** Calls `fn` on every media value of the elements' settings (nested ones too). */
function eachMedia(nodes: FrescoNode[], fn: (media: MediaLike) => MediaLike): FrescoNode[] {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (isMediaLike(value) && /\.\w{2,5}(\?|#|$)|^\/media\//.test(value.url)) return fn(value);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v)]));
    }
    return value;
  };
  return nodes.map((node) => ({
    ...node,
    attrs: visit(node.attrs) as FrescoNode['attrs'],
    ...(node.children ? { children: eachMedia(node.children, fn) } : {}),
  }));
}

/**
 * Elements copied on another site, ready for this one: their media lose the
 * other site's ids and get full addresses (still shown, from the other site).
 * Elements from this same site are returned as they are.
 */
export function remapMedia(payload: ClipboardPayload, here: string): FrescoNode[] {
  if (!payload.origin || payload.origin === here) return payload.nodes;
  return eachMedia(payload.nodes, (media) => {
    const rest: MediaLike = { ...media };
    delete rest.id;
    return {
      ...rest,
      url: media.url.startsWith('/') ? `${payload.origin}${media.url}` : media.url,
    };
  });
}

/** The addresses of other sites' media in the elements (each once). */
export function foreignMedia(nodes: FrescoNode[], here: string): string[] {
  const found = new Set<string>();
  eachMedia(nodes, (media) => {
    if (
      /^https?:\/\//.test(media.url) &&
      !media.url.startsWith(`${here}/`) &&
      !media.id &&
      /\.(jpe?g|png|gif|webp|avif|svg)(\?|#|$)/i.test(media.url)
    )
      found.add(media.url);
    return media;
  });
  return [...found];
}

/**
 * Copies other sites' images into this site's media library, when they can
 * be read from here (the other site allows it): their values then point to
 * the copies. Those that cannot be read keep their address.
 */
export async function importMedia(
  nodes: FrescoNode[],
  here: string,
  upload: (file: File) => Promise<EditorMedia>,
  fetcher: typeof fetch = fetch,
): Promise<{ nodes: FrescoNode[]; copied: number; failed: number }> {
  const urls = foreignMedia(nodes, here).slice(0, 40);
  const copies = new Map<string, EditorMedia>();
  let failed = 0;
  for (const url of urls) {
    try {
      const response = await fetcher(url, { mode: 'cors', credentials: 'omit' });
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      if (!/^image\//.test(blob.type) || blob.size > 20 * 1024 * 1024) throw new Error(blob.type);
      const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'image');
      copies.set(url, await upload(new File([blob], name, { type: blob.type })));
    } catch {
      failed++;
    }
  }
  if (copies.size === 0) return { nodes, copied: 0, failed };
  return {
    nodes: eachMedia(nodes, (media) => {
      const copy = copies.get(media.url);
      return copy ? { ...media, id: copy.id, url: copy.url } : media;
    }),
    copied: copies.size,
    failed,
  };
}

/** Writes elements to the system clipboard (from a click: the browser allows it). */
export async function writeSystemClipboard(nodes: FrescoNode[], origin: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(encodeClipboard(nodes, origin));
    return true;
  } catch {
    return false;
  }
}

/** Reads Fresco elements from the system clipboard, when the browser lets the page read it. */
export async function readSystemClipboard(): Promise<ClipboardPayload | null> {
  try {
    // Only where the browser asks with a permission (Chromium): others show a
    // "Paste" button of their own, and the box of the editor is clearer.
    const permission = await navigator.permissions.query({
      name: 'clipboard-read' as PermissionName,
    });
    if (permission.state === 'denied') return null;
    // Firefox and Safari answer "prompt" too, then wait for their own Paste button.
    if (permission.state !== 'granted' && !('userAgentData' in navigator)) return null;
    return decodeClipboard(await navigator.clipboard.readText());
  } catch {
    return null;
  }
}
