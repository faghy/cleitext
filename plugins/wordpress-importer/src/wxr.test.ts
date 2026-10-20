import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { wxrToDocument } from './wxr';

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
    const result = wxrToDocument(read('export.xml'), { locale: 'en', comments: 'all' });
    expect(stable(result)).toEqual(stable(JSON.parse(read('export.transfer.json'))));
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
        seo: {
          title: '%%title%% %%sep%% %%sitename%%',
          description: 'Our work for a shop.',
          keyphrase: 'shop site',
          noindex: true,
        },
      },
      terms: { portfolio_category: ['portfolio_category:web'] },
    });
    expect(document.entries!.find((e) => e.ref === 'post:11')!.fields).toEqual({
      seo: {
        title: 'About us %%sep%% %%sitename%%',
        description: 'Who we are.',
        keyphrase: 'web agency',
      },
    });
    // WordPress's and builders' own records are neither content nor worth a warning.
    expect(document.entries!.some((e) => e.ref === 'post:12')).toBe(false);
    expect(warnings.join('\n')).not.toContain('elementor_library');
  });
});
