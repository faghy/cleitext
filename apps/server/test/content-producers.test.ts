/**
 * Plugins that write and publish entries (plugin API 1.70): `ctx.content.create`
 * (a draft, as a user), `ctx.content.publish` (now or scheduled) and producers
 * that a calendar plugin asks for an entry (`registerProducer`, `producers`,
 * `produce`).
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const SLUG = 'producer-fixture';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let author: TestClient;
let adminId: string;
let authorId: string;

async function pluginSource(): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), 'producer-src-')), SLUG);
  await mkdir(join(dir, 'dist'), { recursive: true });
  await writeFile(
    join(dir, 'cleitext.plugin.json'),
    JSON.stringify({
      slug: SLUG,
      name: 'Producer (test fixture)',
      version: '1.0.0',
      apiVersion: '^1.70',
      license: 'GPL-2.0-or-later',
      server: 'dist/server.js',
      permissions: ['content:read', 'content:write', 'content:publish', 'routes:admin'],
    }),
  );
  await writeFile(
    join(dir, 'dist', 'server.js'),
    `let calls = 0;
export default { setup(ctx) {
  ctx.content.registerProducer({
    id: '${SLUG}:notes',
    label: 'Notes',
    description: 'One note per slot',
    async produce(siteId, request) {
      calls++;
      if (calls === 2) return null;
      const entry = await ctx.content.create(siteId, {
        type: 'article',
        title: 'Note for ' + request.slotAt.slice(0, 10),
        excerpt: 'Written by a producer',
        document: { schema: 1, blocks: [{ id: 'p1', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Hello' }] }] },
      }, { userId: request.userId });
      return { entryId: entry.id };
    },
  });
  ctx.routes.api({ method: 'POST', path: '/run', capability: 'edit_entries', async handler(request) {
    const body = request.body ?? {};
    try {
      if (body.action === 'producers') return { body: await ctx.content.producers(request.siteId) };
      if (body.action === 'produce')
        return { body: await ctx.content.produce(request.siteId, body.producer, { userId: body.userId, slotAt: body.slotAt }) };
      if (body.action === 'publish')
        return { body: await ctx.content.publish(request.siteId, body.id, { userId: body.userId, ...(body.at ? { at: body.at } : {}) }) };
      if (body.action === 'create')
        return { body: await ctx.content.create(request.siteId, { type: 'article', title: body.title, document: body.document }, { userId: body.userId }) };
    } catch (error) {
      return { status: 422, body: { error: String(error && error.message || error) } };
    }
    return { status: 400, body: {} };
  } });
} };
`,
  );
  return dir;
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await installPlugin(owner.db, {
    source: await pluginSource(),
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath });
  const site = await seedSite(owner, 'content-producers');
  adminId = await seedUser(owner, {
    email: 'admin@producers.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  authorId = await seedUser(owner, {
    email: 'contrib@producers.test',
    password: PASSWORD,
    site,
    role: 'contributor',
  });
  admin = new TestClient(app, site.host, '10.39.0.1');
  author = new TestClient(app, site.host, '10.39.0.2');
  await admin.login('admin@producers.test', PASSWORD);
  await author.login('contrib@producers.test', PASSWORD);
  expect((await admin.post(`/api/v1/plugins/${SLUG}/activate`, {})).statusCode).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

const run = (body: Record<string, unknown>) => admin.post(`/api/v1/ext/${SLUG}/run`, body);

describe('content producers and publishing (plugin API 1.70)', () => {
  it('lists the producers of the active plugins', async () => {
    expect((await run({ action: 'producers' })).json()).toEqual([
      { id: `${SLUG}:notes`, label: 'Notes', description: 'One note per slot', plugin: SLUG },
    ]);
  });

  it('asks a producer for a draft, written as the user', async () => {
    const produced = await run({
      action: 'produce',
      producer: `${SLUG}:notes`,
      userId: adminId,
      slotAt: '2026-12-01T09:00:00.000Z',
    });
    expect(produced.statusCode, produced.body).toBe(200);
    const { entryId } = produced.json() as { entryId: string };
    const entry = (await admin.get(`/api/v1/entries/${entryId}`)).json();
    expect(entry).toMatchObject({
      title: 'Note for 2026-12-01',
      status: 'draft',
    });
    expect(entry.author.id).toBe(adminId);
    // The second call has nothing to write.
    const empty = await run({
      action: 'produce',
      producer: `${SLUG}:notes`,
      userId: adminId,
      slotAt: 'x',
    });
    expect(empty.json()).toBeNull();
    const unknown = await run({
      action: 'produce',
      producer: 'nope',
      userId: adminId,
      slotAt: 'x',
    });
    expect(unknown.statusCode).toBe(422);
  });

  it('publishes now or schedules, with the rights of the user', async () => {
    const draft = (await run({ action: 'create', title: 'Later', userId: adminId })).json();
    const at = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const scheduled = (await run({ action: 'publish', id: draft.id, userId: adminId, at })).json();
    expect(scheduled.status).toBe('scheduled');
    const now = (await run({ action: 'create', title: 'Now', userId: adminId })).json();
    expect((await run({ action: 'publish', id: now.id, userId: adminId })).json().status).toBe(
      'published',
    );
    // A contributor cannot publish, also through a plugin.
    const theirs = (await run({ action: 'create', title: 'Theirs', userId: authorId })).json();
    const refused = await run({ action: 'publish', id: theirs.id, userId: authorId });
    expect(refused.statusCode).toBe(422);
    // The document is checked as the editor's.
    const bad = await run({
      action: 'create',
      title: 'Bad',
      userId: adminId,
      document: { schema: 9 },
    });
    expect(bad.statusCode).toBe(422);
  });
});
