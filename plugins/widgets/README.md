# Widgets

The official Cleitext plugin for blog widgets. It is not in the base package: install it from **Plugins → Add New** (catalog), or download `cleitext-plugin-widgets-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

Its blocks go anywhere blocks go: pages, posts, patterns and the theme's areas (sidebars, footers). They are in the **Widgets** group of the inserter.

## The blocks

- **Recent posts**: the latest posts as a **list** (small pictures beside the titles), a **grid** (1 to 4 columns) or a **magazine** (a large first post with its excerpt, the others beside it). Optionally only the posts of some **categories** or **tags** (their slugs, separated by commas), ordered by date, last update, title or at random, with or without featured image, date, author and excerpt. The post being read is left out. With a single category or tag, the title links to its archive; with several and **A tab for each category or tag**, the posts are in tabs ("All" first, then one for each, with a link to its archive), switched without JavaScript. In the magazine the other posts are cards or a **compact list** with small pictures, and the first post can sit **on the left** of the list; in narrow boxes, such as a column of a third, it always goes above a compact list. **Title link** sends the title anywhere (e.g. a category other than the tabs').
- **Recent comments**: the latest approved comments, with their author, post, date and the start of the text.
- **Tag cloud**: the most used tags (or categories), larger the more posts they have, with the smallest and largest sizes and, if you like, the number of posts.
- **Categories**: the categories (or tags) with links to their archives, the number of posts and the subcategories under their parent. Those without posts are hidden unless you want them.
- **Search form**: a search box for the site, with its label, placeholder and button text.

The **Title** of each block is the default one ("Recent posts", "Categories"…, in the page's language) when left empty; write `-` for none. The lists follow the page's language and refresh by themselves when posts, comments or terms change. They take the theme's fonts and colors; one small stylesheet is added only to the pages that use them, and no JavaScript.

## WordPress

The WordPress importer turns the blocks _Latest Posts_, _Latest Comments_, _Tag Cloud_, _Categories List_ and _Search_ into these blocks, with the same options. Install this plugin to show them.

Plugin API 1.22: blocks (`blocks`), published entries and term counts (`content:read`), comments (`comments`) and the stylesheet (`theme:hooks`).
