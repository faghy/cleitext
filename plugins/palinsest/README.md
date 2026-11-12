# Palinsest

The editorial calendar of a Cleitext site (official plugin, free).

- **Week view** of what comes out and when: the calendar's slots and the entries already scheduled or published.
- **Rules** give the slots: twice a day, once a day, or once every 2, 3, 7, 10 or 15 days, at the times you choose (in the site's time zone).
- **Who writes**: you, by hand (the slot is a reminder), or a service of another plugin that writes entries on request, such as Tell me more. The service is asked about 30 minutes before the slot, so the entry is ready on time.
- **Automatic publishing** is off by default: each entry stays a draft for you to check. Turned on, it is scheduled for the slot's time, as the person who saved the rule; with Multilingual, its translations already made can come out with it.
- Each slot can be **moved**, **removed** or **written now**.

Needs Cleitext 0.98 or later (plugin API 1.70). Other plugins offer their services with `ctx.content.registerProducer` (see docs/PLUGINS.md, "Writing and publishing entries").

The menu entry is **Posts → Editorial calendar**, for administrators and editors (capability `manage_palinsest`).
