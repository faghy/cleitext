import { describe, expect, it } from 'vitest';
import { analyze, occurrences, parseDocument, variants, WEIGHTS, type Paper } from './analysis';
import {
  capitalize,
  filenameWords,
  plainDescription,
  replaceVariables,
  resetCounters,
} from './variables';

const p = (text: string) => ({ type: 'core/paragraph', attrs: {}, content: [{ text }] });
const h = (text: string, level = 2) => ({
  type: 'core/heading',
  attrs: { level },
  content: [{ text }],
});
const link = (href: string, text = 'link', rel?: string) => ({
  type: 'core/paragraph',
  attrs: {},
  content: [{ type: 'link', href, ...(rel ? { rel } : {}), children: [{ text }] }],
});
const words = (n: number, word = 'lorem') => Array.from({ length: n }, () => word).join(' ');

function paper(overrides: Partial<Paper> = {}): Paper {
  return {
    keywords: ['espresso coffee'],
    title: '7 amazing espresso coffee recipes – Bar',
    description: 'How to make espresso coffee at home.',
    url: '/espresso-coffee',
    document: { blocks: [] },
    featuredImage: { alt: 'A cup of espresso coffee' },
    locale: 'en',
    host: 'bar.example',
    ...overrides,
  };
}

describe('the weights', () => {
  it('add up to 100 in English (without the sentiment test)', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(99);
  });
});

describe('keywords', () => {
  it('match plurals and singulars, as whole words', () => {
    expect(variants('coffee cup', 'en')).toEqual(
      expect.arrayContaining(['coffee cup', 'coffee cups']),
    );
    expect(variants('recipes', 'en')).toContain('recipe');
    expect(variants('pizza margherita', 'it')).toContain('pizza margherite');
    expect(occurrences('Coffee cups and a coffee cup; coffeecup', 'coffee cup', 'en')).toBe(2);
    expect(occurrences('Il caffè è buono', 'caffe', 'it')).toBe(1);
  });
});

describe('the document', () => {
  it('gives texts, headings, links and images, also from design blocks', () => {
    const parsed = parseDocument({
      blocks: [
        h('Title'),
        p('Text'),
        { type: 'core/image', attrs: { alt: 'Alt' } },
        { type: 'prisma/table-of-contents', attrs: {} },
        {
          type: 'fresco/text',
          attrs: {
            content:
              '<p>Rich <a href="https://other.example/" rel="nofollow">x</a></p><h3>Sub</h3><img alt="pic">',
          },
        },
        { type: 'fresco/heading', attrs: { title: 'Designed heading' } },
        { type: 'core/embed', attrs: { url: 'https://www.youtube.com/watch?v=1' } },
      ],
    });
    expect(parsed.headings.map((x) => x.text)).toEqual(['Title', 'Sub', 'Designed heading']);
    expect(parsed.links).toEqual([{ href: 'https://other.example/', nofollow: true }]);
    expect(parsed.images.map((i) => i.alt)).toEqual(['Alt', 'pic']);
    expect(parsed.toc).toBe(true);
    expect(parsed.videos).toBe(1);
  });
});

