import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { attachmentDate, attachmentFiles, seoTemplate, uploadsPath, wxrToDocument } from './wxr';

// The export of a small WordPress site, shared with the core's import tests,
// which import the transfer document saved next to it.
const fixtures = new URL('../../../apps/server/test/fixtures/wxr/', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, fixtures), 'utf8');

/** Block ids and the export time change at every run: compared without them. */
const stable = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value), (key, v: unknown) =>
    (key === 'id' && typeof v === 'string' && v.startsWith('b_')) || key === 'exportedAt'
      ? undefined
      : v,
  );

describe('WordPress export to transfer document', () => {
  it('gives the document the core import tests use', () => {
    // Every comment, spam too: the core's tests import that one as spam.
    const { meta, users, ...result } = wxrToDocument(read('export.xml'), {
      locale: 'en',
      comments: 'all',
    });
    expect(stable(result)).toEqual(stable(JSON.parse(read('export.transfer.json'))));
    // Every author, with the role given and where it came from (1.34.0).
    expect(users.every((u) => u.role === 'author' && u.source === 'default')).toBe(true);
    // Every item goes to the plugins with its meta (plugin API 1.48).
    expect(meta.items.find((i) => i.ref === 'att:10')).toMatchObject({
      type: 'attachment',
      imported: true,
      meta: { _wp_attachment_image_alt: 'Boats in the harbour' },
    });
  });

  it('gives plugins every item’s post meta and every term’s term meta (import.wxrMeta)', () => {
    const cdata = (v: string) => `<![CDATA[${v}]]>`;
    const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Site</title><wp:wxr_version>1.2</wp:wxr_version><wp:base_blog_url>https://s.example.com</wp:base_blog_url>
<wp:author><wp:author_id>3</wp:author_id><wp:author_login>ann</wp:author_login><wp:author_email>ann@example.com</wp:author_email><wp:author_display_name>${cdata('Ann B.')}</wp:author_display_name></wp:author>
<wp:category><wp:term_id>5</wp:term_id><wp:category_nicename>news</wp:category_nicename><wp:cat_name>News</wp:cat_name><wp:termmeta><wp:meta_key>color</wp:meta_key><wp:meta_value>${cdata('#ff0000')}</wp:meta_value></wp:termmeta></wp:category>
<wp:term><wp:term_id>7</wp:term_id><wp:term_taxonomy>nav_menu</wp:term_taxonomy><wp:term_slug>main</wp:term_slug><wp:term_name>Main</wp:term_name></wp:term>
<item><title>Price</title><wp:post_id>11</wp:post_id><wp:post_name>field_price</wp:post_name><wp:status>publish</wp:status><wp:post_type>acf-field</wp:post_type><wp:post_parent>10</wp:post_parent><wp:menu_order>2</wp:menu_order><excerpt:encoded>price</excerpt:encoded><content:encoded>${cdata('a:1:{s:4:"type";s:6:"number";}')}</content:encoded></item>
<wp:term><wp:term_id>8</wp:term_id><wp:term_taxonomy>genre</wp:term_taxonomy><wp:term_slug>noir</wp:term_slug><wp:term_name>Noir</wp:term_name></wp:term>
<item><title>A book</title><wp:post_id>30</wp:post_id><wp:post_name>a-book</wp:post_name><wp:status>publish</wp:status><wp:post_type>book</wp:post_type><category domain="genre" nicename="noir"><![CDATA[Noir]]></category></item>
<item><title>Options</title><wp:post_id>12</wp:post_id><wp:post_name>options</wp:post_name><wp:status>publish</wp:status><wp:post_type>acf-ui-options-page</wp:post_type></item>
<item><title>A post</title><dc:creator>ann</dc:creator><wp:post_id>20</wp:post_id><wp:post_name>a-post</wp:post_name><wp:status>publish</wp:status><wp:post_type>post</wp:post_type><content:encoded>${cdata('<p>Hi</p>')}</content:encoded>
<wp:postmeta><wp:meta_key>price</wp:meta_key><wp:meta_value>12</wp:meta_value></wp:postmeta><wp:postmeta><wp:meta_key>_price</wp:meta_key><wp:meta_value>field_price</wp:meta_value></wp:postmeta><wp:postmeta><wp:meta_key>price</wp:meta_key><wp:meta_value>99</wp:meta_value></wp:postmeta></item>
</channel></rss>`;
    const { meta, document, warnings } = wxrToDocument(xml, { locale: 'en' });
    expect(meta.options).toBeNull();
    // Authors and the slugs of custom types and taxonomies (plugin API 1.49).
    expect(meta.authors).toEqual([
      { id: 3, login: 'ann', email: 'ann@example.com', displayName: 'Ann B.', ref: 'user:ann' },
    ]);
    expect(meta.types).toEqual({ book: 'book' });
    expect(meta.taxonomies).toEqual({ genre: 'genre' });
    expect(meta.items.map((i) => [i.ref, i.type, i.imported])).toEqual([
      ['post:11', 'acf-field', false],
      ['post:30', 'book', true],
      ['post:12', 'acf-ui-options-page', false],
      ['post:20', 'post', true],
    ]);
    expect(meta.items[0]).toMatchObject({
      id: 11,
      name: 'field_price',
      title: 'Price',
      excerpt: 'price',
      parent: 10,
      menuOrder: 2,
      content: 'a:1:{s:4:"type";s:6:"number";}',
    });
    // The first value of a key, as WordPress's get_post_meta( …, true ).
    expect(meta.items[3]!.meta).toEqual({ price: '12', _price: 'field_price' });
    expect(meta.terms.filter((t) => t.taxonomy !== 'genre')).toEqual([
      {
        ref: 'category:news',
        id: 5,
        taxonomy: 'category',
        slug: 'news',
        name: 'News',
        imported: true,
        meta: { color: '#ff0000' },
      },
      {
        ref: 'nav_menu:main',
        id: 7,
        taxonomy: 'nav_menu',
        slug: 'main',
        name: 'Main',
        imported: false,
        meta: {},
      },
    ]);
    // ACF's records are not content.
    expect(document.entries?.map((e) => e.ref)).toEqual(['post:30', 'post:20']);
    expect(document.contentTypes?.map((t) => t.slug)).toEqual(['book']);
    expect(warnings.join('\n')).not.toContain('acf');
  });

  it('reports what it cannot convert', () => {
    const { warnings, document } = wxrToDocument(read('export.xml'), {
      locale: 'it',
      authorRole: 'editor',
    });
    expect(warnings.join('\n')).toContain('1 WooCommerce product(s) were imported for Cleishop');
    expect(warnings.join('\n')).toContain('1 pingback(s)');
    expect(document.entries?.every((e) => e.locale === 'it')).toBe(true);
    expect(document.users?.[0]?.role).toBe('editor');
  });

  it('imports approved comments, all of them or none, never pingbacks', () => {
    const comment = (id: number, approved: string, type = 'comment') =>
      `<wp:comment><wp:comment_id>${id}</wp:comment_id><wp:comment_author>Ann</wp:comment_author><wp:comment_author_email>ann@example.com</wp:comment_author_email><wp:comment_date_gmt>2024-01-0${id} 10:00:00</wp:comment_date_gmt><wp:comment_content>Hi ${id}</wp:comment_content><wp:comment_approved>${approved}</wp:comment_approved><wp:comment_type>${type}</wp:comment_type><wp:comment_parent>0</wp:comment_parent></wp:comment>`;
    const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Blog</title><link>https://blog.example</link><wp:wxr_version>1.2</wp:wxr_version><wp:base_blog_url>https://blog.example</wp:base_blog_url>
<item><title>Hello</title><link>https://blog.example/hello/</link><wp:post_id>3</wp:post_id><wp:post_name>hello</wp:post_name><wp:post_type>post</wp:post_type><wp:status>publish</wp:status><wp:comment_status>closed</wp:comment_status><content:encoded><![CDATA[<p>Hi.</p>]]></content:encoded>
${comment(1, '1')}${comment(2, '0')}${comment(3, 'spam')}${comment(4, 'trash')}${comment(5, '1', 'pingback')}${comment(6, '1', 'trackback')}</item>
</channel></rss>`;
    const statuses = (comments?: 'approved' | 'all' | 'skip') => {
      const { document, warnings } = wxrToDocument(xml, {
        locale: 'en',
        ...(comments ? { comments } : {}),
      });
      return {
        statuses: (document.entries?.[0]?.comments ?? []).map((c) => c.status),
        warnings: warnings.join('\n'),
      };
    };

    const byDefault = statuses();
    expect(byDefault.statuses).toEqual(['approved']);
    expect(byDefault.warnings).toContain(
      '2 comment(s) waiting for approval or marked as spam were not imported',
    );
    expect(byDefault.warnings).toContain('2 pingback(s) and trackback(s) were not imported.');
    expect(byDefault.warnings).toContain('1 trashed comment(s) were not imported.');

    const all = statuses('all');
    expect(all.statuses).toEqual(['approved', 'pending', 'spam']);
    expect(all.warnings).not.toContain('waiting for approval');

    const none = statuses('skip');
    expect(none.statuses).toEqual([]);
    expect(none.warnings).toContain('4 comment(s) were not imported, as chosen.');
    expect(none.warnings).toContain('2 pingback(s) and trackback(s) were not imported.');
  });

  it('suggests addresses with a trailing slash when WordPress had them', () => {
    const site = (links: string[]) => `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Site</title><link>https://site.example</link><wp:wxr_version>1.2</wp:wxr_version><wp:base_blog_url>https://site.example</wp:base_blog_url>
${links
  .map(
    (link, i) =>
      `<item><title>P${i}</title><link>https://site.example${link}</link><wp:post_id>${i + 1}</wp:post_id><wp:post_name>p${i}</wp:post_name><wp:post_type>page</wp:post_type><wp:status>publish</wp:status><content:encoded><![CDATA[<p>x</p>]]></content:encoded></item>`,
  )
  .join('')}
</channel></rss>`;
    const hint = 'turn on “End addresses with a slash”';
    expect(
      wxrToDocument(site(['/tariffario-estivo/', '/about/team/']), { locale: 'it' }).warnings.join(
        '\n',
      ),
    ).toContain(hint);
    expect(
      wxrToDocument(site(['/tariffario-estivo', '/about/']), { locale: 'it' }).warnings.join('\n'),
    ).not.toContain(hint);
    // Not when the site already has the setting on.
    expect(
      wxrToDocument(site(['/tariffario-estivo/', '/about/team/']), {
        locale: 'it',
        trailingSlash: true,
      }).warnings.join('\n'),
    ).not.toContain(hint);
    expect(
      wxrToDocument(site(['/?page_id=1']), { locale: 'it' }).warnings.join('\n'),
    ).not.toContain(hint);
  });

  it('keeps SEO data, featured images and the types and taxonomies of themes', () => {
    const meta = (key: string, value: string) =>
      `<wp:postmeta><wp:meta_key>${key}</wp:meta_key><wp:meta_value><![CDATA[${value}]]></wp:meta_value></wp:postmeta>`;
    const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Agency</title><link>https://agency.example</link><wp:wxr_version>1.2</wp:wxr_version><wp:base_blog_url>https://agency.example</wp:base_blog_url>
<wp:term><wp:term_id>7</wp:term_id><wp:term_taxonomy>portfolio_category</wp:term_taxonomy><wp:term_slug>web</wp:term_slug><wp:term_name>Web</wp:term_name></wp:term>
<item><title>Logo</title><wp:post_id>5</wp:post_id><wp:post_type>attachment</wp:post_type><wp:status>inherit</wp:status><wp:attachment_url>https://agency.example/wp-content/uploads/logo.png</wp:attachment_url></item>
<item><title>Shop site</title><link>https://agency.example/portfolio/shop-site/</link><dc:creator>ann</dc:creator><wp:post_id>9</wp:post_id><wp:post_name>shop-site</wp:post_name><wp:post_type>portfolio</wp:post_type><wp:status>publish</wp:status><content:encoded><![CDATA[<p>A shop.</p>]]></content:encoded>
<category domain="portfolio_category" nicename="web"><![CDATA[Web]]></category>
${meta('_thumbnail_id', '5')}${meta('rank_math_title', '%title% %sep% %sitename%')}${meta('rank_math_description', 'Our work for a shop.')}${meta('rank_math_focus_keyword', 'shop site,ecommerce')}${meta('rank_math_robots', 'a:1:{i:0;s:7:"noindex";}')}</item>
<item><title>About</title><link>https://agency.example/about/</link><dc:creator>ann</dc:creator><wp:post_id>11</wp:post_id><wp:post_name>about</wp:post_name><wp:post_type>page</wp:post_type><wp:status>publish</wp:status><content:encoded><![CDATA[<p>Us.</p>]]></content:encoded>
${meta('_yoast_wpseo_title', 'About us %%sep%% %%sitename%%')}${meta('_yoast_wpseo_metadesc', 'Who we are.')}${meta('_yoast_wpseo_focuskw', 'web agency')}</item>
<item><title>Header</title><wp:post_id>12</wp:post_id><wp:post_type>elementor_library</wp:post_type><wp:status>publish</wp:status></item>
</channel></rss>`;
    const { document, warnings } = wxrToDocument(xml, { locale: 'en' });
    expect(document.contentTypes).toEqual([
      {
        slug: 'portfolio',
        name: { en: 'Portfolio' },
        hierarchical: false,
        permalink: '/portfolio/{slug}',
      },
    ]);
    expect(document.taxonomies).toEqual([
      {
        slug: 'portfolio_category',
        name: { en: 'Portfolio category' },
        hierarchical: false,
        contentTypes: ['portfolio'],
      },
    ]);
    const work = document.entries!.find((e) => e.ref === 'post:9')!;
    expect(work).toMatchObject({
      type: 'portfolio',
      featuredMediaRef: 'att:5',
      fields: {
        // Rank Math's own pattern: left to the site's.
        seo: {
          description: 'Our work for a shop.',
          keyphrase: 'shop site',
          noindex: true,
        },
      },
      terms: { portfolio_category: ['portfolio_category:web'] },
    });
    expect(document.entries!.find((e) => e.ref === 'post:11')!.fields).toEqual({
      seo: {
        title: 'About us - %%sitename%%',
        fullTitle: true,
        description: 'Who we are.',
        keyphrase: 'web agency',
      },
    });
    // WordPress's and builders' own records are neither content nor worth a warning.
    expect(document.entries!.some((e) => e.ref === 'post:12')).toBe(false);
    expect(warnings.join('\n')).not.toContain('elementor_library');
  });
});

