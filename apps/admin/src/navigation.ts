import type { Capability } from '@cleitext/shared';
import { MENU_ICONS } from './components/menu-icons';

export interface Section {
  to: string;
  label: string;
  /** Sidebar icon (SVG path data, components/menu-icons.tsx). */
  icon: string;
  /** Any of these capabilities makes the section visible. */
  anyOf: Capability[];
  /** Implemented in the current milestone; the others show a placeholder. */
  ready: boolean;
  /** Shown in the submenu of this section, not in the sidebar on its own (Tools → Redirects). */
  parent?: string;
  /** Not in the sidebar for users with any of these (Profile is under Users for user managers). */
  hiddenWith?: Capability[];
}

/** Admin sections, in the familiar WordPress order. */
export const SECTIONS: Section[] = [
  { to: '/', icon: MENU_ICONS.dashboard, label: 'Dashboard', anyOf: ['read'], ready: true },
  {
    to: '/updates',
    icon: MENU_ICONS.updates,
    label: 'Updates',
    anyOf: ['manage_plugins'],
    ready: true,
  },
  { to: '/posts', icon: MENU_ICONS.posts, label: 'Posts', anyOf: ['edit_entries'], ready: true },
  { to: '/media', icon: MENU_ICONS.media, label: 'Media', anyOf: ['upload_media'], ready: true },
  { to: '/pages', icon: MENU_ICONS.pages, label: 'Pages', anyOf: ['edit_entries'], ready: true },
  {
    to: '/comments',
    icon: MENU_ICONS.comments,
    label: 'Comments',
    anyOf: ['moderate_comments'],
    ready: true,
  },
  {
    to: '/appearance',
    icon: MENU_ICONS.appearance,
    label: 'Appearance',
    anyOf: ['manage_themes', 'manage_menus'],
    ready: true,
  },
  {
    to: '/plugins',
    icon: MENU_ICONS.plugins,
    label: 'Plugins',
    anyOf: ['activate_plugins'],
    ready: true,
  },
  { to: '/users', icon: MENU_ICONS.users, label: 'Users', anyOf: ['manage_users'], ready: true },
  // As in WordPress: Profile is under Users for who manages them, on its own for the others.
  {
    to: '/profile',
    icon: MENU_ICONS.profile,
    label: 'Profile',
    anyOf: ['read'],
    hiddenWith: ['manage_users'],
    ready: true,
  },
  {
    to: '/assistants',
    icon: MENU_ICONS.assistants,
    label: 'Chriss',
    anyOf: ['edit_entries'],
    ready: true,
  },
  {
    to: '/settings',
    icon: MENU_ICONS.settings,
    label: 'Settings',
    anyOf: ['manage_settings'],
    ready: true,
  },
  // Tools: what keeps the site in order, in one place.
  {
    to: '/tools',
    icon: MENU_ICONS.tools,
    label: 'Tools',
    anyOf: ['manage_settings', 'manage_content_types', 'manage_taxonomies', 'manage_sites'],
    ready: true,
  },
  {
    to: '/redirects',
    icon: MENU_ICONS.redirects,
    label: 'Redirects',
    anyOf: ['manage_settings'],
    parent: '/tools',
    ready: true,
  },
  {
    to: '/structure',
    icon: MENU_ICONS.structure,
    label: 'Content structure',
    anyOf: ['manage_content_types', 'manage_taxonomies'],
    parent: '/tools',
    ready: true,
  },
  {
    to: '/activity',
    icon: MENU_ICONS.activity,
    label: 'Activity',
    anyOf: ['manage_settings'],
    parent: '/tools',
    ready: true,
  },
  {
    to: '/system',
    icon: MENU_ICONS.system,
    label: 'System status',
    anyOf: ['manage_settings'],
    parent: '/tools',
    ready: true,
  },
  {
    to: '/sites',
    icon: MENU_ICONS.sites,
    label: 'Sites',
    anyOf: ['manage_sites'],
    parent: '/tools',
    ready: true,
  },
];

const allowed = (section: Section, capabilities: readonly string[]) =>
  section.anyOf.some((c) => capabilities.includes(c));

/** Sections of the sidebar the user can see with their capabilities on the current site. */
export function visibleSections(capabilities: readonly string[]): Section[] {
  return SECTIONS.filter(
    (section) =>
      !section.parent &&
      allowed(section, capabilities) &&
      !section.hiddenWith?.some((c) => capabilities.includes(c)),
  );
}

/** The sections inside another one (Tools → Redirects, Activity…) the user can open. */
export function childSections(parent: string, capabilities: readonly string[]): Section[] {
  return SECTIONS.filter((section) => section.parent === parent && allowed(section, capabilities));
}

export function canAccess(path: string, capabilities: readonly string[]): boolean {
  const section = SECTIONS.find((s) => s.to === path);
  return section ? section.anyOf.some((c) => capabilities.includes(c)) : true;
}
