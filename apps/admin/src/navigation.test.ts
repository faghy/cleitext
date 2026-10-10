import { DEFAULT_ROLES } from '@cleitext/shared';
import { describe, expect, it } from 'vitest';
import { canAccess, visibleSections } from './navigation';
import { safeRedirect } from './pages/auth-pages';

const labels = (caps: readonly string[]) => visibleSections(caps).map((s) => s.label);

describe('visibleSections', () => {
  it('shows an Administrator every site section', () => {
    expect(labels(DEFAULT_ROLES.administrator.capabilities)).toEqual([
      'Dashboard',
      'Posts',
      'Media',
      'Pages',
      'Appearance',
      'Plugins',
      'Users',
      'Profile',
      'Settings',
      'Content structure',
      'Activity',
      'System status',
    ]);
  });

  it('hides Users, Plugins and Settings from an Editor', () => {
    expect(labels(DEFAULT_ROLES.editor.capabilities)).toEqual([
      'Dashboard',
      'Posts',
      'Media',
      'Pages',
      'Appearance',
      'Profile',
    ]);
  });

  it('shows a Subscriber only the dashboard and their profile', () => {
    expect(labels(DEFAULT_ROLES.subscriber.capabilities)).toEqual(['Dashboard', 'Profile']);
  });

  it('guards direct navigation', () => {
    expect(canAccess('/users', DEFAULT_ROLES.editor.capabilities)).toBe(false);
    expect(canAccess('/users', DEFAULT_ROLES.administrator.capabilities)).toBe(true);
  });
});

describe('safeRedirect', () => {
  it('keeps in-app paths and strips the base path', () => {
    expect(safeRedirect('/users')).toBe('/users');
    expect(safeRedirect('/admin/users?x=1')).toBe('/users?x=1');
    expect(safeRedirect('/admin')).toBe('/');
  });

  it('refuses external targets', () => {
    expect(safeRedirect('https://evil.example')).toBe('/');
    expect(safeRedirect('//evil.example')).toBe('/');
    expect(safeRedirect(undefined)).toBe('/');
  });
});
