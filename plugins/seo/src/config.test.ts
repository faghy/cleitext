import { describe, expect, it } from 'vitest';
import { applyTemplate, pageVariable } from './config';

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
});
