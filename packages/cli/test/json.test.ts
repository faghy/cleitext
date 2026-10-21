/* eslint-disable @typescript-eslint/no-explicit-any -- JSON output of the CLI, read field by field. */
/**
 * `--json` output of the CLI (for hosting panels): one JSON object on stdout,
 * `{"error":{code,message}}` on failure. Runs against a database of its own.
 */
import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  createDatabase,
  hashUserToken,
  migrate,
  parseEnvFile,
  userTokens,
  users,
  type DatabaseClient,
} from '@cleitext/db';
import { provisionDatabase, type ProvisionedDatabase } from '@cleitext/testing';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { revokeForeignGrants } from '../src/backup.js';
import { main } from '../src/program.js';

const PASSWORD = 'a long enough password 42';
const OWNER_PASSWORD = 'owner-password-for-tests';

let provisioned: ProvisionedDatabase;
let owner: DatabaseClient;
let data: string;
const savedEnv = { ...process.env };

/** Runs `cleitext <args>`; checks that stdout holds exactly one JSON object. */
async function cli(args: string[], stdin?: string) {
  let out = '';
  const write = vi.spyOn(process.stdout, 'write');
  const code = await main(['node', 'cleitext', ...args], {
    stdout: (text) => (out += text),
    ...(stdin !== undefined ? { stdin: Readable.from([stdin]) } : {}),
  });
  expect(write).not.toHaveBeenCalled();
  write.mockRestore();
  expect(out.endsWith('\n')).toBe(true);
  expect(out.trim().split('\n')).toHaveLength(1);
  return { code, json: JSON.parse(out) as Record<string, any> };
}

beforeAll(async () => {
  provisioned = await provisionDatabase(inject('superuserUrl'), {
    ownerPassword: OWNER_PASSWORD,
  });
  await migrate({ ownerUrl: provisioned.ownerUrl, appRole: provisioned.appRole });
  owner = createDatabase(provisioned.ownerUrl, { max: 2 });
  data = await mkdtemp(path.join(tmpdir(), 'cleitext-cli-json-'));
  Object.assign(process.env, {
    DATABASE_ADMIN_URL: provisioned.ownerUrl,
    DATABASE_URL: provisioned.appUrl,
    MEDIA_PATH: path.join(data, 'media'),
    PLUGINS_PATH: path.join(data, 'plugins'),
    THEMES_PATH: path.join(data, 'themes'),
  });
});

afterEach(() => {
  process.exitCode = undefined;
});

afterAll(async () => {
  process.env = savedEnv;
  await owner?.close();
  await provisioned?.drop();
  // The application role `configure` created.
  const su = createDatabase(inject('superuserUrl'), { max: 1 });
  await su.db.execute(sql.raw(`drop role if exists "${provisioned.database}_app"`));
  await su.close();
  await rm(data, { recursive: true, force: true });
});

describe('errors', () => {
  it('prints {"error":{code,message}} and exits with 1', async () => {
    const saved = process.env.DATABASE_ADMIN_URL;
    delete process.env.DATABASE_ADMIN_URL;
    try {
      const { code, json } = await cli(['site:list', '--json']);
      expect(code).toBe(1);
      expect(json).toEqual({
        error: { code: 'not_configured', message: 'Set DATABASE_ADMIN_URL (owner connection).' },
      });
    } finally {
      process.env.DATABASE_ADMIN_URL = saved;
    }
  });

  it('reports usage errors the same way', async () => {
    const missing = await cli(['site:create', '--json', '--slug', 'x']);
    expect(missing.code).not.toBe(0);
    expect(missing.json.error.code).toBe('usage');
    const unknown = await cli(['no-such-command', '--json']);
    expect(unknown.json.error).toMatchObject({ code: 'usage' });
  });

  it('never prompts', async () => {
    const { code, json } = await cli(['user:create', '--json', '--email', 'p@example.com']);
    expect(code).toBe(1);
    expect(json.error.code).toBe('password_required');
    const restore = await cli(['restore', '--json', 'nothing.tar.gz']);
    expect(restore.json.error.code).toBe('confirmation_required');
  });
});

describe('status', () => {
  it('works when the database is down', async () => {
    const saved = process.env.DATABASE_ADMIN_URL;
    process.env.DATABASE_ADMIN_URL = 'postgres://nobody:nothing@127.0.0.1:1/none';
    try {
      const { code, json } = await cli(['status', '--json']);
      expect(code).toBe(0);
      expect(json).toMatchObject({
        layout: 'folder',
        configured: true,
        node: process.versions.node,
        db: { ok: false },
        sites: [],
      });
      expect(typeof json.db.error).toBe('string');
      expect(json.version).toMatch(/^\d+\.\d+\.\d+/);
    } finally {
      process.env.DATABASE_ADMIN_URL = saved;
    }
  });
});

