import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, type DatabaseClient } from '@cleitext/db';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { OperationError } from '../src/operations.js';
import {
  buildTheme,
  childThemeFiles,
  createChildTheme,
  installTheme,
  listThemes,
  rollbackTheme,
  uninstallTheme,
} from '../src/themes.js';

const example = fileURLToPath(new URL('../../../examples/theme-plain', import.meta.url));
let owner: DatabaseClient;
let themesPath: string;

beforeAll(async () => {
  owner = createDatabase(inject('ownerUrl'), { max: 2 });
  themesPath = await mkdtemp(path.join(tmpdir(), 'cleitext-themes-'));
});

afterAll(async () => {
  await owner?.close();
  await rm(path.join(example, 'dist'), { recursive: true, force: true });
});

describe('themes', () => {
  it('builds a theme without bundling React or the SDK', async () => {
    const { manifest, output } = await buildTheme(example);
    expect(manifest.slug).toBe('plain');
    const code = await readFile(output!, 'utf8');
    expect(code).toContain('globalThis.__cleitextShared["@cleitext/theme-sdk"]');
    expect(code).toContain('globalThis.__cleitextShared["react/jsx-runtime"]');
    expect(code).not.toContain('react.production');
  });

  it('installs, lists, updates and uninstalls a theme', async () => {
    const first = await installTheme({ source: example, themesPath });
    expect(first.previousVersion).toBeNull();
    expect(existsSync(path.join(themesPath, 'plain', 'dist', 'index.js'))).toBe(true);
    expect((await listThemes(themesPath)).map((t) => t.slug)).toEqual(['plain']);
    const again = await installTheme({ source: example, themesPath });
    expect(again.previousVersion).toBe('1.0.0');
    // The version before the update is kept: a rollback swaps them.
    expect(await rollbackTheme({ themesPath, slug: 'plain' })).toEqual({
      from: '1.0.0',
      to: '1.0.0',
    });
    expect(existsSync(path.join(themesPath, 'plain.previous', 'theme.json'))).toBe(true);

    await uninstallTheme(owner.db, 'plain', themesPath);
    expect(await listThemes(themesPath)).toEqual([]);
    await expect(uninstallTheme(owner.db, 'aurora', themesPath)).rejects.toThrow(OperationError);
  });
});

