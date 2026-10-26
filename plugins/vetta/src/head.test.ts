import { describe, expect, it } from 'vitest';
import { entrySeo, sanitizeConfig, taxonomyValue } from './config';
import { buildHead, robotsContent, robotsFor, verificationCode, type HeadInput } from './head';
import { openingHours, schemaGraph } from './jsonld';
import { excluded, imageTexts, linkAttributes, llmsText, robotsText } from './tools';

const baseHead = {
  title: 'Espresso – Bar',
  description: 'Core description',
  canonical: 'https://bar.example/espresso',
  alternates: [],
  og: { 'og:site_name': 'Bar', 'og:url': 'https://bar.example/espresso' },
  tags: [],
};
const entry = {
  id: 'e1',
  type: 'article',
  title: 'Espresso',
  url: '/espresso',
  excerpt: 'How we make it.',
  publishedAt: '2026-10-01T10:00:00Z',
  author: { displayName: 'Ada' },
  terms: { category: [{ name: 'Coffee' }], tag: [{ name: 'hot' }] },
  fields: {},
  words: 600,
};
const input = (over: Partial<HeadInput> = {}): HeadInput => ({
  head: baseHead,
  config: {},
  locale: 'en',
  route: 'entry',
  path: '/espresso',
  isFrontPage: false,
  entry,
  seo: {},
  ...over,
});
const metas = (head: ReturnType<typeof buildHead>) =>
  Object.fromEntries(
    (head.tags ?? [])
      .filter((t) => t.tag === 'meta')
      .map((t) => [
        (t as { attrs: Record<string, string> }).attrs.name,
        (t as { attrs: Record<string, string> }).attrs.content,
      ]),
  );

