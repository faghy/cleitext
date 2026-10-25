/**
 * The official Agenda plugin (appointments) on a real database: the site's
 * time zone given to plugins (`ctx.site`, core 0.81), free slots and a
 * booking from the public API with its emails (calendar file attached),
 * no double bookings when many visitors ask for the same place at once
 * (individual and group), the appointment's page with its signed link
 * (cancel, move, calendar file; older links stop working), the free limit
 * (bookings of the site and by hand count, imported ones do not; the page
 * then shows the contacts; one email; Agenda Pro's hook lifts it), the
 * reminder sent once by the scheduled task, the retention, the importer of
 * Simply Schedule Appointments (synthetic data) and the `[ssa_booking]`
 * shortcode converted on import.
 */
import { cp, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import { createDatabase, type DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { MailService } from '../src/mail/mail.service.js';
import { PluginHost } from '../src/plugins/plugin-host.service.js';
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
const ext = (path: string) => `/api/v1/ext/agenda${path}`;
const ROME = 'Europe/Rome';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let superuser: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let mail: MailService;
let serviceId = '';
let groupId = '';
let ip = 1;

const visitor = () =>
  new TestClient(app, site.host, `10.71.${Math.floor(ip / 250)}.${(ip++ % 250) + 1}`);

const romeDate = (ms: number) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: ROME,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
const day = (offset: number) => romeDate(Date.now() + offset * 86400_000);

const everyDay = (from: string, to: string) =>
  Array.from({ length: 7 }, () => ({ windows: [{ start: from, end: to }], times: [] }));

async function slots(service: string, from = day(2), to = day(4), client = visitor()) {
  const res = await client.get(ext(`/public/slots?service=${service}&from=${from}&to=${to}`));
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as {
    slots: { start: string; left: number }[];
    limit?: boolean;
    next: string | null;
    timeZone: string;
  };
}

function booking(service: string, start: string, extra: Record<string, unknown> = {}) {
  return {
    service,
    start,
    name: 'Ada Lovelace',
    email: 'ada@example.test',
    phone: '+39 333 1234567',
    consent: true,
    locale: 'it',
    timezone: 'Europe/London',
    fields: {},
    ...extra,
  };
}

const plugin = async (sqlText: ReturnType<typeof sql>): Promise<Record<string, unknown>[]> => {
  const result = (await superuser.db.execute(sqlText)) as unknown;
  return Array.isArray(result)
    ? result
    : ((result as { rows: Record<string, unknown>[] }).rows ?? []);
};

beforeAll(async () => {
  owner = ownerDatabase();
  // The superuser, on the test database: it writes rows of the plugin's schema as they were long ago.
  const su = new URL(inject('superuserUrl'));
  su.pathname = new URL(inject('ownerUrl')).pathname;
  superuser = createDatabase(su.toString(), { max: 2 });
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await buildPlugin(join(pluginsRoot, 'agenda'));
  const source = join(await mkdtemp(join(tmpdir(), 'agenda-src-')), 'agenda');
  await cp(join(pluginsRoot, 'agenda'), source, {
    recursive: true,
    filter: (f) => !f.includes('node_modules'),
  });
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath });
  mail = app.get(MailService);
  site = await seedSite(owner, 'agenda', { locale: 'it' });
  await seedUser(owner, {
    email: 'admin@agenda.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.70.0.1');
  await admin.login('admin@agenda.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/agenda/activate')).statusCode).toBe(200);
  expect(
    (await admin.request('PATCH', '/api/v1/settings/core', { timezone: ROME })).statusCode,
  ).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
  await superuser?.close();
});

