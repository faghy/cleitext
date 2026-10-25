# Captcha

The official Cleitext plugin that keeps spam and bots out of your forms. It is free and not in the base package: install it from **Plugins → Add New** (catalog), or download `cleitext-plugin-captcha-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

## What it does

Pick one service and set its keys once: every form of the site is protected with it.

- **Cloudflare Turnstile**: free, private, and most visitors never have to click anything.
- **Google reCAPTCHA v2**: the "I'm not a robot" checkbox, or its invisible version.
- **Google reCAPTCHA v3**: no widget at all; each visitor gets a score and those below your threshold (0.5 by default) are stopped.

The forms it covers, each with its own switch:

- the **admin sign-in** (`/cl-admin`) and its lost and new password screens, as WordPress plugins protect `wp-login.php` (signing in with a passkey and the two-factor code are not asked again);
- visitors' sign in, create an account, lost and new password;
- comments (and the shop's product reviews);
- the forms of the **Forms** plugin;
- the checkout of **Cleishop** (off by default: turn it on if bots place fake orders);
- the forms of the page builders, **Fresco Pro** and **Prisma**, when they are set to use the site captcha (their default when they have no keys of their own);
- the forms of other plugins that ask for it.

Also:

- people who are **signed in** are not asked (you can change it);
- **trusted addresses**: your office, for example (single addresses or ranges such as `203.0.113.0/24`);
- Turnstile's **look**: light, dark or automatic theme (automatic follows the page: a site set to always light or always dark gets a matching widget, otherwise the visitor's device; 1.1.1), normal, full-width or compact size, always shown or only when the visitor has to click;
- the widget speaks the **language of the page**, or one you choose;
- the send button can stay **disabled until the check is passed**;
- your own **error message**, in every language of the site (Italian and English are built in);
- a **failsafe** if Cloudflare is down: show a reCAPTCHA v2 checkbox instead (with its own keys), let the messages through while Cloudflare does not answer, or refuse them.

**Only when needed** (1.1.0). With the free **Antispam** plugin active, set **When to ask** to _Only when Antispam is unsure_: the widget stays hidden and most visitors never see it. When Antispam doubts a message (a few points of its score, or no JavaScript), the form refuses it once with your error message and shows the widget; the visitor solves it and sends again. Without Antispam this mode protects nothing, so keep _Always_.

Every check is made on the server, with the service's own answer: the token, your domain, the form it was solved for and, for reCAPTCHA v3, the score.

## How to use it

1. Get the keys:
   - Turnstile: Cloudflare dashboard → **Turnstile** → **Add widget**, with your domain (it is free, even without using Cloudflare for the site);
   - reCAPTCHA: [google.com/recaptcha/admin](https://www.google.com/recaptcha/admin), choosing the same version you pick in the plugin.
2. Activate the plugin in **Plugins**.
3. Open **Settings → Captcha**, choose the service, paste the **site key** and the **secret key**, tick the forms to protect and save. The secret key is stored encrypted and never shown again.

That's it: open your sign-in page in a private window to see the widget.

**Locked out of the admin?** If the widget cannot load where you are (a firewall, a browser extension) or the keys are wrong, you could not sign in. Keep a second browser tab signed in while you try new keys, and use the failsafe if you choose Turnstile. If it happens anyway, turn the plugin off from the server's command line: your settings and keys are kept, and you can fix them and turn it back on in **Plugins**.

```sh
cleitext plugin:deactivate captcha --site <your site's slug>
```

(`cleitext site:list` shows the slugs; a plugin activated on every site is turned off with `--network`.)

The admin's security policy normally lets in no outside scripts: while the admin sign-in is protected, it lets in the chosen service only (`challenges.cloudflare.com` for Turnstile, Google's reCAPTCHA addresses for reCAPTCHA).

**Trying it out.** Cloudflare has test keys that always pass: site key `1x00000000000000000000AA`, secret key `1x0000000000000000000000000000000AA`. With the site key `2x00000000000000000000AB` the widget always fails, and the secret key `2x0000000000000000000000000000000AA` refuses every token. Use real keys on a live site.

**Behind a proxy or Cloudflare.** The visitor's address is sent to the service and checked against your trusted addresses. When the site runs behind nginx, Plesk, HAProxy or Cloudflare, set `TRUST_PROXY=true` in Cleitext's settings (`.env`), and also `TRUST_CLOUDFLARE=true` behind Cloudflare; otherwise every visitor seems to come from the proxy (or from a Cloudflare server), and the plugin leaves the address out rather than sending the proxy's. `TRUST_PROXY=true` trusts only proxies on local and private networks; a proxy on a public address must be listed in `TRUST_PROXY` (see the deployment guide, §5). Cleitext reads `X-Forwarded-For` from the right, through trusted proxies only, so a visitor cannot put a trusted address in the header to skip the challenge.

## For developers

The plugin answers the core's `form.challenge`, `form.verify` and `form.sources` filters (plugin API 1.38, permission `forms:protect`): the core's own forms ask by themselves, and a plugin with forms of its own asks with `ctx.forms.challenge(…)` and `ctx.forms.verify(…)`, under a form id such as `events/rsvp` (covered by the "Forms of other plugins" switch). Forms sent with JavaScript call `window.cleitextChallenge.prepare(form)` before reading their fields and `reset(form)` after a refused submission; `require(form)` shows a widget kept hidden on demand (also shown by `reset`, and by `?cl-challenge=<form id>` in the page's address after a refusal without JavaScript). See the plugin guide, "Protecting forms".

Permissions: `forms:protect`, `settings:own` (settings and encrypted keys), `routes:admin` (the settings page) and `network` (the services' checks).
