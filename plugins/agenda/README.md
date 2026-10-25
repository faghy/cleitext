# Agenda

🇮🇹 [Leggi in italiano](./README.it.md)

The official Cleitext plugin for **online appointments**: a psychologist's online sessions, a hairdresser's cuts, a yoga class with eight places. Customers pick a time among the free ones and get a confirmation by email; you find everything in the admin. It is free and not in the base package: install it from **Plugins → Add New** (catalog), or upload `cleitext-plugin-agenda-<version>.zip` in **Plugins → Upload Plugin**. It needs Cleitext 0.80 or later (plugin API 1.51); on 0.81 it uses the site's time zone by itself.

The free version takes **30 bookings** per site. **Agenda Pro** (a separate, paid plugin, coming later) takes as many as you need.

## Set up in two minutes

Open **Agenda** in the admin's menu: a short wizard asks what customers book (name and duration), when (the weekly hours, Monday to Friday 9–13 and 14–18 to start with), where to tell you about bookings (your email), then makes and publishes the booking page. A live preview shows what customers will see while you set it up.

## What customers see

Few steps, as on Calendly: **service → day → time → details → done**. Only free times are shown; on phones every target is at least 44 pixels and the form is short and is yours: name and email, then the fields you choose for each service (phone, notes, your questions), each required, optional or hidden, and the consent. The confirmation is on screen at once, with **Add to calendar** (an `.ics` file) and **Google Calendar**, and in the email, with the calendar file attached and a link to **cancel or move** the appointment, no account needed. A reminder arrives the day before (on by default, 24 hours before: you can turn it off or change the hours in Settings → Reminder). Texts are in Italian and English.

Times show in the site's time zone (daylight saving time handled), with a switch to the visitor's own for online sessions. When there are no free times in the days shown, a link jumps to the first free day.

## Features

