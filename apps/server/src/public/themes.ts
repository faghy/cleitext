import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { themeManifestSchema, SHARED_THEME_MODULES, type ThemeManifest } from '@cleitext/shared';
import type { ThemeDefinition } from '@cleitext/theme-sdk';
import { theme as aurora } from '@cleitext/theme-aurora';

/**
 * Installed themes (RF-THM-01): Aurora, shipped with Cleitext, plus the
 * packages in THEMES_PATH (`cleitext theme:install`). Each folder holds a
 * `theme.json` and the bundle it names.
 */
const bundled = new Map<string, ThemeDefinition>([[aurora.slug, aurora]]);
let installed = new Map<string, ThemeDefinition>();
let failures = new Map<string, string>();
let paid = new Map<string, NonNullable<ThemeManifest['paid']>>();
let bundledPlugins = new Map<string, string[]>();
let directories = new Map<string, string>();
let generation = 0;

export const DEFAULT_THEME = 'aurora';

export function themeFor(slug: string | null | undefined): ThemeDefinition {
  const wanted = slug ?? DEFAULT_THEME;
  return installed.get(wanted) ?? bundled.get(wanted) ?? bundled.get(DEFAULT_THEME)!;
}

export function installedThemes(): { theme: ThemeDefinition; bundled: boolean }[] {
  return [
    ...[...bundled.values()].map((theme) => ({ theme, bundled: true })),
    ...[...installed.values()]
      .filter((theme) => !bundled.has(theme.slug))
      .map((theme) => ({ theme, bundled: false })),
  ];
}

/** Themes of THEMES_PATH that failed to load, with the reason. */
export function themeFailures(): ReadonlyMap<string, string> {
  return failures;
}

/** The plugins that come with a theme (theme.json `plugins`). */
export function themePlugins(slug: string | null | undefined): string[] {
  return (slug && bundledPlugins.get(slug)) || [];
}

/**
 * The folder of an installed theme (plugin API 1.49: plugins read files of
 * the site's theme); null for the bundled Aurora and unknown themes.
 */
export function themeDirectory(slug: string | null | undefined): string | null {
  return (slug && directories.get(slug)) || null;
}

/** Paid themes (RF-CAT-03): their license server, from theme.json. */
export function themePaid(slug: string): ThemeManifest['paid'] | null {
  return paid.get(slug) ?? null;
}

export function isThemeAvailable(slug: string): boolean {
  return bundled.has(slug) || installed.has(slug);
}

/**
 * Reloads run one after the other: one started earlier (e.g. on another
 * process's notice) never ends after a later one, putting back the themes
 * of before an installation.
 */
let reloads: Promise<void> = Promise.resolve();

/** (Re)loads the themes of a folder; a broken theme is reported, not fatal. */
export function loadThemes(dir: string): Promise<void> {
  const run = reloads.then(() => load(dir));
  reloads = run.catch(() => {});
  return run;
}

async function load(dir: string): Promise<void> {
  const shared = (globalThis as Record<string, unknown>)['__cleitextShared'] as
    Record<string, unknown> | undefined;
  const target = shared ?? ((globalThis as Record<string, unknown>)['__cleitextShared'] = {});
  for (const name of SHARED_THEME_MODULES) {
    (target as Record<string, unknown>)[name] ??= await import(name);
  }
  generation++;
  const next = new Map<string, ThemeDefinition>();
  const errors = new Map<string, string>();
  const nextPaid = new Map<string, NonNullable<ThemeManifest['paid']>>();
  const nextPlugins = new Map<string, string[]>();
  const nextDirectories = new Map<string, string>();
  const folders = existsSync(dir)
    ? // `x.staging` and `x.previous` belong to an installation in progress.
      (await readdir(dir, { withFileTypes: true })).filter(
        (d) => (d.isDirectory() || d.isSymbolicLink()) && !d.name.includes('.'),
      )
    : [];
  for (const folder of folders) {
    const base = path.join(dir, folder.name);
    try {
      const manifest = themeManifestSchema.parse(
        JSON.parse(await readFile(path.join(base, 'theme.json'), 'utf8')),
      );
      if (manifest.slug !== folder.name)
        throw new Error('theme.json slug does not match the folder');
      const file = path.join(base, manifest.entry);
      const url = `${pathToFileURL(file).href}?v=${encodeURIComponent(manifest.version)}&g=${generation}`;
      const module = (await import(url)) as { default?: ThemeDefinition };
      const theme = module.default;
      if (!theme || typeof theme.Layout !== 'function' || !theme.templates?.index) {
        throw new Error('The bundle must export defineTheme({ Layout, templates }) as default');
      }
      if (theme.slug !== manifest.slug)
        throw new Error('The bundle slug does not match theme.json');
      // theme.json is the version that was installed: the one written in the
      // code may be left behind (themes did), and updates would be offered forever.
      next.set(theme.slug, { ...theme, version: manifest.version });
      if (manifest.paid) nextPaid.set(theme.slug, manifest.paid);
      if (manifest.plugins?.length) nextPlugins.set(theme.slug, manifest.plugins);
      nextDirectories.set(theme.slug, base);
    } catch (error) {
      errors.set(folder.name, error instanceof Error ? error.message : String(error));
    }
  }
  installed = next;
  failures = errors;
  paid = nextPaid;
  bundledPlugins = nextPlugins;
  directories = nextDirectories;
}
