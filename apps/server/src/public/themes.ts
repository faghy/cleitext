import { existsSync } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CHILD_THEME_EDITOR_STYLE,
  CHILD_THEME_STYLE,
  MAX_CHILD_STYLE_BYTES,
  themeEntry,
  themeManifestSchema,
  SHARED_THEME_MODULES,
  type ThemeManifest,
} from '@cleitext/shared';
import type { ChildThemeModule, ThemeDefinition } from '@cleitext/theme-sdk';
import { theme as aurora } from '@cleitext/theme-aurora';
import semver from 'semver';
import { childDefinition, mergeChildTheme } from '../themes/child-themes.js';

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
/** Child themes (core 0.79): child → parent slug, the parent as loaded, the child's CSS. */
let parents = new Map<string, string>();
let parentDefinitions = new Map<string, ThemeDefinition>();
let childStyles = new Map<string, string>();
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

/** The parent of a child theme (core 0.79), or null. */
export function themeParent(slug: string | null | undefined): string | null {
  return (slug && parents.get(slug)) || null;
}

/** The installed child themes of a theme. */
export function themeChildren(slug: string): string[] {
  return [...parents].filter(([, parent]) => parent === slug).map(([child]) => child);
}

/** The parent's own definition, for `useParentTemplate` in a child's templates. */
export function parentDefinition(slug: string | null | undefined): ThemeDefinition | null {
  return (slug && parentDefinitions.get(slug)) || null;
}

/** The CSS of a child theme (`style.css` and its `css`), printed after the parent's. */
export function childThemeCss(slug: string | null | undefined): string {
  return (slug && childStyles.get(slug)) || '';
}

/**
 * Where to look for a file of the site's theme: the child's folder, then its
 * parent's (a child overrides the parent's files by path).
 */
export function themeDirectories(slug: string | null | undefined): string[] {
  const own = themeDirectory(slug);
  const parent = themeDirectory(themeParent(slug));
  return [own, parent].filter((dir): dir is string => Boolean(dir));
}

/**
 * The theme whose license a site needs to activate this one: the theme
 * itself when paid, the parent for a child of a paid theme, else null.
 */
export function themeLicensedAs(slug: string): string | null {
  if (paid.has(slug)) return slug;
  const parent = themeParent(slug);
  return parent && paid.has(parent) ? parent : null;
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
  const manifests: { base: string; manifest: ThemeManifest }[] = [];
  for (const folder of folders) {
    const base = path.join(dir, folder.name);
    try {
      const manifest = themeManifestSchema.parse(
        JSON.parse(await readFile(path.join(base, 'theme.json'), 'utf8')),
      );
      if (manifest.slug !== folder.name)
        throw new Error('theme.json slug does not match the folder');
      manifests.push({ base, manifest });
    } catch (error) {
      errors.set(folder.name, error instanceof Error ? error.message : String(error));
    }
  }
  const importBundle = async (base: string, manifest: ThemeManifest): Promise<unknown> => {
    const entry = themeEntry(manifest, (file) => existsSync(path.join(base, file)));
    if (!entry) return undefined;
    const file = path.join(base, entry);
    const url = `${pathToFileURL(file).href}?v=${encodeURIComponent(manifest.version)}&g=${generation}`;
    return ((await import(url)) as { default?: unknown }).default;
  };
  // Parents first: themes of their own, then the children built on them.
  const nextParents = new Map<string, string>();
  const nextParentDefinitions = new Map<string, ThemeDefinition>();
  const nextStyles = new Map<string, string>();
  for (const { base, manifest } of manifests.filter((m) => !m.manifest.parent)) {
    try {
      const theme = (await importBundle(base, manifest)) as ThemeDefinition | undefined;
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
      errors.set(manifest.slug, error instanceof Error ? error.message : String(error));
    }
  }
  for (const { base, manifest } of manifests.filter((m) => m.manifest.parent)) {
    try {
      const parentSlug = manifest.parent!;
      if (parentSlug === manifest.slug) throw new Error('A theme cannot be its own parent');
      const parentManifest = manifests.find((m) => m.manifest.slug === parentSlug)?.manifest;
      if (parentManifest?.parent) {
        throw new Error(
          `Its parent ${parentSlug} is a child theme itself: a child theme is built on a theme of its own (one level only)`,
        );
      }
      const parent = next.get(parentSlug) ?? bundled.get(parentSlug);
      if (!parent) {
        throw new Error(
          errors.has(parentSlug)
            ? `Its parent theme ${parentSlug} could not be loaded`
            : `It needs the parent theme ${parentSlug}, which is not installed`,
        );
      }
      if (manifest.parentVersion && semver.validRange(manifest.parentVersion) === null) {
        throw new Error(`parentVersion "${manifest.parentVersion}" is not a semver range`);
      }
      if (
        manifest.parentVersion &&
        semver.valid(parent.version) &&
        !semver.satisfies(parent.version, manifest.parentVersion, { includePrerelease: true })
      ) {
        throw new Error(
          `It needs ${parentSlug} ${manifest.parentVersion}, and ${parent.version} is installed`,
        );
      }
      const exported = (await importBundle(base, manifest)) as ChildThemeModule | undefined;
      const child = childDefinition(exported, parent);
      const theme = mergeChildTheme(parent, child, {
        slug: manifest.slug,
        name: manifest.name,
        version: manifest.version,
        ...(manifest.description !== undefined ? { description: manifest.description } : {}),
      });
      const style = await childStyle(base, CHILD_THEME_STYLE);
      const css = [child.css ?? '', style].filter(Boolean).join('\n');
      const editorStyle = await childStyle(base, CHILD_THEME_EDITOR_STYLE);
      if (editorStyle) {
        const before = theme.editorCss;
        theme.editorCss =
          typeof before === 'function'
            ? (values) => `${before(values)}\n${editorStyle}`
            : [before ?? '', editorStyle].filter(Boolean).join('\n');
      }
      next.set(theme.slug, theme);
      nextParents.set(theme.slug, parentSlug);
      nextParentDefinitions.set(theme.slug, parent);
      if (css) nextStyles.set(theme.slug, css);
      // The parent's plugins (its page builder) come with the child too.
      const plugins = [
        ...new Set([...(nextPlugins.get(parentSlug) ?? []), ...(manifest.plugins ?? [])]),
      ];
      if (plugins.length) nextPlugins.set(theme.slug, plugins);
      nextDirectories.set(theme.slug, base);
    } catch (error) {
      errors.set(manifest.slug, error instanceof Error ? error.message : String(error));
    }
  }
  installed = next;
  failures = errors;
  paid = nextPaid;
  bundledPlugins = nextPlugins;
  directories = nextDirectories;
  parents = nextParents;
  parentDefinitions = nextParentDefinitions;
  childStyles = nextStyles;
}

/** A stylesheet of a child theme's folder (only there, at most 512 KB), or ''. */
async function childStyle(base: string, name: string): Promise<string> {
  const file = path.join(base, name);
  try {
    const real = await realpath(file);
    const root = await realpath(base);
    if (!real.startsWith(root + path.sep)) return '';
    const info = await stat(real);
    if (!info.isFile() || info.size > MAX_CHILD_STYLE_BYTES) return '';
    return await readFile(real, 'utf8');
  } catch {
    return '';
  }
}
