/**
 * What the active theme makes of a WordPress import (core 0.82): page
 * options from the post meta, the Additional CSS with its class names, and
 * the site settings a theme's settings file also had.
 */
import type { ThemeDefinition } from '@cleitext/theme-sdk';
import { describe, expect, it } from 'vitest';
import { transferDocumentSchema } from '../src/transfer/model.js';
import { withThemeImport } from '../src/transfer/theme-import.js';
import { importedSiteSettings } from '../src/themes/themes.service.js';

const page = (ref: string, editor?: Record<string, unknown>) => ({
  ref,
  type: 'page',
  locale: 'it',
  slug: ref.replace(':', '-'),
  title: ref,
  status: 'published',
  document: { schema: 1, blocks: [], ...(editor ? { editor } : {}) },
});

const documentOf = (kind: 'wordpress' | 'cleitext' = 'wordpress') =>
  transferDocumentSchema.parse({
    format: 'cleitext-transfer',
    version: 1,
    source: { kind, exportedAt: '2026-10-25T00:00:00Z' },
    site: { additionalCss: { site: '.old-article-inner { padding: 0 } a { color: red }' } },
    locales: [{ code: 'it', name: 'Italiano', default: true }],
    entries: [
      page('post:1'),
      page('post:2', { id: 'fresco', data: { layout: 'full' } }),
      page('post:3'),
    ],
  });

const theme = {
  slug: 'demo',
  name: 'Demo',
  version: '1.0.0',
  templates: {},
  entryFields: {
    fields: [
      {
        name: 'layout',
        type: 'select',
        label: 'Layout',
        options: [
          { value: 'narrow', label: 'Narrow' },
          { value: 'normal', label: 'Normal' },
        ],
      },
      { name: 'boxed', type: 'boolean', label: 'Boxed' },
    ],
  },
  importEntryMeta: ({ meta }: { type: string; meta: Record<string, string> }) =>
    meta['old-layout'] ? { layout: meta['old-layout'], boxed: true, unknown: 1 } : null,
  importCssPrefixes: { 'old-': 'new-' },
} as unknown as ThemeDefinition;

const item = (id: number, meta: Record<string, string>, imported = true) => ({
  ref: `post:${id}`,
  id,
  type: 'page',
  status: 'publish',
  name: '',
  title: '',
  content: '',
  excerpt: '',
  parent: 0,
  menuOrder: 0,
  imported,
  meta,
});

describe('a WordPress import with the active theme', () => {
  it("gives entries the theme's page options from their post meta, only valid ones", () => {
    const document = documentOf();
    const warnings = withThemeImport(document, theme, {
      items: [
        item(1, { 'old-layout': 'narrow' }),
        item(2, { 'old-layout': 'normal' }),
        item(3, { 'old-layout': 'huge' }),
        item(4, { 'old-layout': 'narrow' }, false),
      ],
      terms: [],
    });
    const [one, two, three] = document.entries;
    expect(one!.document.editor).toEqual({ id: 'blocks', data: { layout: 'narrow', boxed: true } });
    expect(two!.document.editor).toEqual({
      id: 'fresco',
      data: { layout: 'full', boxed: true },
    });
    expect(three!.document.editor).toEqual({ id: 'blocks', data: { boxed: true } });
    expect(warnings[0]).toMatch(/3 entries keep their page options/);
  });

  it('renames the classes of the Additional CSS in selectors and says so', () => {
    const document = documentOf();
    const warnings = withThemeImport(document, theme, undefined);
    expect(document.site.additionalCss?.site).toBe(
      '.new-article-inner { padding: 0 } a { color: red }',
    );
    expect(warnings).toEqual([
      "The Additional CSS names Demo's classes: 1 class and id name was renamed (.old- → .new-), in selectors only.",
    ]);
  });

  it('leaves other imports and themes without the options alone', () => {
    const cleitext = documentOf('cleitext');
    expect(
      withThemeImport(cleitext, theme, { items: [item(1, { 'old-layout': 'narrow' })], terms: [] }),
    ).toEqual([]);
    expect(cleitext.site.additionalCss?.site).toContain('.old-article-inner');
    const plain = documentOf();
    const bare = { ...theme, importEntryMeta: undefined, importCssPrefixes: undefined };
    expect(
      withThemeImport(plain, bare as ThemeDefinition, { items: [item(1, {})], terms: [] }),
    ).toEqual([]);
    expect(plain.entries[0]!.document.editor).toBeUndefined();
  });

  it('a throwing theme converter is ignored', () => {
    const document = documentOf();
    const broken = {
      ...theme,
      importEntryMeta: () => {
        throw new Error('no');
      },
    } as ThemeDefinition;
    withThemeImport(document, broken, { items: [item(1, { 'old-layout': 'narrow' })], terms: [] });
    expect(document.entries[0]!.document.editor).toBeUndefined();
  });
});

describe('site settings in a theme settings file', () => {
  it('keeps the valid posts per page and date format', () => {
    expect(importedSiteSettings({ postsPerPage: 6, dateFormat: 'F j, Y' })).toEqual({
      postsPerPage: 6,
      dateFormat: 'F j, Y',
    });
    expect(importedSiteSettings({ postsPerPage: 0, dateFormat: '' })).toBeNull();
    expect(importedSiteSettings({ postsPerPage: 500 })).toBeNull();
    expect(importedSiteSettings('x')).toBeNull();
    expect(importedSiteSettings(undefined)).toBeNull();
  });
});
