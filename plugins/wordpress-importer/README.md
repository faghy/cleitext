# WordPress Importer

The official Cleitext plugin to move a WordPress site in from the admin, without the command line. It is not in the base package: install it from **Plugins → Add New** (catalog), or download `cleitext-plugin-wordpress-importer-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

## How to use it

1. In WordPress, open **Tools → Export**, choose **All content** and press **Download Export File** (an `.xml` file).
2. In Cleitext, open **Import from WordPress**, choose the file, the language of the content (on multilingual sites) and the role of the imported authors, and press **Import**.
3. The import runs in the background: you can leave the page. At the end a report shows what was created, what was already there, and what was adapted or left out.

## What it imports

Posts, pages, images and other media, categories, tags, menus and authors, with dates, drafts, parent pages and featured images. Block content stays made of blocks; classic content is split into paragraphs and headings like WordPress does. The old addresses (`/2024/05/my-post/`, `/?p=12`) redirect to the new pages.

- Block settings of recent WordPress versions stay: text alignment, preset text sizes, rows and grids of groups (flex and grid layouts), columns aligned vertically or kept side by side on phones.
- **Covers** become a group with the picture followed by the content; with **Prisma** active they become a container with the picture as background, the overlay, the height and the position of the content, as in WordPress.
- Pages built with **Elementor** become **Fresco** pages: sections, columns and containers, the widgets (free, Pro and atomic) with their texts, links, images, global colors and fonts, typography, spacing, per-device values, hover states, motion effects and dynamic tags, and the page settings. Widgets with no Fresco counterpart keep their text and are listed in the report. Activate Fresco to show and edit them.
- Elementor's **kit** goes to Fresco's site settings, and its **Theme Builder templates** and popups, custom code and custom fonts to **Fresco Pro** (activate it before importing to keep the templates).
- Sites translated with **WPML**: on a site with several languages (Multilingual plugin), pages and posts that are translations of each other are recognised (WordPress exports them with the same address) and imported in their language, linked as translations. The language of each is guessed from its text among the site's languages: check them after the import.
- Blocks of other plugins that show posts filtered by category or tag keep their filter: the WordPress term ids become the imported terms.
- Nothing already on the site is overwritten: importing the same file twice adds nothing new. Posts and pages imported before (same type, language, address and title) are kept as they are and get only the comments they lack; menus with the same name are not added again.
- Media files are downloaded from the WordPress site, only from public addresses: keep the old site online until the import ends.
- Authors get an account without a password, as members of the site with the chosen role; they set a password with **Forgot password**.
- Comments come along with their threads (approved, waiting and spam); pingbacks, trackbacks and trashed comments are counted in the report. Custom post types of other plugins (WooCommerce products…) are counted and not imported; shortcodes stay as text.

Only administrators can use it (capability `import_wordpress`).

Plugin API 1.8: it reads the WordPress export itself and imports the result with `ctx.transfer.importDocument` (permission `import`); the upload comes through `request.file()`.
