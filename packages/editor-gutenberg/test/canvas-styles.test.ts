import { describe, expect, it } from 'vitest';
import { canvasStyles } from '../src/canvas-styles';

/** The canvas iframe's document, with what the adapter gives it. */
function canvas(html: string): Document {
  const doc = document.implementation.createHTMLDocument('canvas');
  doc.head.innerHTML = html;
  doc.body.innerHTML = '<p class="from-site">Text</p>';
  return doc;
}

describe('canvasStyles', () => {
  it('gives the canvas the theme’s styles, the plugins’ and then the Additional CSS', () => {
    const html = canvasStyles({
      styles: 'p{color:blue}',
      styleUrls: ['/plugin-assets/x/blocks.css'],
      additionalCss: '.from-site{color:rgb(1, 2, 3)}',
    });
    const doc = canvas(html);
    const sheets = [...doc.head.children].map((el) => el.id || el.getAttribute('href'));
    expect(sheets).toEqual([
      'cx-editor-theme-css',
      '/plugin-assets/x/blocks.css',
      'cx-additional-css',
    ]);
    expect(doc.getElementById('cx-additional-css')!.textContent).toBe(
      '.from-site{color:rgb(1, 2, 3)}',
    );
  });

  it('never lets the CSS close its element, and leaves out empty parts', () => {
    const html = canvasStyles({ additionalCss: 'a{}</style><script>alert(1)</script>' });
    const doc = canvas(html);
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    expect(doc.querySelectorAll('style')).toHaveLength(1);
    expect(doc.getElementById('cx-additional-css')!.textContent).toContain('\\3C /style>');
    expect(canvasStyles({ styles: ' ', additionalCss: '' })).toBe('');
  });
});