describe('the head', () => {
  it('uses the own title, description and robots of the page of the posts on its archive', () => {
    const blog = (over: Partial<HeadInput>) =>
      input({
        route: 'archive',
        path: '/blog',
        archive: { type: 'article' },
        entry: undefined,
        postsPage: { id: 'p1', title: 'Blog', url: '/blog', excerpt: '' },
        head: { ...baseHead, title: 'Blog – Bar' },
        ...over,
      });
    const own = buildHead(
      blog({
        seo: { title: '%title% - %sitename%', description: 'News of %title%', noindex: true },
      }),
    );
    expect(own.title).toBe('Blog - Bar');
    expect(own.description).toBe('News of Blog');
    expect(own.robots).toMatch(/^noindex/);
    // A legacy title of the SEO plugin is the page's part, in the pages' template.
    expect(
      buildHead(
        blog({
          config: { pt_page_title: '%title% %sep% %sitename%', separator: '|' },
          seo: { title: 'News', legacyTitle: true },
        }),
      ).title,
    ).toBe('News | Bar');
    // Without one, the archive's title; later pages say which.
    expect(buildHead(blog({ seo: {} })).title).toBe('Blog – Bar');
    expect(buildHead(blog({ seo: {}, path: '/blog/page/2' })).title).toBe('Blog – Page 2 – Bar');
    // The core tells how many pages there are (plugin API 1.57), and says it in its own title.
    expect(
      buildHead(
        blog({
          seo: {},
          path: '/blog/page/2',
          pagination: { page: 2, pages: 22 },
          head: { ...baseHead, title: 'Blog – Page 2 of 22 – Bar' },
        }),
      ).title,
    ).toBe('Blog – Page 2 of 22 – Bar');
    expect(
      buildHead(
        input({
          route: 'archive',
          path: '/news/page/2',
          archive: { type: 'article' },
          entry: undefined,
          locale: 'it',
          pagination: { page: 2, pages: 22 },
          head: { ...baseHead, title: 'Notizie – Pagina 2 di 22 – Bar' },
        }),
      ).title,
    ).toBe('Notizie – Pagina 2 di 22 – Bar');
  });

  it('uses the templates of the content type, and the entry’s own values first', () => {
    const head = buildHead(input());
    expect(head.title).toBe('Espresso – Bar');
    expect(head.description).toBe('How we make it.');
    expect(head.robots).toBe(
      'index, follow, max-snippet:-1, max-video-preview:-1, max-image-preview:large',
    );
    expect(head.og['og:type']).toBe('article');
    expect(head.og['article:section']).toBe('Coffee');
    const own = buildHead(
      input({
        seo: { title: '%title% at home %sep% %sitename%', description: 'Mine' },
        config: { separator: '|' },
      }),
    );
    expect(own.title).toBe('Espresso at home | Bar');
    expect(own.description).toBe('Mine');
    const typed = buildHead(
      input({ config: { pt_article_title: '%title% (%category%) %sep% %sitename%' } }),
    );
    expect(typed.title).toBe('Espresso (Coffee) – Bar');
  });

  it('shows titles imported from Yoast SEO as the whole title, without the site’s name again', () => {
    const title = (seo: Record<string, unknown>, over: Partial<HeadInput> = {}) =>
      buildHead(input({ seo: entrySeo({ seo }), ...over })).title;
    // The old SEO plugin's own titles stay the page's part.
    expect(title({ title: 'Our espresso' })).toBe('Our espresso – Bar');
    // Imported: shown as they are, the variables resolved.
    expect(title({ title: 'Home - Bar Aurora', fullTitle: true })).toBe('Home - Bar Aurora');
    expect(title({ title: '%%title%% - %%sitename%%', fullTitle: true })).toBe('Espresso - Bar');
    // With variables they were always meant as the whole title.
    expect(title({ title: '%%title%% | %%sitename%%' })).toBe('Espresso | Bar');
    expect(
      title(
        {
          title:
            '%%title%% %%page%% - %%category%% - %%sitedesc%% - %%excerpt%% %%currentyear%% %%name%%',
          fullTitle: true,
        },
        { sitedesc: 'Coffee since 1950', now: new Date('2026-10-25T00:00:00Z') },
      ),
    ).toBe('Espresso - Coffee - Coffee since 1950 - How we make it. 2026 Ada');
    expect(
      title(
        { title: '%%title%% %%page%% - %%sitedesc%% - %%sitename%%', fullTitle: true },
        {
          path: '/espresso/page/2',
        },
      ),
    ).toBe('Espresso – Page 2 - Bar');
  });

  it('follows the robots precedence: entry, then content type, then the site', () => {
    expect(robotsFor(input({ config: { robots_noindex: true } })).noindex).toBe(true);
    expect(
      robotsFor(input({ config: { robots_noindex: true }, seo: { noindex: false } })).noindex,
    ).toBe(false);
    expect(
      robotsFor(
        input({ config: { pt_article_custom_robots: true, pt_article_robots_noindex: true } }),
      ).noindex,
    ).toBe(true);
    expect(robotsFor(input({ route: 'search', path: '/search' })).noindex).toBe(true);
    expect(
      robotsFor(
        input({ route: 'archive', path: '/blog/page/2', config: { noindex_paginated: true } }),
      ).noindex,
    ).toBe(true);
    expect(
      robotsFor(input({ route: 'archive', path: '/author/ada', entry: undefined })).noindex,
    ).toBe(true);
    // Tags stay out of search unless the site says otherwise.
    expect(
      robotsFor(
        input({
          route: 'archive',
          path: '/tag/hot',
          archive: { taxonomy: 'tag', term: 'hot' },
          entry: undefined,
        }),
      ).noindex,
    ).toBe(true);
    expect(taxonomyValue({ tax_tag_custom_robots: false }, 'tag', 'custom_robots')).toBe(false);
    const hidden = buildHead(
      input({ seo: { noindex: true, canonical: 'https://other.example/x' } }),
    );
    expect(hidden.robots).toBe('noindex, follow');
    expect(hidden.canonical).toBeNull();
    expect(buildHead(input({ seo: { canonical: 'https://other.example/x' } })).canonical).toBe(
      'https://other.example/x',
    );
    expect(
      robotsContent(
        { noindex: false, nofollow: false, noarchive: true, noimageindex: false, nosnippet: true },
        {},
      ),
    ).toBe('index, follow, noarchive, nosnippet');
  });

  it('fills the home page, archives, search and 404 titles', () => {
    expect(
      buildHead(
        input({
          route: 'archive',
          path: '/',
          archive: { home: true },
          entry: undefined,
          config: { home_title: '%sitename% %sep% Coffee all day' },
        }),
      ).title,
    ).toBe('Bar – Coffee all day');
    const term = buildHead(
      input({
        route: 'archive',
        path: '/category/coffee/page/2',
        archive: { taxonomy: 'category', term: 'coffee' },
        entry: undefined,
        head: { ...baseHead, title: 'Coffee – Bar' },
      }),
    );
    expect(term.title).toBe('Coffee – Bar');
    expect(
      buildHead(input({ route: '404', path: '/x', entry: undefined, locale: 'it' })).title,
    ).toBe('Pagina non trovata – Bar');
    expect(
      buildHead(
        input({
          route: 'search',
          path: '/search',
          entry: undefined,
          head: { ...baseHead, title: 'Results for “tea” – Bar' },
        }),
      ).title,
    ).toBe('Results for “tea” – Bar');
  });

  it('writes social cards, Slack labels and verification tags on the home page', () => {
    const head = buildHead(
      input({
        image: { url: 'https://bar.example/cup.jpg', width: 1200, height: 630 },
        config: { twitter_site: 'bar', facebook_app_id: '123' },
      }),
    );
    expect(head.og['og:image']).toBe('https://bar.example/cup.jpg');
    expect(head.og['fb:app_id']).toBe('123');
    const m = metas(head);
    expect(m['twitter:card']).toBe('summary_large_image');
    expect(m['twitter:site']).toBe('@bar');
    expect(m['twitter:label1']).toBe('Written by');
    expect(m['twitter:data2']).toBe('3 minutes');
    expect(m['google-site-verification']).toBeUndefined();
    const home = metas(
      buildHead(
        input({
          path: '/',
          isFrontPage: true,
          config: { verify_google: '<meta name="google-site-verification" content="abc-123" />' },
        }),
      ),
    );
    expect(home['google-site-verification']).toBe('abc-123');
    expect(verificationCode('"><script>')).toBe('script');
  });
});

