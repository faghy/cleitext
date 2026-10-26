/**
 * A theme whose not-found page fails (core 0.86.1): the address still answers
 * 404, with a plain page, never 500 — as three sites of custom themes did
 * when their 404 template read a missing part of the theme.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseClient } from '@cleitext/db';
import { tempDir } from '@cleitext/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let visitor: TestClient;

/** A theme whose layout throws on every page that is not an entry. */
async function themesFolder(): Promise<string> {
  const dir = tempDir('themes-');
  await mkdir(join(dir, 'broken404', 'dist'), { recursive: true });
  await writeFile(
    join(dir, 'broken404', 'theme.json'),
    JSON.stringify({ slug: 'broken404', name: 'Broken 404', version: '1.0.0' }),
  );
  await writeFile(
    join(dir, 'broken404', 'dist', 'index.js'),
    `const { createElement: h } = globalThis.__cleitextShared.react;
const sdk = globalThis.__cleitextShared['@cleitext/theme-sdk'];
const GROUPS = { home: { styles: '' } };
function Layout({ head, children }) {
  const page = sdk.usePage();
  const group = GROUPS[page.entry ? 'home' : 'contacts'];
  return h('html', null, h('head', null, h('title', null, head.title), h('style', null, group.styles)),
    h('body', null, children));
}
function Index() { return h('main', null, 'index'); }
export default sdk.defineTheme({ slug: 'broken404', name: 'Broken 404', version: '1.0.0',
  templates: { index: Index }, Layout, css: '' });
`,
  );
  return dir;
}

beforeAll(async () => {
  owner = ownerDatabase();
  app = await startTestApp({ env: { THEMES_PATH: await themesFolder() } });
  const site = await seedSite(owner, 'not-found-fallback');
  await seedUser(owner, {
    email: 'admin@not-found-fallback.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  const admin = new TestClient(app, site.host, '10.39.0.1');
  visitor = new TestClient(app, site.host, '10.39.0.2');
  await admin.login('admin@not-found-fallback.test', PASSWORD);
  expect((await admin.post('/api/v1/themes/broken404/activate')).statusCode).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('a theme whose not-found page fails', () => {
  it('still answers 404 with a plain page, for any missing address', async () => {
    for (const path of ['/nonexistent.php', '/foo.html', '/wp-json/x']) {
      const res = await visitor.get(path);
      expect(res.statusCode, path).toBe(404);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('Page not found');
      expect(res.body).toContain('<meta name="robots" content="noindex">');
    }
  });
});
