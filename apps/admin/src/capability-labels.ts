/** Readable names of the core capabilities (RF-USR-06), as English source texts. */
export const CAPABILITY_LABELS: Record<string, string> = {
  read: 'Use the admin',
  edit_entries: 'Write their own content',
  delete_entries: 'Delete their own content',
  publish_entries: 'Publish their own content',
  edit_others_entries: 'Edit content of others',
  publish_others_entries: 'Publish content of others',
  read_private_entries: 'See private content',
  upload_media: 'Upload media',
  manage_terms: 'Manage categories and tags',
  moderate_comments: 'Moderate comments',
  manage_menus: 'Manage menus',
  manage_taxonomies: 'Manage taxonomies',
  manage_content_types: 'Manage content types',
  manage_themes: 'Manage themes',
  edit_theme_settings: 'Change theme settings',
  activate_plugins: 'Activate plugins',
  manage_users: 'Manage users',
  promote_users: 'Change roles and add users',
  manage_settings: 'Change site settings',
  unfiltered_html: 'Publish unfiltered HTML',
  view_audit_log: 'See the activity log',
};

/** Groups for the role editor. */
export const CAPABILITY_GROUPS: { title: string; capabilities: string[] }[] = [
  {
    title: 'Content',
    capabilities: [
      'read',
      'edit_entries',
      'delete_entries',
      'publish_entries',
      'edit_others_entries',
      'publish_others_entries',
      'read_private_entries',
      'upload_media',
      'unfiltered_html',
    ],
  },
  {
    title: 'Structure',
    capabilities: [
      'manage_terms',
      'manage_menus',
      'manage_taxonomies',
      'manage_content_types',
      'manage_themes',
      'edit_theme_settings',
    ],
  },
  {
    title: 'Administration',
    capabilities: [
      'manage_users',
      'promote_users',
      'manage_settings',
      'activate_plugins',
      'view_audit_log',
    ],
  },
];