describe('the fields and settings', () => {
  it('read the old SEO plugin’s fields when Vetta has none', () => {
    expect(
      entrySeo({ seo: { title: 'Old', keyphrase: 'tea', noindex: true, socialImage: 'm1' } }),
    ).toMatchObject({ title: 'Old', keywords: 'tea', noindex: true, ogImage: 'm1' });
    expect(entrySeo({ vetta: { title: 'New' }, seo: { title: 'Old' } }).title).toBe('New');
    expect(entrySeo({ seo: { title: 'Old' } }).legacyTitle).toBe(true);
    expect(entrySeo({ seo: { title: 'Old - Site', fullTitle: true } }).legacyTitle).toBeUndefined();
    expect(entrySeo({ seo: { title: '%%title%% - %%sitename%%' } }).legacyTitle).toBeUndefined();
  });

  it('keep plain values only', () => {
    expect(
      sanitizeConfig({
        ok: 'x',
        n: 2,
        b: true,
        list: ['a', { days: 'Mo', opens: '09:00' }],
        'Bad-Key': 1,
        obj: { a: 1 },
        nested: [{ a: { b: 1 } }],
      }),
    ).toEqual({
      ok: 'x',
      n: 2,
      b: true,
      list: ['a', { days: 'Mo', opens: '09:00' }],
      nested: [],
    });
  });
});

