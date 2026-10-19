import { existsSync } from 'node:fs';
import { cp, lstat, mkdir, readdir, readFile, rename, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { sites, type Database } from '@cleitext/db';
import { SHARED_THEME_MODULES, themeManifestSchema, type ThemeManifest } from '@cleitext/shared';
import { eq, sql } from 'drizzle-orm';
import * as esbuild from 'esbuild';
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

/**
 * Bundles `src/index.tsx` (or .ts/.jsx/.js) into the manifest's entry. React
 * and the theme SDK come from the server, never from the bundle.
 */
export async function buildTheme(
  dir: string,
): Promise<{ manifest: ThemeManifest; output: string }> {
  const manifest = await readThemeManifest(dir);
  const base = manifest.entry.replace(/^dist\//, 'src/').replace(/\.m?js$/, '');
  const source = ['.tsx', '.ts', '.jsx', '.js']
    .map((ext) => path.join(dir, base + ext))
    .find((file) => existsSync(file));
  if (!source) throw new OperationError(`No source for ${manifest.entry} in ${dir}/src.`);
  const output = path.join(dir, manifest.entry);
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
  return { manifest, output };
}

/** Copies (or links) a built theme into THEMES_PATH; the previous version is kept. */
export async function installTheme(options: {
  source: string;
  themesPath: string;
  link?: boolean;
}): Promise<{ manifest: ThemeManifest; previousVersion: string | null }> {
  const source = path.resolve(options.source);
  const manifest = await readThemeManifest(source);
  if (BUNDLED.has(manifest.slug)) {
    throw new OperationError(`"${manifest.slug}" is shipped with Cleitext.`);
  }
  if (!existsSync(path.join(source, manifest.entry))) {
    throw new OperationError(`${manifest.entry} is missing: build the theme first (theme:build).`);
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
