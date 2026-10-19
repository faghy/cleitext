/**
 * Installation reports: about once a day a visited site tells the registry
 * which Cleitext, theme and plugins it runs, with their versions.
 */
import { rmSync } from 'node:fs';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InstallReportService, type InstallReport } from '../src/catalog/install-report.service.js';
import { ownerDatabase, seedSite, startTestApp, TestClient } from './helpers.js';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let visitor: TestClient;
let host: string;
const sent: InstallReport[] = [];

beforeAll(async () => {
  owner = ownerDatabase();
  app = await startTestApp({ env: { INSTALL_REPORT_URL: 'https://registry.test/v1/report' } });
  const service = app.get(InstallReportService);
  rmSync(service.file, { force: true });
  service.fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toBe('https://registry.test/v1/report');
    sent.push(JSON.parse(String(init?.body)) as InstallReport);
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  const site = await seedSite(owner, 'install-report', { forceHttps: false });
  host = site.host;
  visitor = new TestClient(app, site.host, '10.38.0.1');
});

afterAll(async () => {
  rmSync(app.get(InstallReportService).file, { force: true });
  await app?.close();
  await owner?.close();
});

const settle = async () => {
  for (let i = 0; i < 50 && sent.length === 0; i++) await new Promise((r) => setTimeout(r, 20));
};

describe('installation reports', () => {
  it('sends the versions of what a visited site runs, once a day', async () => {
    await visitor.get('/');
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      origin: `http://${host}`,
      theme: { slug: 'aurora' },
    });
    // Plugins installed by other tests are listed, none active on this site.
    expect(sent[0]!.plugins.every((p) => typeof p.version === 'string' && !p.active)).toBe(true);
    expect(sent[0]!.installId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent[0]!.core).toBeTruthy();

    await visitor.get('/');
    await new Promise((r) => setTimeout(r, 100));
    expect(sent).toHaveLength(1);
  });

  it('is never sent for API calls', async () => {
    await visitor.get('/api/v1/public/site');
    await new Promise((r) => setTimeout(r, 100));
    expect(sent).toHaveLength(1);
  });
});
