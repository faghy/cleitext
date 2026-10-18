import type { CxdBlock, CxdInline } from '@cleitext/plugin-sdk';
import type { ReactNode } from 'react';
import type { Sheet } from '@cleitext/design';
import type { Globals } from './globals';

/** A block's attributes: sparse, as saved (defaults are added before use). */
export type Attrs = Record<string, unknown>;

/** How a block's text attribute is drawn: HTML on the site, RichText in the editor. */
export type TextRenderer = (
  name: string,
  props: { tagName: string; className?: string; placeholder?: string },
) => ReactNode;

/** How a container's inner blocks are placed: a wrapper element with a class. */
export type InnerRenderer = (props: { className?: string; tagName?: string }) => ReactNode;

/**
 * The block's root element. In the editor it carries the block's editor
 * props; with `holdsChildren`, the inner blocks go straight into it (after
 * `content`), as in containers without an inner wrapper.
 */
export type RootRenderer = (
  tagName: string,
  props: { className: string; id?: string; style?: Record<string, string> },
  content: ReactNode,
  holdsChildren?: boolean,
) => ReactNode;

export interface ViewProps {
  /** Attributes with their defaults. */
  attrs: Attrs;
  /** The block's id in its CSS class (`pr-block-<id>`). */
  id: string;
  text: TextRenderer;
  inner: InnerRenderer;
  root: RootRenderer;
  /** True in the editor's canvas. */
  editing: boolean;
  /** The site's defaults (Settings → Prisma). */
  globals: Globals;
  /** Media of the page, by id (site only): addresses and sizes. */
  media?: (id: unknown) => { url: string; width: number | null; height: number | null } | null;
}

/** One Prisma block: the same definition on the site and in the editor. */
export interface PrismaBlock {
  /** `container` → `prisma/container`. */
  name: string;
  title: string;
  description: string;
  /** Words that find it in the inserter. */
  keywords?: string[];
  /** Holds other blocks (InnerBlocks). */
  container?: boolean;
  /** Children it holds: only these block types (e.g. buttons → button). */
  allowedBlocks?: string[];
  /** Only inside these parents (e.g. a button inside buttons). */
  parent?: string[];
  /** Attributes edited as rich text, stored as CXD inline nodes. */
  richAttributes?: string[];
  /** Every attribute with its default. */
  defaults: Attrs;
  /** Its CSS rules, scoped by `.pr-block-<id>`, with the site's defaults. */
  css(attrs: Attrs, scope: string, sheet: Sheet, globals: Globals): void;
  /** Its markup. */
  View(props: ViewProps): ReactNode;
  /** Media ids its attributes use, preloaded on the site. */
  media?(attrs: Attrs): string[];
  /**
   * Its script on the site (a file of `src/public`, built to `dist/public`),
   * loaded only on pages whose HTML contains `marker`.
   */
  script?: { file: string; marker: string };
  /** Spectra blocks it replaces on WordPress import, by name (`uagb/review`). */
  spectra?: Record<string, SpectraImporter>;
}

/** A Spectra block → Prisma blocks, on WordPress import. */
export type SpectraImporter = (attrs: Attrs, source: SpectraSource) => CxdBlock[];

export interface SpectraSource {
  /** The block's saved HTML. */
  html: string;
  /** Its inner blocks, already converted. */
  children: CxdBlock[];
  /** A Prisma block (`review` → `prisma/review`); its rich text attributes given as HTML become rich text. */
  block(name: string, attrs: Attrs, children?: CxdBlock[]): CxdBlock;
  /** HTML → rich text, with WordPress's typography. */
  rich(html: string): CxdInline[];
  /** The inner HTML of the first `<tag class="… className …">`, or ''. */
  inner(tag: string, className: string): string;
  /** The same, for any tag. */
  innerAny(className: string): string;
}
