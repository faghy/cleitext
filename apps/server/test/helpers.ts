import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createDatabase,
  roles,
  seedSiteDefaults,
  siteDomains,
  siteMembers,
  sites,
  superAdmins,
  users,
  withSiteContext,
  type DatabaseClient,
} from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { inject } from 'vitest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/crypto.js';
import { loadConfig } from '../src/config/config.js';

export async function startTestApp(
  options: { pluginsPath?: string; env?: Record<string, string> } = {},
): Promise<NestFastifyApplication> {
  const mediaPath = await mkdtemp(join(tmpdir(), 'cleitext-media-'));
  const pluginsPath = options.pluginsPath ?? (await mkdtemp(join(tmpdir(), 'cleitext-plugins-')));
  return createApp(
    loadConfig({
      MEDIA_PATH: mediaPath,
      PLUGINS_PATH: pluginsPath,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: inject('appUrl'),
      MAIL_URL: 'memory://',
      SCHEDULER_INTERVAL_SECONDS: '0',
      ...options.env,
    }),
  );
}

export function ownerDatabase(): DatabaseClient {
  return createDatabase(inject('ownerUrl'), { max: 2 });
}

export interface SeededSite {
  id: string;
  host: string;
}

/** Creates a site with a primary domain (no forced HTTPS) and optional aliases. */
export async function seedSite(
  owner: DatabaseClient,
  slug: string,
  options: { aliases?: string[]; forceHttps?: boolean; locale?: string } = {},
): Promise<SeededSite> {
  const [site] = await owner.db
    .insert(sites)
    .values({ slug, name: `Site ${slug}`, defaultLocale: options.locale ?? 'en' })
    .returning();
  const host = `${slug}.test`;
  await owner.db.insert(siteDomains).values([
    { siteId: site!.id, host, isPrimary: true, forceHttps: options.forceHttps ?? false },
    ...(options.aliases ?? []).map((alias) => ({
      siteId: site!.id,
      host: alias,
      isPrimary: false,
      forceHttps: options.forceHttps ?? false,
    })),
  ]);
  await seedSiteDefaults(owner.db, site!.id);
  return { id: site!.id, host };
}

/** Creates an active user, optionally member of a site with a system role. */
export async function seedUser(
  owner: DatabaseClient,
  input: {
    email: string;
    password: string;
    site?: SeededSite;
    role?: string;
    superAdmin?: boolean;
  },
): Promise<string> {
  const values = {
    email: input.email,
    displayName: input.email.split('@')[0]!,
    passwordHash: await hashPassword(input.password),
  };
  // The author slug is picked by a trigger from the display name: test files
  // running at the same time can race for the same one, so try again.
  let user: typeof users.$inferSelect | undefined;
  for (let attempt = 0; !user; attempt++) {
    try {
      [user] = await owner.db.insert(users).values(values).returning();
    } catch (error) {
      const code = (error as { cause?: { code?: string } }).cause?.code;
      if (code !== '23505' || attempt >= 4) throw error;
    }
  }
  if (input.superAdmin) await owner.db.insert(superAdmins).values({ userId: user!.id });
  if (input.site && input.role) {
    const [role] = await owner.db
      .select()
      .from(roles)
      .where(and(isNull(roles.siteId), eq(roles.slug, input.role)));
    await withSiteContext(owner.db, input.site.id, (tx) =>
      tx.insert(siteMembers).values({ siteId: input.site!.id, userId: user!.id, roleId: role!.id }),
    );
  }
  return user!.id;
}

/** Minimal browser: keeps cookies, sends Origin and the CSRF header. */
export class TestClient {
  private cookies = new Map<string, string>();
  private csrf: string | null = null;

  constructor(
    private readonly app: NestFastifyApplication,
    readonly host: string,
    private readonly remoteAddress = '127.0.0.1',
  ) {}

  async request(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    body?: unknown,
    options: { csrf?: boolean; origin?: string | null } = {},
  ) {
    if (method !== 'GET' && options.csrf !== false && !this.csrf) {
      await this.fetchCsrf();
    }
    const headers: Record<string, string> = { host: this.host };
    if (options.origin !== null) headers.origin = options.origin ?? `http://${this.host}`;
    if (method !== 'GET' && options.csrf !== false && this.csrf)
      headers['x-csrf-token'] = this.csrf;
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    const response = await this.app.inject({
      method,
      url,
      headers,
      remoteAddress: this.remoteAddress,
      ...(body !== undefined ? { payload: body as object } : {}),
    });
    for (const cookie of response.cookies as { name: string; value: string; maxAge?: number }[]) {
      if (cookie.value === '' || cookie.maxAge === 0) this.cookies.delete(cookie.name);
      else this.cookies.set(cookie.name, cookie.value);
    }
    return response;
  }

  /** Posts an HTML form (application/x-www-form-urlencoded), as a browser does. */
  async postForm(url: string, fields: Record<string, string>) {
    const response = await this.app.inject({
      method: 'POST',
      url,
      remoteAddress: this.remoteAddress,
      headers: {
        host: this.host,
        origin: `http://${this.host}`,
        'content-type': 'application/x-www-form-urlencoded',
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
      },
      payload: new URLSearchParams(fields).toString(),
    });
    for (const cookie of response.cookies as { name: string; value: string; maxAge?: number }[]) {
      if (cookie.value === '' || cookie.maxAge === 0) this.cookies.delete(cookie.name);
      else this.cookies.set(cookie.name, cookie.value);
    }
    return response;
  }

  /** Uploads one file as multipart/form-data (field `file`). */
  async upload(
    url: string,
    filename: string,
    data: Buffer,
    contentType = 'application/octet-stream',
  ) {
    const boundary = `----cleitext${Math.random().toString(16).slice(2)}`;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
          `Content-Type: ${contentType}\r\n\r\n`,
      ),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    if (!this.csrf) await this.fetchCsrf();
    return this.app.inject({
      method: 'POST',
      url,
      remoteAddress: this.remoteAddress,
      headers: {
        host: this.host,
        origin: `http://${this.host}`,
        'x-csrf-token': this.csrf!,
        'content-type': `multipart/form-data; boundary=${boundary}`,
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
      },
      payload: body,
    });
  }

  get(url: string) {
    return this.request('GET', url);
  }

  post(url: string, body?: unknown) {
    return this.request('POST', url, body ?? {});
  }

  delete(url: string) {
    return this.request('DELETE', url);
  }

  login(email: string, password: string, remember = false) {
    return this.post('/api/v1/auth/login', { email, password, remember });
  }

  hasCookie(name: string): boolean {
    return this.cookies.has(name);
  }

  private async fetchCsrf() {
    const response = await this.app.inject({
      method: 'GET',
      url: '/api/v1/auth/csrf',
      headers: { host: this.host },
      remoteAddress: this.remoteAddress,
    });
    this.csrf = response.json().token;
    for (const cookie of response.cookies as { name: string; value: string }[]) {
      this.cookies.set(cookie.name, cookie.value);
    }
  }
}

/** Extracts the token from the last email link sent to an address. */
export function tokenFromMail(outbox: { to: string; text: string }[], to: string): string {
  const message = [...outbox].reverse().find((m) => m.to === to);
  const match = message?.text.match(/token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`No token mailed to ${to}`);
  return match[1]!;
}
