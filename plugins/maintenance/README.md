# Maintenance

The official Cleitext plugin for a good-looking maintenance page. It is not in the base package: install it from **Plugins → Add New** (catalog), or download `cleitext-plugin-maintenance-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

## What it does

While your site is in maintenance mode, visitors see a clean page instead of the site, whatever theme you use:

- your **logo** (or the site icon, or simply the site title);
- a **title** and a **message**, written in every language of the site;
- the date you will be **back online**, shown in the visitor's language;
- an **email address** to get in touch;
- your **colours**, and a small "Made with Cleitext" at the bottom.

Choose **Coming soon** instead of **Maintenance** for a site that is not open yet: the page is the same, with "Coming soon" as the default title.

You, and anyone signed in, keep seeing and editing the site as usual.

Search engines are told that the site is only away for a while (status 503, with the return date when you set one), so your pages keep their place in the results.

## How to use it

1. Activate the plugin in **Plugins**.
2. Write the page in **Settings → Maintenance page** and look at the **Preview**.
3. Turn maintenance mode on in **Settings → General** → **Maintenance mode** (or with `cleitext site:maintenance --site <slug>`). Turn it off the same way when you are done.

The page has no scripts, fonts or other files, so it is fast and works on any server.

Plugin API 1.35: the `render.maintenance` filter (`theme:hooks`), its own settings (`settings:own`) and two admin endpoints (`routes:admin`).
