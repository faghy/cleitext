import type { LicenseView } from './licenses.js';

import type { FieldDefinition, Label } from './fields.js';
import type {
  FieldGroupPosition,
  FieldGroupSource,
  HideOnScreen,
  LocationRules,
} from './field-groups.js';

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
  /** Active on every site, by a super admin (RF-PLG-15). */
  network: boolean;
  /** Must-use: always active, installed with `plugin:install --required`. */
  mustUse: boolean;
  /** `error`: the plugin could not be loaded (see `error`). */
  status: 'loaded' | 'error';
  error: string | null;
  /** What it adds, for transparency. */
  contributes: {
    types: string[];
    taxonomies: string[];
    blocks: string[];
    settings: boolean;
    admin: boolean;
  };
  /** Time spent in hooks and errors since the server started (RF-PLG-06). */
  stats: { calls: number; errors: number; totalMs: number; lastError: string | null };
  /** Paid plugin (RF-CAT-03): where to buy it and this site's license; null when free. */
  paid: { purchaseUrl: string | null; license: LicenseView | null } | null;
}

/** What the admin loads for the plugins active on the site. */
export interface PluginAdminInfo {
  slug: string;
  name: string;
  version: string;
  /** URL of the admin entry (ESM), if any. */
  adminUrl: string | null;
  /** URL of the block editor entry (ESM, plugin API 1.23), if any. */
  editorUrl?: string | null;
  /** Styles for the block editor's canvas (plugin API 1.23). */
  editorStyles?: string[];
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
  /** Edited by the plugin's own editor entry (`schema: 'json'`, plugin API 1.23). */
  native?: boolean;
  richAttributes?: string[];
  container?: boolean;
}

/** A field group shown on entries of some content types. */
export interface FieldGroupView {
  id: string;
  title: Label;
  fields: FieldDefinition[];
  /** Where it shows (plugin API 1.47); groups of plugins get rules from their `types`. */
  location?: LocationRules;
  position?: FieldGroupPosition;
  order?: number;
  labelPlacement?: 'top' | 'left';
  description?: Label;
  /** Parts of the entry editor hidden where the group shows (plugin API 1.49). */
  hideOnScreen?: HideOnScreen[];
  /** `site` (the owners'), `theme` or `plugin:<slug>`. */
  source?: FieldGroupSource;
  /**
   * Where values are kept: `fields` (default), under `fields[<id>]`; `document`
   * for the theme's page options, in the document's `editor.data`.
   */
  storage?: 'fields' | 'document';
}

/** The field groups an admin screen may show, with their rules (plugin API 1.47). */
export interface FieldScreenView {
  groups: FieldGroupView[];
  /** Entries: the page templates the theme offers (`pageTemplates`). */
  templates: { name: string; label: Label; types?: string[] }[];
}

/** A person's user fields and the groups shown for them (plugin API 1.47). */
export interface UserFieldsView {
  values: Record<string, unknown>;
  groups: FieldGroupView[];
}
