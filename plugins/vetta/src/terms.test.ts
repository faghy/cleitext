import { describe, expect, it } from 'vitest';
import { TERM_GROUP, termSeo } from './config';
import { ENTRY_FIELDS, TERM_FIELDS } from './fields';
import { buildHead, type HeadInput } from './head';
import { termSeoFromWxr } from './import';
import { termChecks } from './term-checks';

const head = {
  title: 'Coffee – Bar',
  description: 'All about <b>coffee</b>.',
  canonical: 'https://bar.example/category/coffee',
  alternates: [],
  og: { 'og:site_name': 'Bar', 'og:url': 'https://bar.example/category/coffee' },
  tags: [],
};
const archive = (over: Partial<HeadInput> = {}): HeadInput => ({
  head,
  config: { separator: '|' },
  locale: 'en',
  route: 'archive',
  path: '/category/coffee',
  isFrontPage: false,
  archive: { taxonomy: 'category', term: 'coffee' },
  term: { name: 'Coffee', description: '<p>Beans, roasts and <b>espresso</b> to take away.</p>' },
  seo: {},
  ...over,
});

describe('Vetta’s fields', () => {
  it('keep their names, in the box’s order: keywords, title, description, then the rest', () => {
    expect(ENTRY_FIELDS.map((f) => f.name)).toEqual([
      'vettaBox',
      'keywords',
      'title',
      'description',
      'noindex',
      'nofollow',
      'noarchive',
      'noimageindex',
      'nosnippet',
      'canonical',
      'breadcrumbTitle',
      'schema',
      'pillar',
      'ogTitle',
      'ogDescription',
      'ogImage',
    ]);
    expect(ENTRY_FIELDS[0]!.type).toBe('vetta/box');
    // Advanced and Social networks are the only groups, after the main fields.
    const groups = ENTRY_FIELDS.map((f) => (f.group as { en: string } | undefined)?.en ?? '');
    expect([...new Set(groups)]).toEqual(['', 'Advanced', 'Social networks']);
    expect(TERM_FIELDS.map((f) => f.name)).toEqual([
      'vettaBox',
      'keywords',
      'title',
      'description',
      'noindex',
      'nofollow',
      'canonical',
      'ogTitle',
      'ogDescription',
      'ogImage',
    ]);
  });
});

