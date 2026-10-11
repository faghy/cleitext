# AI assistants (MCP)

> 🇮🇹 [Leggi in italiano](./it/MCP.md)

Cleitext is an **MCP server**: people connect their own AI assistant (Claude, ChatGPT, Cursor, Claude Code…) to the site and ask it to write pages and posts. The assistant works with the blocks of the editor and the sections of the theme, with the permissions of the person who connected it. Cleitext calls no AI service itself and needs no API key.

## Turn it on

In **Settings → AI assistants (MCP)**, check _Let AI assistants work on this site_ and save. The address to give the assistant is shown there: `https://<your site>/mcp`. Until it is on, `/mcp` and the OAuth endpoints answer 404.

## Connect an assistant

**With OAuth** (claude.ai, ChatGPT and other apps with "custom connectors"): add a connector with the address `https://<your site>/mcp`. The assistant registers itself, opens the Cleitext sign-in, and asks you to allow access: reading content, creating and changing drafts, and — only if you check it and your role can publish — publishing.

**With a token** (Claude Code, Cursor, scripts): create a token in **Profile → API tokens** (_Can make changes_, and _Can publish_ if wanted), then for example:

```bash
claude mcp add --transport http cleitext https://example.com/mcp --header "Authorization: Bearer ctx_…"
```

Each connection is an API token of your account: it is listed in **Profile → API tokens** (OAuth ones are named "<assistant> (MCP)"), and revoking it disconnects the assistant.

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

Content is sent as **WordPress block markup** (`<!-- wp:heading -->…`), plain HTML or Cleitext blocks; it is converted and validated like everything saved in the editor, so the result always opens in the block editor. Nothing is deleted by an assistant.

## For theme authors

Add `aiGuide` (Markdown) to the theme definition: how pages are built with the theme, its sections and classes and when to use them. Assistants read it with `get_block_guide`, together with the patterns of the site — the best way to make them build in the theme's style.

## Security

- The assistant acts as the user: it can never do more than the user's role.
- Read-only connections cannot change anything; publishing needs its own permission.
- OAuth: authorization code with PKCE (S256), dynamic client registration, consent on the site's own page, access tokens valid 7 days, rotating refresh tokens valid 90 days.
- `/mcp` refuses requests from browser pages of other sites (Origin check).
- `upload_image` only downloads from public https addresses: every address a name resolves to is checked when connecting, redirects included; at most 15 MB, images only.
- Everything an assistant does is in the activity log, as the user, through the token.
