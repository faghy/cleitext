# AI assistants (MCP)

> 🇮🇹 [Leggi in italiano](./it/MCP.md)

Cleitext is an **MCP server**: people connect their own AI assistant (ChatGPT, Cursor or any MCP client) to the site and ask it to write pages and posts. The assistant works with the blocks of the editor and the sections of the theme, with the permissions of the person who connected it. Cleitext calls no AI service itself and needs no API key.

## Turn it on

In the admin, open **AI assistants** and choose _Turn on AI assistants_ (or check _Let AI assistants work on this site_ in **Settings → AI assistants (MCP)** and save). The **AI assistants** section shows the address to give the assistant, `https://<your site>/mcp`, with a Copy button, the steps to connect, and the assistants connected to your account. Until it is on, `/mcp` and the OAuth endpoints answer 404.

The address is not a page to open in the browser: whoever opens it there lands on **AI assistants** in the admin.

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

Each connection is an API token of your account: assistants connected with OAuth are listed in **AI assistants → Connected assistants** (and in **Profile → API tokens**, named "<assistant> (MCP)"); disconnecting or revoking it stops the assistant.

## What the assistant can do

| Tool                        | What it does                                                                            | Needs   |
| --------------------------- | --------------------------------------------------------------------------------------- | ------- |
| `get_site`                  | Languages, content types, theme, menus, and who it acts as                              | read    |
| `get_block_guide`           | How to write blocks: core blocks, plugin blocks, the theme's guide, the site's patterns | read    |
| `get_pattern`               | The blocks of a pattern, to reuse                                                       | read    |
| `list_entries`, `get_entry` | Find and read pages and posts, with their blocks                                        | read    |
| `list_media`                | Find images                                                                             | read    |
| `create_entry`              | Create a page, post or translation (`translation_of`) as a **draft**                    | write   |
| `update_entry`              | Change title, address, excerpt, featured image or body                                  | write   |
| `get_preview_link`          | A temporary link to see a draft                                                         | write   |
| `upload_image`              | Add an image from a public https address, with its alternative text                     | write   |
| `set_menu`                  | Set the items of a menu location in a language                                          | write   |
| `publish_entry`             | Publish                                                                                 | publish |
| `list_comments`             | Comments waiting for approval, approved, spam or trashed (needs comment moderation)     | read    |
| `moderate_comments`         | Approve, hold, mark as spam or trash comments                                           | publish |
| `reply_to_comment`          | Publish a reply under a comment                                                         | publish |

Content is sent as **WordPress block markup** (`<!-- wp:heading -->…`), plain HTML or Cleitext blocks; it is converted and validated like everything saved in the editor, so the result always opens in the block editor. Nothing is deleted by an assistant.

## Chat in the admin

**AI assistants** also has a **Chat**: write the request there and the site's AI does it with the same tools, as you, showing each step (reading the site, creating a draft…) and the links to edit and preview the result. Check _It may also publish_ to let it publish; otherwise it leaves drafts. **Ready requests** are examples that work well: use them in the chat or copy them into your own assistant.

The chat needs an **AI provider**, set by a super admin at the bottom of the page: any service with an OpenAI-compatible chat completions API (the address, such as `https://api.openai.com/v1`, `https://openrouter.ai/api/v1` or `http://localhost:11434/v1` for Ollama, a model that can use tools, and the key). The key is stored encrypted and never shown again; the provider bills the use to the key's account. The conversation stays in the browser tab until you start a new one.

## For theme authors

Add `aiGuide` (Markdown) to the theme definition: how pages are built with the theme, its sections and classes and when to use them. Assistants read it with `get_block_guide`, together with the patterns of the site — the best way to make them build in the theme's style.

## Security

- The assistant acts as the user: it can never do more than the user's role.
- Read-only connections cannot change anything; publishing needs its own permission.
- OAuth: authorization code with PKCE (S256), dynamic client registration, consent in the admin, signed in as usual (API tokens cannot give it), access tokens valid 7 days, rotating refresh tokens valid 90 days.
- `/mcp` refuses requests from browser pages of other sites (Origin check).
- `upload_image` only downloads from public https addresses: every address a name resolves to is checked when connecting, redirects included; at most 15 MB, images only.
- Everything an assistant does is in the activity log, as the user, through the token.
