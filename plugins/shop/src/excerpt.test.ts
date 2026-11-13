import { describe, expect, it } from 'vitest';
import { plainExcerpt, safeExcerpt } from './sync';

describe('short descriptions on cards', () => {
  it('keep simple formatting and safe links only', () => {
    expect(
      safeExcerpt(
        '<h2 class="x" onclick="a()">50 ml</h2><p style="color:red">Fresh <b>citrus</b><script>alert(1)</script></p><a href="javascript:x">bad</a> <a href="/shop">ok</a><img src=x onerror=y>',
      ),
    ).toBe('<h2>50 ml</h2><p>Fresh <b>citrus</b></p><a>bad</a> <a href="/shop">ok</a>');
    expect(plainExcerpt('<h2>50 ml</h2><p>Fresh &amp; <b>citrus</b></p>')).toBe(
      '50 ml Fresh & citrus',
    );
  });
});
