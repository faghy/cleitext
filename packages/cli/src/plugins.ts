/**
 * Plugin packaging and installation (docs/ARCHITECTURE.md §11.3), run with
 * the owner connection: build, install with migrations in the plugin's own
 * schema, list and uninstall.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  pluginMigrations,
  plugins,
  settings,
  sites,
  withSiteContext,
  type Database,
} from '@cleitext/db';
import {
  pluginManifestSchema,
  pluginRoleName,
  pluginSchemaName,
  SDK_VERSION,
  SHARED_ADMIN_MODULES,
  SHARED_MODULES_GLOBAL,
  SHARED_SERVER_MODULES,
  type PluginDefinition,
  type PluginManifest,
} from '@cleitext/plugin-sdk';
import { eq, sql } from 'drizzle-orm';
import * as esbuild from 'esbuild';
import semver from 'semver';
import { OperationError } from './operations.js';

export const MANIFEST_FILE = 'cleitext.plugin.json';
const MIGRATION_RE = /^\d{4}_[a-z0-9_-]+\.sql$/;

// ---- Manifest ---------------------------------------------------------------------------

export async function readManifest(dir: string): Promise<PluginManifest> {
  let raw: string;
  try {
    raw = await readFile(path.join(dir, MANIFEST_FILE), 'utf8');
  } catch {
    throw new OperationError(`No ${MANIFEST_FILE} in ${dir}.`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new OperationError(`${MANIFEST_FILE} is not valid JSON.`);
  }
  const result = pluginManifestSchema.safeParse(json);
  if (!result.success) {
    const problems = result.error.issues.map(
      (i) => `${i.path.join('.') || 'manifest'}: ${i.message}`,
    );
    throw new OperationError(`Invalid ${MANIFEST_FILE}:\n  ${problems.join('\n  ')}`);
  }
  return result.data;
}

/** Checks that the plugin targets this SDK version. */
export function assertCompatible(manifest: PluginManifest): void {
  if (!semver.validRange(manifest.apiVersion)) {
    throw new OperationError(`apiVersion "${manifest.apiVersion}" is not a valid semver range.`);
  }
  if (!semver.satisfies(SDK_VERSION, manifest.apiVersion)) {
    throw new OperationError(
      `${manifest.slug} needs plugin API ${manifest.apiVersion}; this Cleitext provides ${SDK_VERSION}.`,
    );
  }
}

// ---- Build ------------------------------------------------------------------------------

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

