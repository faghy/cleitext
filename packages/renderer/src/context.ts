import type { CxdDocument } from '@cleitext/blocks';
import { createContext, useContext } from 'react';
import type { BlockRenderer } from './blocks.js';

/** A media file as the renderer needs it (original plus resized variants). */
export interface RenderMedia {
  id: string;
  url: string;
  mime: string;
  width: number | null;
  height: number | null;
  alt: string;
  variants: { variant: string; format: string; url: string; width: number; height: number }[];
  /** Kept in view when CSS crops the image (object-fit: cover). */
  focalPoint?: { x: number; y: number } | null;
}

/** Data the server preloads before rendering (rendering is synchronous). */
export interface RenderContext {
  /** Media referenced by the document, by id. */
  media: ReadonlyMap<string, RenderMedia>;
  /** Documents of the synced patterns used by the document, by id (RF-EDT-07). */
  patterns?: ReadonlyMap<string, CxdDocument>;
  /** Content language, for `lang`-sensitive output. */
  locale: string;
  /** Load the first image eagerly (LCP), the others lazily. */
  eagerFirstImage?: boolean;
  /** Images rendered so far in the current document (set by `<Blocks>`). */
  imageCounter?: { n: number };
  /** Renderers for this page only (e.g. blocks of plugins active on the site). */
  renderers?: ReadonlyMap<string, BlockRenderer>;
}

const DEFAULT: RenderContext = { media: new Map(), locale: 'en', eagerFirstImage: true };

export const RenderContextReact = createContext<RenderContext>(DEFAULT);

export function useRenderContext(): RenderContext {
  return useContext(RenderContextReact);
}
