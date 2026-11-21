# AI assistants (MCP)

> 🇮🇹 [Leggi in italiano](./it/MCP.md)

Cleitext is an **MCP server**: people connect their own AI assistant (ChatGPT, Cursor or any MCP client) to the site and ask it to write pages and posts. The assistant works with the blocks of the editor and the sections of the theme, with the permissions of the person who connected it. Cleitext calls no AI service itself and needs no API key.

In the admin there is also **Chriss**, the Cleitext assistant: a chat that does the same work with the site's own AI provider (see [Chat in the admin](#chat-in-the-admin)).

## Turn it on

In the admin, open **Chriss** and choose _Turn on AI assistants_ (or check _Let AI assistants work on this site_ in **Settings → AI assistants (MCP)** and save). The **Chriss** page shows the address to give the assistant, `https://<your site>/mcp`, with a Copy button, the steps to connect, and the assistants connected to your account. Until it is on, `/mcp` and the OAuth endpoints answer 404, except for the official Cleitext app: it signs in with the same OAuth flow (redirect `com.cleitext.app:/oauth/callback`) on every site, as it is not an AI assistant.

The address is not a page to open in the browser: whoever opens it there lands on **Chriss** in the admin.

## Connect an assistant

**With OAuth** (apps with "custom connectors", such as ChatGPT): add a connector with the address `https://<your site>/mcp`. The assistant registers itself and opens the site: you sign in to the admin, if needed, and see **Connect an assistant**, where you allow access: reading content, creating and changing drafts, and — only if you check it and your role can publish — publishing.

**With a token** (desktop and command-line assistants, editors, scripts): create a token in **Profile → API tokens** (_Can make changes_, and _Can publish_ if wanted), then add the server to the assistant's MCP configuration, for example:

```json
{
  "mcpServers": {
    "cleitext": {
      "type": "http",
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer ctx_…" }
    }
  }
}
```

Each connection is an API token of your account: assistants connected with OAuth are listed in **Chriss → Connected assistants** (and in **Profile → API tokens**, named "<assistant> (MCP)"); disconnecting or revoking it stops the assistant.

## What the assistant can do

| Tool                        | What it does                                                                                              | Needs   |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | ------- |
| `get_site`                  | Languages, content types (with their editor and custom fields), editors, theme, menus, and who it acts as | read    |
| `get_block_guide`           | The guide: Cleitext's rules, the editor's guide, what plugins add, the theme's guide, the site's patterns | read    |
| `get_pattern`               | The blocks of a pattern, to reuse                                                                         | read    |
| `list_entries`, `get_entry` | Find and read pages and posts, with their editor and body                                                 | read    |
| `list_media`                | Find images                                                                                               | read    |
| `create_entry`              | Create a page, post or translation (`translation_of`) as a **draft**                                      | write   |
| `update_entry`              | Change title, address, excerpt, featured image, custom fields (SEO…) or body                              | write   |
| `get_preview_link`          | A temporary link to see a draft                                                                           | write   |
| `upload_image`              | Add an image from a public https address, with its alternative text                                       | write   |
| `set_menu`                  | Set the items of a menu location in a language                                                            | write   |
| `publish_entry`             | Publish                                                                                                   | publish |
| `list_comments`             | Comments waiting for approval, approved, spam or trashed (needs comment moderation)                       | read    |
| `moderate_comments`         | Approve, hold, mark as spam or trash comments                                                             | publish |
| `reply_to_comment`          | Publish a reply under a comment                                                                           | publish |

Content is sent as **WordPress block markup** (`<!-- wp:heading -->…`), plain HTML or Cleitext blocks; it is converted and validated like everything saved in the editor. Nothing is deleted by an assistant. Plugins can add tools of their own (named `<plugin>_<tool>`), which act as the user too.

### The editor of each entry

Every entry keeps the editor it was made with: the block editor, or a plugin's, such as **Fresco** or the **Classic Editor**. The assistant knows it and keeps it:

