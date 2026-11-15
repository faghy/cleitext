import { describe, expect, it } from 'vitest';
import { customAttributes, linkProps } from '../src/core/links.js';

describe('links', () => {
  it('carry the title and the custom attributes', () => {
    expect(
      linkProps({
        url: '/argomenti/seo/',
        newTab: true,
        title: ' Articoli sulla SEO ',
        attributes: 'data-track|menu, aria-label|SEO, id|seo',
      }),
    ).toEqual({
      'data-track': 'menu',
      'aria-label': 'SEO',
      id: 'seo',
      href: '/argomenti/seo/',
      target: '_blank',
      rel: 'noopener',
      title: 'Articoli sulla SEO',
    });
  });

  it('never take scripts, addresses or styles from the custom attributes', () => {
    expect(
      customAttributes(
        'onclick|alert(1), ONMOUSEOVER|x, href|javascript:alert(1), style|color:red, src|x, "bad|1, data-ok|1, download',
      ),
    ).toEqual({ 'data-ok': '1', download: '' });
    expect(linkProps({ url: '/', attributes: 'href|https://evil.example' })).toEqual({ href: '/' });
  });
});
