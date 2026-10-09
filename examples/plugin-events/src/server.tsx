import { defineBlock, definePlugin, type PluginEntry } from '@cleitext/plugin-sdk';
import { and, count, eq } from 'drizzle-orm';
import { rsvps, type RsvpRow } from './schema';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Events from today on, soonest first. */
function upcoming(events: PluginEntry[]): PluginEntry[] {
  const today = new Date().toISOString().slice(0, 10);
  return events
    .filter((e) => String(e.fields.startsAt ?? '') >= today)
    .sort((a, b) => String(a.fields.startsAt).localeCompare(String(b.fields.startsAt)));
}

function formatDate(value: unknown, locale: string): string {
  const date = new Date(`${String(value)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

export default definePlugin({
  setup(ctx) {
    ctx.content.registerType({
      slug: 'event',
      name: { en: 'Events', it: 'Eventi' },
      permalink: '/events/{slug}',
      fields: [
        { name: 'startsAt', type: 'date', label: { en: 'Date', it: 'Data' }, required: true },
        { name: 'venue', type: 'text', label: { en: 'Venue', it: 'Luogo' }, maxLength: 200 },
        {
          name: 'capacity',
          type: 'number',
          label: { en: 'Places', it: 'Posti' },
          help: { en: 'Leave empty for no limit.', it: 'Vuoto: senza limite.' },
          min: 1,
        },
      ],
    });

    ctx.access.defineCapability('manage_events', {
      label: { en: 'Manage events', it: 'Gestire gli eventi' },
      roles: ['administrator', 'editor'],
    });

    // ---- Block: upcoming events ---------------------------------------------------
    ctx.blocks.register(
      defineBlock<{ heading: string; limit: number }, PluginEntry[]>({
        type: 'events/upcoming',
        title: { en: 'Upcoming events', it: 'Prossimi eventi' },
        description: { en: 'The next events, by date.', it: 'I prossimi eventi, per data.' },
        icon: 'calendar',
        attributes: [
          {
            name: 'heading',
            type: 'text',
            label: { en: 'Heading', it: 'Titolo' },
            default: 'Upcoming events',
          },
          {
            name: 'limit',
            type: 'number',
            label: { en: 'How many', it: 'Quanti' },
            min: 1,
            max: 20,
            default: 3,
          },
        ],
        async load(attrs, context) {
          context.tag('type:event');
          const events = await ctx.content.find(context.siteId, {
            type: 'event',
            locale: context.locale,
            limit: 200,
          });
          return upcoming(events).slice(0, attrs.limit);
        },
        render({ attrs, data, context }) {
          return (
            <section className="events-upcoming">
              {attrs.heading && <h2>{attrs.heading}</h2>}
              {data.length === 0 ? (
                <p>
                  {context.locale.startsWith('it')
                    ? 'Nessun evento in programma.'
                    : 'No events planned.'}
                </p>
              ) : (
                <ul>
                  {data.map((event) => (
                    <li key={event.id}>
                      <a href={event.url}>{event.title}</a>
                      {' — '}
                      <time dateTime={String(event.fields.startsAt)}>
                        {formatDate(event.fields.startsAt, context.locale)}
                      </time>
                      {event.fields.venue ? `, ${String(event.fields.venue)}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        },
      }),
    );

    // ---- Block: RSVP form, added to every event page ------------------------------
    ctx.blocks.register(
      defineBlock<{ eventId?: string }>({
        type: 'events/rsvp',
        title: { en: 'RSVP form', it: 'Modulo di prenotazione' },
        icon: 'tickets-alt',
        attributes: [],
        render({ block, context }) {
          const it = context.locale.startsWith('it');
          const eventId = String(block.attrs.eventId ?? '');
          return (
            <section className="events-rsvp" id="rsvp">
              <style>
                {
                  '.events-rsvp-done:not(:target){display:none}.events-rsvp form{display:grid;gap:.5rem;max-width:28rem}'
                }
              </style>
              <h2>{it ? 'Prenota il tuo posto' : 'Book your place'}</h2>
              <p className="events-rsvp-done" id="rsvp-done" role="status">
                {it ? 'Grazie, la prenotazione è registrata.' : 'Thank you, your place is booked.'}
              </p>
              <form method="post" action="/events/rsvp">
                <input type="hidden" name="event" value={eventId} />
                <label>
                  {it ? 'Nome' : 'Name'}
                  <input name="name" required maxLength={120} autoComplete="name" />
                </label>
                <label>
                  Email
                  <input name="email" type="email" required maxLength={200} autoComplete="email" />
                </label>
                <button type="submit">{it ? 'Prenota' : 'Book'}</button>
              </form>
            </section>
          );
        },
      }),
    );

    // Event pages: date and venue first, the RSVP form last.
    ctx.hooks.filter('render.blocks', (blocks, context) => {
      if (context.entry.type !== 'event') return blocks;
      const { startsAt, venue } = context.entry.fields;
      const when = `${formatDate(startsAt, context.locale)}${venue ? ` · ${String(venue)}` : ''}`;
      return [
        {
          id: 'events-when',
          type: 'core/paragraph',
          v: 1,
          attrs: { className: 'event-when' },
          content: [{ text: when, marks: ['bold'] }],
        },
        ...blocks,
        { id: 'events-rsvp', type: 'events/rsvp', v: 1, attrs: { eventId: context.entry.id } },
      ];
    });

    // Structured data for search engines.
    ctx.hooks.filter('render.head', (head, context) => {
      if (context.entry?.type !== 'event') return head;
      const data = {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: context.entry.title,
        startDate: context.entry.fields.startsAt,
        ...(context.entry.fields.venue
          ? { location: { '@type': 'Place', name: context.entry.fields.venue } }
          : {}),
      };
      return { ...head, tags: [...(head.tags ?? []), { tag: 'json-ld', data }] };
    });

    // ---- RSVPs ------------------------------------------------------------------------
    ctx.routes.public({
      method: 'POST',
      path: '/events/rsvp',
      async handler(request) {
        const form = (request.body ?? {}) as Record<string, string | undefined>;
        const name = form.name?.trim() ?? '';
        const email = form.email?.trim().toLowerCase() ?? '';
        const event = form.event ? await ctx.content.get(request.siteId, form.event) : null;
        if (!event || event.type !== 'event' || event.status !== 'published') {
          return { status: 404, body: 'Event not found.' };
        }
        if (!name || name.length > 120 || !EMAIL_RE.test(email) || email.length > 200) {
          return { status: 400, body: 'Please enter your name and a valid email address.' };
        }
        const capacity = typeof event.fields.capacity === 'number' ? event.fields.capacity : null;
        const booked = await ctx.db.transaction(request.siteId, async (tx) => {
          const [taken] = await tx
            .select({ n: count() })
            .from(rsvps)
            .where(eq(rsvps.eventId, event.id));
          if (capacity !== null && (taken?.n ?? 0) >= capacity) return false;
          await tx
            .insert(rsvps)
            .values({ siteId: request.siteId, eventId: event.id, name, email })
            .onConflictDoNothing();
          return true;
        });
        if (!booked) return { status: 409, body: 'Sorry, this event is full.' };
        ctx.log.info('RSVP', { event: event.id });
        return { status: 303, headers: { location: `${event.url}#rsvp-done` } };
      },
    });

    ctx.routes.api({
      method: 'GET',
      path: '/rsvps',
      capability: 'manage_events',
      async handler(request) {
        const rows = await ctx.db.transaction(request.siteId, (tx) =>
          tx.select().from(rsvps).orderBy(rsvps.createdAt),
        );
        const events = await ctx.content.find(request.siteId, {
          type: 'event',
          status: 'any',
          ids: [...new Set(rows.map((r) => r.eventId))],
          limit: 200,
        });
        const titles = new Map(events.map((e) => [e.id, e.title]));
        const body: RsvpRow[] = rows.map((r) => ({
          eventId: r.eventId,
          eventTitle: titles.get(r.eventId) ?? '(deleted event)',
          name: r.name,
          email: r.email,
          createdAt: r.createdAt.toISOString(),
        }));
        return { body };
      },
    });

    ctx.routes.api({
      method: 'DELETE',
      path: '/rsvps/:event/:email',
      capability: 'manage_events',
      async handler(request) {
        await ctx.db.transaction(request.siteId, (tx) =>
          tx
            .delete(rsvps)
            .where(
              and(eq(rsvps.eventId, request.params.event!), eq(rsvps.email, request.params.email!)),
            ),
        );
        return { status: 204 };
      },
    });
  },
});