describe('Yoast SEO titles', () => {
  it('keep the variables Cleitext’s SEO plugins know, under their names', () => {
    expect(seoTemplate('%%title%% at %%sitename%%')).toBe('%%title%% at %%sitename%%');
    expect(seoTemplate('%%sitename%%: %%sitedesc%%')).toBe('%%sitename%%: %%sitedesc%%');
    expect(seoTemplate('%%title%% %%page%%')).toBe('%%title%% %%page%%');
    expect(seoTemplate('%%primary_category%% news')).toBe('%%category%% news');
    expect(seoTemplate('%%category%% news')).toBe('%%category%% news');
    expect(seoTemplate('%%excerpt%%')).toBe('%%excerpt%%');
    expect(seoTemplate('Offers %%currentyear%%')).toBe('Offers %%currentyear%%');
    expect(seoTemplate('Posts by %%name%%')).toBe('Posts by %%name%%');
  });

  it('write the separator the old site used, a hyphen by default', () => {
    expect(seoTemplate('Rooms %%sep%% Hotel')).toBe('Rooms - Hotel');
    expect(seoTemplate('Rooms %%sep%% Hotel', 'sc-pipe')).toBe('Rooms | Hotel');
    expect(seoTemplate('Rooms %%sep%% Hotel', 'sc-ndash')).toBe('Rooms – Hotel');
    expect(seoTemplate('Rooms %%sep%% Hotel', '•')).toBe('Rooms • Hotel');
  });

  it('drop unknown variables without double separators or stray spaces', () => {
    expect(seoTemplate('%%title%% %%sep%% %%cf_price%% %%sep%% %%sitename%%')).toBe(
      '%%title%% - %%sitename%%',
    );
    expect(seoTemplate('%%ct_brand%% | %%title%%  |  %%focuskw%%')).toBe('%%title%%');
    expect(seoTemplate('  %%term404%%   Contacts  ')).toBe('Contacts');
    // A hyphen inside words is not a separator.
    expect(seoTemplate('Check-in %%unknown%% - Hotel')).toBe('Check-in - Hotel');
  });

  const page = (yoast: Record<string, string>, options: { seoSeparator?: string } = {}) => {
    const metas = Object.entries(yoast)
      .map(
        ([k, v]) =>
          `<wp:postmeta><wp:meta_key>${k}</wp:meta_key><wp:meta_value><![CDATA[${v}]]></wp:meta_value></wp:postmeta>`,
      )
      .join('');
    const xml = `<?xml version="1.0"?>
<rss xmlns:wp="http://wordpress.org/export/1.2/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Hotel</title><wp:wxr_version>1.2</wp:wxr_version><wp:base_blog_url>https://h.example</wp:base_blog_url>
<item><title>Home</title><link>https://h.example/home/</link><dc:creator>ann</dc:creator><wp:post_id>2</wp:post_id><wp:post_name>home</wp:post_name><wp:status>publish</wp:status><wp:post_type>page</wp:post_type><content:encoded>Hi</content:encoded>${metas}</item>
</channel></rss>`;
    return wxrToDocument(xml, { locale: 'en', ...options }).document.entries![0]!.fields;
  };

  it('are the whole title, shown as it is: the site’s name is not added again', () => {
    expect(page({ _yoast_wpseo_title: 'Hotel Aurora &amp; Spa - Welcome' })).toEqual({
      seo: { title: 'Hotel Aurora & Spa - Welcome', fullTitle: true },
    });
    expect(
      page({ _yoast_wpseo_title: '%%title%% %%sep%% %%sitedesc%%' }, { seoSeparator: 'sc-pipe' }),
    ).toEqual({
      seo: { title: '%%title%% | %%sitedesc%%', fullTitle: true },
    });
  });

  it('are left empty when they are the site’s default pattern', () => {
    expect(page({ _yoast_wpseo_title: '%%title%% - %%sitename%%' })).toBeUndefined();
    expect(page({ _yoast_wpseo_title: '%%title%% %%page%% %%sep%% %%sitename%%' })).toBeUndefined();
    expect(
      page({
        _yoast_wpseo_title: '%%title%% %%sep%% %%sitename%%',
        _yoast_wpseo_metadesc: '%%excerpt%%',
      }),
    ).toBeUndefined();
    // A description with variables keeps them, the unknown ones go.
    expect(
      page({ _yoast_wpseo_metadesc: '%%excerpt%% %%sep%% %%cf_x%% %%sep%% Book now' }),
    ).toEqual({
      seo: { description: '%%excerpt%% - Book now' },
    });
  });

  it('never end with half a variable when cut to 70 characters', () => {
    const fields = page({ _yoast_wpseo_title: `${'a'.repeat(58)} %%sep%% %%sitename%%` });
    expect(fields).toEqual({ seo: { title: 'a'.repeat(58), fullTitle: true } });
  });
});

