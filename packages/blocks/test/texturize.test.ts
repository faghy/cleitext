import { describe, expect, it } from 'vitest';
import { texturizeHtml, texturizeText } from '../src/html.js';

describe('WordPress typography (wptexturize)', () => {
  it('turns quotes, dashes, ellipses and dimensions as WordPress shows them', () => {
    expect(texturizeText("L'evoluzione dei cocktails, all'anno 1000")).toBe(
      'L’evoluzione dei cocktails, all’anno 1000',
    );
    expect(texturizeText('Lei disse "ciao" e \'basta\'.')).toBe('Lei disse “ciao” e ‘basta’.');
    expect(texturizeText('VITTORIANI (1837 - 1901) -- oggi --- domani...')).toBe(
      'VITTORIANI (1837 – 1901) — oggi — domani…',
    );
    expect(texturizeText("10--20, 2x3 m, 6' tall, a 12\" pizza, the '90s")).toBe(
      '10–20, 2×3 m, 6′ tall, a 12″ pizza, the ’90s',
    );
  });

  it('leaves comments, attributes, shortcodes and code alone', () => {
    expect(texturizeHtml('<p>[gallery ids="10"] "x"</p>')).toBe('<p>[gallery ids="10"] “x”</p>');
    const html =
      '<!-- wp:paragraph {"label":"it\'s"} --><p title="it\'s">It\'s <code>a\'b -- c</code> "x"</p><!-- /wp:paragraph -->';
    expect(texturizeHtml(html)).toBe(
      '<!-- wp:paragraph {"label":"it\'s"} --><p title="it\'s">It’s <code>a\'b -- c</code> “x”</p><!-- /wp:paragraph -->',
    );
  });
});
