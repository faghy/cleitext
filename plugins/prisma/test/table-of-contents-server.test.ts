import { expect, it } from 'vitest';
import { buildTablesOfContents } from '../src/blocks/table-of-contents/server';

it('builds tables of contents in the page, touching nothing else', () => {
  const config = JSON.stringify({
    mapping: [false, true, true, false, false, false],
    list: false,
    depth: 5,
  }).replace(/"/g, '&quot;');
  const page =
    `<html><body><header><h2>Site menu</h2></header><main><div class="entry-content">` +
    `<div class="pr-toc" data-pr-table-of-contents="${config}"><div class="pr-toc__list-wrap"></div></div>` +
    `<h2 class="x">Rooms &amp; prices</h2><p>…</p><h3>Breakfast</h3><h2>Rooms &amp; prices</h2>` +
    `<h4>Not listed</h4><h2 class="pr-toc-hide-heading">Hidden</h2>` +
    `<script>if (a < b) {}</script></div></main></body></html>`;
  const out = buildTablesOfContents(page);
  expect(out).toContain(
    '<h2 class="x"><span id="rooms-prices" class="pr-toc__anchor"></span>Rooms &amp; prices</h2>',
  );
  expect(out).toContain('<h3><span id="breakfast" class="pr-toc__anchor"></span>Breakfast</h3>');
  expect(out).toContain(
    '<h2><span id="rooms-prices-2" class="pr-toc__anchor"></span>Rooms &amp; prices</h2>',
  );
  expect(out).toMatch(
    /<div class="pr-toc__list-wrap"><ol class="pr-toc__list">[\s\S]*href="#rooms-prices"[\s\S]*href="#breakfast"[\s\S]*href="#rooms-prices-2"/,
  );
  expect(out).not.toContain('Site menu</a>');
  expect(out).not.toContain('#not-listed');
  expect(out).not.toContain('#hidden');
  // The rest stays exactly as it was.
  expect(
    out
      .replace(/<span id="[^"]+" class="pr-toc__anchor"><\/span>/g, '')
      .replace(
        /<div class="pr-toc__list-wrap">[\s\S]*?<\/ol><\/div>/,
        '<div class="pr-toc__list-wrap"></div>',
      ),
  ).toBe(page);
  expect(buildTablesOfContents('<p>no table</p>')).toBe('<p>no table</p>');
});
