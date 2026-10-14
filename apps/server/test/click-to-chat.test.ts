/**
 * The official Click to Chat plugin (Joinchat for Cleitext): the WhatsApp
 * button on the public pages, per-page settings, the button block, the
 * script and styles, and the click counter.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let visitor: TestClient;

async function page(title: string, extra: Record<string, unknown> = {}) {
  const created = (await admin.post('/api/v1/entries', { type: 'page', title, ...extra })).json();
  const published = await admin.post(`/api/v1/entries/${created.id}/publish`);
  expect(published.statusCode, published.body).toBe(200);
  return `/${published.json().slug as string}`;
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  // Built where its dependencies are (the QR code generator), then copied.
  await buildPlugin(join(pluginsRoot, 'click-to-chat'));
  const source = join(await mkdtemp(join(tmpdir(), 'click-to-chat-src-')), 'click-to-chat');
  await cp(join(pluginsRoot, 'click-to-chat'), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'whatsapp');
  await seedUser(owner, {
    email: 'admin@whatsapp.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.70.0.1');
  await admin.login('admin@whatsapp.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.70.0.2');
  const activated = await admin.post('/api/v1/plugins/click-to-chat/activate');
  expect(activated.statusCode, activated.body).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('Click to Chat', () => {
  it('shows nothing until there is a number', async () => {
    const html = (await visitor.get('/')).body;
    expect(html).not.toContain('class="joinchat');
    expect(html).not.toContain('/click-to-chat/front.js');
  });

  it('adds the button, its chat window, the script and the styles to the pages', async () => {
    const saved = await admin.request('PATCH', '/api/v1/plugins/click-to-chat/settings', {
      telephone: '+39 333 1234567',
      message_send: 'Hello from {TITLE}',
      message_text: 'Hi! Welcome to *{SITE}*',
      button_tip: 'Need help?',
      color: '#0f4c81',
      show_search: false,
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const path = await page('Contacts');
    const html = (await visitor.get(path)).body;
    expect(html).toMatch(
      /<link rel="stylesheet" href="\/click-to-chat\/front\.css\?v=\w+"><style>\.joinchat\{--ch:208;--cs:79%;--cl:28%;--bw:1\}<\/style><\/head>/,
    );
    expect(html).toMatch(
      /<script src="\/click-to-chat\/front\.js\?v=\w+" defer><\/script><\/body>/,
    );
    expect(html).toContain('"telephone":"393331234567"');
    expect(html).toMatch(/"message_send":"Hello from Contacts[^"]*"/);
    expect(html).toContain('Hi! Welcome to <strong>Site whatsapp</strong>');
    expect(html).toContain('"tracking_url":"/click-to-chat/track"');
    // Search results are off: only the triggers would work there.
    expect((await visitor.get('/search?q=x')).body).not.toContain('class="joinchat');
  });

  it('serves the script and the styles with a long cache', async () => {
    const js = await visitor.get('/click-to-chat/front.js');
    expect(js.statusCode).toBe(200);
    expect(js.headers['content-type']).toContain('javascript');
    expect(js.headers['cache-control']).toContain('immutable');
    expect(js.body).toContain('Based on Joinchat 6.4.2 by Creame');
    expect(js.body).not.toContain('QrCreator');
    const css = await visitor.get('/click-to-chat/front.css');
    expect(css.body).toContain('.joinchat__button');
  });

  it('follows the settings of each page', async () => {
    const hidden = await page('No chat', {
      fields: { 'click-to-chat': { view: 'hide' } },
    });
    expect((await visitor.get(hidden)).body).not.toContain('class="joinchat');
    const other = await page('Sales', {
      fields: { 'click-to-chat': { telephone: '+39 02 7654321', message_text: '{}' } },
    });
    const html = (await visitor.get(other)).body;
    expect(html).toContain('"telephone":"39027654321"');
    expect(html).toContain('joinchat--btn');
    expect(html).not.toContain('joinchat__chatbox');
  });

  it('has a WhatsApp button block, working also without the script', async () => {
    const path = await page('Book', {
      document: {
        schema: 1,
        blocks: [
          {
            id: 'wa1',
            type: 'click-to-chat/button',
            v: 1,
            attrs: { text: 'Book a table', message: 'A table for two', align: 'center' },
          },
        ],
      },
    });
    const html = (await visitor.get(path)).body;
    expect(html).toContain(
      '<div class="cx-chat-button cx-chat-button--center"><figure><figcaption>Scan the code</figcaption><span><svg',
    );
    expect(html).toContain(
      '<a class="wp-element-button cx-chat-button__link joinchat_app" href="https://wa.me/393331234567?text=A+table+for+two" target="_blank" rel="noopener" data-message="A table for two">Book a table</a>',
    );
  });

  it('counts the clicks, once per visitor and minute, and not those of bots', async () => {
    const track = (agent: string) =>
      app.inject({
        method: 'POST',
        url: '/click-to-chat/track',
        remoteAddress: '203.0.113.9',
        headers: {
          host: site.host,
          origin: `http://${site.host}`,
          'user-agent': agent,
          'content-type': 'application/x-www-form-urlencoded',
        },
        payload: 'trigger=button&chat_channel=whatsapp&chat_id=393331234567&is_mobile=1',
      });
    expect((await track('Mozilla/5.0 (iPhone)')).statusCode).toBe(204);
    expect((await track('Mozilla/5.0 (iPhone)')).statusCode).toBe(204);
    expect((await track('Googlebot/2.1')).statusCode).toBe(204);
    const stats = (await admin.get('/api/v1/ext/click-to-chat/stats')).json();
    expect(stats).toMatchObject({ today: 1, week: 1, month: 1, total: 1 });
    expect(stats.days).toHaveLength(30);
    expect((await visitor.get('/api/v1/ext/click-to-chat/stats')).statusCode).toBe(401);
  });
});