describe('the SEO of terms', () => {
  it('reads the term group, trimmed', () => {
    expect(
      termSeo({ [TERM_GROUP]: { title: ' Coffee beans ', noindex: true, canonical: '' } }),
    ).toMatchObject({ title: 'Coffee beans', noindex: true, canonical: null });
    expect(termSeo(undefined).title).toBeNull();
  });

  it('uses the taxonomy’s template, with the term’s name and description', () => {
    const next = buildHead(archive());
    expect(next.title).toBe('Coffee | Bar');
    expect(next.description).toBe('Beans, roasts and espresso to take away.');
    expect(next.robots).toMatch(/^index, follow/);
  });

  it('uses the term’s own title, description, robots, canonical and social card', () => {
    const next = buildHead(
      archive({
        seo: termSeo({
          [TERM_GROUP]: {
            keywords: 'coffee beans',
            title: '%focuskw% from %term% %sep% %sitename%',
            description: 'Our %term%: %term_description%',
            nofollow: true,
            canonical: 'https://other.example/coffee',
            ogTitle: 'Coffee for you',
          },
        }),
      }),
    );
    expect(next.title).toBe('coffee beans from Coffee | Bar');
    expect(next.description).toBe('Our Coffee: Beans, roasts and espresso to take away.');
    expect(next.robots).toMatch(/^index, nofollow/);
    expect(next.canonical).toBe('https://other.example/coffee');
    expect(next.og['og:title']).toBe('Coffee for you');

    const hidden = buildHead(archive({ seo: termSeo({ [TERM_GROUP]: { noindex: true } }) }));
    expect(hidden.robots).toBe('noindex, follow');
    expect(hidden.canonical).toBeNull();
    // A term may show a tag, which is out of search by default: its own choice wins.
    const tag = buildHead(
      archive({
        archive: { taxonomy: 'tag', term: 'hot' },
        seo: termSeo({ [TERM_GROUP]: { noindex: false } }),
      }),
    );
    expect(tag.robots).toMatch(/^index, follow/);
    expect(buildHead(archive({ archive: { taxonomy: 'tag', term: 'hot' } })).robots).toMatch(
      /^noindex/,
    );
  });

  it('checks the title and the description against the main keyword', () => {
    expect(termChecks({ keywords: '', title: 'x', description: 'y', locale: 'en' })).toBeNull();
    const good = termChecks({
      keywords: 'espresso, coffee',
      title: 'Espresso at the bar',
      description:
        'Espresso as we make it: the beans, the grind, the water and the cup, with the tips of our baristas for home.',
      locale: 'en',
    })!;
    expect(good.score).toBe(100);
    expect(good.tests.every((t) => t.status === 'pass')).toBe(true);
    const poor = termChecks({
      keywords: 'espresso',
      title: 'All our coffees and teas, from the bar on the corner of the square to your home',
      description: '',
      locale: 'it',
    })!;
    expect(poor.score).toBe(0);
    expect(poor.tests.map((t) => t.id)).toEqual([
      'termKeywordTitle',
      'termKeywordStart',
      'termTitleLength',
      'termDescription',
    ]);
    // Without a title, the template applies: only the description counts.
    const template = termChecks({
      keywords: 'caffè',
      title: '',
      description: 'Il caffè come lo facciamo noi.',
      locale: 'it',
    })!;
    expect(template.tests[0]!.status).toBe('info');
    expect(template.score).toBe(60);
  });
});

describe('the import of Rank Math’s term SEO', () => {
  const metaValue = (text: string | undefined) =>
    text === 'a:2:{i:0;s:7:"noindex";i:1;s:8:"nofollow";}' ? ['noindex', 'nofollow'] : text;

  it('maps the term meta to Vetta’s fields of the imported terms', () => {
    const values = termSeoFromWxr(
      [
        {
          ref: 'category:coffee',
          imported: true,
          meta: {
            rank_math_title: '%term% beans %sep% %sitename%',
            rank_math_description: 'All our <b>coffee</b> &amp; more',
            rank_math_focus_keyword: 'coffee,beans',
            rank_math_robots: 'a:2:{i:0;s:7:"noindex";i:1;s:8:"nofollow";}',
            rank_math_canonical_url: 'https://bar.example/coffee',
            rank_math_facebook_title: 'Coffee!',
            rank_math_facebook_image_id: '42',
          },
        },
        // Rank Math's own pattern: the template does it already.
        {
          ref: 'post_tag:hot',
          imported: true,
          meta: { rank_math_title: '%term% %page% %sep% %sitename%' },
        },
        { ref: 'category:gone', imported: false, meta: { rank_math_title: 'Gone' } },
      ],
      metaValue,
    );
    expect(values).toEqual({
      'category:coffee': {
        'vetta-term': {
          keywords: 'coffee, beans',
          title: '%term% beans %sep% %sitename%',
          description: 'All our coffee & more',
          noindex: true,
          nofollow: true,
          canonical: 'https://bar.example/coffee',
          ogTitle: 'Coffee!',
          ogImage: { $media: 'att:42' },
        },
      },
    });
  });
});

describe('Vetta’s box', () => {
  it('shows the main fields first, then Advanced and Social networks without their headings', async () => {
    const { splitFields } = await import('./box');
    const { main, sections } = splitFields(ENTRY_FIELDS.slice(1), 'it');
    expect(main.map((f) => f.name)).toEqual(['keywords', 'title', 'description']);
    expect(sections.map((s) => [s.title, s.fields.length])).toEqual([
      ['Avanzate', 9],
      ['Social network', 3],
    ]);
    expect(sections.every((s) => s.fields.every((f) => f.group === undefined))).toBe(true);
  });
});
