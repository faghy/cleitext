import { describe, expect, it } from 'vitest';
import { safeHref, sanitizeHtml } from '../src/sanitize';

describe('sanitizer', () => {
  it('keeps what Mastodon sends', () => {
    const html =
      '<p><span class="h-card" translate="no"><a href="https://disbigle.com/@blog" class="u-url mention">@<span>blog</span></a></span> Bello! <a href="https://example.com/a-very-long-link" rel="nofollow noopener" target="_blank"><span class="invisible">https://</span><span class="ellipsis">example.com/a-very</span><span class="invisible">-long-link</span></a></p><p>Riga<br />due</p>';
    expect(sanitizeHtml(html)).toBe(
      '<p><span><a href="https://disbigle.com/@blog" rel="nofollow ugc noopener noreferrer" target="_blank">@<span>blog</span></a></span> Bello! <a href="https://example.com/a-very-long-link" rel="nofollow ugc noopener noreferrer" target="_blank"><span class="invisible">https://</span><span class="ellipsis">example.com/a-very</span><span class="invisible">-long-link</span></a></p><p>Riga<br>due</p>',
    );
  });

  it('drops scripts, styles, events and dangerous links', () => {
    const out = sanitizeHtml(
      '<p onclick="x()" style="color:red">Hi<script>alert(1)</script><style>p{}</style><img src=x onerror=alert(1)><a href="javascript:alert(1)">js</a><a href=" jav&#x61;script:alert(1)">e</a><iframe src="https://evil.example"></iframe><svg><script>1</script></svg></p>',
    );
    expect(out).toBe('<p>Hi<a>js</a><a>e</a></p>');
  });

  it('escapes stray characters and closes what is left open', () => {
    expect(sanitizeHtml('<p>a < b & c > d "q"<b>bold')).toBe(
      '<p>a &lt; b &amp; c &gt; d "q"<b>bold</b></p>',
    );
    expect(sanitizeHtml('</p>x</em><!-- c --><em>y')).toBe('x<em>y</em>');
    expect(sanitizeHtml('<a href="https://a.example"><a href="https://b.example">n</a></a>')).toBe(
      '<a href="https://a.example" rel="nofollow ugc noopener noreferrer" target="_blank">n</a>',
    );
  });

  it('keeps entities and escapes quotes in addresses', () => {
    expect(sanitizeHtml('<p>&lt;b&gt; &amp; &#39;</p>')).toBe('<p>&lt;b&gt; &amp; &#39;</p>');
    expect(sanitizeHtml('<a href=\'https://x.example/?a=1&amp;b="2"\'>l</a>')).toBe(
      '<a href="https://x.example/?a=1&amp;b=&quot;2&quot;" rel="nofollow ugc noopener noreferrer" target="_blank">l</a>',
    );
  });

  it('takes only http(s) addresses', () => {
    expect(safeHref('https://ok.example/x')).toBe('https://ok.example/x');
    expect(safeHref('data:text/html,hi')).toBeNull();
    expect(safeHref('https://ok.example/a b')).toBeNull();
    expect(safeHref('//evil.example')).toBeNull();
  });

  it('gives nothing for what is not text', () => {
    expect(sanitizeHtml(undefined)).toBe('');
    expect(sanitizeHtml(42)).toBe('');
  });
});
