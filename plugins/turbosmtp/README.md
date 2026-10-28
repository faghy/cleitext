# turboSMTP

🇮🇹 [Leggi in italiano](./README.it.md)

The official Cleitext plugin for **[turboSMTP](https://www.serversmtp.com)**: every email of the site leaves through turboSMTP, so password resets, orders, bookings and form messages reach the inbox instead of the spam folder. It is an integration for the turboSMTP service, made by Cleitext: it is not made or supported by turboSMTP. It works like turboSMTP's own WordPress plugin (4.9.8). It is free and not in the base package: install it from **Plugins → Add New** (catalog), or upload `cleitext-plugin-turbosmtp-<version>.zip` in **Plugins → Upload Plugin**. It needs Cleitext 0.93 or later (plugin API 1.60). You need a turboSMTP account (it has a free plan).

## Set up

Open **turboSMTP** in the admin's menu (after Settings):

1. **Connect your account**, in one of two ways:
   - **API keys**: create them in turboSMTP → Settings → API keys and paste the Consumer Key and the Consumer Secret;
   - **Email and password**: the plugin signs in once, creates API keys for this site (named after it) and signs out. The password is not kept.
2. **Sending**: by **turboSMTP's API** (recommended: fast, and it works where the server's SMTP ports are closed) or by its **SMTP servers**, European (`pro.eu.turbo-smtp.com`, data in the EU) or international (`pro.turbo-smtp.com`), on port 587, 465, 25 or 2525. SMTP needs the user (usually the account's email) and the password, which are checked with turboSMTP before they are saved.
3. **Sender**: an address and a name for the site's emails. Empty, the site's own (Settings → Email, or `no-reply@` the site's domain). Use an address of a domain verified in turboSMTP. A sender chosen for one email, e.g. by a contact form, stays.
4. **Test email**: sends a message through turboSMTP and shows turboSMTP's answer if it refuses it.

A switch turns the sending through turboSMTP off without disconnecting the account. **Disconnect** removes the keys and the SMTP password.

## The site never stops sending

The plugin takes the emails through the core's `mail.deliver` hook (plugin API 1.60). If turboSMTP does not take an email (an error, a quota, the service unreachable), the core sends it the usual way, with the site's SMTP settings or the server's, and the plugin's page shows the last error. Deactivating the plugin brings back the site's own sending at once.

## Statistics

**turboSMTP → Statistics** reads turboSMTP's analytics for a period (the last 30 days by default): sent, delivered, opened, clicked and bounced emails with their share, a chart per day, and the list of messages, filtered by outcome (also queued, unsubscribed, reported as spam, dropped), a page at a time, with turboSMTP's error for each one. The rest is in turboSMTP's dashboard.

## Privacy and security

- The plugin asks the `mail:transport` permission: it sees every email of the site, password-reset links included, so activating it asks the administrator's consent.
- Keys and the SMTP password are stored encrypted with the site's secrets and never sent back to the browser.
- The emails and their recipients go to turboSMTP, which processes them on the site's behalf: mention it in the privacy policy. The European servers keep the data in the EU.
- Only administrators can manage it (capability `manage_turbosmtp`).

## Development

```sh
pnpm --filter @cleitext/plugin-turbosmtp test
pnpm --filter @cleitext/plugin-turbosmtp build
```

`TURBOSMTP_TEST_ENDPOINT=http://127.0.0.1:<port>` sends every turboSMTP request to a local fake (as `<base>/<host><path>`), for tests only.

## License

GPL-2.0-or-later. turboSMTP is a trademark of its owner.
