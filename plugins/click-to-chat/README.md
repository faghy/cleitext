# Click to Chat

The official Cleitext plugin for a WhatsApp button on the site: [Joinchat](https://join.chat) by Creame, brought to Cleitext. It is not in the base package: install it from **Plugins → Add New** (catalog), or download `cleitext-plugin-click-to-chat-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

## What it does

- **A floating button** in a corner of every page, with your color, a tooltip, an optional image (e.g. who answers) and dark mode. It appears after a few seconds, or at once.
- **A chat window** with your messages, written like on WhatsApp: `*bold*`, `_italic_`, `~strikethrough~`, `` `code` ``, links `[text](address)`, buttons `{BTN address text}`, images `![](address)`, random texts `{RAND Hi||Hello}`, a new bubble with `===` and notes with `>>>`. It can open by itself after some seconds from the page you choose, once per message, or show a "1" on the button instead.
- **A message already written** for the visitor when WhatsApp opens, with the page it comes from: `{SITE}`, `{TITLE}`, `{URL}`, `{HOME}`.
- **On computers**: a QR code over the button, to continue on the phone, or WhatsApp Web. Or the button only on phones.
- **Where it shows**: home, pages, posts, other content types, archives, search, "page not found". Each page and post can have its own number and messages, or no button (box **WhatsApp button** in the editor; `{}` empties a text).
- **WhatsApp button block**, for pages: a button with its own number and message, and a QR code on computers. It works also without the script (it is an ordinary `wa.me` link). Links to `#whatsapp` (open WhatsApp) and `#joinchat` (open the window) work in menus and texts too, as in Joinchat.
- **Privacy notice** in the window, to accept with a checkbox if you want.
- **Statistics**: clicks per day in the **Dashboard** (counts only: nothing about visitors is kept; bots and repeated clicks are not counted). With Google Analytics 4 or Tag Manager on the site, every click also sends the `generate_lead` event (or yours), and a Google Ads conversion if set.

No cookies: the script remembers in the browser (`localStorage`) how many pages the visitor saw and which messages were shown, to open the window only once.

## Settings

**Settings → Click to Chat**: number, messages, button, chat window, where it shows, statistics.

## Credits and license

The script and the styles are those of **Joinchat 6.4.2** by Creame (https://join.chat), GPL-2.0-or-later, with these changes: the QR codes are drawn by the server as SVG (with `qrcode-generator` by Kazuhiko Arase, MIT), the jQuery and WooCommerce parts are removed, and the button block is Cleitext's. The settings, the page box, the block and the server code are written for Cleitext. WhatsApp is a trademark of Meta Platforms, Inc.; this plugin is not made or endorsed by Meta or by Creame.

GPL-2.0-or-later. Plugin API 1.4: script and styles added with `render.html` (`theme:hooks`), served by the site (`routes:public`), statistics (`routes:admin`, own table), page box (`content:write`), block (`blocks`), button image (`media:read`), settings (`settings:own`).
