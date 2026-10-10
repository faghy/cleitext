import { describe, expect, it } from 'vitest';
import { matchPermalink, UrlBuilder, type TypeInfo } from '../src/public/urls.js';

const types: TypeInfo[] = [
  { slug: 'page', permalink: '/{path}', hierarchical: true },
  { slug: 'article', permalink: '/{year}/{slug}', hierarchical: false },
];

const urls = new UrlBuilder(
  [
    { code: 'en', name: 'English', isDefault: true, prefix: '' },
    { code: 'it', name: 'Italiano', isDefault: false, prefix: '/it' },
  ],
  new Map(types.map((t) => [t.slug, t])),
  new Map([['team', ['about', 'team']]]),
);

describe('UrlBuilder', () => {
  it('builds entry URLs with language prefixes and page paths', () => {
    const base = {
      parentId: null,
      createdAt: new Date('2026-01-01'),
      publishedAt: new Date('2026-05-02'),
    };
    expect(urls.entry({ ...base, id: 'a', typeSlug: 'article', locale: 'en', slug: 'hello' })).toBe(
      '/2026/hello',
    );
    expect(urls.entry({ ...base, id: 'b', typeSlug: 'article', locale: 'it', slug: 'ciao' })).toBe(
      '/it/2026/ciao',
    );
    expect(urls.entry({ ...base, id: 'team', typeSlug: 'page', locale: 'en', slug: 'team' })).toBe(
      '/about/team',
    );
    expect(urls.home('it')).toBe('/it');
    expect(urls.home('en')).toBe('/');
    expect(urls.page('/it', 2)).toBe('/it/page/2');
    expect(urls.term('category', 'news', 'en')).toBe('/category/news');
    expect(urls.page('/category/news', 3)).toBe('/category/news/page/3');
  });

  it('splits the language prefix', () => {
    expect(urls.splitLocale('/it/2026/ciao')).toEqual({ locale: 'it', rest: '/2026/ciao' });
    expect(urls.splitLocale('/it')).toEqual({ locale: 'it', rest: '/' });
    expect(urls.splitLocale('/italy')).toEqual({ locale: 'en', rest: '/italy' });
  });

  it('has no prefixes with a single language (no language plugin)', () => {
    const single = new UrlBuilder(
      [{ code: 'it', name: 'IT', isDefault: true, prefix: '' }],
      new Map(types.map((t) => [t.slug, t])),
      new Map(),
    );
    expect(single.home('it')).toBe('/');
    expect(single.splitLocale('/en/about')).toEqual({ locale: 'it', rest: '/en/about' });
    expect(single.term('tag', 'x', 'en')).toBe('/tag/x');
  });
});

describe('matchPermalink', () => {
  it('prefers dated patterns over catch-all page paths', () => {
    expect(matchPermalink('/2026/hello', types)).toEqual({
      type: 'article',
      slug: 'hello',
      parents: [],
      year: 2026,
    });
    expect(matchPermalink('/about/team', types)).toEqual({
      type: 'page',
      slug: 'team',
      parents: ['about'],
    });
    expect(matchPermalink('/about/', types)).toEqual({ type: 'page', slug: 'about', parents: [] });
  });

  it('rejects malformed paths', () => {
    expect(matchPermalink('/About', types)).toBeNull();
    expect(matchPermalink('/a//b', types)).toBeNull();
    expect(matchPermalink('/../etc', types)).toBeNull();
  });
});
