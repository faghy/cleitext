import { describe, expect, it } from 'vitest';
import {
  CAPABILITIES,
  DEFAULT_ROLES,
  SUPER_ADMIN_ONLY,
  effectiveCapabilities,
} from '../src/capabilities.js';

describe('default roles', () => {
  it('follow the capability matrix of the specifications', () => {
    const has = (role: keyof typeof DEFAULT_ROLES, cap: string) =>
      DEFAULT_ROLES[role].capabilities.includes(cap as never);
    expect(has('administrator', 'manage_users')).toBe(true);
    expect(has('editor', 'manage_users')).toBe(false);
    expect(has('editor', 'manage_menus')).toBe(true);
    expect(has('author', 'publish_entries')).toBe(true);
    expect(has('author', 'edit_others_entries')).toBe(false);
    expect(has('contributor', 'publish_entries')).toBe(false);
    expect(DEFAULT_ROLES.subscriber.capabilities).toEqual(['read']);
  });

  it('never grant super-admin-only capabilities through roles', () => {
    for (const role of Object.values(DEFAULT_ROLES)) {
      for (const cap of SUPER_ADMIN_ONLY) expect(role.capabilities).not.toContain(cap);
    }
  });

  it('are hierarchical: each role includes the one below', () => {
    const order = ['subscriber', 'contributor', 'author', 'editor', 'administrator'] as const;
    for (let i = 1; i < order.length; i++) {
      for (const cap of DEFAULT_ROLES[order[i - 1]!].capabilities) {
        expect(DEFAULT_ROLES[order[i]!].capabilities).toContain(cap);
      }
    }
  });
});

describe('effectiveCapabilities', () => {
  it('grants everything to super admins', () => {
    expect(effectiveCapabilities([], true)).toEqual([...CAPABILITIES]);
  });

  it('drops unknown and super-admin-only capabilities from roles', () => {
    expect(effectiveCapabilities(['read', 'manage_sites', 'bogus'], false)).toEqual(['read']);
  });
});
