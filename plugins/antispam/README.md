# Antispam

The official Cleitext plugin that keeps spam out of comments, sign-ups and forms, with checks that all run on your site. It is free and not in the base package: install it from **Plugins → Add New** (catalog), or download `cleitext-plugin-antispam-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

It works as soon as it is active, with no keys and no account anywhere: **nothing is sent to other services**, and visitors' IP addresses are never stored, only as salted hashes that are forgotten after a few days.

## What it protects

- **comments** (and the shop's product reviews);
- **sign-ups** (Create an account);
- the forms of the **Forms** plugin;
- the forms of **Prisma** and **Fresco Pro** (Fresco Pro forms with their own captcha keys are left to that captcha);
- other plugins' forms that ask for it (off by default: a shop's checkout, for example).

Sign-in and password forms are never checked: spam does not go there, and nobody should be locked out.

## How it decides

Every message gets a **score**. These checks add points:

| Check                                                                                                 | Points                    |
| ----------------------------------------------------------------------------------------------------- | ------------------------- |
| a hidden field that people never see is filled in (bots fill everything)                              | always dropped            |
| the message came **faster than 3 seconds** after the visitor started filling the form                 | 6                         |
| the time check was forged                                                                             | 6                         |
| more than **2 links** (configurable)                                                                  | 2 to 4                    |
| forum link tags such as `[url=…]`                                                                     | 4                         |
| a **blocked** word, web address, domain, email or IP address (your own list)                          | 6                         |
| mostly written in an **alphabet the site does not use** (e.g. Cyrillic or Chinese on an Italian site) | 4 (2 for a few words)     |
| the name is a web address                                                                             | 3                         |
| the **same text** came three times or more in a day                                                   | 3                         |
| the text was **marked as spam** before                                                                | 5                         |
| the text was **marked as not spam** before                                                            | −3                        |
| the address sent spam before                                                                          | 2, or 4 after three times |
| the email's domain has no mail server (optional, off by default)                                      | 3                         |

Then, with the default thresholds:

- **under 3**: the message goes through;
- **3 to 5, doubtful**: if the **Captcha** plugin is active, the visitor is asked to solve it (see below); otherwise the message waits in the spam queue;
- **6 to 9, spam**: it waits in the **spam queue**, and the visitor reads the usual thanks. Forms that cannot keep a message aside (sign-ups, Fresco Pro) refuse it with a polite message instead;
- **10 or more** (and the hidden field always): dropped, while the sender is told it went through.

**No JavaScript?** The time check needs the plugin's small script. A visitor without JavaScript is never refused for that alone: their message is treated as doubtful only when the Captcha plugin can ask them, and goes through otherwise.

### Pages in the cache

Pages are usually served from a cache, the same to everybody, so a form cannot carry the moment it was opened. The plugin's form fields are the same for every visitor; its script (under 2 KB, no cookies) asks the site for a signed time token (`GET /_antispam/token`, never cached) when the visitor starts filling a form, or at the latest when they send it. The server then knows when the visitor started: sending sooner than the minimum time means a bot. People are never refused for being quick: the script holds the message for the remaining second or two. Tokens are signed with a key of the site and expire after a day.

### With the Captcha plugin

Set **Settings → Captcha → When to ask** to _Only when Antispam is unsure_: most visitors never see a captcha. When Antispam doubts a message, the form refuses it once and shows the Turnstile or reCAPTCHA widget; once solved, the message goes through. Clear spam stays spam even with the captcha solved. With _Always_, Captcha checks every message as before, and a solved captcha takes away Antispam's doubts.

## The spam queue

**Spam** in the admin's menu lists the comments in the spam folder and the form messages held as spam, with why they were held:

- **Not spam** publishes the comment or delivers the message (stored and emailed by its form, as if it had just arrived), and teaches the filter that the text is fine;
- **Spam: delete** deletes it for good and teaches the filter that the text is spam;
- the queue empties itself after **15 days** (configurable), spam comments included.

Messages refused as spam by forms that cannot keep them (sign-ups, Fresco Pro) are listed too, so you can see a mistake; "Not spam" then only teaches the filter. Marking comments as spam or not spam in **Comments** teaches it as well.

**Spam → Statistics** shows what was stopped each day of the last 30, and why.

## Settings

**Settings → Antispam**: the forms to protect, whether signed-in people are checked (not by default), the minimum time, the links allowed, the alphabets (those of the site's languages by default), the block list and the "never check" list (emails, `@domain`, IP addresses and ranges), the checks to use, the three thresholds and the days the queue keeps spam.

## Privacy

- No outside service: every check runs on your server.
- IP addresses are kept only as salted hashes (a key of the site), to recognise senders of spam, and forgotten with the queue.
- Texts are remembered only as salted fingerprints, which cannot be read back.
- The queue holds the messages taken for spam (names, emails, text) for the days you set; the Privacy plugin's export and erasure by email address include them.
- The optional mail server check asks your server's DNS resolver about the email's domain (which may be a service outside the site): it is off by default.
- The script sets no cookie and stores nothing in the browser.

For your privacy policy, for example: _“To protect the site from spam, messages sent with its forms are checked automatically on our server. Messages taken for spam are kept for up to 15 days so that we can check them; the visitor's IP address is kept only in a non-reversible form for the same time. No data is passed to third parties for this purpose.”_

## For developers

The plugin answers the core's `form.challenge` and `form.verify` filters (permission `forms:protect`, plugin API 1.38) with the spam verdicts of plugin API 1.45: `spam` for forms that can hold messages (`hold: true`, delivered later through the `form.released` action), `silent` for bots and `challenge` for a captcha plugin that runs after it. It reads and moderates the spam comments with `ctx.comments` (permission `comments`). A plugin with forms of its own gets these checks by asking `ctx.forms.challenge` and `ctx.forms.verify` (switch "Forms of other plugins"); see the plugin guide, "Protecting forms".

Permissions: `forms:protect`, `comments`, `settings:own` (settings and the site's key), `routes:admin` (the admin pages) and `routes:public` (the time token).