describe('the score', () => {
  it('is 100 for a page that passes every test', () => {
    const body = [
      p(`Espresso coffee ${words(50)} espresso coffee ${words(50)}`),
      h('Espresso coffee at home'),
      ...Array.from({ length: 24 }, (_, i) => p(`${words(100)} espresso coffee ${i}`)),
      link('/menu', 'menu'),
      link('https://italy.example/', 'Italy'),
      { type: 'core/image', attrs: { alt: 'espresso coffee' } },
      { type: 'core/image', attrs: { alt: 'b' } },
      { type: 'core/image', attrs: { alt: 'c' } },
      { type: 'core/toc', attrs: {} },
    ];
    const result = analyze(paper({ document: { blocks: body } }));
    const failed = result.tests.filter((t) => t.score < t.max).map((t) => t.id);
    expect(failed).toEqual([]);
    expect(result.score).toBe(100);
    expect(result.words).toBeGreaterThanOrEqual(2500);
  });

  it('counts what is missing', () => {
    const result = analyze(
      paper({
        title: 'Our bar',
        description: '',
        url: '/a-very-long-address-for-a-page-that-talks-about-many-things-at-once-and-more',
        document: { blocks: [p(words(200))] },
        featuredImage: null,
      }),
    );
    const byId = Object.fromEntries(result.tests.map((t) => [t.id, t]));
    expect(byId.keywordInTitle!.status).toBe('fail');
    expect(byId.lengthPermalink!.status).toBe('fail');
    expect(byId.keywordDensity!.score).toBe(0);
    expect(result.score).toBeLessThan(20);
  });

  it('weighs the title test 38 in other languages, and scores the other keywords on their own tests', () => {
    const result = analyze(
      paper({ locale: 'it', keywords: ['caffè espresso', 'moka'], title: 'Caffè espresso a casa' }),
    );
    expect(result.tests.find((t) => t.id === 'keywordInTitle')!.max).toBe(38);
    expect(result.keywords.map((k) => k.keyword)).toEqual(['caffè espresso', 'moka']);
    expect(result.tests.find((t) => t.id === 'titleHasPowerWords')).toBeDefined();
  });

  it('scores the density in tiers', () => {
    const score = (n: number) =>
      analyze(
        paper({
          document: {
            blocks: [
              p(
                `${words(1000 - n * 2)} ${Array.from({ length: n }, () => 'espresso coffee').join(' ')}`,
              ),
            ],
          },
        }),
      ).tests.find((t) => t.id === 'keywordDensity')!.score;
    expect(score(2)).toBe(0); // 0.2%
    expect(score(6)).toBe(2); // 0.6%
    expect(score(9)).toBe(3); // 0.9%
    expect(score(15)).toBe(6); // 1.5%
    expect(score(30)).toBe(0); // 3%
  });
});

describe('variables', () => {
  const now = new Date('2026-10-19T10:00:00Z');
  it('fill templates, collapse separators and drop what is empty', () => {
    expect(
      replaceVariables('%title% %sep% %sitename%', { sep: '–', sitename: 'Bar', title: 'Menu' }),
    ).toBe('Menu – Bar');
    expect(
      replaceVariables('%sitename% %page% %sep% %sitedesc%', {
        sep: '|',
        sitename: 'Bar',
        sitedesc: '',
      }),
    ).toBe('Bar');
    expect(
      replaceVariables('%%title%% %%sep%% %%sitename%%', {
        sep: '-',
        sitename: 'Bar',
        title: 'Yoast',
      }),
    ).toBe('Yoast - Bar');
    expect(
      replaceVariables('%title% %page% %sep% %sitename%', {
        sep: '–',
        sitename: 'Bar',
        title: 'Blog',
        page: 2,
        pages: 5,
      }),
    ).toBe('Blog – Page 2 of 5 – Bar');
    expect(replaceVariables('%unknown% %title%', { sep: '–', sitename: '', title: 'X' })).toBe('X');
    expect(
      replaceVariables('%title% (%category%) %sep% %sitename%', {
        sep: '–',
        sitename: 'Bar',
        title: 'X',
      }),
    ).toBe('X – Bar');
    expect(
      replaceVariables('%currentyear% %categories(limit=2&separator= / )%', {
        sep: '–',
        sitename: '',
        categories: ['A', 'B', 'C'],
        now,
      }),
    ).toBe('2026 A / B');
    expect(
      replaceVariables('%customfield(shop.price)%', {
        sep: '–',
        sitename: '',
        fields: { shop: { price: 12 } },
      }),
    ).toBe('12');
    resetCounters();
    expect(
      replaceVariables('%title% %count(title)%', { sep: '–', sitename: '', title: 'Photo' }),
    ).toBe('Photo 1');
    expect(
      replaceVariables('%title% %count(title)%', { sep: '–', sitename: '', title: 'Photo' }),
    ).toBe('Photo 2');
  });

  it('tidy descriptions, file names and capitals', () => {
    expect(plainDescription('<p>Hello <b>world</b></p>')).toBe('Hello world');
    expect(plainDescription(words(40, 'word'), 30).length).toBeLessThanOrEqual(31);
    expect(filenameWords('/media/red-shoes_2-1200x800.jpg')).toBe('red shoes 2');
    expect(capitalize('the best way to learn')).toBe('The Best Way To Learn');
  });
});
