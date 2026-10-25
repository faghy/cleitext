/** Child themes (core 0.79): how a child's definition is laid over its parent's. */
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ThemeDefinition } from '@cleitext/theme-sdk';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { beforeHeadEnd, withAdditionalCss } from '../src/themes/additional-css.js';
import { childDefinition, mergeChildTheme } from '../src/themes/child-themes.js';
import { zipThemeFolder } from '../src/themes/theme-package.js';

const Layout = () => null;
const Index = () => null;
const Entry = () => null;

const parent: ThemeDefinition = {
  slug: 'mother',
  name: 'Mother',
  version: '2.0.0',
  description: 'The parent',
  menuLocations: { primary: 'Primary' },
  templates: { index: Index, entry: Entry },
  Layout,
  css: '.mother{}',
  settings: [
    { name: 'accent', type: 'color', label: 'Accent', default: '#000000' },
    { name: 'motto', type: 'text', label: 'Motto' },
  ],
  settingsSections: [{ id: 'colors', label: 'Colors' }],
  presets: [{ id: 'dark', label: 'Dark', values: {} }],
  entryFields: { types: ['page'], fields: [{ name: 'wide', type: 'boolean', label: 'Wide' }] },
  pageTemplates: [{ name: 'landing', label: 'Landing' }],
  editorCss: (values) => `.mother-editor{color:${String(values.accent)}}`,
  aiGuide: 'Mother guide',
  relatedEntries: 3,
};

const meta = { slug: 'daughter', name: 'Daughter', version: '1.0.0' };

describe('mergeChildTheme', () => {
  it('inherits everything the child does not give', () => {
    const theme = mergeChildTheme(parent, {}, meta);
    expect(theme).toMatchObject({
      slug: 'daughter',
      name: 'Daughter',
      version: '1.0.0',
      description: 'The parent',
      parent: 'mother',
      css: '.mother{}',
      relatedEntries: 3,
      aiGuide: 'Mother guide',
    });
    expect(theme.templates).toEqual(parent.templates);
    expect(theme.Layout).toBe(Layout);
    expect(theme.settings).toEqual(parent.settings);
    expect(theme.entryFields).toEqual(parent.entryFields);
    expect(theme.editorCss).toBe(parent.editorCss);
    // Lists the parent never had stay missing.
    const bare = mergeChildTheme(
      {
        slug: 'm',
        name: 'M',
        version: '1.0.0',
        menuLocations: {},
        templates: { index: Index },
        Layout,
        css: '',
      },
      {},
      meta,
    );
    expect(bare.settings).toBeUndefined();
    expect(bare.presets).toBeUndefined();
    expect(bare.editorCss).toBeUndefined();
  });

  it('overrides by name and adds the rest', () => {
    const ChildIndex = () => null;
    const ChildLayout = () => null;
    const importSettings = () => ({ motto: 'imported' });
    const theme = mergeChildTheme(
      parent,
      {
        slug: 'daughter',
        templates: { index: ChildIndex, 'template-landing': ChildIndex },
        Layout: ChildLayout,
        settings: [
          { name: 'motto', type: 'text', label: 'Tagline', maxLength: 50 },
          { name: 'ribbon', type: 'boolean', label: 'Ribbon' },
        ],
        settingsDefaults: { accent: '#7c3aed', ribbon: true },
        settingsSections: [
          { id: 'colors', label: 'Palette' },
          { id: 'extra', label: 'Extra' },
        ],
        presets: [{ id: 'light', label: 'Light', values: {} }],
        menuLocations: { footer: 'Footer' },
        areas: { side: 'Side' },
        pageTemplates: [{ name: 'wide', label: 'Wide' }],
        entryFields: {
          types: ['post'],
          fields: [{ name: 'hero', type: 'boolean', label: 'Hero' }],
        },
        editorCss: '.daughter-editor{}',
        aiGuide: 'Daughter guide',
        comments: 'manual',
        listTerms: true,
        importSettings,
      },
      { ...meta, description: 'Mine' },
    );
    expect(theme.description).toBe('Mine');
    expect(theme.templates.index).toBe(ChildIndex);
    expect(theme.templates.entry).toBe(Entry);
    expect(theme.templates['template-landing']).toBe(ChildIndex);
    expect(theme.Layout).toBe(ChildLayout);
    expect(theme.settings).toEqual([
      { name: 'accent', type: 'color', label: 'Accent', default: '#7c3aed' },
      { name: 'motto', type: 'text', label: 'Tagline', maxLength: 50 },
      { name: 'ribbon', type: 'boolean', label: 'Ribbon', default: true },
    ]);
    expect(theme.settingsSections).toEqual([
      { id: 'colors', label: 'Palette' },
      { id: 'extra', label: 'Extra' },
    ]);
    expect(theme.presets!.map((p) => p.id)).toEqual(['dark', 'light']);
    expect(theme.menuLocations).toEqual({ primary: 'Primary', footer: 'Footer' });
    expect(theme.areas).toEqual({ side: 'Side' });
    expect(theme.pageTemplates!.map((p) => p.name)).toEqual(['landing', 'wide']);
    expect(theme.entryFields).toEqual({
      types: ['page', 'post'],
      fields: [
        { name: 'wide', type: 'boolean', label: 'Wide' },
        { name: 'hero', type: 'boolean', label: 'Hero' },
      ],
    });
    expect(typeof theme.editorCss).toBe('function');
    expect((theme.editorCss as (v: Record<string, unknown>) => string)({ accent: 'red' })).toBe(
      '.mother-editor{color:red}\n.daughter-editor{}',
    );
    expect(theme.aiGuide).toBe('Mother guide\n\nDaughter guide');
    expect(theme.comments).toBe('manual');
    expect(theme.listTerms).toBe(true);
    expect(theme.importSettings!(null)).toEqual({ motto: 'imported' });
  });

  it('joins string editor styles and takes entry fields of a parent without them', () => {
    const theme = mergeChildTheme(
      { ...parent, editorCss: '.a{}', entryFields: undefined },
      { editorCss: '.b{}', entryFields: { fields: [] } },
      meta,
    );
    expect(theme.editorCss).toBe('.a{}\n.b{}');
    expect(theme.entryFields).toEqual({ fields: [] });
    const untyped = mergeChildTheme(
      { ...parent, entryFields: { fields: [] } },
      { entryFields: { fields: [] } },
      meta,
    );
    expect(untyped.entryFields).toEqual({ fields: [] });
  });

  it('refuses a bundle of another slug', () => {
    expect(() => mergeChildTheme(parent, { slug: 'other' }, meta)).toThrow(/slug/);
  });
});