- **Services**: name, description, duration, free time before and after (buffers), how soon and how far ahead one can book, an indicative price (text only, nothing is paid online), bookable or hidden, **places per time** (1 for individual appointments, more for a group), category, colour, texts in the site's other languages (Multilingual). Buffers keep free time around an appointment: between two appointments there is at least the larger of the two buffers that face each other (one's "after" and the next one's "before"); buffers may overlap each other, never an appointment. It is the rule of Simply Schedule Appointments too, so imported services offer the same times (e.g. with Thursday 13:00, 14:15, 15:30, 50' and 80'/10' buffers, booking 13:00 closes 14:15 and leaves 15:30 free).
- **Booking form, per service**: every field (phone, notes, your questions: short or long text, a choice, a yes/no box, a number, a date) can be **required, optional or hidden**, and you can add, remove and reorder them (drag and drop, or the up/down arrows from the keyboard), with a label and a help text in each language of the site; the preview beside the editor shows the form as customers will see it. Name and email are always required, since the booking needs them. Change it whenever you like: it applies to new bookings, existing ones keep their answers.
- **Weekly hours**: open hours with a new time every few minutes (e.g. 9–13 every 30'), or **fixed start times** (e.g. Thursday 13:00, 14:15, 15:30). **Closures** (holidays, days off) and **days with other hours**, for every service or one.
- **One calendar or many**: by default an appointment makes the same time busy for every service (one person or one room); turn it off to give each service its own calendar.
- **No double bookings**: every booking is stored inside a database transaction that locks the site's services and checks the place again, so two visitors asking for the same time at the same moment are served one after the other: one gets it, the other is told and sees the free times again. Groups fill up to their places.
- **Approval**: a service can ask you to confirm each booking; the customer gets "request received", then the confirmation. The time stays taken meanwhile.
- **Emails** through the site's mail settings: confirmation with the calendar file, request received, moved, cancelled, reminder (24 hours before, or as you set it), and a notification to you. Every text can be changed, per language.
- **Admin**: the appointments as a list (filters, search, upcoming or past) or a calendar (day, week, month); one appointment opens with its details, buttons to confirm, cancel or mark as **no-show**, a new time and private notes. **New appointment** books one by hand. **CSV export**. A box on the Dashboard: today, the next 7 days, what to confirm.
- **Bot protection**: the form asks the site's Captcha or Antispam (the core's form protection), with a hidden field for simple bots.
- **Privacy**: everything stays in the site's database. The personal data of past appointments are erased after a number of months (24 by default); the appointment stays, without them. Requests to export or erase a person's data include appointments, and the **Privacy** plugin's generated privacy policy gets a section about bookings.
- **Import from WordPress** (Agenda → Import):
  - **Simply Schedule Appointments**: its export (Settings → Import/Export), its `wp_ssa_*` tables as JSON rows (with or without the prefix, phpMyAdmin's JSON export too, the settings as `settings` or `ssa_settings_json`) or a SQL dump of them: every appointment type (the published ones bookable, the others hidden to review) with its hours (blocks or start times), buffers, notice, label and questions (name and email required, the phone as SSA asked it, every other question optional even when SSA required it: you decide which ones to require in the service's booking form, and the report says which ones were); appointments past and future with their customers, status and cancellation notes; the administrator's address for notifications, the customers' email texts (confirmation, cancellation, reminder… with SSA's variables turned into Agenda's placeholders) and the blackout dates. The report lists what was read, what was left out (e.g. SSA's availability cache, the booking page of each appointment, the emails to the administrator) and what to check.
  - **Booking Calendar (WPBC)**: a dump or CSVs of `wp_booking`, `wp_bookingdates` and `wp_bookingtypes`: resources (as hidden services to review) and bookings, by time or whole days.
  - Importing again updates instead of adding, and keeps the booking form as you set it (questions added in the other plugin since are appended). Imported bookings never count toward the free limit. Imported settings never replace yours: addresses are added to the notified ones, email texts fill only the kinds you have not written.
  - On a WordPress import, the shortcodes `[ssa_booking type="…"]` and `[booking type=…]` become the Booking block, pointing to the imported service.

## Show the calendar

- the **Booking (Agenda)** block in the block editor (also inside Prisma's containers), with the service (or the visitor's choice) and a month or week calendar;
- the **Booking** widget in Fresco;
- the shortcode `[agenda]` (or `[agenda service="<id>"]`) alone in a paragraph.

It looks like your theme and can be changed with CSS variables, e.g. in **Appearance → Additional CSS**:

```css
.ag {
  --agenda-accent: #0f766e; /* buttons, free days */
  --agenda-accent-text: #fff;
  --agenda-radius: 6px;
  --agenda-font: inherit;
}
```

Also `--agenda-text`, `--agenda-muted`, `--agenda-bg`, `--agenda-surface`, `--agenda-border`, `--agenda-gap`, `--agenda-danger`.

## The free limit

Every booking made on the site or by hand in the admin counts, **cancelled and past ones too**; imported ones do not. The admin shows "12 / 30 bookings", with a warning from 25. At 30 the booking page shows your contacts (Settings → Your contacts) instead of the calendar, and you get one email. Nothing is deleted, and the appointments already booked keep working: customers can still cancel or move them.

## For developers

**Extending Agenda (Agenda Pro).** Agenda puts a server API on `globalThis` under `Symbol.for('cleitext.agenda')` (see `src/pro.ts`), set up again whenever plugins reload. A plugin that requires Agenda finds it in its own `setup`:

```ts
const agenda = (globalThis as any)[Symbol.for('cleitext.agenda')];
agenda.bookingLimit.push(async (siteId) => ((await licensed(siteId)) ? Infinity : null));
agenda.blocked.push(async ({ siteId, service, from, to }) =>
  busyTimesOfMyCalendar(siteId, from, to),
);
agenda.booked.push(async ({ siteId, appointment, service }) => addVideoLink(appointment));
agenda.changed.push(async ({ appointment, previous }) => syncCalendar(appointment, previous));
```

- `bookingLimit`: the largest answer wins (`null`: no opinion; Agenda answers 30).
- `blocked`: times nobody can book (an external calendar's busy times).
- `booked`, `changed`: after a booking is stored, and after a status or time changes. Agenda also emits the actions `agenda.booked` and `agenda.changed`.
- Failing extensions are logged and skipped.

**Data.** Tables `services`, `exceptions` and `appointments` in the schema `plg_agenda`, with Row Level Security. Services keep their settings in a JSON column (`data`), extensions included, and their booking form as an ordered list of fields (`fields`: `name`, `state` `required`/`optional`/`hidden`, `label`, `help`, `translations`; see `src/model/form.ts`); appointments keep each answer with the label it had, and `source` (`site`, `admin` or `import`) and are never deleted.

**Renaming the plugin.** The slug, the names, the block, the capability, the form id, the public addresses and the CSS marker all come from `src/config.ts`; the manifest (`cleitext.plugin.json`: `slug`, `name`, `capabilities`) must match it (a test checks it). To rename: change `src/config.ts` and the manifest, the `name` of `package.json`, the folder, the action names `agenda.booked`/`agenda.changed` in `src/server.tsx` (TypeScript declaration merging needs literal names), `'agenda'` in `tools/release/index.mjs`, the Italian texts that say "Agenda", and these READMEs. The database schema follows the slug (`plg_<slug>`): an installed copy is a different plugin after a rename.
