/**
 * What an AI assistant reads before writing content (tool `get_block_guide`):
 * Cleitext's rules for every entry (`CLEITEXT_GUIDE`), then the guide of the
 * editor it writes with: the block editor's (`BLOCK_GUIDE`) or a plugin
 * editor's (`ctx.ai.registerEditor`). The plugins' sections, the theme's
 * guide and the site's patterns are added to them.
 */
export const CLEITEXT_GUIDE = `# Writing for a Cleitext site

Cleitext is a CMS like WordPress. Pages, posts and other entries are documents of blocks,
edited afterwards by people who do not write code: what you build must stay editable for them.

## Rules

- **Editable by non-coders.** Use the editor's own elements (headings, paragraphs, lists, images,
  buttons, columns, groups…) styled with the theme's classes and the site's patterns. Never put a
  page in one big HTML block, and never write inline styles or scripts.
- **Keep the editor.** Each entry has an editor (get_entry: \`editor\`): the block editor
  (\`blocks\`) or a plugin's, such as the Fresco page builder (\`fresco\`) or the Classic Editor
  (\`classic\`). The tools keep it: write in its format (this guide, for the editor you asked) or send
  blocks that are converted to it. New entries use the editor of their type (get_site:
  \`content_types[].editor\`) unless you choose \`editor\`.
- **Drafts first.** create_entry makes drafts; changes to published entries are saved as a new
  revision that visitors see only once published. Show the preview link (preview_url) and publish
  (publish_entry) only when the user asks.
- **Read before changing.** update_entry replaces the whole body: read it with get_entry and send it
  back with your changes, keeping what should stay.

## A complete entry

- **Title** and an **address** (\`slug\`: lowercase words with dashes, in the entry's language).
- **Excerpt** (\`excerpt\`): one or two sentences, shown in lists, search results and social cards.
- **Featured image** (\`featured_media_id\`) on posts and pages whose type supports it
  (get_site: \`supports\` has \`featured_image\`): upload it with upload_image (with alt text) or find
  it with list_media.
- **SEO fields** when the site has an SEO plugin: get_site lists the custom fields of each type, e.g.
  \`seo.title\` and \`seo.description\` (SEO plugin) or \`vetta.title\`, \`vetta.description\` and
  \`vetta.keywords\` (Vetta SEO). Send them in \`fields\`, e.g.
  \`{"seo": {"title": "…", "description": "…"}}\`: search title up to about 60 characters,
  description about 150, in the entry's language. Leave noindex options alone unless asked.
- **Pages in a tree**: \`parent_id\` for subpages of hierarchical types.

## Languages

Write each entry in its own language (\`locale\`; get_site: \`languages\`). With the Multilingual
plugin, translate an entry with create_entry and \`translation_of\` (the id of the original) and
\`locale\`: the translation is linked to the original and keeps its editor; give it its own title,
address, excerpt and SEO fields in that language. Never mix languages on one page.

## Menus

set_menu sets the items of the menu at a theme location (get_site: \`theme.menuLocations\`) in a
language: link entries by id (\`entry_id\`) so links follow address changes; one menu per language.

## Images

Every image needs alternative text describing it. Use images of the media library (list_media) or
upload them from a public address (upload_image); use their \`id\` and \`url\`.
`;

export const BLOCK_GUIDE = `# Writing with the block editor

Pages and posts of the block editor are made of **blocks**, as in the WordPress block editor
(Gutenberg). Whatever you send is converted into blocks and validated.

## How to send content

Pass \`content\` as **WordPress block markup** (recommended), the format of Gutenberg:

\`\`\`html
<!-- wp:heading {"level":2} --><h2>Our services</h2><!-- /wp:heading -->
<!-- wp:paragraph --><p>We build <strong>fast</strong> sites.</p><!-- /wp:paragraph -->
<!-- wp:columns -->
<!-- wp:column --><!-- wp:paragraph --><p>Left</p><!-- /wp:paragraph --><!-- /wp:column -->
<!-- wp:column --><!-- wp:paragraph --><p>Right</p><!-- /wp:paragraph --><!-- /wp:column -->
<!-- /wp:columns -->
<!-- wp:buttons --><!-- wp:button {"url":"/contact"} -->
<div class="wp-block-button"><a class="wp-block-button__link" href="/contact">Contact us</a></div>
<!-- /wp:button --><!-- /wp:buttons -->
\`\`\`

Plain HTML (\`<h2>\`, \`<p>\`, \`<ul>\`, \`<img>\`, \`<blockquote>\`…) is accepted too and becomes
the matching blocks; block markup is better because it keeps classes and attributes.
Theme styles are applied with \`"className"\` in the block comment, e.g.
\`<!-- wp:group {"className":"cv-section cv-bg-soft","align":"full","tagName":"section"} -->\`.
You can also send \`blocks\` (CXD, as get_entry returns them) to keep ids and attributes exactly.

## Core blocks

| Block | Use | Useful attributes |
| --- | --- | --- |
| core/paragraph | Text; inline <strong>, <em>, <code>, <a href> | className, align |
| core/heading | Titles: the page title is level 1, so sections start at 2, then 3 | level, className |
| core/list, core/list-item | Bulleted or numbered lists | ordered |
| core/quote | A quotation, with its citation | className |
| core/image | An image: use the id and url of uploaded media (tool upload_image) | id, url, alt, className |
| core/gallery | Several images in a grid | columns |
| core/buttons, core/button | Calls to action; className "is-style-outline" for secondary | url |
| core/columns, core/column | Side by side content (stacked on phones) | width (column) |
| core/group | A container, e.g. a page section | className, align ("full"), tagName ("section") |
| core/table | Tabular data only, never for layout | |
| core/code | Code or commands | |
| core/embed | A video, post or profile by URL: YouTube, Vimeo, Dailymotion, Spotify, TikTok, Instagram, Facebook, X (other addresses show as a link card) | url |
| core/separator, core/spacer | Visual breaks | height (spacer) |
| core/html | Only for a small embed with no block (a form snippet, a map); never for text | |

## Good practice

- Short paragraphs, meaningful headings in order, alt text on every image.
- Build sections with groups and the theme's classes (below), or start from the site's patterns.
`;