describe('sites, domains and users', () => {
  it('creates and lists sites', async () => {
    const created = await cli([
      'site:create',
      '--json',
      '--slug',
      'main',
      '--name',
      'Main',
      '--domain',
      'main.example',
    ]);
    expect(created.code).toBe(0);
    expect(created.json).toMatchObject({
      slug: 'main',
      name: 'Main',
      status: 'active',
      maintenance: false,
      url: 'https://main.example/',
      domains: [{ host: 'main.example', primary: true, forceHttps: true }],
    });
    const { json } = await cli(['site:list', '--json']);
    expect(json.sites.map((s: { slug: string }) => s.slug)).toEqual(['main']);
    expect(json.sites[0].id).toBe(created.json.id);
  });

  it('adds, renames and removes domains', async () => {
    await cli(['site:domain:add', '--json', '--site', 'main', '--domain', 'www.main.example']);
    const replaced = await cli([
      'site:domain:replace',
      '--json',
      '--from',
      'main.example',
      '--to',
      'copy.example',
    ]);
    expect(replaced.json).toEqual({
      site: 'main',
      from: 'main.example',
      to: 'copy.example',
      primary: true,
    });
    const primary = await cli([
      'site:domain:remove',
      '--json',
      '--site',
      'main',
      '--domain',
      'copy.example',
    ]);
    expect(primary.json.error.code).toBe('primary_domain');
    const removed = await cli([
      'site:domain:remove',
      '--json',
      '--site',
      'main',
      '--domain',
      'www.main.example',
    ]);
    expect(removed.json).toEqual({ site: 'main', domain: 'www.main.example', removed: true });
    const { json } = await cli(['status', '--json']);
    expect(json.db).toMatchObject({ ok: true, migrations: { pending: 0 } });
    expect(json.installed).toBe(true);
    expect(json.sites[0].domains).toEqual([
      { host: 'copy.example', primary: true, forceHttps: true },
    ]);
    expect(json.appUrls).toContain('https://copy.example/');
  });

  it('creates users and resets passwords from stdin', async () => {
    const created = await cli(
      ['user:create', '--json', '--email', 'root@example.com', '--super-admin', '--password-stdin'],
      `${PASSWORD}\n`,
    );
    expect(created.json).toMatchObject({ email: 'root@example.com', superAdmin: true });
    await cli(
      [
        'user:create',
        '--json',
        '--email',
        'editor@example.com',
        '--site',
        'main',
        '--role',
        'editor',
        '--password-stdin',
      ],
      PASSWORD,
    );
    const reset = await cli(
      ['user:reset-password', '--json', '--email', 'root@example.com', '--password-stdin'],
      'another long password 43\n',
    );
    expect(reset.json).toEqual({ email: 'root@example.com' });
    const short = await cli(
      ['user:reset-password', '--json', '--email', 'root@example.com', '--password-stdin'],
      'short',
    );
    expect(short.json.error.code).toBe('failed');
  });
});

describe('login-link', () => {
  it('issues a one-time link, stored hashed', async () => {
    const before = Date.now();
    const { code, json } = await cli(['login-link', '--json', '--first-super-admin']);
    expect(code).toBe(0);
    expect(json).toMatchObject({ user: 'root@example.com', site: 'main' });
    const url = new URL(json.url);
    expect(url.origin).toBe('https://copy.example');
    expect(url.pathname).toBe('/api/v1/auth/one-time');
    const token = url.searchParams.get('token')!;
    const expires = new Date(json.expiresAt).getTime();
    expect(expires - before).toBeGreaterThan(55_000);
    expect(expires - before).toBeLessThan(65_000);
    const [row] = await owner.db
      .select()
      .from(userTokens)
      .where(eq(userTokens.tokenHash, hashUserToken(token)));
    expect(row).toMatchObject({ kind: 'panel_login', usedAt: null });
    expect(row!.tokenHash).not.toBe(token);
  });

  it('checks the user, the site and the TTL', async () => {
    const long = await cli(['login-link', '--json', '--first-super-admin', '--ttl', '301']);
    expect(long.json.error.code).toBe('invalid_option');
    const both = await cli(['login-link', '--json']);
    expect(both.json.error.code).toBe('invalid_option');
    await cli(['site:create', '--json', '--slug', 'blog', '--name', 'B', '--domain', 'b.example']);
    const notMember = await cli([
      'login-link',
      '--json',
      '--email',
      'editor@example.com',
      '--site',
      'blog',
    ]);
    expect(notMember.json.error.code).toBe('not_member');
    const member = await cli([
      'login-link',
      '--json',
      '--email',
      'editor@example.com',
      '--ttl',
      '300',
    ]);
    expect(member.json.site).toBe('main');
    await owner.db
      .update(users)
      .set({ status: 'suspended' })
      .where(eq(users.email, 'editor@example.com'));
    const suspended = await cli(['login-link', '--json', '--email', 'editor@example.com']);
    expect(suspended.json.error.code).toBe('user_inactive');
    const nobody = await cli(['login-link', '--json', '--email', 'nobody@example.com']);
    expect(nobody.json.error.code).toBe('not_found');
  });
});

