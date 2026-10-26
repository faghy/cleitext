import { describe, expect, it } from 'vitest';
import {
  hrefs,
  postsPermalink,
  scanPostsPermalink,
  sitePath,
  taxonomyBase,
  type PostAddress,
} from './permalinks';
import { wxrToDocument } from './wxr';

const BASE = 'https://lino.example.com';
const post = (id: number, slug: string, link: string, categories: string[] = []): PostAddress => ({
  id,
  link: link.startsWith('http') ? link : `${BASE}${link}`,
  slug,
  date: '2024-05-02 08:00:00',
  categories,
});

describe('the structure of the posts’ addresses', () => {
  it('is read from their links, as WordPress’s permalink settings', () => {
    expect(
      postsPermalink([post(1, 'obama', '/obama/'), post(2, 'nintendo', '/nintendo/')], BASE),
    ).toEqual({ wordpress: '/%postname%/', cleitext: '/{slug}' });
    expect(postsPermalink([post(1, 'obama', '/2024/05/obama/')], BASE)).toEqual({
      wordpress: '/%year%/%monthnum%/%postname%/',
      cleitext: '/{year}/{month}/{slug}',
    });
    expect(postsPermalink([post(1, 'obama', '/blog/2024/obama')], BASE)).toEqual({
      wordpress: '/blog/%year%/%postname%/',
      cleitext: '/blog/{year}/{slug}',
    });
    // Encoded slugs, and a site in a folder.
    expect(
      postsPermalink(
        [post(1, 'caf%c3%a9', 'https://www.lino.example.com/wp/caf%C3%A9/')],
        `${BASE}/wp`,
      ),
    ).toEqual({ wordpress: '/%postname%/', cleitext: '/{slug}' });
  });

  it('names the structures Cleitext cannot keep', () => {
    expect(postsPermalink([post(1, 'obama', '/2024/05/02/obama/')], BASE)).toEqual({
      wordpress: '/%year%/%monthnum%/%day%/%postname%/',
      cleitext: null,
    });
    expect(postsPermalink([post(7, 'obama', '/archives/7')], BASE)).toEqual({
      wordpress: '/archives/%post_id%/',
      cleitext: null,
    });
    expect(
      postsPermalink([post(1, 'obama', '/mente/inconscio/obama/', ['mente', 'inconscio'])], BASE),
    ).toEqual({ wordpress: '/%category%/%postname%/', cleitext: null });
    expect(postsPermalink([post(1, 'obama', '/Notizie/obama/')], BASE)?.cleitext).toBeNull();
  });

  it('is unknown when the posts do not agree, or have plain addresses', () => {
    expect(postsPermalink([post(1, 'a', '/a/'), post(2, 'b', '/2024/b/')], BASE)).toBeNull();
    expect(postsPermalink([post(1, 'a', '/?p=1')], BASE)).toBeNull();
    expect(postsPermalink([post(1, 'a', 'https://elsewhere.example/a/')], BASE)).toBeNull();
    expect(postsPermalink([post(1, '', '/a/')], BASE)).toBeNull();
    expect(postsPermalink([], BASE)).toBeNull();
    // Most of them is enough: the others redirect.
    const many = Array.from({ length: 9 }, (_, i) => post(i, `p${i}`, `/p${i}/`));
    expect(postsPermalink([...many, post(10, 'x', '/2020/x/')], BASE)?.cleitext).toBe('/{slug}');
  });
});

describe('the first part of archives', () => {
  const slugs = new Set(['mente', 'inconscio']);
  it('is read from links to the terms', () => {
    const links = [`${BASE}/argomenti/mente/`, `${BASE}/argomenti/mente/inconscio/page/2/`];
    expect(taxonomyBase(links, BASE, slugs, new Set())).toBe('argomenti');
    expect(taxonomyBase([`${BASE}/mente/feed/`], BASE, slugs, new Set())).toBe('');
    expect(taxonomyBase(['/category/mente'], BASE, slugs, new Set())).toBe('category');
  });

  it('ignores addresses of posts and pages, other sites and deeper paths', () => {
    expect(taxonomyBase([`${BASE}/mente/`], BASE, slugs, new Set(['/mente']))).toBeNull();
    expect(taxonomyBase(['https://other.example/x/mente'], BASE, slugs, new Set())).toBeNull();
    expect(taxonomyBase([`${BASE}/a/b/mente`, `${BASE}/A_B/mente`], BASE, slugs, new Set())).toBe(
      null,
    );
    expect(taxonomyBase([`${BASE}/x/mente`, `${BASE}/y/mente`], BASE, slugs, new Set())).toBeNull();
  });

  it('reads links and paths', () => {
    expect(hrefs('<a href="/a?x=1&amp;y=2">A</a> <a class=b HREF=\'/b\'>')).toEqual([
      '/a?x=1&y=2',
      '/b',
    ]);
    expect(sitePath('not a url', 'nor a base')).toBeNull();
    expect(sitePath(`${BASE}/%E0%A4%A`, BASE)).toBeNull();
    expect(sitePath(`${BASE}/other`, `${BASE}/wp`)).toBeNull();
    expect(sitePath(`${BASE}/`, BASE)).toBe('/');
  });
});

