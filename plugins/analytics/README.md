# Analytics

The official Cleitext plugin to connect measurement and webmaster services: **Matomo**, **Google Analytics 4**, **Google Tag Manager**, the **Meta Pixel**, and the site verification of **Google Search Console** and **Bing Webmaster Tools**. Turn on as many as you use. It is not in the base package: download `cleitext-plugin-analytics-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

## Privacy rules, applied for you

Each service tells the **Privacy & GDPR** plugin what it does, and that plugin applies the rules — nothing to copy by hand:

| Service                              | Consent    | Category                | Cookies                                           | Policy                                                                         |
| ------------------------------------ | ---------- | ----------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Matomo, anonymous mode (recommended) | not needed | —                       | none                                              | legitimate interest, aggregate statistics                                      |
| Matomo with cookies                  | needed     | Statistics              | `_pk_id.*`, `_pk_ses.*`                           | consent                                                                        |
| Google Analytics 4                   | needed     | Statistics              | `_ga`, `_ga_<id>`                                 | consent, Google, transfer to the USA (Data Privacy Framework), Consent Mode v2 |
| Google Tag Manager                   | needed     | Statistics or Marketing | those of its tags (add them in Privacy → Cookies) | consent, Consent Mode v2                                                       |
| Meta Pixel                           | needed     | Marketing               | `_fbp`, `fr`                                      | consent, Meta, transfer outside the EU                                         |
| Search Console, Bing                 | not needed | —                       | none (a meta tag)                                 | —                                                                              |

- The banner offers the categories the services need, even when the site itself offers none; it asks visitors again when the services change.
- Services that need consent reach the page inert and run only after the visitor accepts their category. Without Privacy & GDPR active (or with its banner off) they are not loaded at all.
- Google services turn on Google Consent Mode v2: everything starts _denied_ and follows the choice.
- Their cookies appear in the cookie table, and the privacy policy describes each service when you create it again in **Privacy → Policies**.

**Matomo anonymous mode** uses no cookies (`disableCookies`). The Italian Garante (guidelines of 10 June 2021) allows such analytics without consent when the IP address is masked and the data is not combined with other data: in Matomo, set **Privacy → Anonymize data** to at least 2 bytes.

## Search engines

Paste the verification code of Google Search Console (the `google-site-verification` tag, or just its content) or Bing (`msvalidate.01`), then submit the sitemap `https://<your site>/sitemap.xml` in their consoles.

## Install

```bash
bin/cleitext plugin:install plugins/analytics
```

or upload the zip in **Plugins → Upload Plugin**, then activate it with **Privacy & GDPR**. The settings are in **Analytics** in the admin menu. It needs Cleitext 0.13 or later (plugin API 1.4).
