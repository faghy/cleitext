import type { CxdDocument } from '@cleitext/blocks';

/**
 * Editor-independent contract between the admin and a block editor
 * (docs/ARCHITECTURE.md §10.2). Gutenberg is one implementation; switching
 * editor means providing another adapter, with no change to stored content.
 */
export interface EditorAdapter {
  /** e.g. 'gutenberg' */
  id: string;
  mount(options: EditorMountOptions): EditorInstance;
}

export interface EditorMountOptions {
  /** Initial content. */
  document: CxdDocument;
  /** Where the editor renders: the canvas and, optionally, the block settings. */
  targets: { canvas: HTMLElement; inspector?: HTMLElement | null };
  /** Services implemented by Cleitext, never by the editor's own platform. */
  services: EditorServices;
  /** Content language (BCP 47). */
  locale: string;
  readOnly?: boolean;
  /** Called with the full document after every change. */
  onChange(document: CxdDocument): void;
}

export interface EditorServices {
  uploadMedia?(file: File): Promise<MediaRef>;
  /** Media library browsing, for the editor's media picker. */
  listMedia?(query: { kind?: 'image'; search?: string }): Promise<MediaRef[]>;
  searchLinks?(query: string): Promise<LinkSuggestion[]>;
}

export interface MediaRef {
  id: string;
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  mime: string;
  /** Small preview, when available. */
  thumbnailUrl?: string;
}

export interface LinkSuggestion {
  id: string;
  title: string;
  url: string;
  type: string;
}

export interface EditorInstance {
  getDocument(): CxdDocument;
  /** Replaces the content (e.g. after restoring a revision). */
  setDocument(document: CxdDocument): void;
  destroy(): void;
}