describe('Agenda', () => {
  it('starts with the wizard, in the site’s time zone', async () => {
    const overview = (await admin.get(ext('/overview'))).json();
    expect(overview).toMatchObject({
      timeZone: ROME,
      setupDone: false,
      limit: { used: 0, limit: 30, reached: false },
    });
    const setup = await admin.post(ext('/setup'), {
      notify: 'studio@agenda.test',
      service: {
        name: 'Consulenza',
        duration: 60,
        schedule: { mode: 'intervals', step: 60, days: everyDay('09:00', '17:00') },
      },
    });
    expect(setup.statusCode, setup.body).toBe(201);
    serviceId = setup.json().service.id;
    expect((await admin.get(ext('/overview'))).json().setupDone).toBe(true);
    const group = await admin.post(ext('/services'), {
      name: 'Yoga',
      duration: 60,
      capacity: 3,
      schedule: {
        mode: 'fixed',
        days: Array.from({ length: 7 }, () => ({ windows: [], times: ['18:00'] })),
      },
    });
    expect(group.statusCode).toBe(201);
    groupId = group.json().id;
    // A separate calendar for the group, so the tests do not depend on each other.
    await admin.request('PUT', ext('/settings'), { shared: false, privacyUrl: '/privacy' });
  });

  it('shows the block on a page, with its runtime only there', async () => {
    const created = await admin.post('/api/v1/entries', {
      type: 'page',
      title: 'Prenota',
      document: {
        schema: 1,
        blocks: [{ id: 'b_agenda1', type: 'agenda/booking', v: 1, attrs: {} }],
      },
    });
    const published = await admin.post(`/api/v1/entries/${created.json().id}/publish`);
    const html = (await visitor().get(`/${published.json().slug}`)).body;
    expect(html).toContain('data-agenda=');
    expect(html).toContain('Consulenza');
    expect(html).toContain('Yoga');
    expect(html).toMatch(/plugin-assets\/agenda\/[^"]+\/agenda\.js/);
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('Cosa vuoi prenotare?');
    const home = (await visitor().get('/')).body;
    expect(home).not.toContain('agenda.js');
  });

  it('gives free slots and books one, with the emails', async () => {
    const free = await slots(serviceId);
    expect(free.timeZone).toBe(ROME);
    expect(free.slots).toHaveLength(24);
    const start = free.slots[0]!.start;
    mail.outbox.length = 0;
    const res = await visitor().post(ext('/public/book'), booking(serviceId, start));
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json()).toMatchObject({ status: 'confirmed', start, email: 'ada@example.test' });
    expect(res.json().manageUrl).toMatch(/\/agenda\/appointment\?t=/);
    expect((await slots(serviceId)).slots.map((s) => s.start)).not.toContain(start);
    await expect.poll(() => mail.outbox.length).toBe(2);
    const customer = mail.outbox.find((m) => String(m.to).includes('ada@example.test'))!;
    expect(customer.subject).toContain('Appuntamento confermato: Consulenza');
    const ics = String(customer.attachments?.[0]?.content ?? '');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain(`DTSTART:${start.replace(/[-:]/g, '').replace('.000', '')}`);
    const notice = mail.outbox.find((m) => String(m.to).includes('studio@agenda.test'))!;
    expect(notice.subject).toContain('Nuova prenotazione');
    expect(notice.text).toContain('Ada Lovelace');
  });

  it('refuses incomplete bookings and bots', async () => {
    const start = (await slots(serviceId)).slots[0]!.start;
    const bad = await visitor().post(
      ext('/public/book'),
      booking(serviceId, start, { email: 'nope', consent: false }),
    );
    expect(bad.statusCode).toBe(400);
    expect(bad.json().fields).toEqual(['email', 'consent']);
    const outside = await visitor().post(
      ext('/public/book'),
      booking(serviceId, new Date(Date.parse(start) + 15 * 60_000).toISOString()),
    );
    expect(outside.statusCode).toBe(409);
    const bot = await visitor().post(
      ext('/public/book'),
      booking(serviceId, start, { website: 'spam' }),
    );
    expect(bot.statusCode).toBe(201);
    expect((await slots(serviceId)).slots.map((s) => s.start)).toContain(start);
    const foreign = await visitor().request(
      'POST',
      ext('/public/book'),
      booking(serviceId, start),
      { origin: 'https://evil.test' },
    );
    expect(foreign.statusCode).toBe(403);
  });

  it('never books the same place twice, even at the same moment', async () => {
    const start = (await slots(serviceId)).slots[3]!.start;
    const answers = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        visitor().post(
          ext('/public/book'),
          booking(serviceId, start, { email: `race${i}@example.test` }),
        ),
      ),
    );
    const codes = answers.map((r) => r.statusCode).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(11);
    expect(answers.find((r) => r.statusCode === 409)!.json().code).toBe('taken');

    const groupStart = (await slots(groupId)).slots[0]!;
    expect(groupStart.left).toBe(3);
    const group = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        visitor().post(
          ext('/public/book'),
          booking(groupId, groupStart.start, { email: `yoga${i}@example.test` }),
        ),
      ),
    );
    expect(group.filter((r) => r.statusCode === 201)).toHaveLength(3);
    const rows = await plugin(
      sql`select count(*)::int as n from plg_agenda.appointments where starts_at = ${groupStart.start}::timestamptz and status <> 'cancelled'`,
    );
    expect(rows[0]?.n).toBe(3);
  });

  it('lets the customer move and cancel with the link of the email, within the notice', async () => {
    const start = (await slots(serviceId)).slots[6]!.start;
    const booked = (
      await visitor().post(
        ext('/public/book'),
        booking(serviceId, start, { email: 'move@example.test' }),
      )
    ).json();
    const token = new URL(booked.manageUrl).searchParams.get('t')!;
    const page = await visitor().get(`/agenda/appointment?t=${token}`);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Il tuo appuntamento');
    expect(page.body).toContain('Consulenza');
    expect(page.body).toContain('noindex');
    const ics = await visitor().get(`/agenda/appointment.ics?t=${token}`);
    expect(ics.headers['content-type']).toContain('text/calendar');

    const target = (await slots(serviceId)).slots[8]!.start;
    const moved = await visitor().post(ext('/public/reschedule'), { token, start: target });
    expect(moved.statusCode, moved.body).toBe(200);
    // The old link stops working; the new one shows the new time.
    expect((await visitor().get(`/agenda/appointment?t=${token}`)).statusCode).toBe(404);
    const fresh = new URL(moved.json().manageUrl).searchParams.get('t')!;
    const cancel = await visitor().postForm('/agenda/appointment', { t: fresh, action: 'cancel' });
    expect(cancel.statusCode).toBe(303);
    expect(cancel.headers.location).toContain('done=cancelled');
    const after = await visitor().get(String(cancel.headers.location));
    expect(after.body).toContain('Annullato');
    expect((await slots(serviceId)).slots.map((s) => s.start)).toContain(target);

    // Too late: less notice than the site asks.
    await admin.request('PUT', ext('/settings'), { changeNoticeHours: 24 * 30 });
    const late = (
      await visitor().post(
        ext('/public/book'),
        booking(serviceId, (await slots(serviceId)).slots[10]!.start),
      )
    ).json();
    const lateToken = new URL(late.manageUrl).searchParams.get('t')!;
    expect((await visitor().get(`/agenda/appointment?t=${lateToken}`)).body).toContain(
      'troppo tardi',
    );
    expect(
      (await visitor().post(ext('/public/reschedule'), { token: lateToken, start: target }))
        .statusCode,
    ).toBe(409);
    await admin.request('PUT', ext('/settings'), { changeNoticeHours: 24 });
  });

  it('manages appointments in the admin and exports them', async () => {
    const list = (await admin.get(ext('/appointments?status=confirmed,pending'))).json();
    expect(list.total).toBeGreaterThan(3);
    const manual = await admin.post(ext('/appointments'), {
      serviceId,
      start: `${day(5)}T06:00:00.000Z`,
      name: 'Walk-in',
      notify: false,
    });
    expect(manual.statusCode, manual.body).toBe(201);
    expect(manual.json().source).toBe('admin');
    const clash = await admin.post(ext('/appointments'), {
      serviceId,
      start: `${day(5)}T06:30:00.000Z`,
      name: 'Other',
    });
    expect(clash.statusCode).toBe(409);
    const noShow = await admin.request('PATCH', ext(`/appointments/${manual.json().id}`), {
      status: 'no_show',
    });
    expect(noShow.json().status).toBe('no_show');
    const csv = await admin.get(ext('/export.csv?status=no_show'));
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('Walk-in');
    expect(csv.body.split('\r\n')[0]).toContain('Servizio');
  });

  it('imports Simply Schedule Appointments without counting its bookings', async () => {
    const before = (await admin.get(ext('/overview'))).json().limit.used;
    const json = await readFile(join(pluginsRoot, 'agenda/test/fixtures/ssa-export.json'));
    expect(
      (await admin.upload(ext('/import/files'), 'ssa.json', json, 'application/json')).statusCode,
    ).toBe(200);
    const preview = await admin.post(ext('/import/run'), { kind: 'ssa', dryRun: true });
    expect(preview.json().preview).toMatchObject({ appointments: 3, future: 2, timezone: ROME });
    const run = await admin.post(ext('/import/run'), { kind: 'ssa' });
    expect(run.json().result).toMatchObject({ services: 3, appointments: 3, exceptions: 1 });
    await admin.upload(ext('/import/files'), 'ssa.json', json, 'application/json');
    const again = await admin.post(ext('/import/run'), { kind: 'ssa' });
    expect(again.json().result).toMatchObject({
      services: 0,
      servicesUpdated: 3,
      appointments: 0,
      existing: 3,
    });
    expect((await admin.get(ext('/overview'))).json().limit.used).toBe(before);

    // [ssa_booking type="1"] of a WordPress page becomes the block, which finds the imported service.
    const blocks = await app.get(PluginHost).applyFilter(
      'import.shortcode',
      null,
      {
        siteId: site.id,
        tag: 'ssa_booking',
        attrs: { type: '1' },
        content: '',
        text: '[ssa_booking type="1"]',
      },
      site.id,
    );
    expect(blocks).toMatchObject([{ type: 'agenda/booking', attrs: { ref: 'ssa:type:1' } }]);
    const created = await admin.post('/api/v1/entries', {
      type: 'page',
      title: 'Consulenza online',
      document: { schema: 1, blocks },
    });
    const published = await admin.post(`/api/v1/entries/${created.json().id}/publish`);
    const html = (await visitor().get(`/${published.json().slug}`)).body;
    expect(html).toContain('Consulenza online');
    expect(html).not.toContain('Yoga');
  });

  it('sends a reminder once, and erases old personal data', async () => {
    const inserted = await plugin(
      sql`insert into plg_agenda.appointments (site_id, service_id, starts_at, ends_at, status, name, email, source, created_at, locale)
            values (${site.id}, ${serviceId}, now() + interval '20 hours', now() + interval '21 hours', 'confirmed', 'Remind Me', 'remind@example.test', 'site', now() - interval '3 days', 'it')
            returning id`,
    );
    expect(inserted[0]?.id).toBeTruthy();
    mail.outbox.length = 0;
    const host = app.get(PluginHost);
    await host.runSchedules(Date.now() + 365 * 86400_000);
    await expect
      .poll(() => mail.outbox.filter((m) => String(m.to).includes('remind@example.test')).length)
      .toBe(1);
    expect(
      mail.outbox.find((m) => String(m.to).includes('remind@example.test'))!.subject,
    ).toContain('Promemoria');
    await host.runSchedules(Date.now() + 2 * 365 * 86400_000);
    expect(mail.outbox.filter((m) => String(m.to).includes('remind@example.test'))).toHaveLength(1);

    await plugin(
      sql`insert into plg_agenda.appointments (site_id, service_id, starts_at, ends_at, status, name, email, source)
          values (${site.id}, ${serviceId}, now() - interval '30 months', now() - interval '30 months' + interval '1 hour', 'confirmed', 'Old Customer', 'old@example.test', 'import')`,
    );
    await host.runSchedules(Date.now() + 3 * 365 * 86400_000);
    const old = (await admin.get(ext('/appointments?q=old%40example.test&status='))).json();
    expect(old.total).toBe(0);
  });

  it('stops new bookings at 30, keeps the old ones working, and lets Agenda Pro lift the limit', async () => {
    const used = (await admin.get(ext('/overview'))).json().limit.used as number;
    // Fill up to 29 with past bookings of the site (cancelled ones count too).
    for (let i = used; i < 29; i++) {
      await plugin(
        sql`insert into plg_agenda.appointments (site_id, service_id, starts_at, ends_at, status, source)
            values (${site.id}, ${serviceId}, now() - interval '400 days' + ${i} * interval '1 hour', now() - interval '400 days' + ${i} * interval '1 hour' + interval '1 hour', 'cancelled', 'site')`,
      );
    }
    const warning = (await admin.get(ext('/overview'))).json().limit;
    expect(warning).toMatchObject({ used: 29, warning: true, reached: false });
    mail.outbox.length = 0;
    const free = await slots(serviceId);
    const last = await visitor().post(
      ext('/public/book'),
      booking(serviceId, free.slots[12]!.start, { email: 'last@example.test' }),
    );
    expect(last.statusCode).toBe(201);
    expect((await slots(serviceId)).limit).toBe(true);
    const refused = await visitor().post(
      ext('/public/book'),
      booking(serviceId, free.slots[14]!.start),
    );
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ code: 'limit', contact: 'studio@agenda.test' });
    await expect
      .poll(() => mail.outbox.filter((m) => m.subject.includes('limite di 30')).length)
      .toBe(1);
    // The page shows the contacts instead of the calendar.
    const page = await admin.post('/api/v1/entries', {
      type: 'page',
      title: 'Limite',
      document: { schema: 1, blocks: [{ id: 'b_lim', type: 'agenda/booking', v: 1, attrs: {} }] },
    });
    const slug = (await admin.post(`/api/v1/entries/${page.json().id}/publish`)).json().slug;
    const html = (await visitor().get(`/${slug}`)).body;
    expect(html).toContain('La prenotazione online non è disponibile');
    expect(html).toContain('studio@agenda.test');
    // Existing bookings: still cancelled from their link.
    const token = new URL(last.json().manageUrl).searchParams.get('t')!;
    expect(
      (await visitor().postForm('/agenda/appointment', { t: token, action: 'cancel' })).headers
        .location,
    ).toContain('done=cancelled');
    // Cancelling does not give the place back to the limit.
    expect((await admin.get(ext('/overview'))).json().limit).toMatchObject({
      used: 30,
      reached: true,
    });
    // Agenda Pro's hook.
    const api = (globalThis as unknown as Record<symbol, { bookingLimit: (() => number)[] }>)[
      Symbol.for('cleitext.agenda')
    ]!;
    api.bookingLimit.push(() => Infinity);
    try {
      const ok = await visitor().post(
        ext('/public/book'),
        booking(serviceId, free.slots[14]!.start, { email: 'pro@example.test' }),
      );
      expect(ok.statusCode).toBe(201);
      expect((await admin.get(ext('/overview'))).json().limit).toMatchObject({
        used: 31,
        limit: null,
        reached: false,
      });
    } finally {
      api.bookingLimit.pop();
    }
  });

  it('describes itself in the privacy policy of the Privacy plugin', async () => {
    const registry = (
      globalThis as unknown as Record<
        symbol,
        Map<
          string,
          (i: { siteId: string; locale: string }) => Promise<{ title: string; text: string }[]>
        >
      >
    )[Symbol.for('cleitext.privacy.policySections')]!;
    const [section] = await registry.get('agenda')!({ siteId: site.id, locale: 'it' });
    expect(section!.title).toBe('Prenotazione di appuntamenti');
    expect(section!.text).toContain('24 mesi');
    expect(
      await registry.get('agenda')!({
        siteId: '00000000-0000-4000-8000-000000000000',
        locale: 'en',
      }),
    ).toEqual([]);
  });
});
