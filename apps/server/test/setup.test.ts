/** Setup wizard without a configuration (RF-SIT-02): token, requirements, database. */
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { createDatabase } from '@cleitext/db';
import { provisionDatabase, type ProvisionedDatabase } from '@cleitext/testing';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { loadConfig } from '../src/config/config.js';
import { createSetup } from '../src/install/setup.js';
import { tokenFile } from '../src/install/token.js';

const superuserUrl = inject('superuserUrl');
let root: string;
let db: ProvisionedDatabase;
let wizard: FastifyInstance;
let configured = 0;
let cookie = '';

const su = async (statement: string) => {
  const conn = createDatabase(superuserUrl, { max: 1 });
  try {
    await conn.db.execute(sql.raw(statement));
  } finally {
    await conn.close();
  }
};

const host = () => new URL(superuserUrl).hostname;
const port = () => new URL(superuserUrl).port || '5432';
const ownerPassword = () => decodeURIComponent(new URL(db.ownerUrl).password);

const post = (url: string, values: Record<string, string>, withCookie = true) =>
  wizard.inject({
    method: 'POST',
    url,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(withCookie && cookie ? { cookie } : {}),
    },
    payload: new URLSearchParams(values).toString(),
  });

const databaseForm = (overrides: Record<string, string> = {}) => ({
  host: host(),
  port: port(),
  database: db.database,
  owner: db.ownerRole,
  ownerPassword: ownerPassword(),
  appRole: `${db.database}_site`,
  dataDir: join(root, 'shared'),
  trustProxy: 'on',
  ...overrides,
});

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'cleitext-setup-'));
  db = await provisionDatabase(superuserUrl);
  wizard = await createSetup({
    root,
    onConfigured: () => configured++,
    logLevel: 'silent',
    requireToken: true,
  });
});

afterAll(async () => {
  await wizard?.close();
  await db?.drop();
  await su(`drop role if exists "${db.database}_site"`).catch(() => {});
  rmSync(root, { recursive: true, force: true });
});

describe('setup wizard without the token (default)', () => {
  it('starts from a welcome page and goes straight to the steps', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'cleitext-setup-open-'));
    const open = await createSetup({ root: plain, onConfigured: () => {}, logLevel: 'silent' });
    try {
      const page = await open.inject({ url: '/install' });
      expect(page.statusCode).toBe(200);
      expect(page.body).not.toContain('name="token"');
      expect(page.body).toContain('href="/install?step=requirements"');
      expect(existsSync(tokenFile(plain))).toBe(false);
      expect((await open.inject({ url: '/install?step=database' })).body).toContain(
        'name="ownerPassword"',
      );
      // No session needed: an incomplete form is refused for what it lacks.
      const post = await open.inject({
        method: 'POST',
        url: '/install/database',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'host=localhost',
      });
      expect(post.statusCode).toBe(400);
    } finally {
      await open.close();
      rmSync(plain, { recursive: true, force: true });
    }
  });
});

describe('setup wizard with the token (CLEITEXT_SETUP_TOKEN)', () => {
  it('asks for the setup token, kept in tmp/setup-token', async () => {
    const page = await wizard.inject({ url: '/install' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-security-policy']).toContain("default-src 'none'");
    expect(page.body).toContain('Setup token');
    expect(page.body).toContain(tokenFile(root));
    expect(statSync(tokenFile(root)).mode & 0o777).toBe(0o600);

    const italian = await wizard.inject({ url: '/install?lang=it' });
    expect(italian.body).toContain('Codice di setup');

    // Any other address leads here.
    expect((await wizard.inject({ url: '/admin/' })).headers.location).toBe('/install');
  });

  it('refuses a wrong token and opens a session with the right one', async () => {
    expect((await post('/install/token', { token: 'wrong' }, false)).statusCode).toBe(403);
    const token = readFileSync(tokenFile(root), 'utf8').trim();
    const ok = await post('/install/token', { token }, false);
    expect(ok.statusCode).toBe(303);
    cookie = String(ok.headers['set-cookie']).split(';')[0]!;
    expect(cookie).toMatch(/^cleitext_setup=/);

    const checks = await wizard.inject({ url: '/install?step=requirements', headers: { cookie } });
    expect(checks.body).toContain(`Node.js ${process.versions.node}`);
    expect(checks.body).toContain('step=database');
  });

  it('needs the session for the database step', async () => {
    expect((await post('/install/database', databaseForm(), false)).statusCode).toBe(403);
  });

  it('shows the exact command when the owner cannot create roles', async () => {
    await su(`alter role "${db.ownerRole}" nocreaterole`);
    try {
      const page = await post('/install/database', databaseForm());
      expect(page.statusCode).toBe(400);
      expect(page.body).toContain('CREATEROLE');
      expect(page.body).toContain(
        `sudo -u postgres psql -c &#39;ALTER ROLE &quot;${db.ownerRole}&quot; CREATEROLE;&#39;`,
      );
    } finally {
      await su(`alter role "${db.ownerRole}" createrole`);
    }
  });

  it('reports a wrong password', async () => {
    const page = await post('/install/database', databaseForm({ ownerPassword: 'wrong' }));
    expect(page.statusCode).toBe(400);
    expect(page.body).toContain('Could not connect to the database');
  });

  it('creates the application user and writes the configuration', async () => {
    const page = await post('/install/database', databaseForm());
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Configuration saved');

    const file = join(root, 'shared', '.env');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(lstatSync(join(root, '.env')).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(root, '.env'))).toBe(join('shared', '.env'));
    for (const folder of ['media', 'plugins', 'themes', 'backups']) {
      expect(statSync(join(root, 'shared', folder)).isDirectory()).toBe(true);
    }

    const env = parseEnv(readFileSync(file, 'utf8'));
    const config = loadConfig({ ...env, LOG_LEVEL: 'silent' });
    expect(config.env).toBe('production');
    expect(config.trustProxy).toBe(true);
    expect(new URL(config.database.url).username).toBe(`${db.database}_site`);
    expect(new URL(config.database.adminUrl!).username).toBe(db.ownerRole);

    // The new user connects, and is not the owner of anything.
    const app = createDatabase(config.database.url, { max: 1 });
    try {
      const [row] = await app.db.execute<{ user: string; creates: boolean }>(
        sql`select current_user as user, rolcreaterole as creates from pg_roles where rolname = current_user`,
      );
      expect(row).toMatchObject({ user: `${db.database}_site`, creates: false });
    } finally {
      await app.close();
    }

    // The answer was sent: the server moves on to the installer.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(configured).toBe(1);
    expect((await wizard.inject({ url: '/install' })).headers.location).toBe('/install');
  });
});
