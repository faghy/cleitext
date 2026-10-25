/** The allowlist of the HTML block (users without unfiltered_html): inline styles. */
import { describe, expect, it } from 'vitest';
import { sanitizeHtmlBlock } from '../src/content/html-sanitize.js';

describe('HTML block sanitizer, inline styles', () => {
  it('keeps safe text styles, as an imported widget has them', () => {
    const html =
      '<p><a href="/cookie-policy/"><span style="font-size: 10pt">Cookie Policy</span></a>' +
      '<span style="font-size: 10pt;color:#ff0000;font-weight:700"> - x</span></p>';
    const out = sanitizeHtmlBlock(html);
    expect(out).toContain('<span style="font-size:10pt">Cookie Policy</span>');
    expect(out).toContain('style="font-size:10pt;color:#ff0000;font-weight:700"');
  });

  it('drops unsafe properties and values', () => {
    const out = sanitizeHtmlBlock(
      '<div style="background-image:url(https://evil.example/x.png);position:fixed;color:expression(alert(1));width:100%">x</div>' +
        '<span style="behavior:url(x.htc)">y</span>',
    );
    expect(out).toBe('<div style="width:100%">x</div><span>y</span>');
  });
});
