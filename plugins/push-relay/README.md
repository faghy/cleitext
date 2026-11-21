# Push Relay

Sends the push notifications of the official Cleitext app (iOS and Android) for every Cleitext site, through Firebase Cloud Messaging (HTTP v1). It is installed on cleitext.com: it holds the Firebase service account, so sites never need a Firebase key.

## How it works

1. A person signs in to their site from the Cleitext app and registers the phone (`POST /api/v1/push/devices`).
2. When something happens (a comment to moderate, a form message, a new order), the site posts to the relay:

   ```http
   POST /api/v1/ext/push-relay/send
   content-type: application/json
   x-cleitext-site: https://example.com

   { "tokens": ["…"], "title": "Nuovo ordine n. 12 — 71,98 €", "body": "Ada Rossi · 3 prodotti",
     "data": { "type": "shop.order", "siteUrl": "https://example.com", "adminPath": "/cl-admin/ext/shop/orders?order=…", "id": "…" } }
   ```

3. The relay sends one message per phone and answers `{ "sent": 2, "invalid": ["…"], "failed": 0 }`. The site forgets the `invalid` tokens (apps removed, tokens renewed).

Limits of a request: 100 tokens, a title of 120 characters, a body of 400, `data` with at most 20 text values. Errors: `400 {error: "invalid_request"}`, `429 {error: "rate_limited"}` (with `retry-after`), `502 {error: "upstream_error"}` (Google refused the service account), `503 {error: "not_configured"}` until the key is set.

## Settings

**Settings → Push Relay** (capability `manage_push_relay`, administrators):

- **Firebase service account**: paste the JSON key (Firebase console → Project settings → Service accounts → Generate new private key). It is stored encrypted; the page only shows the project and the account.
- **Notifications per hour for each site**: 300 by default, counted per phone by the `x-cleitext-site` address. Each address may also make 120 requests a minute. Counters are kept in memory.

Sites use `https://cleitext.com/api/v1/ext/push-relay/send` by default; `CLEITEXT_PUSH_RELAY` points a site to another relay, and an empty value turns notifications off.
