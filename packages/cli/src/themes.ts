import { existsSync } from 'node:fs';
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sites, type Database } from '@cleitext/db';
import {
  SHARED_THEME_MODULES,
  themeEntry,
  themeManifestSchema,
  type ThemeManifest,
} from '@cleitext/shared';
import { eq, sql } from 'drizzle-orm';
import * as esbuild from 'esbuild';
import semver from 'semver';
import { OperationError } from './operations.js';
import { swapFolders } from './plugins.js';

/** Themes shipped with Cleitext: they cannot be installed over or removed. */
const BUNDLED = new Set(['aurora']);

export async function readThemeManifest(dir: string): Promise<ThemeManifest> {
  const file = path.join(dir, 'theme.json');
  if (!existsSync(file)) throw new OperationError(`No theme.json in ${dir}.`);
  const parsed = themeManifestSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
  if (!parsed.success) {
    throw new OperationError(
      `Invalid theme.json: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
    );
  }
  return parsed.data;
}

/** The bundle of a theme folder, or null for a child theme made only of CSS. */
function entryOf(dir: string, manifest: ThemeManifest): string | null {
  return themeEntry(manifest, (file) => existsSync(path.join(dir, file)));
}

/**
 * The parent of a child theme being built or installed: its folder next to
 * the child's (as in a repository of themes) or in THEMES_PATH.
 */
async function findParent(
  slug: string,
  places: (string | undefined)[],
): Promise<{ dir: string; manifest: ThemeManifest } | null> {
  for (const place of places) {
    if (!place) continue;
    const dir = path.join(place, slug);
    if (!existsSync(path.join(dir, 'theme.json'))) continue;
    try {
      return { dir, manifest: await readThemeManifest(dir) };
    } catch {
      continue;
    }
  }
  return null;
}

/** Checks that a child theme's parent fits: not a child, a version in `parentVersion`. */
function checkParent(child: ThemeManifest, parent: ThemeManifest): void {
  if (parent.parent) {
    throw new OperationError(
      `${parent.slug} is a child theme itself: a child theme is built on a theme of its own (one level only).`,
    );
  }
  if (child.parentVersion) {
    if (semver.validRange(child.parentVersion) === null) {
      throw new OperationError(`parentVersion "${child.parentVersion}" is not a semver range.`);
    }
    if (!semver.satisfies(parent.version, child.parentVersion, { includePrerelease: true })) {
      throw new OperationError(
        `${child.slug} needs ${parent.slug} ${child.parentVersion}, and ${parent.version} is installed: update ${parent.slug} first.`,
      );
    }
  }
}

/**
 * Bundles `src/index.tsx` (or .ts/.jsx/.js) into the manifest's entry. React
 * and the theme SDK come from the server, never from the bundle. A child
 * theme is built the same way (its parent's code comes from the server too,
 * through `useParentTemplate` or `defineChildTheme((parent) => …)`), after
 * checking its parent when it is found next to it or in `themesPath`; a
 * child without code has nothing to bundle (`output` null).
 */
export async function buildTheme(
  dir: string,
  options: { themesPath?: string } = {},
): Promise<{ manifest: ThemeManifest; output: string | null; parent?: string | null }> {
  const manifest = await readThemeManifest(dir);
  let parent: string | null = null;
  if (manifest.parent) {
    const found = await findParent(manifest.parent, [path.dirname(dir), options.themesPath]);
    if (found) {
      checkParent(manifest, found.manifest);
      parent = `${found.manifest.slug} ${found.manifest.version}`;
    }
  }
  const entry = entryOf(dir, manifest);
  if (!entry) return { manifest, output: null, parent };
  const base = entry.replace(/^dist\//, 'src/').replace(/\.m?js$/, '');
  const source = ['.tsx', '.ts', '.jsx', '.js']
    .map((ext) => path.join(dir, base + ext))
    .find((file) => existsSync(file));
  if (!source) throw new OperationError(`No source for ${entry} in ${dir}/src.`);
  const output = path.join(dir, entry);
  await esbuild
    .build({
      entryPoints: [source],
      outfile: output,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node22',
      jsx: 'automatic',
      sourcemap: true,
      logLevel: 'silent',
      plugins: [
        {
          name: 'cleitext-shared-modules',
          setup(build) {
            build.onResolve({ filter: /^[@a-z]/ }, (args) =>
              (SHARED_THEME_MODULES as readonly string[]).includes(args.path)
                ? { path: args.path, namespace: 'cleitext-shared' }
                : undefined,
            );
            build.onLoad({ filter: /.*/, namespace: 'cleitext-shared' }, (args) => ({
              contents: `module.exports = globalThis.__cleitextShared[${JSON.stringify(args.path)}];`,
              loader: 'js',
            }));
          },
        },
      ],
    })
    .catch((error: unknown) => {
      const failure = error as esbuild.BuildFailure;
      throw new OperationError(
        `Theme build failed:\n  ${(failure.errors ?? []).map((e) => `${e.location?.file ?? ''}:${e.location?.line ?? ''} ${e.text}`).join('\n  ') || String(error)}`,
      );
    });
  return { manifest, output, parent };
}

/**
 * Copies (or links) a built theme into THEMES_PATH; the previous version is kept.
 * A child theme needs its parent installed, in the version it asks; a theme
 * is not updated to a version its installed children do not accept (unless
 * `force`), and never made a child while others are built on it.
 */
export async function installTheme(options: {
  source: string;
  themesPath: string;
  link?: boolean;
  force?: boolean;
}): Promise<{ manifest: ThemeManifest; previousVersion: string | null }> {
  const source = path.resolve(options.source);
  const manifest = await readThemeManifest(source);
  if (BUNDLED.has(manifest.slug)) {
    throw new OperationError(`"${manifest.slug}" is shipped with Cleitext.`);
  }
  const entry = entryOf(source, manifest);
  if (entry && !existsSync(path.join(source, entry))) {
    throw new OperationError(`${entry} is missing: build the theme first (theme:build).`);
  }
  const installed = await listThemes(options.themesPath);
  const children = installed.filter((t) => t.parent === manifest.slug);
  if (manifest.parent) {
    if (manifest.parent === manifest.slug) {
      throw new OperationError('A theme cannot be its own parent.');
    }
    if (children.length > 0) {
      throw new OperationError(
        `${children.map((c) => c.slug).join(', ')} ${children.length === 1 ? 'is a child' : 'are children'} of ${manifest.slug}: a child theme cannot have children (one level only).`,
      );
    }
    if (!BUNDLED.has(manifest.parent)) {
      const parent = installed.find((t) => t.slug === manifest.parent);
      if (!parent) {
        throw new OperationError(
          `${manifest.slug} is a child theme of ${manifest.parent}${manifest.parentVersion ? ` ${manifest.parentVersion}` : ''}: install ${manifest.parent} first.`,
          'parent_missing',
        );
      }
      checkParent(manifest, parent);
    }
  } else if (!options.force) {
    const refusing = children.filter(
      (c) =>
        c.parentVersion &&
        semver.validRange(c.parentVersion) !== null &&
        !semver.satisfies(manifest.version, c.parentVersion, { includePrerelease: true }),
    );
    if (refusing.length > 0) {
      throw new OperationError(
        `${refusing.map((c) => `${c.slug} needs ${manifest.slug} ${c.parentVersion}`).join('; ')}: update the child theme first, or install with --force.`,
        'child_refuses',
      );
    }
  }
  const target = path.join(options.themesPath, manifest.slug);
  const previousVersion = existsSync(path.join(target, 'theme.json'))
    ? (await readThemeManifest(target)).version
    : null;
  await mkdir(options.themesPath, { recursive: true });
  const staging = `${target}.staging`;
  const previous = `${target}.previous`;
  await rm(staging, { recursive: true, force: true });
  if (options.link) await symlink(source, staging, 'dir');
  else {
    await cp(source, staging, {
      recursive: true,
      filter: (file) => !/(^|[\\/])(node_modules|\.git)([\\/]|$)/.test(path.relative(source, file)),
    });
  }
  if (await exists(target)) {
    await rm(previous, { recursive: true, force: true });
    await rename(target, previous);
  }
  await rename(staging, target);
  return { manifest, previousVersion };
}

export async function listThemes(themesPath: string): Promise<ThemeManifest[]> {
  if (!existsSync(themesPath)) return [];
  const result: ThemeManifest[] = [];
  for (const entry of await readdir(themesPath, { withFileTypes: true })) {
    if (entry.name.includes('.')) continue;
    try {
      result.push(await readThemeManifest(path.join(themesPath, entry.name)));
    } catch {
      // Listed by the server as broken.
    }
  }
  return result;
}

/** Removes an installed theme, unless a site still uses it. */
export async function uninstallTheme(
  db: Database,
  slug: string,
  themesPath: string,
): Promise<void> {
  if (BUNDLED.has(slug)) throw new OperationError(`"${slug}" is shipped with Cleitext.`);
  const target = path.join(themesPath, slug);
  if (!(await exists(target))) throw new OperationError(`The theme "${slug}" is not installed.`);
  // A parent stays while child themes are built on it (core 0.79).
  const children = (await listThemes(themesPath)).filter((t) => t.parent === slug);
  if (children.length > 0) {
    throw new OperationError(
      `${children.map((c) => c.slug).join(', ')} ${children.length === 1 ? 'is a child theme' : 'are child themes'} of ${slug}: delete ${children.length === 1 ? 'it' : 'them'} first.`,
      'has_children',
    );
  }
  const using = await db.select({ slug: sites.slug }).from(sites).where(eq(sites.themeSlug, slug));
  if (using.length > 0) {
    throw new OperationError(
      `Used by ${using.map((s) => s.slug).join(', ')}: activate another theme there first.`,
    );
  }
  await rm(target, { recursive: true, force: true });
  await rm(`${target}.previous`, { recursive: true, force: true });
}

/** Running servers reload their themes (no restart needed). */
export async function announceThemeChange(db: Database): Promise<void> {
  await db.execute(sql`select pg_notify('cleitext_cache', ${JSON.stringify({ themes: true })})`);
}

async function exists(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Back to the version of a theme kept by its last update
 * (`<slug>.previous`); a second rollback undoes the first.
 */
export async function rollbackTheme(options: {
  themesPath: string;
  slug: string;
}): Promise<{ from: string; to: string }> {
  const target = path.join(path.resolve(options.themesPath), options.slug);
  const previous = `${target}.previous`;
  const version = async (dir: string) =>
    (JSON.parse(await readFile(path.join(dir, 'theme.json'), 'utf8')) as { version: string })
      .version;
  if (!existsSync(path.join(previous, 'theme.json'))) {
    throw new OperationError(`No previous version of ${options.slug} to go back to.`);
  }
  const from = existsSync(path.join(target, 'theme.json')) ? await version(target) : '?';
  await swapFolders(target, previous);
  return { from, to: await version(target) };
}

/** A slug for a child theme: lowercase letters, digits and `-`. */
export const THEME_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * The files of a new child theme (core 0.79): `theme.json` naming the
 * parent, an empty `style.css` and a README on how to override templates.
 */
export function childThemeFiles(options: {
  parent: { slug: string; name: string };
  slug: string;
  name: string;
}): Record<string, string> {
  const { parent, slug, name } = options;
  const manifest = {
    slug,
    name,
    version: '1.0.0',
    description: `A child theme of ${parent.name}: changes made here survive its updates.`,
    license: 'GPL-2.0-or-later',
    parent: parent.slug,
  };
  return {
    'theme.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'style.css': `/*
 * ${name}, a child theme of ${parent.name}.
 * This CSS is printed after ${parent.name}'s on every page (and before the
 * Additional CSS of Customize). Updates of ${parent.name} never change it.
 */
`,
    'README.md': `# ${name}

A child theme of **${parent.name}** (\`${parent.slug}\`): it inherits everything from
it (templates, styles, settings, areas, page templates, fonts) and gives only what
changes. Updating ${parent.name} never touches this folder.

## Change the styles

Write CSS in \`style.css\`: it is printed after ${parent.name}'s CSS on every page.
\`editor.css\` (optional) is added to the block editor's styles.

## Override or wrap a template

Add \`src/index.tsx\`, then build with \`cleitext theme:build <folder>\`:

\`\`\`tsx
import { defineChildTheme, ParentTemplate, type TemplateProps } from '@cleitext/theme-sdk';

function Index(props: TemplateProps) {
  return (
    <>
      <p className="notice">Before the content</p>
      <ParentTemplate {...props} />
    </>
  );
}

export default defineChildTheme({
  // A template with the same name as one of ${parent.name}'s replaces it.
  templates: { index: Index },
  // New defaults of ${parent.name}'s settings, or settings of your own.
  settingsDefaults: {},
});
\`\`\`

\`<ParentTemplate>\` renders the template ${parent.name} would use for the page;
\`useParentTemplate('index')\` gives one of its templates by name, and
\`defineChildTheme((parent) => ({ … }))\` gets the whole parent definition.

Template names follow the hierarchy (\`entry-page\`, \`entry\`, \`archive\`,
\`search\`, \`404\`, \`template-<name>\` for page templates, \`index\`): the child's
template wins over the parent's of the same name.

## Install it again

Zip this folder and upload it in **Appearance → Themes → Add New → Upload Theme**,
or run \`cleitext theme:install <folder> --build\` on the server.

See "Child themes" in docs/THEMES.md of Cleitext.
`,
  };
}

/** Writes a new child theme in `dir` (which must not exist). */
export async function scaffoldChildTheme(options: {
  dir: string;
  parent: { slug: string; name: string };
  slug: string;
  name: string;
}): Promise<string> {
  if (!THEME_SLUG_RE.test(options.slug)) {
    throw new OperationError('The slug may hold lowercase letters, digits and "-" only.');
  }
  if (options.slug === options.parent.slug || BUNDLED.has(options.slug)) {
    throw new OperationError(`"${options.slug}" cannot be the slug of a child theme.`);
  }
  const name = options.name.trim().slice(0, 100);
  if (!name) throw new OperationError('Give the child theme a name.');
  const dir = path.resolve(options.dir);
  if (existsSync(dir)) throw new OperationError(`${dir} already exists.`);
  await mkdir(dir, { recursive: true });
  for (const [file, text] of Object.entries(
    childThemeFiles({ parent: options.parent, slug: options.slug, name }),
  )) {
    await writeFile(path.join(dir, file), text);
  }
  return dir;
}

/**
 * `theme:child <parent> <slug>`: a new child theme of an installed theme (or
 * Aurora). With `install`, it goes straight into THEMES_PATH; otherwise it is
 * written in `dir` to be edited and installed later.
 */
export async function createChildTheme(options: {
  themesPath: string;
  parent: string;
  slug: string;
  name?: string;
  dir?: string;
  install?: boolean;
}): Promise<{ manifest: ThemeManifest; dir: string; installed: boolean }> {
  const parent = BUNDLED.has(options.parent)
    ? { slug: options.parent, name: 'Aurora', parent: undefined }
    : (await findParent(options.parent, [options.themesPath]))?.manifest;
  if (!parent) throw new OperationError(`The theme "${options.parent}" is not installed.`);
  if (parent.parent) {
    throw new OperationError(
      `${parent.slug} is a child theme itself: make the child of ${parent.parent} instead.`,
    );
  }
  const name = options.name ?? `${parent.name} Child`;
  if (options.install) {
    if (BUNDLED.has(options.slug) || (await exists(path.join(options.themesPath, options.slug)))) {
      throw new OperationError(`A theme "${options.slug}" is already installed.`, 'slug_taken');
    }
    const work = await mkdtemp(path.join(tmpdir(), 'cleitext-child-'));
    try {
      const dir = await scaffoldChildTheme({
        dir: path.join(work, options.slug),
        parent,
        slug: options.slug,
        name,
      });
      const { manifest } = await installTheme({ source: dir, themesPath: options.themesPath });
      return { manifest, dir: path.join(options.themesPath, options.slug), installed: true };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
  const dir = await scaffoldChildTheme({
    dir: options.dir ?? options.slug,
    parent,
    slug: options.slug,
    name,
  });
  return { manifest: await readThemeManifest(dir), dir, installed: false };
}