describe('childDefinition', () => {
  it('reads an object, a function of the parent or nothing', () => {
    expect(childDefinition(undefined, parent)).toEqual({});
    expect(childDefinition({ css: '.x{}' }, parent)).toEqual({ css: '.x{}' });
    expect(childDefinition((p) => ({ aiGuide: p.name }), parent)).toEqual({ aiGuide: 'Mother' });
    expect(() => childDefinition((() => null) as never, parent)).toThrow(/defineChildTheme/);
  });
});

describe('Additional CSS in the page', () => {
  it('goes last in <head>, never closing the element', () => {
    const html = '<html><head><style>.t{}</style></head><body></body></html>';
    expect(withAdditionalCss(html, { site: '.a{}', theme: '' })).toBe(
      '<html><head><style>.t{}</style><style id="cx-additional-css">.a{}</style></head><body></body></html>',
    );
    expect(withAdditionalCss(html, { site: ' ', theme: '' })).toBe(html);
    expect(withAdditionalCss(html, { site: '.a{}', theme: '.b{}' })).toContain('.a{}\n.b{}');
    // Stored before the checks, or written in the database by hand: escaped.
    expect(withAdditionalCss(html, { site: 'a{}</style><script>x</script>', theme: '' })).toContain(
      'a{}\\3C /style>\\3C script>x\\3C /script>',
    );
    expect(beforeHeadEnd('<p>no head</p>', 'x', '.c{}')).toBe(
      '<style id="x">.c{}</style><p>no head</p>',
    );
  });
});

describe('zipThemeFolder', () => {
  it('packs the regular files under the slug, without links or dependencies', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cleitext-zip-'));
    await writeFile(join(dir, 'theme.json'), '{}');
    await mkdir(join(dir, 'src'));
    await writeFile(join(dir, 'src', 'index.tsx'), 'export {}');
    await mkdir(join(dir, 'node_modules'));
    await writeFile(join(dir, 'node_modules', 'x.js'), '');
    await symlink('/etc/hostname', join(dir, 'leak'));
    const files = unzipSync(await zipThemeFolder(dir, 'kid'));
    expect(Object.keys(files).sort()).toEqual(['kid/src/index.tsx', 'kid/theme.json']);
  });
});
