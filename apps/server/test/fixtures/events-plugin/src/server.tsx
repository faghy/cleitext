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
    // Templates the plugin uses itself: no public address.
    ctx.content.registerType({ slug: 'event_template', name: 'Event templates', public: false });
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
        render: ({ attrs, items }) => (
          <div className="stack">
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
