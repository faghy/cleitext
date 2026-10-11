# WordPress Importer

The official Cleitext plugin to move a WordPress site in from the admin, without the command line. It is not in the base package: install it from **Plugins → Add New** (catalog), or download `cleitext-plugin-wordpress-importer-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

## How to use it

1. In WordPress, open **Tools → Export**, choose **All content** and press **Download Export File** (an `.xml` file).
2. In Cleitext, open **Import from WordPress**, choose the file, the language of the content (on multilingual sites) and the role of the imported authors, and press **Import**.
3. The import runs in the background: you can leave the page. At the end a report shows what was created, what was already there, and what was adapted or left out.

## What it imports

Posts, pages, images and other media, categories, tags, menus and authors, with dates, drafts, parent pages and featured images. Block content stays made of blocks; classic content is split into paragraphs and headings like WordPress does. The old addresses (`/2024/05/my-post/`, `/?p=12`) redirect to the new pages.

- Nothing already on the site is overwritten: importing the same file twice adds nothing new.
- Media files are downloaded from the WordPress site, only from public addresses: keep the old site online until the import ends.
- Authors get an account without a password, as members of the site with the chosen role; they set a password with **Forgot password**.
- Custom post types of other plugins (WooCommerce products…) and comments are counted in the report and not imported; shortcodes stay as text.

Only administrators can use it (capability `import_wordpress`).

Plugin API 1.8: it reads the WordPress export itself and imports the result with `ctx.transfer.importDocument` (permission `import`); the upload comes through `request.file()`.