describe('media folders', () => {
  it("takes the year and month of WordPress's uploads folder, else the upload date", () => {
    const uploads = 'https://x.example/wp-content/uploads';
    expect(attachmentDate(`${uploads}/2015/07/a.gif`, '2016-01-02 10:00:00')).toBe(
      '2015-07-01T00:00:00Z',
    );
    expect(attachmentDate(`${uploads}/a.gif`, '2016-01-02 10:00:00')).toBe('2016-01-02T10:00:00Z');
    expect(attachmentDate(`${uploads}/a.gif`, '0000-00-00 00:00:00')).toBeUndefined();
    expect(attachmentDate(`${uploads}/a.gif`, '')).toBeUndefined();
  });
});

describe('attachment files (1.33.1)', () => {
  const uploads = 'https://x.example/wp-content/uploads';
  const metadata = (original: string) =>
    `a:2:{s:4:"file";s:28:"2020/05/Big-Photo-scaled.jpg";s:14:"original_image";s:${original.length}:"${original}";}`;

  it('keeps the name exactly, case included', () => {
    const files = attachmentFiles({
      url: `${uploads}/2011/07/Fotolia_63675623_M.jpg`,
      guid: `${uploads}/2011/07/Fotolia_63675623_M.jpg`,
      attached: '2011/07/Fotolia_63675623_M.jpg',
      metadata: undefined,
      gmt: '2011-07-04 10:00:00',
    });
    expect(files.filename).toBe('Fotolia_63675623_M.jpg');
    expect(files.urls).toEqual([`${uploads}/2011/07/Fotolia_63675623_M.jpg`]);
    expect(files.date).toBe('2011-07-01T00:00:00Z');
  });

  it('takes the name and folder of _wp_attached_file before the address', () => {
    const files = attachmentFiles({
      url: `${uploads}/2015/09/yoga.png`,
      guid: 'https://old-domain.example/wp-content/uploads/2015/08/yoga.png',
      attached: '2015/09/yoga-1.png',
      metadata: undefined,
      gmt: '2016-01-01 10:00:00',
    });
    expect(files.filename).toBe('yoga-1.png');
    expect(files.date).toBe('2015-09-01T00:00:00Z');
    // Every address redirects: the attached file's, the address, the guid.
    expect(files.urls).toEqual([
      `${uploads}/2015/09/yoga-1.png`,
      `${uploads}/2015/09/yoga.png`,
      'https://old-domain.example/wp-content/uploads/2015/08/yoga.png',
    ]);
  });

  it('keeps the name of a -scaled image and adds its original', () => {
    const files = attachmentFiles({
      url: `${uploads}/2020/05/Big-Photo-scaled.jpg`,
      guid: `${uploads}/2020/05/Big-Photo.jpg`,
      attached: '2020/05/Big-Photo-scaled.jpg',
      metadata: metadata('Big-Photo.jpg'),
      gmt: '',
    });
    expect(files.filename).toBe('Big-Photo-scaled.jpg');
    expect(files.urls).toEqual([
      `${uploads}/2020/05/Big-Photo-scaled.jpg`,
      `${uploads}/2020/05/Big-Photo.jpg`,
    ]);
    // An original that names another folder is ignored.
    expect(
      attachmentFiles({
        url: `${uploads}/2020/05/Big-Photo-scaled.jpg`,
        guid: '',
        attached: '2020/05/Big-Photo-scaled.jpg',
        metadata: metadata('../../x.jpg'),
        gmt: '',
      }).urls,
    ).toEqual([`${uploads}/2020/05/Big-Photo-scaled.jpg`]);
  });

  it('never takes a path that leaves the uploads folder', () => {
    const files = attachmentFiles({
      url: `${uploads}/2016/03/escape.png`,
      guid: '',
      attached: '2016/03/../../../../secret/escape.png',
      metadata: undefined,
      gmt: '',
    });
    expect(files.filename).toBe('escape.png');
    expect(files.urls).toEqual([`${uploads}/2016/03/escape.png`]);
    for (const path of ['../x.jpg', '/etc/passwd', 'a//b.jpg', 'C:\\x.jpg']) {
      expect(uploadsPath(path)).toBeUndefined();
    }
    expect(uploadsPath('/var/www/wp-content/uploads/2010/01/old.jpg')).toBe('2010/01/old.jpg');
  });

  it('gives the transfer document WordPress’s names and every address', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Site</title><wp:wxr_version>1.2</wp:wxr_version><wp:base_blog_url>https://x.example</wp:base_blog_url>
<item><title>Piatto</title><guid>${uploads}/2013/02/PIATTO.JPG</guid><wp:post_id>7</wp:post_id><wp:post_type>attachment</wp:post_type><wp:status>inherit</wp:status><wp:post_date_gmt>2013-02-03 10:00:00</wp:post_date_gmt><wp:attachment_url>${uploads}/2013/02/PIATTO.JPG</wp:attachment_url><wp:postmeta><wp:meta_key>_wp_attached_file</wp:meta_key><wp:meta_value>2013/02/PIATTO.JPG</wp:meta_value></wp:postmeta></item>
<item><title>Yoga</title><wp:post_id>8</wp:post_id><wp:post_type>attachment</wp:post_type><wp:status>inherit</wp:status><wp:attachment_url>${uploads}/2015/09/yoga.png</wp:attachment_url><wp:postmeta><wp:meta_key>_wp_attached_file</wp:meta_key><wp:meta_value>2015/09/yoga-1.png</wp:meta_value></wp:postmeta></item>
</channel></rss>`;
    const { document } = wxrToDocument(xml, { locale: 'en' });
    expect(document.media).toEqual([
      expect.objectContaining({
        ref: 'att:7',
        file: `${uploads}/2013/02/PIATTO.JPG`,
        filename: 'PIATTO.JPG',
        urls: [`${uploads}/2013/02/PIATTO.JPG`],
        date: '2013-02-01T00:00:00Z',
      }),
      expect.objectContaining({
        ref: 'att:8',
        file: `${uploads}/2015/09/yoga.png`,
        filename: 'yoga-1.png',
        urls: [`${uploads}/2015/09/yoga-1.png`, `${uploads}/2015/09/yoga.png`],
        date: '2015-09-01T00:00:00Z',
      }),
    ]);
  });
});
