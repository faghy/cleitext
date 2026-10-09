import type { FieldDefinition, Label } from './fields.js';

/** A plugin as listed in Plugins (RF-PLG-02). */
export interface PluginView {
  slug: string;
  name: string;
  version: string;
  description: string | null;
  author: string | null;
  homepage: string | null;
  license: string;
  permissions: string[];
  requires: Record<string, string>;
  /** Active on the current site. */
  active: boolean;
  /** `error`: the plugin could not be loaded (see `error`). */
  status: 'loaded' | 'error';
  error: string | null;
  /** What it adds, for transparency. */
  contributes: { types: string[]; blocks: string[]; settings: boolean; admin: boolean };
  /** Time spent in hooks and errors since the server started (RF-PLG-06). */
  stats: { calls: number; errors: number; totalMs: number; lastError: string | null };
}

/** What the admin loads for the plugins active on the site. */
export interface PluginAdminInfo {
  slug: string;
  name: string;
  version: string;
  /** URL of the admin entry (ESM), if any. */
  adminUrl: string | null;
  /** Settings form, when the user may edit it. */
  settings: { title: Label; fields: FieldDefinition[] } | null;
}

/** A block of a plugin, as editors need it: attributes described with fields. */
export interface PluginBlockView {
  type: string;
  plugin: string;
  title: Label;
  description: Label | null;
  icon: string | null;
  category: 'text' | 'media' | 'design' | 'widgets' | 'embed';
  version: number;
  attributes: FieldDefinition[];
}

/** A field group shown on entries of some content types. */
export interface FieldGroupView {
  id: string;
  title: Label;
  fields: FieldDefinition[];
}
