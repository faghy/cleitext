import type { Capability } from '@cleitext/shared';

export interface Section {
  to: string;
  label: string;
  /** Any of these capabilities makes the section visible. */
  anyOf: Capability[];
  /** Implemented in the current milestone; the others show a placeholder. */
  ready: boolean;
}

/** Admin sections, in the familiar WordPress order. */
export const SECTIONS: Section[] = [
  { to: '/', label: 'Dashboard', anyOf: ['read'], ready: true },
  { to: '/posts', label: 'Posts', anyOf: ['edit_entries'], ready: false },
  { to: '/media', label: 'Media', anyOf: ['upload_media'], ready: false },
  { to: '/pages', label: 'Pages', anyOf: ['edit_entries'], ready: false },
  {
    to: '/appearance',
    label: 'Appearance',
    anyOf: ['manage_themes', 'manage_menus'],
    ready: false,
  },
  { to: '/plugins', label: 'Plugins', anyOf: ['activate_plugins'], ready: false },
  { to: '/users', label: 'Users', anyOf: ['manage_users'], ready: true },
  { to: '/profile', label: 'Profile', anyOf: ['read'], ready: true },
  { to: '/settings', label: 'Settings', anyOf: ['manage_settings'], ready: false },
];

/** Sections the user can see with their capabilities on the current site. */
export function visibleSections(capabilities: readonly string[]): Section[] {
  return SECTIONS.filter((section) => section.anyOf.some((c) => capabilities.includes(c)));
}

export function canAccess(path: string, capabilities: readonly string[]): boolean {
  const section = SECTIONS.find((s) => s.to === path);
  return section ? section.anyOf.some((c) => capabilities.includes(c)) : true;
}
