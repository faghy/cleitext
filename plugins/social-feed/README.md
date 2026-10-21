# Social Feed

🇮🇹 [Leggi in italiano](./README.it.md)

The official Cleitext plugin that shows the latest posts of your **Instagram** account and your **Facebook Page** on the site. It is free and not in the base package: install it from **Plugins → Add New** (catalog), or download `cleitext-plugin-social-feed-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

## What it does

- **Instagram, Facebook or both.** Each channel is turned on by itself. A feed can show one of them, or both in one list sorted by date.
- **The Social feed block**, in the block editor and in Fresco (as a plugin block):
  - grid, carousel or list layout, with columns for desktop, tablet and mobile;
  - how many posts, and a **Load more** button that shows the next ones;
  - square, portrait or original pictures;
  - caption, date, likes and comments, each on or off;
  - a **header** with the profile picture, the name, the followers and a **Follow** button;
  - a **lightbox**: the post opens in a window on the page, with its caption and a link to the original.
- **Fast and found by search engines.** The posts are written in the page by the server, with real links and alternative text from the captions. The only script (about 4 KB) adds Load more, the carousel's arrows and the lightbox; without it the posts are still links.
- **Looks like your site.** The block takes fonts, colors and buttons from the theme.
- **Pictures that never break, and nothing loaded from Meta.** The pictures are copied to the site and served from it: Meta's picture addresses expire after some days, and visitors would otherwise send their address to Meta. No cookies, no consent needed. If you prefer, the pictures can load from Meta's servers instead: with the **Privacy & GDPR** plugin they then wait for consent, and the plugin is listed in the cookie policy.
- **Official APIs and your own app.** The plugin talks to Meta with your own Meta app: the Instagram API with Instagram Login (`instagram_business_basic`), or the Graph API with Facebook Login for a Page (`pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, and `instagram_basic` to read Instagram through the Page). No third-party service is involved.
- **Tokens taken care of.** Access tokens are stored encrypted on the server and never sent to the browser. The Instagram token lasts 60 days: the plugin renews it by itself a month before it expires. The settings show when each token expires and warn a week before.
- **Robust.** Posts are fetched every hour (or as you choose) and on demand. When Meta limits the requests or a token stops working, the site keeps showing the last posts, the error is shown in the settings and the plugin tries again later.

## How to use it

1. Activate the plugin and open **Settings → Social feed**.
2. Create your Meta app: the page has a step-by-step guide (in English and Italian) and the **redirect address** to copy into the app. Meta asks for https.
3. Paste the app's ID and secret and **Save**.
4. Click **Connect with Instagram** (or **Connect with Facebook**), sign in and allow. With several Pages you choose one. The first posts arrive at once.
5. Add the **Social feed** block to a page and choose its layout.

Cannot use the sign-in? **Paste a token** instead: a long-lived Instagram user token (from the app's **Generate access tokens**), or a Facebook Page token or user token (from the Graph API Explorer).

## Good to know

- Instagram needs a **professional account** (Business or Creator): personal accounts cannot be read through Meta's APIs since the Basic Display API was retired.
- While the Meta app is in development mode, only accounts with a role in the app can connect: add yourself as a tester, or publish the app. Your own accounts and Pages need no App Review.
- Up to 50 posts per channel are kept, and up to 120 pictures; pictures no post uses any more are deleted after a day.
- Disconnecting a channel deletes its token, its posts and its pictures.

## For developers

- Block: `social-feed/feed`, with the attributes `source` (`all`, `instagram`, `facebook`), `layout` (`grid`, `carousel`, `list`), `columns` (`{ desktop, tablet, mobile }`), `count`, `gap`, `aspect`, `header`, `follow`, `followLabel`, `caption`, `captionLength`, `date`, `likes`, `loadMore`, `loadMoreLabel`, `lightbox`.
- Pages showing a feed carry the cache tag `social-feed`, refreshed when new posts arrive.
- Pictures are served at `/social-feed/media/<key>.<ext>`, cached for a year (their address changes with their content).
- Settings API under `/api/v1/ext/social-feed` (capability `manage_settings`): `GET`/`PUT /settings`, `POST /oauth/start`, `/oauth/callback`, `/facebook/page`, `/token`, `/refresh`, `/disconnect`.
- Plugin API 1.36 or later (`ctx.http` with files); AI assistants learn about the block with `ctx.ai` (API 1.40) where available.

License: GPL-2.0-or-later.
