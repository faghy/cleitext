# Events: an example Cleitext plugin

Built only with the [plugin guide](../../docs/PLUGINS.md), outside the Cleitext packages. It adds:

- the **Event** content type, with date, venue and number of places;
- the **Upcoming events** block;
- an **RSVP form** on every event page, stored in the plugin's own `rsvps` table;
- an **RSVPs** admin page (capability `manage_events`, granted to administrators and editors);
- structured data (`schema.org/Event`) on event pages.

It has no dependencies of its own: everything it imports is provided by Cleitext.

```bash
pnpm cleitext plugin:install examples/plugin-events --build
```

Then activate **Events** in the admin, under **Plugins**.
