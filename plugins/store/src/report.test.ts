import { describe, expect, it } from 'vitest';
import { isPublicOrigin, parseReport } from './server';

const good = {
  installId: '0b6f2a8e-3c1d-4e5f-8a9b-0c1d2e3f4a5b',
  origin: 'https://example.com/some/page',
  core: '0.37.0',
  theme: { slug: 'vitality', version: '1.4.0' },
  plugins: [
    { slug: 'seo', version: '1.3.0', active: true },
    { slug: 'forms', version: '2.0.1', active: false },
  ],
  themes: [{ slug: 'vitality', version: '1.4.0' }],
};

describe('installation reports', () => {
  it('keeps what a report says, with the origin only', () => {
    expect(parseReport(good)).toEqual({ ...good, origin: 'https://example.com' });
  });

  it('refuses reports without identity, address or version', () => {
    expect(parseReport({ ...good, installId: 'x' })).toBeNull();
    expect(parseReport({ ...good, origin: 'ftp://example.com' })).toBeNull();
    expect(parseReport({ ...good, core: 'latest' })).toBeNull();
    expect(parseReport(null)).toBeNull();
  });

  it('drops items that are not plugins or themes, and limits their number', () => {
    const parsed = parseReport({
      ...good,
      plugins: [{ slug: '<script>', version: '1' }, ...Array(300).fill(good.plugins[0])],
      themes: 'all',
    });
    expect(parsed?.plugins).toHaveLength(199);
    expect(parsed?.themes).toEqual([]);
  });
});

describe('public addresses', () => {
  it('counts real sites, not development, tests or private networks', () => {
    for (const origin of ['https://dongbei.it', 'https://www.example.com', 'http://81.30.157.33'])
      expect(isPublicOrigin(origin), origin).toBe(true);
    for (const origin of [
      'http://localhost',
      'http://localhost:3000',
      'http://site-12.test',
      'http://shop.local',
      'http://127.0.0.1:8080',
      'http://192.168.1.20',
      'http://10.0.0.5',
      'http://172.20.1.1',
      'http://[::1]:3000',
      'http://intranet',
      'not a url',
    ])
      expect(isPublicOrigin(origin), origin).toBe(false);
  });
});