describe('child themes', () => {
  async function folder(
    slug: string,
    manifest: Record<string, unknown>,
    files: Record<string, string> = {},
  ) {
    const dir = path.join(await mkdtemp(path.join(tmpdir(), 'cleitext-src-')), slug);
    await mkdir(path.join(dir, 'dist'), { recursive: true });
    await writeFile(
      path.join(dir, 'theme.json'),
      JSON.stringify({ slug, name: slug, version: '1.0.0', ...manifest }),
    );
    for (const [file, text] of Object.entries(files)) await writeFile(path.join(dir, file), text);
    return dir;
  }

  it('need their parent, in the version they ask, one level only', async () => {
    const themes = await mkdtemp(path.join(tmpdir(), 'cleitext-themes-'));
    const kid = await folder(
      'kid',
      { parent: 'mom', parentVersion: '^1.0.0' },
      { 'style.css': '' },
    );
    await expect(installTheme({ source: kid, themesPath: themes })).rejects.toThrow(
      'kid is a child theme of mom ^1.0.0: install mom first.',
    );
    const mom = await folder('mom', { version: '2.0.0' }, { 'dist/index.js': 'export default {}' });
    await installTheme({ source: mom, themesPath: themes });
    await expect(installTheme({ source: kid, themesPath: themes })).rejects.toThrow(
      'kid needs mom ^1.0.0, and 2.0.0 is installed',
    );
    const mom1 = await folder(
      'mom',
      { version: '1.4.0' },
      { 'dist/index.js': 'export default {}' },
    );
    await installTheme({ source: mom1, themesPath: themes, force: true });
    // A child without code needs no build.
    expect((await installTheme({ source: kid, themesPath: themes })).manifest.parent).toBe('mom');
    expect((await listThemes(themes)).find((t) => t.slug === 'kid')?.parent).toBe('mom');

    // The parent is not updated past its children, unless forced.
    await expect(installTheme({ source: mom, themesPath: themes })).rejects.toThrow(
      'kid needs mom ^1.0.0: update the child theme first, or install with --force.',
    );
    // No grandchildren, no theme of its own parent, no child turned into a parent of children.
    const grand = await folder('grand', { parent: 'kid' }, { 'style.css': '' });
    await expect(installTheme({ source: grand, themesPath: themes })).rejects.toThrow(
      'one level only',
    );
    const self = await folder('self', { parent: 'self' }, { 'style.css': '' });
    await expect(installTheme({ source: self, themesPath: themes })).rejects.toThrow(
      'its own parent',
    );
    const momChild = await folder(
      'mom',
      { parent: 'aurora', version: '1.5.0' },
      { 'style.css': '' },
    );
    await expect(installTheme({ source: momChild, themesPath: themes })).rejects.toThrow(
      'cannot have children',
    );
    // A child of Aurora, shipped with Cleitext.
    const auroraKid = await folder('aurora-kid', { parent: 'aurora' }, { 'style.css': '' });
    await installTheme({ source: auroraKid, themesPath: themes });

    // The parent stays while children use it.
    await expect(uninstallTheme(owner.db, 'mom', themes)).rejects.toThrow(
      'kid is a child theme of mom: delete it first.',
    );
    await uninstallTheme(owner.db, 'kid', themes);
    await uninstallTheme(owner.db, 'mom', themes);
  });

  it('are built against their parent, and scaffolded by theme:child', async () => {
    const themes = await mkdtemp(path.join(tmpdir(), 'cleitext-themes-'));
    const repo = await mkdtemp(path.join(tmpdir(), 'cleitext-repo-'));
    // A parent next to the child (a repository of themes).
    await mkdir(path.join(repo, 'mom'));
    await writeFile(
      path.join(repo, 'mom', 'theme.json'),
      JSON.stringify({ slug: 'mom', name: 'Mom', version: '1.0.0' }),
    );
    await mkdir(path.join(repo, 'kid', 'src'), { recursive: true });
    await writeFile(
      path.join(repo, 'kid', 'theme.json'),
      JSON.stringify({
        slug: 'kid',
        name: 'Kid',
        version: '1.0.0',
        parent: 'mom',
        parentVersion: '^1.0.0',
      }),
    );
    await writeFile(
      path.join(repo, 'kid', 'src', 'index.tsx'),
      `import { defineChildTheme, ParentTemplate } from '@cleitext/theme-sdk';
export default defineChildTheme({ templates: { index: (props) => <div><ParentTemplate {...props} /></div> } });`,
    );
    const built = await buildTheme(path.join(repo, 'kid'), { themesPath: themes });
    expect(built.parent).toBe('mom 1.0.0');
    expect(await readFile(built.output!, 'utf8')).toContain('ParentTemplate');
    // Only CSS: nothing to bundle.
    await mkdir(path.join(repo, 'plain-kid'));
    await writeFile(
      path.join(repo, 'plain-kid', 'theme.json'),
      JSON.stringify({ slug: 'plain-kid', name: 'Plain kid', version: '1.0.0', parent: 'aurora' }),
    );
    expect((await buildTheme(path.join(repo, 'plain-kid'))).output).toBeNull();
    // A parent in the wrong version is reported at build time.
    await writeFile(
      path.join(repo, 'mom', 'theme.json'),
      JSON.stringify({ slug: 'mom', name: 'Mom', version: '3.0.0' }),
    );
    await expect(buildTheme(path.join(repo, 'kid'))).rejects.toThrow('needs mom ^1.0.0');

    // theme:child: a folder to edit, or installed at once.
    const written = await createChildTheme({
      themesPath: themes,
      parent: 'aurora',
      slug: 'my-aurora',
      dir: path.join(repo, 'my-aurora'),
    });
    expect(written.installed).toBe(false);
    expect(written.manifest).toMatchObject({
      slug: 'my-aurora',
      name: 'Aurora Child',
      parent: 'aurora',
    });
    expect(existsSync(path.join(repo, 'my-aurora', 'style.css'))).toBe(true);
    await expect(
      createChildTheme({ themesPath: themes, parent: 'nope', slug: 'x', install: true }),
    ).rejects.toThrow('not installed');
    await expect(
      createChildTheme({ themesPath: themes, parent: 'aurora', slug: 'Bad Slug', install: true }),
    ).rejects.toThrow('lowercase');
    const installed = await createChildTheme({
      themesPath: themes,
      parent: 'aurora',
      slug: 'site-look',
      name: 'Site look',
      install: true,
    });
    expect(installed).toMatchObject({ installed: true, manifest: { name: 'Site look' } });
    await expect(
      createChildTheme({ themesPath: themes, parent: 'aurora', slug: 'site-look', install: true }),
    ).rejects.toThrow('already installed');
    await expect(
      createChildTheme({ themesPath: themes, parent: 'site-look', slug: 'deeper', install: true }),
    ).rejects.toThrow('child theme itself');
    expect(
      Object.keys(childThemeFiles({ parent: { slug: 'a', name: 'A' }, slug: 'b', name: 'B' })),
    ).toEqual(['theme.json', 'style.css', 'README.md']);
  });
});
