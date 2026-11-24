# Disbigle

🇮🇹 [Leggi in italiano](./README.it.md)

The official Cleitext plugin that announces your new articles on the **fediverse** through your **Disbigle** account, or through an account on another Mastodon-compatible server. It is free and not in the base package: install it from **Plugins → Add New** (catalog), or download `cleitext-plugin-disbigle-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

Cleitext does not become an ActivityPub server: your Disbigle server writes, signs and delivers the posts. The site only talks to it through its API.

## What it does

- **One post per article.** When an article is published for the first time, a post goes out with its title, a summary (the excerpt, or the beginning of the text, about 300 characters) and its link. With the Multilingual plugin, one post covers all the translations: Disbigle gets the article in English, Italian, Spanish, French, German and Chinese, whichever it has, and shows each follower their language. Updating or publishing the article again never makes a second post.
- **Mentions.** Write `@anna@disbigle.com` in an article: Anna is notified, and the mention becomes a link to her profile. Someone added when you update an article that is already announced is told once, in a quiet reply to its post.
- **Hashtags.** The categories and tags of the article become hashtags (letters, digits and underscores; up to 10).
- **Comments from the fediverse.** Under the article, a **Comment on the fediverse** button opens the post: anyone with a Disbigle, Mastodon or other fediverse account can reply, and the public replies appear under the article, refreshed every few minutes. Their text is cleaned again on the site; pictures come only from your server (which keeps copies of them), the others show initials unless you allow **remote avatars**.
- **Never in the way.** If the server is down or refuses the post, the article is published all the same; the error shows in **Settings → Disbigle**, and the plugin tries again later when it makes sense (or when you click **Try again**). The same article is never posted twice: each attempt carries the same idempotency key.
- **Safe.** The sign-in uses OAuth with PKCE; the access token and the app's secret are stored encrypted on the server, never sent to the browser or written to the logs. **Disconnect** revokes and forgets them.

## How to use it

1. Activate the plugin and open **Settings → Disbigle**.
2. Leave the instance at `https://app.disbigle.com` (or write your Mastodon-compatible server) and click **Connect to Disbigle**.
3. Sign in on the server and allow Cleitext to **read your account and write posts**. Back on the site you see **Connected as @you@server**.
4. Publish an article. To leave one out, turn off **Announce on Disbigle** in its sidebar (under **Disbigle**) before publishing it.

## Good to know

- Only articles published after you connect are announced, not older ones published again.
- Scheduled articles are announced within five minutes of coming out.
- Replies only visible to followers, and direct messages, never appear on the site. The replies of your own account (Disbigle's notices in other languages) are not shown either.

## For developers

- Field group `disbigle` on articles, with `announce` (boolean, default `true`).
- Block `disbigle/fediverse`: the replies and the link to comment of the entry shown (added by itself under announced articles).
- Pages showing it carry the cache tags `disbigle` and `disbigle:<status id>`, refreshed when new replies arrive.
- Server calls: `POST /api/v1/apps`, `/oauth/authorize`, `POST /oauth/token`, `GET /api/v1/accounts/verify_credentials`, `POST /api/v1/disbigle/articles` (with `Idempotency-Key: <entry id>`), `GET /api/v1/statuses/:id/context` (without token), `POST /oauth/revoke`.
