# Classic Editor

The classic editor of WordPress for Cleitext (GPL-2.0-or-later). It adds **Edit with Classic Editor** to every content type: posts, pages and the types of other plugins. Install it from **Plugins → Add New** (catalog), or upload `cleitext-plugin-classic-editor-<version>.zip` from the Releases page, and activate it.

Needs plugin API 1.11 or later (editors for entries).

## The editing screen

As in WordPress before the block editor:

- **Add Media** above the editor opens the media library: upload files, pick a picture and set its alternative text, caption, alignment (none, left, center, right), link (none, the media file or an address) and size (thumbnail, medium, large or full). Other files are inserted as a link.
- **Visual** shows the content as it looks, with two rows of buttons. The first: paragraph and heading formats (Paragraph, Heading 1–6, Preformatted), bold, italic, bulleted and numbered lists, quote, align left, center and right, insert and remove a link, the **Read More** tag, full screen and **Toolbar Toggle**, which shows or hides the second row: strikethrough, horizontal line, text color, paste as text, clear formatting, special characters, decrease and increase indent, undo, redo and the keyboard shortcuts.
- **Text** shows the HTML. Paragraphs are written as text separated by a blank line and a single new line is a line break, as in WordPress (`wpautop`): there is no need to type `<p>` and `<br>`. The buttons above it insert tags: `b`, `i`, `link`, `b-quote`, `del`, `ins`, `img`, `ul`, `ol`, `li`, `code`, `more` and **close tags**. With text selected, a button wraps it; without, it opens the tag and the next click closes it.
- **Word count** below the editor, for both tabs.

The editor remembers the last tab used and whether the second row is shown (in the browser). When the content may only be read (no permission, or someone else is editing it), the editor and its buttons are read-only.

## Where the content is stored

The content is **still saved as blocks** (CXD): the Visual and Text tabs are only another way to write them, so revisions, autosaves, translations, search, the AI assistants and the themes keep working. The document carries `editor: { id: "classic" }`, so the entry always opens with the classic editor; **Use the block editor** in the settings goes back to the block editor with the same blocks.

| Classic HTML                                                               | Block                                     |
| -------------------------------------------------------------------------- | ----------------------------------------- |
| paragraph (`<p>`, with its alignment)                                      | Paragraph                                 |
| `<h1>`–`<h6>` (with their alignment)                                       | Heading                                   |
| `<ul>`, `<ol>`, nested lists                                               | List, List item                           |
| `<blockquote>` with a final `<cite>`                                       | Quote (with its citation)                 |
| `<pre>`                                                                    | Code                                      |
| `<img>` (`alignleft`/`aligncenter`/`alignright`, a link, a `<figcaption>`) | Image (the media id is kept in `data-id`) |
| `<table>` (head, body, foot, caption, spans, cell alignment)               | Table                                     |
| `<hr>`                                                                     | Separator                                 |
| an address alone on its line (YouTube, Vimeo, Dailymotion, Spotify)        | Embed                                     |
| `<!--more-->`                                                              | Custom HTML with the More tag             |
| any other element (`<div>`, `<iframe>`, `<form>`…)                         | Custom HTML                               |

Blocks with no classic equivalent — columns, groups, buttons, galleries, spacers, synced patterns and the blocks of plugins — are shown as a grey **Block: …** box. It cannot be edited here, but it can be moved or deleted, and it comes back exactly as it was when the page is saved. Edit those blocks with the block editor. The same happens to custom HTML that the visual editor would change (scripts, frames, forms).

Blocks keep their ids, and the settings HTML cannot show (colors, spacing, drop caps…) are kept from the block they come from.

## Limitations

- Bold, italic, strikethrough, code, superscript, subscript, highlight, text color and links are kept; other inline formatting (e.g. `<ins>`, font sizes) keeps its text only.
- The More tag is kept in the content, but excerpts are not cut there yet.
- Image sizes set the width and height of the same file: the media library has no smaller copies to choose from.

## Credits and licenses

- The editing experience reproduces WordPress's [Classic Editor](https://wordpress.org/plugins/classic-editor/) plugin (GPLv2 or later); no WordPress code is used.
- The visual editor is [TinyMCE](https://www.tiny.cloud/) 7.9 (GPL-2.0-or-later, © Ephox Corporation DBA Tiny Technologies, Inc., used under its open-source license), bundled with its skin and icons, so nothing is loaded from other sites. TinyMCE includes [DOMPurify](https://github.com/cure53/DOMPurify) (Apache-2.0 or MPL-2.0). Their license notices are in `dist/admin.js.LEGAL.txt`.
- The Italian strings of the TinyMCE interface used here are our own.