describe('plugins, themes, migrations, doctor', () => {
  it('lists plugins and themes', async () => {
    expect((await cli(['plugin:list', '--json'])).json).toEqual({ plugins: [] });
    const themes = await cli(['theme:list', '--json']);
    expect(themes.json.themes[0]).toEqual({
      slug: 'aurora',
      name: 'Aurora',
      version: null,
      bundled: true,
    });
  });

  it('activates plugins only with --site or --network', async () => {
    const neither = await cli(['plugin:activate', 'seo', '--json']);
    expect(neither.json.error.code).toBe('invalid_option');
    const missing = await cli(['plugin:activate', 'seo', '--network', '--json']);
    expect(missing.json.error.code).toBe('not_found');
  });

  it('migrates', async () => {
    const { json } = await cli(['migrate', '--json']);
    expect(json).toMatchObject({ applied: 0, appRole: provisioned.appRole });
    expect(json.total).toBe(json.expected);
  });

  it('checks the installation', async () => {
    const { code, json } = await cli(['doctor', '--json', '--offline']);
    expect(code).toBe(0);
    expect(['ok', 'warn', 'fail']).toContain(json.status);
    const byId = Object.fromEntries(json.checks.map((c: { id: string }) => [c.id, c]));
    for (const id of [
      'env_file',
      'document_root',
      'setup_token',
      'trust_proxy',
      'database',
      'https',
      'migrations',
      'installed',
      'owner_createrole',
      'pg_dump',
      'disk_space',
    ]) {
      expect(byId[id], id).toBeDefined();
      expect(['ok', 'warn', 'fail']).toContain(byId[id].status);
    }
    expect(byId.database.status).toBe('ok');
    expect(byId.migrations.status).toBe('ok');
    expect(byId.owner_createrole.status).toBe('ok');
    expect(byId.core_update).toBeUndefined();
  });
});

describe('backups', () => {
  it('lists and prunes', async () => {
    const dir = path.join(data, 'backups');
    await mkdir(dir, { recursive: true });
    const names = ['cleitext-a.tar.gz', 'before-1.2.3.tar.gz', 'cleitext-c.tar.gz'];
    for (const [i, name] of names.entries()) {
      await writeFile(path.join(dir, name), 'x'.repeat(i + 1));
      const time = new Date(Date.UTC(2026, 0, i + 1));
      await utimes(path.join(dir, name), time, time);
    }
    await writeFile(path.join(dir, 'notes.txt'), 'not a backup');
    const list = await cli(['backup:list', '--json']);
    expect(list.json.dir).toBe(dir);
    expect(list.json.backups.map((b: { name: string }) => b.name)).toEqual([
      'cleitext-c.tar.gz',
      'before-1.2.3.tar.gz',
      'cleitext-a.tar.gz',
    ]);
    expect(list.json.backups[1]).toMatchObject({ bytes: 2, beforeVersion: '1.2.3' });
    const bad = await cli(['backup:prune', '--json', '--keep', 'two']);
    expect(bad.json.error.code).toBe('invalid_option');
    const pruned = await cli(['backup:prune', '--json', '--keep', '1']);
    expect(pruned.json.removed.map((b: { name: string }) => b.name)).toEqual([
      'before-1.2.3.tar.gz',
      'cleitext-a.tar.gz',
    ]);
    expect(existsSync(path.join(dir, 'cleitext-c.tar.gz'))).toBe(true);
    expect(existsSync(path.join(dir, 'notes.txt'))).toBe(true);
  });

  it('takes rights away from the roles of another database after a restore', async () => {
    const tag = Math.random().toString(16).slice(2, 8);
    const kept = `cx_foreign_app_${tag}`;
    const created = `cx_plg_seo_${tag}`;
    // As a backup of another database leaves them: grants to its roles.
    for (const role of [kept, created]) {
      await owner.db.execute(sql.raw(`CREATE ROLE ${role} NOLOGIN`));
      await owner.db.execute(
        sql.raw(`GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT ON sites TO ${role}`),
      );
    }
    const revoked = await revokeForeignGrants(owner.db, [kept, created], [created]);
    expect(revoked.sort()).toEqual([created, kept].sort());
    // (USAGE on the public schema also comes from PUBLIC: the role's own grant is checked.)
    const [rights] = await owner.db.execute<{ table: boolean; schema: boolean }>(
      sql.raw(`select has_table_privilege('${kept}', 'public.sites', 'select') as table,
                      coalesce(nspacl::text like '%${kept}=%', false) as schema
               from pg_namespace where nspname = 'public'`),
    );
    expect(rights).toEqual({ table: false, schema: false });
    const roles = await owner.db.execute<{ rolname: string }>(
      sql.raw(`select rolname from pg_roles where rolname in ('${kept}', '${created}')`),
    );
    expect(roles.map((r) => r.rolname)).toEqual([kept]);
    await owner.db.execute(sql.raw(`DROP ROLE ${kept}`));
  });
});

