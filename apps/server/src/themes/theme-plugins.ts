/**
 * The plugins that come with themes (theme.json `plugins`). When a site
 * activates a theme, its plugins are activated; when it leaves, those the
 * theme activated are deactivated (data kept), while a plugin the site used
 * before the theme stays active. A theme updated with a new plugin offers it
 * once to the sites that use it (`syncThemePlugins`): activated if inactive,
 * and never again after, so a plugin deactivated by hand stays off. A plugin
 * that cannot start does not stop the theme: the reason is returned.
 */
import { settings, sites, withContext, type DatabaseClient } from '@cleitext/db';
import { and, eq } from 'drizzle-orm';
import { themeNamespace } from '../public/theme-data.js';
import { themePlugins } from '../public/themes.js';
import type { PluginHost } from '../plugins/plugin-host.service.js';

/** Plugins the theme activated on the site, and those it has offered there already. */
type ListKey = 'plugins' | 'plugins-offered';

interface Scope {
  db: DatabaseClient['db'];
  host: PluginHost;
  siteId: string;
  userId: string;
}

async function readList(scope: Scope, theme: string, key: ListKey): Promise<string[]> {
  const [row] = await withContext(scope.db, { siteId: scope.siteId, userId: scope.userId }, (tx) =>
    tx
      .select({ value: settings.value })
      .from(settings)
      .where(and(eq(settings.namespace, themeNamespace(theme)), eq(settings.key, key))),
  );
  return Array.isArray(row?.value)
    ? (row.value as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
}

async function saveList(scope: Scope, theme: string, key: ListKey, slugs: string[]): Promise<void> {
  await withContext(scope.db, { siteId: scope.siteId, userId: scope.userId }, (tx) =>
    tx
      .insert(settings)
      .values({ siteId: scope.siteId, namespace: themeNamespace(theme), key, value: slugs })
      .onConflictDoUpdate({
        target: [settings.siteId, settings.namespace, settings.key],
        set: { value: slugs },
      }),
  );
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Activates the given plugins of a theme that are not active; returns those it activated. */
async function activateAll(
  scope: Scope,
  plugins: string[],
  warnings: string[],
): Promise<{ activated: string[]; handled: string[] }> {
  const active = await scope.host.activeSlugs(scope.siteId);
  const activated: string[] = [];
  const handled: string[] = [];
  for (const plugin of plugins) {
    if (active.has(plugin)) {
      handled.push(plugin);
      continue;
    }
    if (!scope.host.get(plugin)) {
      warnings.push(
        `The plugin ${plugin} that comes with the theme is not installed: install the theme again.`,
      );
      continue;
    }
    try {
      await scope.host.activate(scope.siteId, scope.userId, plugin);
      activated.push(plugin);
      handled.push(plugin);
      active.add(plugin);
    } catch (error) {
      warnings.push(message(error));
    }
  }
  return { activated, handled };
}

/** A site changes theme: the plugins of the new one on, those the old one turned on off. */
export async function switchThemePlugins(
  scope: Scope,
  previous: string | null,
  next: string,
): Promise<string[]> {
  const wanted = themePlugins(next);
  const leavingTheme = previous && previous !== next ? previous : null;
  const switchedOn = leavingTheme ? await readList(scope, leavingTheme, 'plugins') : [];
  const leaving = switchedOn.filter((p) => !wanted.includes(p));
  if (wanted.length === 0 && leaving.length === 0) return [];
  const warnings: string[] = [];
  const active = await scope.host.activeSlugs(scope.siteId);
  // Dependents first: the theme lists a plugin after those it needs.
  for (const plugin of [...leaving].reverse()) {
    if (!active.has(plugin)) continue;
    await scope.host.deactivate(scope.siteId, scope.userId, plugin).catch((error: unknown) => {
      warnings.push(message(error));
    });
  }
  if (leavingTheme && switchedOn.length > 0) await saveList(scope, leavingTheme, 'plugins', []);
  // Kept: what this theme turned on before (inherited from the previous theme too).
  const mine = new Set([
    ...(await readList(scope, next, 'plugins')),
    ...switchedOn.filter((p) => wanted.includes(p)),
  ]);
  const { activated, handled } = await activateAll(scope, wanted, warnings);
  for (const plugin of activated) mine.add(plugin);
  await saveList(
    scope,
    next,
    'plugins',
    wanted.filter((p) => mine.has(p)),
  );
  const offered = new Set([...(await readList(scope, next, 'plugins-offered')), ...handled]);
  await saveList(
    scope,
    next,
    'plugins-offered',
    wanted.filter((p) => offered.has(p)),
  );
  return warnings;
}

/**
 * The active theme was updated with plugins the site has not been offered
 * yet: they are activated now, once.
 */
export async function syncThemePlugins(scope: Scope): Promise<string[]> {
  const [site] = await withContext(scope.db, { siteId: scope.siteId, userId: scope.userId }, (tx) =>
    tx.select({ theme: sites.themeSlug }).from(sites).where(eq(sites.id, scope.siteId)),
  );
  const theme = site?.theme;
  if (!theme) return [];
  const wanted = themePlugins(theme);
  if (wanted.length === 0) return [];
  const offered = await readList(scope, theme, 'plugins-offered');
  const fresh = wanted.filter((p) => !offered.includes(p));
  if (fresh.length === 0) return [];
  const warnings: string[] = [];
  const { activated, handled } = await activateAll(scope, fresh, warnings);
  if (handled.length === 0) return warnings;
  const mine = new Set([...(await readList(scope, theme, 'plugins')), ...activated]);
  await saveList(
    scope,
    theme,
    'plugins',
    wanted.filter((p) => mine.has(p)),
  );
  await saveList(
    scope,
    theme,
    'plugins-offered',
    wanted.filter((p) => offered.includes(p) || handled.includes(p)),
  );
  return warnings;
}
