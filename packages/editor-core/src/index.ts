import type { CxdDocument } from '@cleitext/blocks';
import type { FieldDefinition } from '@cleitext/shared';

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
  /**
   * Extra blocks (from plugins) described by their attributes: the editor
   * builds their editing form itself, so they work with any editor.
   */
  fieldBlocks?: FieldBlockDefinition[];
  /** CSS of the site's theme for the canvas, so content looks like the site. */
  styles?: string;
  /** Stylesheets of plugins' blocks for the canvas (plugin API 1.23), after the theme's. */
  styleUrls?: string[];
  /**
   * Shortcuts handled by the host page (e.g. save), listed in the editor's
   * keyboard shortcuts help next to the editor's own (RF-EDT-06).
   */
  hostShortcuts?: HostShortcut[];
  /** Called with the full document after every change. */
  onChange(document: CxdDocument): void;
  /**
   * Called when blocks get selected (`true`) or the selection is cleared
   * (`false`), so the host can show the block's settings, as WordPress does.
   */
  onSelectionChange?(selected: boolean): void;
}

export interface HostShortcut {
  description: string;
  /** `primary` is Ctrl, or Cmd on Apple devices; `access` is Shift+Alt (Ctrl+Option on Apple). */
  modifier?: 'primary' | 'primaryShift' | 'primaryAlt' | 'access';
  character: string;
}

export interface EditorServices {
  uploadMedia?(file: File): Promise<MediaRef>;
  /** Media library browsing, for the editor's media picker. */
  listMedia?(query: { kind?: 'image'; search?: string }): Promise<MediaRef[]>;
  searchLinks?(query: string): Promise<LinkSuggestion[]>;
  /** Saved block patterns (RF-EDT-07). */
  listPatterns?(): Promise<PatternRef[]>;
  /** Saves blocks as a new pattern. */
  savePattern?(input: {
    title: string;
    document: CxdDocument;
    synced: boolean;
  }): Promise<PatternRef>;
  /** Embed preview (oEmbed response), or null when the address cannot be embedded. */
  oembed?(url: string): Promise<EmbedPreview | null>;
}

export interface EmbedPreview {
  type: string;
  provider_name: string;
  html: string;
  width?: number;
  height?: number;
}

export interface PatternRef {
  id: string;
  title: string;
  document: CxdDocument;
  synced: boolean;
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
  /** Replaces the content (e.g. after restoring a revision). Does not call `onChange`. */
  setDocument(document: CxdDocument): void;
  destroy(): void;
}

/** A block whose attributes are described with the field DSL. */
export interface FieldBlockDefinition {
  type: string;
  title: string;
  description?: string;
  /** Dashicon name, e.g. `calendar`. */
  icon?: string;
  category: 'text' | 'media' | 'design' | 'widgets' | 'embed';
  version: number;
  attributes: FieldDefinition[];
  /**
   * Registered by the plugin's own editor entry (plugin API 1.23): only its
   * CXD conversion is set up here, never a generated form.
   */
  native?: boolean;
  richAttributes?: string[];
  container?: boolean;
}