describe('configure', () => {
  it('writes cleitext-shared/.env for the releases layout, and keeps it on a second run', async () => {
    const base = await mkdtemp(path.join(tmpdir(), 'cleitext-configure-'));
    const release = path.join(base, 'releases', 'cleitext-1.0.0');
    await mkdir(release, { recursive: true });
    await writeFile(path.join(release, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    await symlink('releases/cleitext-1.0.0', path.join(base, 'cleitext'));
    const url = new URL(provisioned.ownerUrl);
    const args = [
      'configure',
      '--json',
      '--root',
      path.join(base, 'cleitext'),
      '--db-host',
      url.hostname,
      '--db-port',
      url.port,
      '--db-name',
      provisioned.database,
      '--owner',
      provisioned.ownerRole,
    ];
    const noPassword = await cli(args, '');
    expect(noPassword.json.error.code).toBe('password_required');

    const first = await cli(args, `${OWNER_PASSWORD}\n`);
    expect(first.code).toBe(0);
    const envFile = path.join(base, 'cleitext-shared', '.env');
    expect(first.json).toMatchObject({
      envFile,
      envLink: path.join(release, '.env'),
      dataDir: path.join(base, 'cleitext-shared'),
      appRole: `${provisioned.database}_app`,
      changed: true,
      secret: 'new',
    });
    expect(statSync(envFile).mode & 0o777).toBe(0o600);
    expect(lstatSync(path.join(release, '.env')).isSymbolicLink()).toBe(true);
    const settings = parseEnvFile(readFileSync(envFile, 'utf8'));
    expect(settings.TRUST_PROXY).toBe('true');
    expect(settings.MEDIA_PATH).toBe(path.join(base, 'cleitext-shared', 'media'));
    // The application role can connect with the written URL.
    const app = createDatabase(settings.DATABASE_URL!, { max: 1 });
    await app.db.execute(sql`select 1`);
    await app.close();

    // Again, with the password in the environment: nothing changes.
    process.env.CLEITEXT_DB_OWNER_PASSWORD = OWNER_PASSWORD;
    try {
      const second = await cli(args);
      expect(second.json).toMatchObject({ changed: false, secret: 'kept' });
      const third = await cli([...args, '--app-url', 'https://copy.example/']);
      expect(third.json).toMatchObject({ changed: true, secret: 'kept' });
      const after = parseEnvFile(readFileSync(envFile, 'utf8'));
      expect(after.APP_SECRET).toBe(settings.APP_SECRET);
      expect(after.DATABASE_URL).toBe(settings.DATABASE_URL);
      expect(after.APP_URL).toBe('https://copy.example');
      const wrong = await cli([...args, '--trust-proxy', 'everyone']);
      expect(wrong.json.error.code).toBe('invalid_option');
      // A copy of another installation takes its APP_SECRET.
      const source = path.join(base, 'source.env');
      await writeFile(source, `APP_SECRET=${'ab'.repeat(32)}\n`);
      const copied = await cli([...args, '--app-secret-from', source]);
      expect(copied.json).toMatchObject({ changed: true, secret: 'copied' });
      expect(parseEnvFile(readFileSync(envFile, 'utf8')).APP_SECRET).toBe('ab'.repeat(32));
    } finally {
      delete process.env.CLEITEXT_DB_OWNER_PASSWORD;
    }
    await rm(base, { recursive: true, force: true });
  });
});