/** `dist/server.js` → `src/server.ts` (or .tsx/.js…), when it exists. */
function sourceFor(dir: string, output: string): string | null {
  const base = output.replace(/^dist\//, 'src/').replace(/\.m?js$/, '');
  for (const extension of SOURCE_EXTENSIONS) {
    const candidate = path.join(dir, base + extension);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Replaces imports of host-provided modules with the host's instance, so a
 * plugin never ships its own React, Drizzle or SDK.
 */
function sharedModulesPlugin(shared: readonly string[], target: string): esbuild.Plugin {
  return {
    name: 'cleitext-shared-modules',
    setup(build) {
      build.onResolve({ filter: /^[@a-z]/ }, (args) => {
        if (shared.includes(args.path)) return { path: args.path, namespace: 'cleitext-shared' };
        const hostOnly = [...SHARED_SERVER_MODULES, ...SHARED_ADMIN_MODULES];
        if (hostOnly.includes(args.path as never)) {
          return { errors: [{ text: `"${args.path}" is not available in the ${target} entry.` }] };
        }
        return undefined;
      });
      build.onLoad({ filter: /.*/, namespace: 'cleitext-shared' }, (args) => ({
        contents: `module.exports = globalThis[${JSON.stringify(SHARED_MODULES_GLOBAL)}][${JSON.stringify(args.path)}];`,
        loader: 'js',
      }));
    },
  };
}

export interface BuildResult {
  manifest: PluginManifest;
  outputs: string[];
}

/** Bundles the server and admin entries (TypeScript and JSX supported). */
export async function buildPlugin(dir: string): Promise<BuildResult> {
  const manifest = await readManifest(dir);
  const outputs: string[] = [];
  const targets = [
    {
      entry: manifest.server,
      platform: 'node' as const,
      shared: SHARED_SERVER_MODULES,
      name: 'server',
    },
    {
      entry: manifest.admin,
      platform: 'browser' as const,
      shared: SHARED_ADMIN_MODULES,
      name: 'admin',
    },
  ];
  for (const target of targets) {
    if (!target.entry) continue;
    const source = sourceFor(dir, target.entry);
    if (!source) {
      throw new OperationError(
        `No source for ${target.entry}: expected ${target.entry.replace(/^dist\//, 'src/').replace(/\.m?js$/, '.ts')}.`,
      );
    }
    const outfile = path.join(dir, target.entry);
    const result = await esbuild
      .build({
        entryPoints: [source],
        outfile,
        bundle: true,
        format: 'esm',
        platform: target.platform,
        target: target.platform === 'node' ? 'node22' : 'es2023',
        jsx: 'automatic',
        sourcemap: true,
        minify: target.platform === 'browser',
        legalComments: 'linked',
        logLevel: 'silent',
        plugins: [sharedModulesPlugin(target.shared, target.name)],
      })
      .catch((error: unknown) => {
        const failure = error as esbuild.BuildFailure;
        const messages = failure.errors?.map(
          (e) => `${e.location?.file ?? ''}:${e.location?.line ?? ''} ${e.text}`,
        );
        throw new OperationError(
          `Build of the ${target.name} entry failed:\n  ${(messages ?? [String(error)]).join('\n  ')}`,
        );
      });
    if (result.errors.length === 0) outputs.push(outfile);
  }
  return { manifest, outputs };
}

// ---- Install ----------------------------------------------------------------------------

export interface InstallOptions {
  /** Folder of the plugin to install (with its built entries). */
  source: string;
  /** Where installed plugins live (PLUGINS_PATH). */
  pluginsPath: string;
  /** Application role, which may switch to the plugin role. */
  appRole: string;
  /** Development: link the folder instead of copying it. */
  link?: boolean;
  /** Must-use: always active on every site (RF-PLG-15). */
  required?: boolean;
}

export interface InstallResult {
  manifest: PluginManifest;
  previousVersion: string | null;
  migrations: string[];
}

/** Installs or updates a plugin: files, migrations, registration (RF-PLG-01/03). */
export async function installPlugin(db: Database, options: InstallOptions): Promise<InstallResult> {
  const source = path.resolve(options.source);
  const manifest = await readManifest(source);
  assertCompatible(manifest);
  for (const entry of [manifest.server, manifest.admin]) {
    if (entry && !existsSync(path.join(source, entry))) {
      throw new OperationError(
        `${entry} is missing: run "cleitext plugin:build ${options.source}" first.`,
      );
    }
  }
  const [existing] = await db.select().from(plugins).where(eq(plugins.slug, manifest.slug));
  if (existing && semver.lt(manifest.version, existing.version)) {
    throw new OperationError(
      `${manifest.slug} ${existing.version} is installed; refusing to downgrade to ${manifest.version}.`,
    );
  }
  await assertDependencies(db, manifest);

  const target = path.join(path.resolve(options.pluginsPath), manifest.slug);
  if (path.relative(target, source) !== '') await placeFiles(source, target, Boolean(options.link));

  const migrations = await migratePlugin(db, manifest.slug, target, options.appRole);
  const values = {
    version: manifest.version,
    apiVersion: manifest.apiVersion,
    manifest: manifest as unknown as Record<string, unknown>,
    // Kept on updates unless --required is given again.
    ...(options.required ? { mustUse: true } : {}),
  };
  await db
    .insert(plugins)
    .values({ slug: manifest.slug, ...values })
    .onConflictDoUpdate({ target: plugins.slug, set: values });
  return { manifest, previousVersion: existing?.version ?? null, migrations };
}

async function assertDependencies(db: Database, manifest: PluginManifest): Promise<void> {
  for (const [slug, range] of Object.entries(manifest.requires?.plugins ?? {})) {
    const [dependency] = await db.select().from(plugins).where(eq(plugins.slug, slug));
    if (!dependency)
      throw new OperationError(`${manifest.slug} requires the plugin ${slug} (${range}).`);
    if (!semver.satisfies(dependency.version, range)) {
      throw new OperationError(
        `${manifest.slug} requires ${slug} ${range}; version ${dependency.version} is installed.`,
      );
    }
  }
}

/** Copies (or links) the plugin; the previous version is kept for rollback. */
async function placeFiles(source: string, target: string, link: boolean): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const previous = `${target}.previous`;
  const staging = `${target}.staging`;
  await rm(staging, { recursive: true, force: true });
  if (link) {
    await symlink(source, staging, 'dir');
  } else {
    await cp(source, staging, {
      recursive: true,
      filter: (file) =>
        !/[\\/](node_modules|\.git)([\\/]|$)/.test(path.relative(source, file)) &&
        !/^(node_modules|\.git)$/.test(path.relative(source, file)),
    });
  }
  if (await exists(target)) {
    await rm(previous, { recursive: true, force: true });
    await rename(target, previous);
  }
  await rename(staging, target);
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
 * Applies the plugin's SQL migrations in its own schema, as the owner, and
 * grants its PostgreSQL role access to that schema only (RF-PLG-03).
 * A migration changed after being applied stops the installation.
 */
export async function migratePlugin(
  db: Database,
  slug: string,
  dir: string,
  appRole: string,
): Promise<string[]> {
  const schema = pluginSchemaName(slug);
  const role = pluginRoleName(slug);
  const folder = path.join(dir, 'migrations');
  const files = existsSync(folder)
    ? (await readdir(folder)).filter((f) => f.endsWith('.sql')).sort()
    : [];
  for (const file of files) {
    if (!MIGRATION_RE.test(file)) {
      throw new OperationError(`Migration ${file}: use names like 0001_create_tables.sql.`);
    }
  }
  const applied: string[] = [];
  await db.transaction(async (tx) => {
    await tx.execute(
      sql.raw(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
          CREATE ROLE ${role} NOLOGIN;
        END IF;
      END $$`),
    );
    await tx.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS ${schema}`));
    const done = new Map(
      (await tx.select().from(pluginMigrations).where(eq(pluginMigrations.pluginSlug, slug))).map(
        (m) => [m.migration, m.checksum],
      ),
    );
    for (const file of files) {
      const text = await readFile(path.join(folder, file), 'utf8');
      const checksum = createHash('sha256').update(text).digest('hex');
      const recorded = done.get(file);
      if (recorded) {
        if (recorded !== checksum) {
          throw new OperationError(
            `Migration ${slug}/${file} was changed after being applied. Add a new migration instead.`,
          );
        }
        continue;
      }
      await tx.execute(sql.raw(`SET LOCAL search_path TO ${schema}, public`));
      await tx.execute(sql.raw(text));
      await tx.execute(sql.raw('SET LOCAL search_path TO public'));
      await tx.insert(pluginMigrations).values({ pluginSlug: slug, migration: file, checksum });
      applied.push(file);
    }
    // The plugin role sees its schema only; the app role may switch to it.
    await tx.execute(
      sql.raw(`
      GRANT USAGE ON SCHEMA ${schema} TO ${role};
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role};
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role};
      GRANT ${role} TO ${quoteIdent(appRole)};`),
    );
  });
  return applied;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// ---- List and uninstall -----------------------------------------------------------------

export async function listPlugins(db: Database) {
  return db.select().from(plugins).orderBy(plugins.slug);
}

export interface UninstallOptions {
  pluginsPath: string;
}

/**
 * Removes a plugin with its data (RF-PLG-04): `onUninstall`, the schema and
 * role, its settings on every site, its files. Entries of its content types
 * are kept (they reappear if the plugin is installed again).
 */
export async function uninstallPlugin(
  db: Database,
  slug: string,
  options: UninstallOptions,
): Promise<void> {
  const [plugin] = await db.select().from(plugins).where(eq(plugins.slug, slug));
  if (!plugin) throw new OperationError(`The plugin ${slug} is not installed.`);
  const dependents = (await db.select().from(plugins)).filter(
    (p) => (p.manifest as PluginManifest).requires?.plugins?.[slug] !== undefined,
  );
  if (dependents.length > 0) {
    throw new OperationError(
      `Uninstall first: ${dependents.map((d) => d.slug).join(', ')} (they require ${slug}).`,
    );
  }
  const dir = path.join(path.resolve(options.pluginsPath), slug);
  const manifest = plugin.manifest as PluginManifest;
  if (manifest.server && existsSync(path.join(dir, manifest.server))) {
    await runUninstallHook(dir, manifest);
  }
  const schema = pluginSchemaName(slug);
  const role = pluginRoleName(slug);
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`));
    // The role owns nothing: its grants went with the schema.
    await tx.execute(sql.raw(`DROP ROLE IF EXISTS ${role}`));
    await tx.delete(pluginMigrations).where(eq(pluginMigrations.pluginSlug, slug));
    await tx.delete(plugins).where(eq(plugins.slug, slug));
  });
  // Settings are tenant rows: removed site by site.
  for (const site of await db.select({ id: sites.id }).from(sites)) {
    await withSiteContext(db, site.id, (tx) =>
      tx.delete(settings).where(eq(settings.namespace, `plugin:${slug}`)),
    );
  }
  await rm(dir, { recursive: true, force: true });
  await rm(`${dir}.previous`, { recursive: true, force: true });
}

async function runUninstallHook(dir: string, manifest: PluginManifest): Promise<void> {
  const { installServerSharedModules } = await import('@cleitext/plugin-sdk/host');
  await installServerSharedModules();
  const module = (await import(pathToFileURL(path.join(dir, manifest.server!)).href)) as {
    default?: PluginDefinition;
  };
  const log = (level: string) => (message: string) =>
    console.log(`[${manifest.slug}] ${level}: ${message}`);
  await module.default?.onUninstall?.({
    plugin: { slug: manifest.slug, version: manifest.version },
    log: { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') },
  });
}

/** Asks running servers (Passenger) to restart, so they load the new code. */
export async function requestRestart(appRoot: string): Promise<boolean> {
  const tmp = path.join(appRoot, 'tmp');
  if (!existsSync(tmp)) return false;
  await writeFile(path.join(tmp, 'restart.txt'), new Date().toISOString());
  return true;
}