describe('the schema.org graph', () => {
  it('links the site, the publisher, the page and the article', () => {
    const graph = schemaGraph({
      config: {
        knowledge_name: 'Bar Srl',
        module_localSeo: true,
        local_street: 'Via Roma 1',
        local_locality: 'Bologna',
        local_hours: [{ days: 'Mo,Tu', opens: '9:00', closes: '18:00' }],
        local_latitude: '44.5',
        local_longitude: '11.3',
      },
      pageUrl: 'https://bar.example/espresso',
      title: 'Espresso – Bar',
      description: 'How we make it.',
      siteName: 'Bar',
      locale: 'it',
      isHome: false,
      route: 'entry',
      image: null,
      logo: 'https://bar.example/logo.png',
      crumbs: [
        { title: 'Home', url: '/' },
        { title: 'Espresso', url: '/espresso' },
      ],
      entry: {
        type: 'article',
        title: 'Espresso',
        publishedAt: null,
        author: 'Ada',
        keywords: ['espresso'],
        sections: ['Coffee'],
        schema: 'auto',
      },
    })!;
    const nodes = graph['@graph'] as Record<string, unknown>[];
    expect(nodes.map((n) => n['@type'])).toEqual([
      'WebSite',
      'LocalBusiness',
      'WebPage',
      'BreadcrumbList',
      'BlogPosting',
    ]);
    const business = nodes[1]!;
    expect(business.address).toMatchObject({
      streetAddress: 'Via Roma 1',
      addressLocality: 'Bologna',
    });
    expect(business.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 44.5, longitude: 11.3 });
    expect(business.openingHoursSpecification).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday'],
        opens: '09:00',
        closes: '18:00',
      },
    ]);
    expect(openingHours([{ days: 'xx', opens: '9', closes: '10:00' }])).toEqual([]);
  });
});

describe('the page’s HTML', () => {
  it('marks links to other sites and fills missing image texts', () => {
    const html =
      '<a href="https://other.example/x">x</a><a href="/in">in</a><a href="https://bar.example/">own</a><a href="https://ok.example/" rel="dofollow">ok</a>';
    const out = linkAttributes(html, {
      host: 'bar.example',
      nofollowExternal: true,
      newWindowExternal: true,
      nofollowImages: false,
      nofollowDomains: [],
      followDomains: [],
    });
    expect(out).toContain(
      '<a href="https://other.example/x" target="_blank" rel="nofollow noopener">',
    );
    expect(out).toContain('<a href="/in">');
    expect(out).toContain('<a href="https://bar.example/">');
    expect(out).toContain('rel="dofollow"');
    const images = imageTexts(
      '<img src="/m/red-shoes-800x600.jpg" alt=""><img src="/b.png" alt="Kept">',
      {
        addAlt: true,
        altFormat: '%filename%',
        addTitle: false,
        titleFormat: '',
        title: 'Shop',
        sitename: '',
      },
    );
    expect(images).toBe(
      '<img src="/m/red-shoes-800x600.jpg" alt="red shoes"><img src="/b.png" alt="Kept">',
    );
  });

  it('keeps addresses out of the 404 log by rule', () => {
    expect(excluded('/old/page', 'start:/old')).toBe(true);
    expect(excluded('/x.php', 'end:.php')).toBe(true);
    expect(excluded('/feed', 'exact:/feed\nregex:^/tmp')).toBe(true);
    expect(excluded('/tmp/1', 'regex:^/tmp')).toBe(true);
    expect(excluded('/keep', 'regex:([')).toBe(false);
  });

  it('writes llms.txt and robots.txt', () => {
    const text = llmsText({
      name: 'Bar',
      summary: 'Coffee in Bologna',
      origin: 'https://bar.example',
      sections: [
        { title: 'Pages', items: [{ title: 'Menu', url: '/menu', excerpt: 'What we serve' }] },
      ],
      extra: '',
    });
    expect(text).toBe(
      '# Bar\n\n> Coffee in Bologna\n\n## Sitemaps\n\n- [XML sitemap](https://bar.example/sitemap.xml)\n\n## Pages\n\n- [Menu](https://bar.example/menu): What we serve\n',
    );
    expect(robotsText('User-agent: *\nDisallow: /tmp', 'https://bar.example/sitemap.xml')).toBe(
      'User-agent: *\nDisallow: /tmp\n\nSitemap: https://bar.example/sitemap.xml\n',
    );
  });
});
