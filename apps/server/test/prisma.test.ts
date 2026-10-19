/**
 * Prisma, the design blocks library (official plugin): blocks drawn on the
 * site with their CSS, the site-wide defaults, and pages built with Spectra
 * imported from WordPress as Prisma blocks.
 */
import { readFileSync } from 'node:fs';
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));
/** Assets are served under the plugin's version. */
const ASSETS = `/plugin-assets/prisma/${(JSON.parse(readFileSync(join(pluginsRoot, 'prisma', 'cleitext.plugin.json'), 'utf8')) as { version: string }).version}`;

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let visitor: TestClient;

async function install(slug: string, pluginsPath: string) {
  const source = join(await mkdtemp(join(tmpdir(), `${slug}-src-`)), slug);
  await buildPlugin(join(pluginsRoot, slug));
  await cp(join(pluginsRoot, slug), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
}

async function page(title: string, blocks: unknown[]): Promise<string> {
  const created = await admin.post('/api/v1/entries', {
    type: 'page',
    title,
    document: { schema: 1, blocks },
  });
  expect(created.statusCode, created.body).toBe(201);
  const published = await admin.post(`/api/v1/entries/${created.json().id}/publish`);
  return (await visitor.get(`/${published.json().slug as string}`)).body;
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install('prisma', pluginsPath);
  await install('wordpress-importer', pluginsPath);
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'prisma');
  await seedUser(owner, {
    email: 'admin@prisma.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.73.0.1');
  visitor = new TestClient(app, site.host, '10.73.0.2');
  await admin.login('admin@prisma.test', PASSWORD);
  for (const slug of ['prisma', 'wordpress-importer']) {
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`)).statusCode).toBe(200);
  }
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('Prisma blocks', () => {
  it('draws a full-width container with boxed content, its children and its CSS', async () => {
    const html = await page('Container', [
      {
        id: 'c1',
        type: 'prisma/container',
        v: 1,
        attrs: {
          blockId: 'abc12345',
          isBlockRootParent: true,
          directionDesktop: 'row',
          topPaddingMobile: 40,
          backgroundType: 'color',
          backgroundColor: '#123456',
          bottomType: 'waves',
          bottomColor: '#ffffff',
        },
        children: [
          { id: 'p1', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Inside' }] },
        ],
      },
    ]);
    expect(html).toMatch(
      /<div class="wp-block-prisma-container pr-container pr-block-abc12345 alignfull pr-is-root"><div class="pr-container__shape pr-container__shape-bottom pr-container__shape-above pr-container__invert"><svg[^>]*viewBox="0 0 1000 100"[^>]*>[\s\S]*?<\/svg><\/div><div class="pr-container__inner"><p>Inside<\/p><\/div><\/div>/,
    );
    // The site's defaults: content width, padding and gaps.
    expect(html).toContain(
      '.pr-container.pr-is-root.alignfull.pr-block-abc12345 > .pr-container__inner{--inner-content-custom-width:min(100%, 1140px);max-width:var(--inner-content-custom-width);width:100%;flex-direction:row;align-items:center;justify-content:center;flex-wrap:nowrap;row-gap:20px;column-gap:20px}',
    );
    expect(html).toContain('padding-top:10px');
    expect(html).toContain('background-color:#123456');
    expect(html).toContain('fill:rgba(255,255,255,1)');
    expect(html).toMatch(
      /@media \(max-width:767px\)\{[^@]*\.pr-block-abc12345\.pr-container\{padding-top:40px/,
    );
    expect(html).toContain('<link rel="stylesheet" href="/plugin-assets/prisma/');

    // Changing the defaults changes the containers left at default.
    const saved = await admin.request('PATCH', '/api/v1/plugins/prisma/settings', {
      contentWidth: 1200,
      containerPadding: 0,
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const again = await page('Container again', [
      {
        id: 'c2',
        type: 'prisma/container',
        v: 1,
        attrs: { blockId: 'def67890', isBlockRootParent: true },
        children: [],
      },
    ]);
    expect(again).toContain('--inner-content-custom-width:min(100%, 1200px)');
    expect(again).toContain('padding-top:0');
  });

  it('draws an image with a mask, an overlay heading and a link', async () => {
    const html = await page('Image', [
      {
        id: 'i1',
        type: 'prisma/image',
        v: 1,
        attrs: {
          blockId: 'img00001',
          url: 'https://example.com/a.jpg',
          alt: 'A lake',
          width: 600,
          layout: 'overlay',
          heading: [{ text: 'Lake ' }, { text: 'Como', marks: ['bold'] }],
          href: 'https://example.com/lake',
          maskShape: 'circle',
          imageBorderStyle: 'solid',
          imageBorderTopWidth: 2,
          imageBorderColor: '#000000',
          height: 500,
        },
      },
    ]);
    expect(html).toContain(
      'class="wp-block-prisma-image pr-image pr-block-img00001 pr-image--layout-overlay pr-image--effect-static pr-image--align-none"',
    );
    expect(html).toMatch(
      /<a href="https:\/\/example\.com\/lake" rel="noopener"><img src="https:\/\/example\.com\/a\.jpg" alt="A lake" width="600"/,
    );
    expect(html).toContain('<h2 class="pr-image__heading">Lake <strong>Como</strong></h2>');
    expect(html).toContain('mask-image:url("data:image/svg+xml,');
    expect(html).toContain('border-top-width:2px');
    expect(html).toContain('width:600px');
    // Lazy images keep their attributes' proportions, as with WordPress's sizes="auto".
    expect(html).toContain('aspect-ratio:600 / 500');
  });

  it('draws a gallery carousel with its lightbox and its script', async () => {
    const html = await page('Gallery', [
      {
        id: 'g1',
        type: 'prisma/gallery',
        v: 1,
        attrs: {
          blockId: 'gal00001',
          feedLayout: 'carousel',
          imageClickEvent: 'lightbox',
          imageDisplayCaption: true,
          mediaGallery: [
            { id: 1, url: 'https://example.com/1.jpg', alt: 'One', caption: 'First' },
            { id: 2, url: 'https://example.com/2.jpg', alt: 'Two', caption: '' },
          ],
        },
      },
    ]);
    expect(html).toContain('class="wp-block-prisma-gallery pr-gallery-block pr-block-gal00001"');
    expect(html).toContain('pr-gallery pr-gallery--carousel');
    expect(html).toContain('data-pr-gallery=');
    expect(html).toContain('<div class="pr-gallery__track">');
    expect(html).toContain('alt="One"');
    expect(html).toContain('First');
    expect(html).toContain('class="pr-lightbox"');
    expect(html).toContain(`${ASSETS}/gallery.js`);
  });

  it('imports pages built with Spectra as Prisma blocks', async () => {
    const content = [
      '<!-- wp:uagb/container {"block_id":"9ccf5722","innerContentWidth":"alignfull","minHeightDesktop":700,"backgroundType":"image","backgroundImageDesktop":{"id":309,"url":"https://old.example.com/wp-content/uploads/2025/04/18-1024x768.webp","sizes":{"full":{"url":"x"}}},"backgroundImageColor":"#000000","overlayType":"color","overlayOpacity":0.6,"isBlockRootParent":true,"UAGAnimationType":"zoom-in","UAGHideMob":true} -->',
      '<div class="wp-block-uagb-container uagb-block-9ccf5722 alignfull uagb-is-root-container">',
      '<!-- wp:uagb/image {"block_id":"f61fd18f","url":"https://old.example.com/wp-content/uploads/2025/04/pic.jpg","layout":"overlay","maskShape":"hexagon"} -->',
      '<div class="wp-block-uagb-image uagb-block-f61fd18f"><figure class="wp-block-uagb-image__figure"><img src="https://old.example.com/wp-content/uploads/2025/04/pic.jpg" alt="Rooms"/><div class="wp-block-uagb-image--layout-overlay__color-wrapper"></div><div class="wp-block-uagb-image--layout-overlay__inner center-center"><h2 class="uagb-image-heading">Pernottamento</h2></div></figure></div>',
      '<!-- /wp:uagb/image -->',
      '<!-- wp:paragraph {"textColor":"ast-global-color-0"} --><p class="has-ast-global-color-0-color has-text-color">Welcome <a style="color:#4A4A4A;" href="tel:+39">+39</a></p><!-- /wp:paragraph -->',
      '<!-- wp:html --><iframe src="https://www.google.com/maps/embed?pb=1" width="600" height="450"></iframe><!-- /wp:html -->',
      '<!-- wp:uagb/advanced-heading {"block_id":"54dbe4be","classMigrate":true,"headingAlign":"center","headFontFamily":"Poiret One","headLoadGoogleFonts":true} -->',
      '<div class="wp-block-uagb-advanced-heading uagb-block-54dbe4be"><h2 class="uagb-heading-text">Cocktails <mark class="uagb-highlight">twist</mark></h2></div>',
      '<!-- /wp:uagb/advanced-heading -->',
      '<!-- wp:uagb/info-box {"classMigrate":true,"headingTag":"h1","headFontSize":100,"headFontSizeMobile":60,"block_id":"4599409c","seperatorStyle":"solid","seperatorColor":"#c06e52","seperatorWidth":12,"showIcon":false,"showPrefix":true} -->',
      '<div class="wp-block-uagb-info-box uagb-block-4599409c uagb-infobox__content-wrap  uagb-infobox-icon-above-title uagb-infobox-image-valign-top"><div class="uagb-ifb-content"><div class="uagb-ifb-title-wrap"><span class="uagb-ifb-title-prefix">Al</span><h1 class="uagb-ifb-title">Duomo</h1></div><div class="uagb-ifb-separator"></div><p class="uagb-ifb-desc">Atmosfera senza tempo</p></div></div>',
      '<!-- /wp:uagb/info-box -->',
      '<!-- wp:uagb/buttons {"block_id":"c8e849a6","classMigrate":true,"childMigrate":true,"gap":90} -->',
      '<div class="wp-block-uagb-buttons uagb-buttons__outer-wrap uagb-btn__default-btn uagb-block-c8e849a6"><div class="uagb-buttons__wrap uagb-buttons-layout-wrap ">',
      '<!-- wp:uagb/buttons-child {"block_id":"a5590b23","label":"Contattaci","link":"tel:3454674236","btnBorderTopLeftRadius":12,"btnBorderStyle":"solid","UAGAnimationType":"fade-right"} -->',
      '<div class="wp-block-uagb-buttons-child uagb-buttons__outer-wrap uagb-block-a5590b23 wp-block-button"><div class="uagb-button__wrapper"><a class="uagb-buttons-repeater wp-block-button__link" href="tel:3454674236" rel="follow noopener" target="_self" role="button"><div class="uagb-button__link">Contattaci</div></a></div></div>',
      '<!-- /wp:uagb/buttons-child -->',
      '</div></div><!-- /wp:uagb/buttons -->',
      '</div>',
      '<!-- /wp:uagb/container -->',
      '<!-- wp:uagb/image-gallery {"block_id":"0a1b2c3d","mediaGallery":[{"id":41,"url":"https://old.example.com/wp-content/uploads/2025/04/g1.jpg","alt":"Pool","caption":"La piscina"}],"mediaIDs":[41],"feedLayout":"masonry","imageClickEvent":"lightbox","readyToRender":true} /-->',
      '<!-- wp:uagb/unknown-thing --><div>Kept</div><!-- /wp:uagb/unknown-thing -->',
    ].join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wfw="http://wellformedweb.org/CommentAPI/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Old</title><link>https://old.example.com</link><wp:wxr_version>1.2</wp:wxr_version><wp:base_site_url>https://old.example.com</wp:base_site_url>
<item><title>Home</title><link>https://old.example.com/</link><dc:creator><![CDATA[admin]]></dc:creator>
<content:encoded><![CDATA[${content}]]></content:encoded><wp:post_id>7</wp:post_id><wp:post_date>2025-04-15 10:00:00</wp:post_date><wp:post_date_gmt>2025-04-15 10:00:00</wp:post_date_gmt><wp:post_name>home</wp:post_name><wp:status>publish</wp:status><wp:post_type>page</wp:post_type></item>
</channel></rss>`;
    const started = await admin.upload(
      '/api/v1/ext/wordpress-importer/imports?locale=en',
      'export.xml',
      Buffer.from(xml),
      'text/xml',
    );
    expect(started.statusCode, started.body).toBe(202);
    let job: { status: string; report?: { warnings: string[]; errors: string[] } } = {
      status: 'running',
    };
    for (let i = 0; i < 200 && job.status === 'running'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      job = (await admin.get('/api/v1/ext/wordpress-importer/status')).json().job;
    }
    expect(job.status, JSON.stringify(job)).toBe('done');
    expect(job.report!.warnings.join('\n')).toContain(
      'Block uagb/unknown-thing has no equivalent (1×)',
    );

    const html = (await visitor.get('/home')).body;
    expect(html).toContain(
      'class="wp-block-prisma-container pr-container pr-block-9ccf5722 alignfull pr-is-root"',
    );
    expect(html).toContain(
      'class="wp-block-prisma-image pr-image pr-block-f61fd18f pr-image--layout-overlay',
    );
    expect(html).toContain('<h2 class="pr-image__heading">Pernottamento</h2>');
    expect(html).toContain('alt="Rooms"');
    // Palette colors, inline link colors and custom HTML (a map) of the core blocks.
    expect(html).toContain(
      '<p class="has-ast-global-color-0-color has-text-color">Welcome <a href="tel:+39" style="color:#4A4A4A">+39</a></p>',
    );
    expect(html).toContain('<iframe src="https://www.google.com/maps/embed?pb=1"');
    expect(html).toContain('<p>Kept</p>');
    // The overlay of the background, and the mask.
    expect(html).toMatch(
      /\.pr-block-9ccf5722::before\{content:"";position:absolute;pointer-events:none;top:-0px;left:-0px;width:calc\(100% \+ 0px\);height:calc\(100% \+ 0px\)[^}]*background:#000000;opacity:0\.6\}/,
    );
    expect(html).toContain('min-height:700px');
    // Heading with its highlight, info box, buttons with an entrance animation.
    expect(html).toContain('<h2 class="pr-heading__text">Cocktails <mark>twist</mark></h2>');
    expect(html).toContain('font-family:"Poiret One"');
    expect(html).toContain(
      'href="https://fonts.googleapis.com/css2?family=Poiret+One:wght@400;700&amp;display=swap"',
    );
    expect(html).toContain(
      '<span class="pr-info-box__prefix">Al</span><h1 class="pr-info-box__title">Duomo</h1>',
    );
    expect(html).toContain(
      '<div class="pr-info-box__separator"></div><p class="pr-info-box__desc">Atmosfera senza tempo</p>',
    );
    expect(html).toContain('font-size:100px');
    expect(html).toMatch(
      /<div class="pr-buttons__wrap">[\s\S]*?<a class="pr-button__link wp-block-button__link" href="tel:3454674236" rel="noopener"><span class="pr-button__text">Contattaci<\/span><\/a>/,
    );
    expect(html).toContain('data-pr-animation="fade-right"');
    expect(html).toContain(`${ASSETS}/animations.js`);
    expect(html).toContain('gap:90px');
    expect(html).toContain('pr-gallery pr-gallery--masonry');
    expect(html).toContain('alt="Pool"');
    expect(html).not.toContain('uagb');
  });
});
