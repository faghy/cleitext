# Prisma

The official Cleitext plugin for design blocks. It is not in the base package: install it from **Plugins → Add New** (catalog), or download `cleitext-plugin-prisma-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

Its blocks are edited in the block editor with a live preview. The settings are in the sidebar, in the **General**, **Style** and **Advanced** tabs. Values that change by device (sizes, spacing, columns) follow the desktop, tablet and mobile switcher at the top of the editor. The blocks are in the **Prisma** group of the inserter.

## The blocks

- **Container**: lays out other blocks in a row, a column or a grid, full width or boxed. Backgrounds can be a color, a gradient, an image or a video, with an overlay. It also takes a minimum height, a border, a shadow and shape dividers at the top and bottom (waves, curves, tilts, triangles…). Containers nest inside each other.
- **Heading**: a heading with a description, a separator and highlighted words, with its typography, colors, text shadow and background.
- **Image**: an image with a mask (circle, hexagon, blob…), a caption or a heading over it, hover effects and a link.
- **Info Box**: an icon or image, a prefix, a title, a description, a separator and a call to action (a link or a button).
- **Buttons**: buttons side by side or stacked, each with its icon, colors and hover colors, border and shadow.
- **Image Gallery**: images as a grid, a masonry, a carousel or tiles. Captions can show over the image or as a bar, and pagination or "load more" are available. A click can open the images in a lightbox, with thumbnails and a count.

Every block can also have an **entrance animation**, be **hidden on desktop, tablet or mobile**, and use **Google Fonts**.

**Settings → Prisma** holds the site's defaults:

- the content width of boxed containers;
- the padding of containers;
- the gap between elements;
- CSS variables, such as a color palette the blocks can use with `var(--name)`.

## WordPress

The WordPress importer turns the Spectra blocks _Container_, _Heading_, _Image_, _Info Box_, _Buttons_ and _Image Gallery_ into these blocks, keeping their settings. Activate this plugin **before** importing.

Plugin API 1.23: blocks with their own editor (`blocks`), the stylesheets and scripts of the site (`theme:hooks`), its own settings (`settings:own`) and media (`content:read`).
