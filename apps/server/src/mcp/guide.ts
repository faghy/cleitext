/**
 * What an AI assistant reads before writing content (tool `get_block_guide`):
 * how Cleitext stores pages as blocks, the core blocks and how to send them.
 * The theme's own guide and the site's patterns are added to it.
 */
export const BLOCK_GUIDE = `# Writing content for Cleitext

Pages and posts are made of **blocks**, as in the WordPress block editor (Gutenberg).
Whatever you send is converted into blocks and validated: people then edit it in the
block editor, so build with blocks, never with one big HTML block.

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

## Core blocks

| Block | Use | Useful attributes |
| --- | --- | --- |
| core/paragraph | Text; inline <strong>, <em>, <code>, <a href> | className, align |
| core/heading | Titles: one level 1 per page (usually the page title), then 2, 3 | level, className |
| core/list, core/list-item | Bulleted or numbered lists | ordered |
| core/quote | A quotation, with its citation | className |
| core/image | An image: use the id and url of uploaded media (tool upload_image) | id, url, alt, className |
| core/buttons, core/button | Calls to action; className "is-style-outline" for secondary | url |
| core/columns, core/column | Side by side content (stacked on phones) | width (column) |
| core/group | A container, e.g. a page section | className, align ("full"), tagName ("section") |
| core/code | Code or commands | |
| core/embed | A video or post from YouTube, Vimeo… by URL | url |
| core/separator, core/spacer | Visual breaks | height (spacer) |

## Good practice

- Write in the language of the entry (see get_site: languages); add a translation with
  \`translation_of\` instead of mixing languages on one page.
- Short paragraphs, meaningful headings in order, alt text on every image.
- Prefer the theme's sections and the site's patterns (below) to ad-hoc layouts.
- New entries are **drafts**: give the user the preview link; publish only when asked.
`;