/** An export of posts at the given addresses, with a menu link to a category. */
function exportOf(links: string[], menuUrl = `${BASE}/argomenti/mente/`) {
  const items = links
    .map(
      (link, i) =>
        `<item><title>Post ${i}</title><link>${BASE}${link}</link><dc:creator>ann</dc:creator><wp:post_id>${i + 1}</wp:post_id><wp:post_date><![CDATA[2024-05-02 08:00:00]]></wp:post_date><wp:post_name><![CDATA[post-${i}]]></wp:post_name><wp:status>publish</wp:status><wp:post_type>post</wp:post_type><category domain="category" nicename="mente"><![CDATA[Mente]]></category><content:encoded><![CDATA[<p><a href="${BASE}/tag/sogni/">sogni</a></p>]]></content:encoded></item>`,
    )
    .join('\n');
  return `<?xml version="1.0"?>
<rss xmlns:wp="http://wordpress.org/export/1.2/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Lino</title><link>${BASE}</link><wp:wxr_version>1.2</wp:wxr_version><wp:base_blog_url>${BASE}</wp:base_blog_url>
<wp:category><wp:term_id>3</wp:term_id><wp:category_nicename>mente</wp:category_nicename><wp:category_parent></wp:category_parent><wp:cat_name><![CDATA[Mente]]></wp:cat_name></wp:category>
<wp:tag><wp:term_id>4</wp:term_id><wp:tag_slug>sogni</wp:tag_slug><wp:tag_name><![CDATA[Sogni]]></wp:tag_name></wp:tag>
${items}
<item><title>Menu</title><link>${BASE}/?p=99</link><wp:post_id>99</wp:post_id><wp:status>publish</wp:status><wp:post_type>nav_menu_item</wp:post_type><wp:postmeta><wp:meta_key>_menu_item_url</wp:meta_key><wp:meta_value><![CDATA[${menuUrl}]]></wp:meta_value></wp:postmeta></item>
</channel></rss>`;
}

describe('imports of WordPress exports', () => {
  it('give the core the addresses of the posts and of the archives', () => {
    const xml = exportOf(['/post-0/', '/post-1/']);
    const { document, warnings } = wxrToDocument(xml, { locale: 'en', corePermalinks: true });
    expect(document.permalinks).toEqual({
      types: { article: '/{slug}' },
      taxonomyBases: { category: 'argomenti', tag: 'tag' },
    });
    expect(warnings.filter((w) => w.startsWith('Posts had'))).toEqual([]);
    const replaced = wxrToDocument(xml, {
      locale: 'en',
      corePermalinks: true,
      replacePermalinks: true,
    }).document.permalinks;
    expect(replaced?.replace).toBe(true);
    // The preview reads the same structure.
    expect(scanPostsPermalink(xml)).toEqual({ wordpress: '/%postname%/', cleitext: '/{slug}' });
  });

  it('give older cores a hint instead, and say which addresses cannot be kept', () => {
    const old = wxrToDocument(exportOf(['/post-0/']), { locale: 'en' });
    expect(old.document.permalinks).toBeUndefined();
    expect(old.warnings).toContain(
      'Posts had addresses like /%postname%/: to keep them, set the permalink of Posts to /{slug} in Content structure before importing (otherwise the old addresses redirect).',
    );
    const daily = wxrToDocument(exportOf(['/2024/05/02/post-0/'], '/about/'), {
      locale: 'en',
      corePermalinks: true,
    });
    expect(daily.document.permalinks).toEqual({ types: {}, taxonomyBases: { tag: 'tag' } });
    expect(daily.warnings).toContain(
      'Posts had addresses like /%year%/%monthnum%/%day%/%postname%/ in WordPress, which Cleitext cannot keep: the old addresses redirect to the new ones.',
    );
    expect(scanPostsPermalink('<rss></rss>')).toBeNull();
  });
});