- `get_site` lists the editors of the site and, for each content type, the editor new entries use. It is chosen in **Settings → Writing** (the admin opens new entries with it too); without a choice, the block editor.
- `get_entry` gives the entry's `editor` and its body: `blocks` for the block editor, `native` (the editor's own format, e.g. Fresco's tree of containers and widgets) for the others; `as_blocks: true` reads it converted to blocks.
- `create_entry` and `update_entry` take an optional `editor`; an update keeps the entry's editor and its page settings unless told otherwise. Block markup, HTML and blocks sent for an entry of another editor are converted to it by its plugin on the server; `native` documents are checked by it (Fresco refuses unknown elements and widgets outside containers, and cleans rich text). If the editor's plugin is not active, or cannot convert, the tool answers with an error instead of moving the entry to another editor.
- `get_block_guide` is one guide for the editor asked (by default the one of the content type): Cleitext's rules (pages editable by people who do not code, drafts first, excerpt, featured image, SEO fields, languages, menus), the editor's guide (for Fresco: the format, its elements and settings, devices, hover, the site's global colors and fonts), the sections plugins add, the theme's `aiGuide` and the site's patterns.

Opened from an entry's editor with **Ask Chriss**, the admin chat knows which entry it is about and its editor.

## Chat in the admin

The **Chriss** page also has a **Chat with Chriss** (and the entry editor an **Ask Chriss** link that opens it about that entry): write the request there and Chriss does it with the site's AI and the same tools, as you, showing each step (reading the site, creating a draft…) and the links to edit and preview the result. Check _It may also publish_ to let Chriss publish; otherwise Chriss leaves drafts. **Ready requests** are examples that work well: use them in the chat or copy them into your own assistant.

The chat needs an **AI provider**, set by a super admin at the bottom of the page: any service with an OpenAI-compatible chat completions API (the address, such as `https://api.openai.com/v1`, `https://openrouter.ai/api/v1` or `http://localhost:11434/v1` for Ollama, a model that can use tools, and the key). The key is stored encrypted and never shown again; the provider bills the use to the key's account. The conversation stays in the browser tab until you start a new one.

**Chriss base** is the quickest start: a super admin clicks **Activate** and the site uses the free AI of cleitext.com, with a small model and a daily limit (20 questions by default; the chat shows how many are left). The texts are processed on cleitext.com and not stored. When the free requests of the day are used up, the chat invites you to connect your own AI service. With Chriss base the chat sends only the essential tools and a short prompt, and answers are shorter.

**Chriss on every screen**: a round button at the bottom right of the admin opens the same chat in a panel (a full-height sheet on phones) that stays open while you move around the admin; Esc closes it. It is not shown on the Chriss page itself.

The official Cleitext app can use the chat too, with its own sign-in token (`write` scope; `publish` only with that scope and the permission to publish): `POST /api/v1/assistants/chat` with `Authorization: Bearer …` answers the same stream of JSON lines. Other API tokens are refused (assistants use MCP). With Chriss base and no question left, the answer is `429 {"error":"quota_exceeded","limit":20,"resetAt":"…"}`; when the service says so during an answer, the stream has `{"type":"error","error":"quota_exceeded","limit":20,"resetAt":"…","message":"…"}`, and after each answer `{"type":"quota","remaining":19,"limit":20,"resetAt":"…"}`. While the request waits its turn at the free service, `{"type":"queue","position":2}` (the requests ahead of it, sent when it changes; core 0.117.0).

## For theme and plugin authors

Add `aiGuide` (Markdown) to the theme definition: how pages are built with the theme, its sections and classes and when to use them. Assistants read it with `get_block_guide`, together with the patterns of the site — the best way to make them build in the theme's style.

Plugins teach assistants with `ctx.ai` (plugin API 1.40, see [PLUGINS.md](./PLUGINS.md#ai-assistants)): an editor with its guide, conversions and validation, sections of the guide, and tools.

## Security

- The assistant acts as the user: it can never do more than the user's role.
- Read-only connections cannot change anything; publishing needs its own permission.
- OAuth: authorization code with PKCE (S256), dynamic client registration, consent in the admin, signed in as usual (API tokens cannot give it), access tokens valid 7 days, rotating refresh tokens valid 90 days.
- `/mcp` refuses requests from browser pages of other sites (Origin check).
- `upload_image` only downloads from public https addresses: every address a name resolves to is checked when connecting, redirects included; at most 15 MB, images only.
- Everything an assistant does is in the activity log, as the user, through the token.
