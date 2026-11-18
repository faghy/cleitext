# Zaphook

Every message of your contact forms, sent also to the services you use. A free official Cleitext plugin.

## What it does

When someone writes to you with a form of your site (the **Forms** plugin), Zaphook passes the message on to one or more **webhooks**: the address another service gives you to receive data. For example:

- a Zapier **"Catch Hook"**, to add the request to a spreadsheet, a CRM or a chat;
- a **Make** or **n8n** scenario;
- any other `https://` address of a service of yours.

The message still arrives by email and stays in **Messages**, as always (unless you choose otherwise). Each field goes with the name it has in the form: a form with the fields `nome`, `telefono`, `email`, `comune` and `richiesta` sends exactly those names, so the automations you already have keep working.

- **Choose the forms**: every form of the site, or only some of them, for each webhook.
- **Nothing is lost**: if the other service is busy or out of reach, Zaphook tries again by itself after 1 minute, 5 minutes, 30 minutes, 2 hours and 6 hours.
- **See what happened**: the page shows the latest 200 deliveries, with their outcome. A failed one can be tried again with a click.
- **Try it**: **Send a test** sends a sample message straight away and tells you the answer.
- **Sign the requests** with a secret, so the receiving side can check they really come from your site.
- **No email for these messages**, if you like: the webhook takes care of them, and they stay in **Messages**.
- **Privacy first**: the visitor's IP address and browser are not sent unless you turn them on, and the privacy policy written by the **Privacy & GDPR** plugin names the services that receive the messages.

## How to use it

1. Make sure **Forms** (version 1.9.0 or later) is active, then activate **Zaphook** in **Plugins**.
2. In the service you use, create the webhook: in Zapier, a Zap that starts with **Webhooks by Zapier → Catch Hook**; copy the address it gives you.
3. In the admin, open **Settings → Zaphook**, click **Add a webhook**, paste the address and save.
4. Click **Send a test**: the service receives a sample message, which helps it learn the fields. Then send a real message with your form.

## Fixed fields and failure emails (1.1.0)

- **Fixed fields**: each webhook can send values of its own with every message, at the root of the JSON next to the form fields (e.g. `product-id` → `PROD-123`, or a category your automation expects). A fixed field wins over a form field with the same name; names cannot start with `_`.
- **Failed deliveries**: when a message still does not arrive after the last attempt, or the webhook refuses it, Zaphook sends an email to the site's administrators (those with a confirmed address), or to the address chosen in the page. It names the form, the webhook and the answer, never the visitor's values. It can be turned off.

## For developers

Each delivery is a `POST` with `Content-Type: application/json`. The form's fields are at the root, by name, as sent (fields with several values, such as checkboxes, are lists); Zaphook's own keys start with `_`:

```json
{
  "nome": "Mario Rossi",
  "telefono": "+39 333 1234567",
  "email": "mario.rossi@example.com",
  "comune": "Varazze",
  "richiesta": "Vorrei un preventivo per il giardino.",
  "_form": "Richiesta informazioni",
  "_page_url": "https://example.com/contatti",
  "_page_title": "",
  "_submitted_at": "2026-11-18T09:30:00.000Z",
  "_locale": "it",
  "_message_id": "0b7e…"
}
```

`_ip` and `_user_agent` are added only when the webhook asks for them. **Send a test** adds `"_test": true`.

**Answers.** Any `2xx` is a delivery. `429`, `5xx`, a timeout (15 seconds) or an unreachable address are tried again (1 min, 5 min, 30 min, 2 h, 6 h); `410 Gone` and the other `4xx` (and redirects, which are not followed) end it as failed. The log keeps the latest 200 deliveries per site, with the names of the fields but never their values; the values of a sent message are deleted at once, those of a failed one after 7 days (so it can be tried again).

**Signature.** With a secret, each request carries `X-Zaphook-Timestamp` (Unix seconds) and `X-Zaphook-Signature: sha256=<hex>`, the HMAC-SHA256 of `<timestamp>.<raw body>` with the secret. To check it, for example in Node.js:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(rawBody, headers, secret) {
  const timestamp = headers['x-zaphook-timestamp'];
  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  const given = String(headers['x-zaphook-signature'] ?? '');
  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 300;
  return (
    fresh &&
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  );
}
```

Use the body exactly as received, before parsing it. The secret is kept encrypted in the plugin's secrets: it is never shown again, logged or exported.

**How it works.** Zaphook provides Forms' `forms.delivered` extension point (Forms 1.9.0): it only puts the message in its queue (the `plg_zaphook.deliveries` table, one row per webhook) while the visitor waits, and answers `skipMail` when a matching webhook asks for no email. A task every minute sends what is due through `ctx.http` (public https addresses only). Queued values are part of **Privacy → Requests** (export and erasure by email address). Plugin API 1.73; permissions `routes:admin`, `settings:own`, `network`.

The admin page reads everything with `GET /api/v1/ext/zaphook/state` (webhooks, log, form names, alerts); webhooks are changed with `POST /webhooks`, `PUT /webhooks/:id` and `DELETE /webhooks/:id`, the failure email with `PUT /alerts`.

## License

GPL-2.0-or-later. Copyright (C) 2026 Serafino Christian.
