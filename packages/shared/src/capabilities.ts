/**
 * Capabilities and default roles (docs/SPECIFICATIONS.md §3).
 *
 * Role names follow WordPress for familiarity. The super admin is not a role:
 * it is a global flag that grants every capability on every site.
 */

export const CAPABILITIES = [
  'manage_sites',
  'manage_plugins',
  'activate_plugins',
  'manage_themes',
  'edit_theme_settings',
  'manage_users',
  'promote_users',
  'manage_settings',
  'manage_content_types',
  'manage_taxonomies',
  'manage_menus',
  'edit_others_entries',
  'publish_others_entries',
  'manage_terms',
  'moderate_comments',
  'publish_entries',
  'upload_media',
  'edit_entries',
  'delete_entries',
  'read_private_entries',
  'unfiltered_html',
  'view_audit_log',
  'read',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** Capabilities reserved to super admins; never granted through a site role. */
export const SUPER_ADMIN_ONLY: readonly Capability[] = ['manage_sites', 'manage_plugins'];

export const DEFAULT_ROLE_SLUGS = [
  'administrator',
  'editor',
  'author',
  'contributor',
  'subscriber',
] as const;

export type DefaultRoleSlug = (typeof DEFAULT_ROLE_SLUGS)[number];

const subscriber: Capability[] = ['read'];
const contributor: Capability[] = [...subscriber, 'edit_entries', 'delete_entries'];
const author: Capability[] = [...contributor, 'publish_entries', 'upload_media'];
const editor: Capability[] = [
  ...author,
  'manage_menus',
  'edit_others_entries',
  'publish_others_entries',
  'manage_terms',
  'read_private_entries',
  'moderate_comments',
];
const administrator: Capability[] = [
  ...editor,
  'activate_plugins',
  'manage_themes',
  'edit_theme_settings',
  'manage_users',
  'promote_users',
  'manage_settings',
  'manage_content_types',
  'manage_taxonomies',
  'unfiltered_html',
  'view_audit_log',
];

export const DEFAULT_ROLES: Record<DefaultRoleSlug, { name: string; capabilities: Capability[] }> =
  {
    administrator: { name: 'Administrator', capabilities: administrator },
    editor: { name: 'Editor', capabilities: editor },
    author: { name: 'Author', capabilities: author },
    contributor: { name: 'Contributor', capabilities: contributor },
    subscriber: { name: 'Subscriber', capabilities: subscriber },
  };

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

/** Effective capabilities: everything for super admins, the role's otherwise. */
export function effectiveCapabilities(
  roleCapabilities: readonly string[],
  isSuperAdmin: boolean,
): Capability[] {
  if (isSuperAdmin) return [...CAPABILITIES];
  return roleCapabilities.filter(
    (c): c is Capability => isCapability(c) && !SUPER_ADMIN_ONLY.includes(c),
  );
}
