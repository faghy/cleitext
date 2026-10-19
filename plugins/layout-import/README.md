# Layout Import

The official Cleitext plugin to bring pages of a WordPress site laid out with the old theme's layout builder — the one that stores each page as `[av_…]` shortcodes (`[av_section]`, `[av_one_half]`, `[av_textblock]`…) — into **native blocks** of the block editor. After the conversion every page is edited with the normal block editor: no page builder is needed. It is free and not in the base package: install it from **Plugins → Add New** (catalog), or download `cleitext-plugin-layout-import-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

## How it works

Open **Tools → Layout import**.

1. **Options.** The color of the old theme's headings and whether they were in capitals (the export does not say it: headings without a color of their own get these), the address of the old site (its links become links of this site; read from the export when there is one), and whether to publish again the converted entries that were published.
2. **Choose the source.**
   - **From a WordPress export**: upload the export of the old site (WordPress: Tools → Export → All content). It is read in your browser. Every page, post or portfolio item laid out with `[av_…]` shortcodes is matched with the entry of this site that has the same type and slug (as the WordPress importer created them). Links to pages and posts by id, categories, tags and images by attachment id are resolved with the export.
   - **Pages of this site with `[av_…]` text**: for sites already imported where the shortcodes stayed as text in the paragraphs (the WordPress importer keeps unknown shortcodes as text). The text of the blocks is put back together and converted. Without the export, links to ids of the old site cannot be resolved.
3. **Check the preview.** For each entry: how many elements it had and how many blocks it becomes, and what could not be kept exactly (elements left out, shown with simpler blocks, unknown shortcodes, background images, images not in the media library).
4. **Convert** one entry or all of them. Each entry gets the blocks as a **new revision**: a published page keeps showing its old content until you check it and publish it (or choose to publish again in the options), and the earlier content stays in **Revisions**, so it can be restored. Entries someone else is editing are skipped.

Images are looked up in this site's media library by file name (size suffixes such as `-300x200` ignored), so the files imported with the WordPress importer are used; images not found keep their address on the old site and are reported.

## What becomes what

| Shortcodes                                                                                       | Blocks                                                                          |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `av_section`                                                                                     | Group, full width, with its background color and padding                        |
| `av_one_full`, `av_one_half`, `av_one_third`… (`first` starts a row)                             | Columns with their widths, vertical alignment, background color and padding     |
| `av_layout_row` with `av_cell_…`                                                                 | Columns, full width                                                             |
| `av_textblock`                                                                                   | Paragraphs, headings, lists, quotes, images… (its text size and color kept)     |
| `av_heading`                                                                                     | Heading (level, alignment, color, size, link) and its subheading as a paragraph |
| `av_hr`                                                                                          | Separator, or Spacer for invisible ones                                         |
| `av_button`, `av_buttonrow`, `av_button_big`                                                     | Buttons                                                                         |
| `av_image`                                                                                       | Image (alignment, link, caption)                                                |
| `av_gallery`, `av_masonry_gallery`, `av_horizontal_gallery`, `av_partner`                        | Gallery                                                                         |
| `av_slideshow`, `av_slideshow_full`, `av_fullscreen`, `av_slideshow_accordion`                   | Gallery of the slides, then their titles and texts                              |
| `av_video`                                                                                       | Embed                                                                           |
| `av_icon_box`, `av_iconlist`, `av_promobox`, `av_notification`, `av_team_member`                 | Groups of headings, paragraphs, lists and buttons with all their text           |
| `av_testimonials`                                                                                | Quotes, with name and role as citation                                          |
| `av_tab_container`, `av_toggle_container`, `av_tab_section`, `av_content_slider`, `av_timeline`  | A heading for each item, followed by its content                                |
| `av_icongrid`, `av_icon_circles`                                                                 | Columns of headings and texts                                                   |
| `av_table`, `av_catalogue`                                                                       | Table                                                                           |
| `av_codeblock`                                                                                   | Code                                                                            |
| `av_progress`, `av_animated_numbers`, `av_headline_rotator`, `av_image_hotspot`, `av_image_diff` | List, paragraphs, heading, image and columns (without the animations)           |

Maps, contact forms, post and portfolio lists (`av_blog`, `av_magazine`, `av_masonry_entries`, `av_portfolio`, `av_postslider`…), countdowns, sharing buttons and the audio player have no native block: they are left out and reported, so you can add them again with the blocks of other plugins (Maps, Forms, Widgets…). Unknown shortcodes keep their text and are reported. Icons, animations, background images and the theme's own styles are not kept.

## For developers

Plugin API 1.26: an admin page only, with no server part and no permissions of its own. It uses the core content and media API (`/api/v1/entries`, `/api/v1/media`) with the user's own permissions; the conversion (`src/convert.ts`) is a pure function from the shortcode text to core blocks, tested with Vitest.

## License

GPL-2.0-or-later.
