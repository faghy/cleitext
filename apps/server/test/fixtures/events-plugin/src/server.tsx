import { defineBlock, definePlugin, type PluginEntry } from '@cleitext/plugin-sdk';
import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const rsvps = pgTable('rsvps', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  eventId: uuid('event_id').notNull(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Entries published while the plugin was active (observed through a hook). */
const published: string[] = [];

const byDate = (a: PluginEntry, b: PluginEntry) =>
  String(a.fields.startsAt ?? '').localeCompare(String(b.fields.startsAt ?? ''));

export default definePlugin({
  setup(ctx) {
    ctx.content.registerType({
      slug: 'event',
      name: { en: 'Events', it: 'Eventi' },
      permalink: '/events/{slug}',
      fields: [
        { name: 'startsAt', type: 'date', label: { en: 'Date', it: 'Data' }, required: true },
        { name: 'venue', type: 'text', label: 'Venue', maxLength: 200 },
      ],
    });
    ctx.content.registerTaxonomy({
      slug: 'event-series',
      name: { en: 'Series', it: 'Rassegne' },
      hierarchical: true,
      types: ['event'],
      fields: [
        { name: 'poster', type: 'media', label: 'Poster' },
        { name: 'season', type: 'number', label: 'Season', min: 1 },
      ],
    });
    // Templates the plugin uses itself: no public address.
    ctx.content.registerType({ slug: 'event_template', name: 'Event templates', public: false });
    ctx.routes.api({
      method: 'GET',
      path: '/templates',
      capability: 'manage_events',
      handler: async (request) => ({
        body: await ctx.content.find(request.siteId, {
          type: 'event_template',
          withDocument: true,
        }),
      }),
    });
    ctx.access.defineCapability('manage_events', {
      label: 'Manage events',
      roles: ['administrator', 'editor'],
    });
    ctx.settings.define([
      { name: 'icsName', type: 'text', label: 'Calendar name', default: 'Events' },
    ]);

    ctx.blocks.register(
      defineBlock<{ heading: string; limit: number; explode?: boolean }, PluginEntry[]>({
        type: 'events/upcoming',
        title: { en: 'Upcoming events', it: 'Prossimi eventi' },
        icon: 'calendar',
        attributes: [
          { name: 'heading', type: 'text', label: 'Heading', default: 'Upcoming events' },
          { name: 'limit', type: 'number', label: 'How many', min: 1, max: 20, default: 3 },
          { name: 'explode', type: 'boolean', label: 'Fail (tests)' },
        ],
        async load(attrs, context) {
          context.tag('type:event');
          const list = await ctx.content.find(context.siteId, {
            type: 'event',
            locale: context.locale,
          });
          return list.sort(byDate).slice(0, attrs.limit);
        },
        render({ attrs, data }) {
          if (attrs.explode) throw new Error('Boom');
          return (
            <section className="events">
              <h2>{attrs.heading}</h2>
              <ul>
                {data.map((event) => (
                  <li key={event.id}>
                    <a href={event.url}>{event.title}</a>{' '}
                    <time>{String(event.fields.startsAt)}</time>
                  </li>
                ))}
              </ul>
            </section>
          );
        },
      }),
    );

    // A listing made with the public query: titles in order, and the total.
    ctx.blocks.register(
      defineBlock<{ limit: number }, { titles: string[]; total: number }>({
        type: 'events/titles',
        title: 'Event titles',
        attributes: [{ name: 'limit', type: 'number', label: 'How many', default: 2 }],
        async load(attrs, context) {
          const { entries, total } = await context.query({
            type: ['event', 'no-such-type'],
            orderBy: 'title',
            order: 'asc',
            limit: attrs.limit,
            offset: Number(context.page.params?.skip ?? 0),
          });
          return { titles: entries.map((e) => `${e.title}@${e.url}`), total };
        },
        render: ({ data }) => (
          <p className="titles" data-total={data.total}>
            {data.titles.join(' | ')}
          </p>
        ),
      }),
    );

    // Script and style only on pages that show the events block.
    for (const file of ['events.js', 'events.css']) {
      ctx.assets.enqueue({ file, when: ({ html }) => html.includes('class="events"') });
    }

    // A container: its children are rendered by Cleitext, its CSS goes to <head>.
    ctx.blocks.register(
      defineBlock<{ tone: string }>({
        type: 'events/box',
        title: 'Box',
        container: true,
        attributes: [{ name: 'tone', type: 'text', label: 'Tone', default: 'plain' }],
        css: ({ attrs, block }) => `.box-${block.id}{border:1px solid ${attrs.tone}}`,
        render: ({ attrs, block, children }) => (
          <aside className={`box box-${block.id}`} data-tone={attrs.tone}>
            {children}
          </aside>
        ),
      }),
    );

    // A container wrapping each child on its own, with a raw HTML note.
    ctx.blocks.register(
      defineBlock<{ note: string }>({
        type: 'events/stack',
        title: 'Stack',
        container: true,
        html: ['note'],
        attributes: [{ name: 'note', type: 'text', label: 'Note', multiline: true }],
        render: ({ attrs, items, context }) => (
          <div
            className="stack"
            data-page={`${context.page.route}:${context.page.entry?.title ?? ''}`}
          >
            <div className="note" dangerouslySetInnerHTML={{ __html: attrs.note ?? '' }} />
            <ol>
              {items?.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          </div>
        ),
      }),
    );

    // Where an archive's entries go: a plugin listing's own HTML (plugin API 1.20).
    ctx.blocks.register(
      defineBlock({
        type: 'events/listing',
        title: 'Archive listing',
        render: ({ context }) => (
          <div
            className="listing"
            data-archive={`${context.page.route}:${context.page.archive?.title ?? ''}:${context.page.archive?.term?.slug ?? ''}:${context.page.archive?.contentType ?? ''}`}
            dangerouslySetInnerHTML={{ __html: context.page.archive?.html ?? '' }}
          />
        ),
      }),
    );
    // A theme builder's archive template for event listings; its single template never applies there.
    ctx.hooks.filter('render.locations', (locations, context) =>
      context.route === 'archive' && context.archive?.type === 'event'
        ? {
            ...locations,
            archive: {
              schema: 1,
              blocks: [
                {
                  id: 'aa',
                  type: 'core/paragraph',
                  v: 1,
                  attrs: {},
                  content: [{ text: `Archive template ${context.archive.term ?? 'all'}` }],
                },
                { id: 'al', type: 'events/listing', v: 1, attrs: {} },
              ],
            },
            single: { schema: 1, blocks: [] },
          }
        : locations,
    );
    // A theme builder's templates, on one page only.
    ctx.hooks.filter('render.locations', (locations, context) =>
      context.path === '/located'
        ? {
            ...locations,
            header: {
              schema: 1,
              blocks: [
                {
                  id: 'lh',
                  type: 'core/paragraph',
                  v: 1,
                  attrs: {},
                  content: [{ text: 'Plugin header' }],
                },
              ],
            },
            overlay: {
              schema: 1,
              blocks: [
                {
                  id: 'lo',
                  type: 'core/paragraph',
                  v: 1,
                  attrs: {},
                  content: [{ text: 'A popup' }],
                },
              ],
            },
            single: {
              schema: 1,
              blocks: [
                {
                  id: 'ls',
                  type: 'core/paragraph',
                  v: 1,
                  attrs: {},
                  content: [{ text: 'Before the content' }],
                },
                { id: 'lc', type: 'cleitext/entry-content', v: 1, attrs: {} },
              ],
            },
            // Hook points of themes that mark them (plugin API 1.33); bad names are dropped.
            'hook:test_top': {
              schema: 1,
              blocks: [
                {
                  id: 'lk',
                  type: 'core/paragraph',
                  v: 1,
                  attrs: {},
                  content: [{ text: `Hooked ${context.signedIn ? 'signed in' : 'visitor'}` }],
                },
              ],
            },
            'hook:bad name': { schema: 1, blocks: [] },
          }
        : locations,
    );

    ctx.hooks.filter('render.blocks', (blocks, context) =>
      context.entry.type === 'event'
        ? [
            {
              id: 'event-when',
              type: 'core/paragraph',
              v: 1,
              attrs: {},
              content: [{ text: `When: ${String(context.entry.fields.startsAt)}` }],
            },
            ...blocks,
          ]
        : blocks,
    );
    ctx.hooks.filter('render.head', (head, context) =>
      context.entry?.type === 'event'
        ? {
            ...head,
            tags: [
              ...(head.tags ?? []),
              {
                tag: 'json-ld',
                data: {
                  '@type': 'Event',
                  name: context.entry.title,
                  startDate: context.entry.fields.startsAt,
                },
              },
            ],
          }
        : head,
    );
    // A failing filter is skipped; the page still renders. It fails on the
    // agenda only, so the failures stay under the deactivation limit.
    ctx.hooks.filter('render.html', (html, context) => {
      if (context.path === '/agenda') throw new Error('broken filter');
      return html;
    });
    ctx.hooks.on('entry.published', ({ entry }) => {
      published.push(entry.id);
    });
    // The last save of each entry, as plugins that keep a copy of it get it.
    const saved = new Map<string, unknown>();
    ctx.hooks.on('entry.saved', ({ entry }) => {
      saved.set(entry.id, entry);
    });
    ctx.routes.api({
      method: 'GET',
      path: '/saved/:id',
      capability: 'manage_events',
      handler: async (request) => ({
        body: {
          event: saved.get(request.params.id!) ?? null,
          found: await ctx.content.find(request.siteId, {
            ids: [request.params.id!],
            status: 'any',
          }),
        },
      }),
    });

    ctx.routes.api({
      method: 'POST',
      path: '/events/:id/rsvp',
      public: true,
      async handler(request) {
        const email = (request.body as { email?: unknown } | null)?.email;
        if (typeof email !== 'string' || !email.includes('@')) {
          return { status: 400, body: { error: 'A valid email is required.' } };
        }
        const event = await ctx.content.get(request.siteId, request.params.id!);
        if (!event || event.type !== 'event' || event.status !== 'published') {
          return { status: 404, body: { error: 'Event not found.' } };
        }
        await ctx.db.transaction(request.siteId, (tx) =>
          tx.insert(rsvps).values({ siteId: request.siteId, eventId: event.id, email }),
        );
        return { status: 201, body: { ok: true } };
      },
    });
    ctx.routes.api({
      method: 'GET',
      path: '/rsvps',
      capability: 'manage_events',
      async handler(request) {
        const rows = await ctx.db.transaction(request.siteId, (tx) => tx.select().from(rsvps));
        return { body: rows.map((r) => ({ eventId: r.eventId, email: r.email })) };
      },
    });
    ctx.routes.api({
      method: 'GET',
      path: '/published',
      capability: 'manage_events',
      handler: () => ({ body: published }),
    });
    // The plugin role must not reach core tables.
    ctx.routes.api({
      method: 'GET',
      path: '/peek',
      capability: 'manage_events',
      async handler(request) {
        const rows = await ctx.db.transaction(request.siteId, (tx) =>
          tx.execute(sql`select count(*) as n from public.users`),
        );
        return { body: rows };
      },
    });

    // A page of the plugin in the theme, with its own cookie (plugin API 1.14).
    ctx.routes.public({
      method: 'GET',
      path: '/basket',
      handler: async (request) => {
        const visits = Number(request.cookies.events_visits ?? 0) + 1;
        const site = await ctx.site(request.siteId);
        return {
          cookies: [{ name: 'events_visits', value: String(visits), maxAge: 3600 }],
          page: {
            title: 'Your basket',
            html: `<p class="basket">Visits: ${visits}; cookies: ${Object.keys(request.cookies).join(' ')}; language: ${request.locale}</p><p class="where">${site.name} at ${request.origin}</p>`,
          },
        };
      },
    });
    // A catalog page: cached and indexed (plugin API 1.17).
    ctx.routes.public({
      method: 'GET',
      path: '/calendar',
      handler: (request) => ({
        cacheTags: ['type:event'],
        page: {
          title: 'Calendar',
          html: `<p class="calendar">All the events</p><p class="tags">${(request.queryAll.tag ?? []).join(',')}</p>`,
          index: true,
          head: [{ tag: 'json-ld', data: { '@type': 'ItemList', name: 'Events' } }],
        },
      }),
    });
    // Listings of events, by tag: archives for theme builders (plugin API 1.20).
    ctx.routes.public({
      method: 'GET',
      path: '/event-tag/:tag',
      handler: (request) => ({
        page: {
          title: `Tagged ${request.params.tag ?? ''}`,
          html: `<ul class="tagged"><li>${request.params.tag ?? ''} event</li></ul>`,
          archive: {
            type: 'event',
            term: { taxonomy: 'event-tag', slug: request.params.tag ?? '', name: 'Tag' },
          },
        },
      }),
    });
    // Notes on events, as comments of the plugin's own type (plugin API 1.19).
    ctx.routes.public({
      method: 'POST',
      path: '/event-notes',
      async handler(request) {
        const body = (request.body ?? {}) as Record<string, string>;
        try {
          const posted = await ctx.comments.post(request, {
            entryId: body.entry ?? '',
            type: 'note',
            content: body.text ?? '',
            meta: { stars: Number(body.stars) },
            authorName: body.name ?? '',
            authorEmail: body.email ?? '',
          });
          return { body: posted };
        } catch (error) {
          return {
            status: (error as { status?: number }).status ?? 500,
            body: { error: (error as Error).message },
          };
        }
      },
    });
    ctx.routes.public({
      method: 'GET',
      path: '/event-notes/:entry',
      handler: async (request) => ({
        body: await ctx.comments.find(request.siteId, {
          entryId: request.params.entry ?? '',
          type: 'note',
          status: 'any',
        }),
      }),
    });
    // Work done every 5 minutes (plugin API 1.18).
    ctx.schedule.every('count-ticks', 5, async (siteId) => {
      const ticks = Number((await ctx.storage.get(siteId, 'ticks')) ?? 0);
      await ctx.storage.set(siteId, 'ticks', ticks + 1);
    });
    ctx.routes.public({
      method: 'GET',
      path: '/ticks',
      handler: async (request) => ({
        body: String((await ctx.storage.get(request.siteId, 'ticks')) ?? 0),
      }),
    });
    // API 1.24: rules added to robots.txt, a log of "not found" pages, fields on every type.
    ctx.hooks.filter('robots.txt', (text) => `${text}Disallow: /private-events/\n`);
    // One write at a time: two events close together would otherwise lose one.
    let logged: Promise<void> = Promise.resolve();
    ctx.hooks.on('request.notFound', (event, context) => {
      logged = logged.then(async () => {
        const seen = ((await ctx.storage.get(context.siteId, 'missing')) as string[] | null) ?? [];
        await ctx.storage.set(context.siteId, 'missing', [...seen, `${event.path}?${event.query}`]);
      });
      return logged;
    });
    ctx.routes.public({
      method: 'GET',
      path: '/missing-log',
      handler: async (request) => ({
        body: JSON.stringify((await ctx.storage.get(request.siteId, 'missing')) ?? []),
      }),
    });
    ctx.content.registerFieldGroup({
      id: 'events-everywhere',
      title: 'Everywhere',
      types: ['*'],
      fields: [{ name: 'note', type: 'text', label: 'Note' }],
    });
    // A link on visitors' account page (plugin API 1.17).
    ctx.hooks.filter('account.links', (links, context) => [
      ...links,
      { label: 'My RSVPs', url: `${context.base}/rsvps` },
      { label: 'Elsewhere', url: 'https://example.com/' },
    ]);
    ctx.routes.public({
      method: 'GET',
      path: '/bad-cookie',
      handler: () => ({ cookies: [{ name: 'cleitext_session', value: 'x' }], body: 'no' }),
    });
    ctx.routes.public({
      method: 'GET',
      path: '/events.ics',
      async handler(request) {
        const settings = await ctx.settings.get(request.siteId);
        const events = await ctx.content.find(request.siteId, { type: 'event' });
        const lines = [
          'BEGIN:VCALENDAR',
          `X-WR-CALNAME:${String(settings.icsName)}`,
          ...events.flatMap((e) => [
            'BEGIN:VEVENT',
            `SUMMARY:${e.title}`,
            `DTSTART;VALUE=DATE:${String(e.fields.startsAt).replace(/-/g, '')}`,
            'END:VEVENT',
          ]),
          'END:VCALENDAR',
        ];
        return {
          body: lines.join('\r\n'),
          contentType: 'text/calendar; charset=utf-8',
          cacheTags: ['type:event'],
        };
      },
    });
  },
});
