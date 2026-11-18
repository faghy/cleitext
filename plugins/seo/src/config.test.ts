import { describe, expect, it } from 'vitest';
import {
  applyTemplate,
  cleanVerificationFiles,
  pageVariable,
  searchTitle,
  verificationFile,
} from './config';

describe('title templates', () => {
  it('say which page of an archive, as Yoast SEO’s %%page%%', () => {
    expect(pageVariable('it', '-', 2, 22)).toBe('- Pagina 2 di 22');
    expect(pageVariable('en', '|', 3, 4)).toBe('| Page 3 of 4');
    // Older cores give no total.
    expect(pageVariable('en', '–', 2, undefined)).toBe('– Page 2');
    expect(pageVariable('it', '-', 1, 22)).toBe('');
    const template = '%%title%% %%page%% %%sep%% %%sitename%%';
    const values = { title: 'Blog', sep: '-', sitename: 'Lino Missio' };
    expect(applyTemplate(template, { ...values, page: pageVariable('it', '-', 2, 22) })).toBe(
      'Blog - Pagina 2 di 22 - Lino Missio',
    );
    expect(applyTemplate(template, { ...values, page: '' })).toBe('Blog - Lino Missio');
  });

  it('use the title as written in WordPress while the page keeps the imported one', () => {
    expect(searchTitle('L’ipnosi – cos’è', "L'ipnosi - cos'è")).toBe("L'ipnosi - cos'è");
    expect(searchTitle('Quattro – passi', 'Quattro -- passi')).toBe('Quattro -- passi');
    // Renamed since: the new title.
    expect(searchTitle('L’ipnosi oggi', "L'ipnosi - cos'è")).toBe('L’ipnosi oggi');
    expect(searchTitle('Title', undefined)).toBe('Title');
  });
});

describe('verification files', () => {
  const files = cleanVerificationFiles([
    {
      name: '/google7b1481c7b4e3669e.html',
      content: 'google-site-verification: google7b1481c7b4e3669e.html',
    },
    { name: 'BingSiteAuth.xml', content: '<?xml version="1.0"?><users><user>K</user></users>' },
    { name: 'robots.txt', content: 'User-agent: *' },
    { name: 'x.php', content: 'no' },
    { name: 'empty.txt', content: ' ' },
    { name: 'BingSiteAuth.xml', content: 'twice' },
  ]);

  it('keep valid names with a content, once each', () => {
    expect(files.map((f) => f.name)).toEqual(['google7b1481c7b4e3669e.html', 'BingSiteAuth.xml']);
  });

  it('are served with the type of their extension, and nothing else is', () => {
    expect(verificationFile(files, 'google7b1481c7b4e3669e.html')).toEqual({
      body: 'google-site-verification: google7b1481c7b4e3669e.html',
      contentType: 'text/html; charset=utf-8',
    });
    expect(verificationFile(files, 'BingSiteAuth.xml')?.contentType).toBe(
      'application/xml; charset=utf-8',
    );
    expect(verificationFile(files, 'other.html')).toBeNull();
    expect(verificationFile(files, 'robots.txt')).toBeNull();
  });
});
