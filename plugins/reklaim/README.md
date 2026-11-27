# Reklaim

The official Cleitext plugin for a **call-to-action bar** fixed at the bottom of the screen on phones: a short text and a button, e.g. «From €29 a month · Ask for a free demo». It is not in the base package: install it from **Plugins → Add New** (catalog), or download `cleitext-plugin-reklaim-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

## What it does

- **Texts per language**: one text, button and address per language (`it`, `en`, `fr`…), and one for the languages without their own. It follows the language of the page, also with Multilingual.
- **Shown at the right moment**: after some scrolling (500 px by default), only on screens narrower than 768 px (or any width you choose, 0 for all).
- **Towards your form**: with an anchor (e.g. `demo`, the id of the form), on pages that have it the button goes there and the bar hides while the form is in view. On the other pages the button goes to the address of the language.
- **Pages without the bar**: one address per line; `/blog/*` also covers the pages below it.
- **Colors** of the bar, the text and the button. The bar leaves room at the bottom of the page and respects the notch and home bar of phones (safe area).
- **Statistics**: clicks per day in the **Dashboard** (counts only: nothing about visitors is kept; bots and repeated clicks are not counted). With Google Analytics 4 or Tag Manager on the site, every click also sends the `generate_lead` event (or yours; `off` for none).

The bar is drawn by a small script after the page loads, so it works with cached pages and does not slow down the first view. No cookies.

## Reklaim Pro

Reklaim Pro (paid) adds:

- **More bars, in order**: «if the page has the anchor X, say Y and go there», or only on some addresses and languages, from and until a date. The first that fits wins; then the site's bar.
- **A box in the editor** of each page and post: its own text, button and address, or no bar.
- **Also on computers**, and **at the top of the screen**.
- Clicks **per bar** in the Dashboard.

## Settings

**Settings → Reklaim**.

## For developers

Reklaim Pro talks to Reklaim through `globalThis[Symbol.for('cleitext.reklaim')]` (see `src/pro.ts`): for each page, the providers in `providers` say which bars come first, whether the page hides the bar, and whether it shows on computers or at the top.

## License

GPL-2.0-or-later. Plugin API 1.69: script and styles added with `render.html` (`theme:hooks`), served by the site (`routes:public`), statistics (`routes:admin`, own table), settings (`settings:own`).
