# Prisma

The official Cleitext plugin for design blocks. It is not in the base package: install it from **Plugins → Add New** (catalog), or download `cleitext-plugin-prisma-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

Its blocks are edited in the block editor with a live preview. The settings are in the sidebar, in the **General**, **Style** and **Advanced** tabs. Values that change by device (sizes, spacing, columns) follow the desktop, tablet and mobile switcher at the top of the editor. The blocks are in the **Prisma** group of the inserter.

## The blocks

**Layout and basics.** Container (rows, columns or grids with backgrounds, overlays and shape dividers), Heading, Image (with masks), Image Gallery (grid, masonry, carousel, tiles, lightbox), Info Box, Buttons, Icon, Icon List, Separator.

**Content.** Call to Action, Marketing Button, Blockquote (with a share link), Counter (number, bar or circle), Countdown (to a date, or per visitor), Star Rating, Inline Notice (can be closed), Tabs, FAQ (accordion or grid, with FAQ structured data), Modal (opened by text, icon, image, button or automatically), Slider, Content Timeline, Table of Contents.

**People and business.** Testimonials (columns or carousel), Team, Social Share, Price List, Review (with review structured data), How-To (with HowTo structured data), Google Map, Lottie animation.

**Posts.** Post Grid (also as masonry), Post Carousel, Post Timeline and Taxonomy List, from the site's posts and categories, or from any content type (paintings, portfolio, real estate, events…): its custom fields can be shown under the title with their labels, entries can follow the manual order, and with the picture beside the text the sides can alternate. Buttons, page links and empty messages follow the page's language.

**Forms.** A form with name, email, phone, URL, text, select, radio, checkbox, toggle, date, hidden, upload and consent fields. Messages are sent by email to the addresses of the form, with a honeypot, a time check, a rate limit and optional reCAPTCHA v2/v3 against spam.

Every block can also have an **entrance animation**, be **hidden on desktop, tablet or mobile**, and use **Google Fonts**.

**Settings → Prisma** holds the site's defaults:

- the content width of boxed containers;
- the padding of containers;
- the gap between elements;
- CSS variables, such as a color palette the blocks can use with `var(--name)`;
- the address that receives the forms' messages when a form names none, and the reCAPTCHA keys.

## WordPress

The WordPress importer turns the Spectra blocks into these blocks, keeping their settings, including the older Section, Columns and Column layouts (as containers). Activate this plugin **before** importing. WordPress covers become containers with their background picture and overlay; the additional CSS classes of the blocks and WordPress's hiding by device (desktop, tablet, phone, with WordPress's breakpoints) are kept.

Plugin API 1.23: blocks with their own editor (`blocks`), the stylesheets and scripts of the site (`theme:hooks`), its own settings (`settings:own`), posts and media (`content:read`), comment counts (`comments`), the form's address (`routes:public`), its emails (`mail:send`) and the reCAPTCHA check (`network`).
