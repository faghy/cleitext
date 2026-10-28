/**
 * Transport plugins (`mail.deliver`, plugin API 1.60): a plugin with
 * `mail:transport` delivers the site's emails itself or names the SMTP
 * server to use; when it fails, the email goes the usual way.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import { PluginPermissionError, type MailDeliverResult } from '@cleitext/plugin-sdk';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { AppConfig } from '../src/config/config.js';
import { checkSmtp, MailService } from '../src/mail/mail.service.js';
import { createPluginContext } from '../src/plugins/plugin-context.js';
import { PluginHost, type LoadedPlugin } from '../src/plugins/plugin-host.service.js';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const fixture = fileURLToPath(new URL('./fixtures/courier-plugin', import.meta.url));

let app: NestFastifyApplication;
let owner: DatabaseClient;
let mail: MailService;
let admin: TestClient;
let host: string;

/** A memory mailer whose sites have no SMTP settings of their own (no database). */
const memoryMail = () => {
  const service = new MailService(
    { mail: { url: 'memory://', from: 'Site <hi@site.test>' } } as AppConfig,
    {} as DatabaseClient,
  );
  Object.assign(service, { siteTransport: async () => null });
  return service;
};
const message = { to: 'a@example.com', subject: 'Hello', text: 'Body' };

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const source = join(await mkdtemp(join(tmpdir(), 'courier-src-')), 'courier');
  await cp(fixture, source, { recursive: true });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath });
  mail = app.get(MailService);
  const site = await seedSite(owner, 'couriered');
  host = site.host;
  await seedUser(owner, {
    email: 'admin@couriered.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  for (const name of ['anna', 'smtp', 'local', 'fail']) {
    await seedUser(owner, {
      email: `${name}@couriered.test`,
      password: PASSWORD,
      site,
      role: 'author',
    });
  }
  admin = new TestClient(app, host, '10.82.0.1');
  await admin.login('admin@couriered.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

/** A password reset for that account, and the email it sent. */
async function reset(email: string) {
  const before = mail.outbox.length;
  const sent = await new TestClient(app, host, '10.82.1.1').post('/api/v1/auth/password/forgot', {
    email,
  });
  expect(sent.statusCode).toBe(202);
  expect(mail.outbox.length).toBe(before + 1);
  return mail.outbox.at(-1)!;
}

describe('mail.deliver', () => {
  it('leaves the emails to the server while no transport plugin is active', async () => {
    expect((await reset('anna@couriered.test')).via).toBe('server');
  });

  it('hands every email of the site to the active transport plugin', async () => {
    expect((await admin.post('/api/v1/plugins/courier/activate')).statusCode).toBe(200);
    const sent = await reset('anna@couriered.test');
    expect(sent).toMatchObject({ via: 'plugin', to: 'anna@couriered.test' });
    expect(sent.from).toBe('"Courier" <out@courier.example>');
  });

  it('sends through the SMTP server the plugin names', async () => {
    expect((await reset('smtp@couriered.test')).via).toBe('plugin-smtp');
  });

  it('sends the usual way when the plugin fails or names a server it may not', async () => {
    expect((await reset('fail@couriered.test')).via).toBe('server');
    expect((await reset('local@couriered.test')).via).toBe('server');
  });

  it('stops when the plugin is deactivated', async () => {
    expect((await admin.post('/api/v1/plugins/courier/deactivate')).statusCode).toBe(200);
    expect((await reset('anna@couriered.test')).via).toBe('server');
  });

  it('needs the mail:transport permission', () => {
    const plugin = { slug: 'nosy', version: '1.0.0', manifest: { permissions: ['mail:send'] } };
    const ctx = createPluginContext(plugin as unknown as LoadedPlugin, app.get(PluginHost));
    expect(() => ctx.hooks.filter('mail.deliver', (result) => result)).toThrow(
      PluginPermissionError,
    );
  });
});

describe('MailService with a deliverer', () => {
  it('gives the plugin the checked message and keeps a sender chosen for it', async () => {
    const service = memoryMail();
    const seen: unknown[] = [];
    service.useDeliverer(async (outgoing) => {
      seen.push(outgoing);
      return { delivered: true, from: 'Other <other@example.com>' };
    });
    await service.send(
      {
        ...message,
        to: 'a@example.com, b@example.com',
        cc: ['c@example.com'],
        fromOverride: { name: 'Form' },
      },
      'site-1',
    );
    expect(seen[0]).toMatchObject({
      from: '"Form" <hi@site.test>',
      fromChosen: true,
      to: ['a@example.com', 'b@example.com'],
      cc: ['c@example.com'],
      bcc: [],
      attachments: [],
    });
    expect(service.outbox.at(-1)).toMatchObject({ via: 'plugin', from: '"Form" <hi@site.test>' });
  });

  it('never asks a plugin for the emails of the server itself', async () => {
    const service = memoryMail();
    let asked = false;
    service.useDeliverer(async () => {
      asked = true;
      return { delivered: true } as MailDeliverResult;
    });
    await service.send(message);
    expect(asked).toBe(false);
    expect(service.outbox.at(-1)?.via).toBe('server');
  });

  it('sends the usual way when the deliverer throws', async () => {
    const service = memoryMail();
    service.useDeliverer(async () => {
      throw new Error('down');
    });
    await service.send(message, 'site-1');
    expect(service.outbox.at(-1)?.via).toBe('server');
  });
});

describe('checkSmtp', () => {
  it('takes host names with a valid port', () => {
    expect(
      checkSmtp({
        host: 'Pro.EU.turbo-smtp.com',
        port: 587,
        security: 'starttls',
        user: 'u',
        password: 'p',
      }),
    ).toEqual({
      host: 'pro.eu.turbo-smtp.com',
      port: 587,
      security: 'starttls',
      user: 'u',
      password: 'p',
    });
  });

  it('refuses addresses, localhost, names without a dot and bad ports', () => {
    for (const host of [
      '127.0.0.1',
      '10.0.0.5',
      'localhost',
      'mail.localhost',
      'intranet',
      '[::1]',
    ]) {
      expect(checkSmtp({ host, port: 25 })).toBeNull();
    }
    expect(checkSmtp({ host: 'smtp.example.com', port: 0 })).toBeNull();
    expect(checkSmtp({ host: 'smtp.example.com', port: '25' })).toBeNull();
  });
});
