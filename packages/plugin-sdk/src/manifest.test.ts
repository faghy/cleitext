import { describe, expect, it } from 'vitest';
import { pluginManifestSchema, pluginSchemaName } from './manifest.js';

const valid = {
  slug: 'events',
  name: 'Events',
  version: '1.2.0',
  apiVersion: '^1.0',
  license: 'GPL-2.0-or-later',
  server: 'dist/server.js',
};

describe('plugin manifest', () => {
  it('accepts a minimal manifest and fills defaults', () => {
    expect(pluginManifestSchema.parse(valid)).toMatchObject({ permissions: [], capabilities: [] });
  });

  it('rejects bad slugs, versions, licenses and paths', () => {
    expect(pluginManifestSchema.safeParse({ ...valid, slug: 'Events' }).success).toBe(false);
    expect(pluginManifestSchema.safeParse({ ...valid, version: '1.2' }).success).toBe(false);
    expect(pluginManifestSchema.safeParse({ ...valid, license: 'Proprietary' }).success).toBe(
      false,
    );
    expect(pluginManifestSchema.safeParse({ ...valid, server: '../outside.js' }).success).toBe(
      false,
    );
    expect(pluginManifestSchema.safeParse({ ...valid, server: '/abs/server.js' }).success).toBe(
      false,
    );
    expect(pluginManifestSchema.safeParse({ ...valid, permissions: ['root'] }).success).toBe(false);
  });

  it('names the plugins it cannot run with (API 1.24)', () => {
    expect(pluginManifestSchema.parse({ ...valid, conflicts: ['seo'] }).conflicts).toEqual(['seo']);
    expect(pluginManifestSchema.safeParse({ ...valid, conflicts: ['Not A Slug'] }).success).toBe(
      false,
    );
  });

  it('derives PostgreSQL names from the slug', () => {
    expect(pluginSchemaName('my-forms')).toBe('plg_my_forms');
  });
});
