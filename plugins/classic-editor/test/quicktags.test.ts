import { describe, expect, it } from 'vitest';
import { applyTag, closeTags, TAG_BUTTONS } from '../src/quicktags.js';

const button = (id: string) => TAG_BUTTONS.find((b) => b.id === id)!;

describe('quick tags', () => {
  it('wraps the selection', () => {
    const result = applyTag({ value: 'say hello now', start: 4, end: 9 }, button('strong'), []);
    expect(result.value).toBe('say <strong>hello</strong> now');
    expect(result.open).toEqual([]);
  });

  it('opens a tag without a selection, and closes it on the next click', () => {
    const opened = applyTag({ value: 'ab', start: 1, end: 1 }, button('em'), []);
    expect(opened).toEqual({ value: 'a<em>b', start: 5, end: 5, open: ['em'] });
    const closed = applyTag({ value: 'a<em>xb', start: 6, end: 6 }, button('em'), opened.open);
    expect(closed.value).toBe('a<em>x</em>b');
    expect(closed.open).toEqual([]);
  });

  it('closes all open tags, the last first', () => {
    const result = closeTags({ value: '<ul>\n\t<li>x', start: 11, end: 11 }, ['ul', 'li']);
    expect(result.value).toBe('<ul>\n\t<li>x</li>\n</ul>\n\n');
    expect(result.open).toEqual([]);
  });

  it('asks for the address of links and images', () => {
    const state = { value: 'go', start: 0, end: 2 };
    expect(applyTag(state, button('link'), []).value).toBe('go');
    expect(applyTag(state, button('link'), [], { href: 'https://a.test/?a&b' }).value).toBe(
      '<a href="https://a.test/?a&amp;b">go</a>',
    );
    expect(
      applyTag({ value: '', start: 0, end: 0 }, button('img'), [], { src: '/a.png', alt: 'A "b"' })
        .value,
    ).toBe('<img src="/a.png" alt="A &quot;b&quot;" />');
  });

  it('inserts the More tag', () => {
    expect(applyTag({ value: 'ab', start: 1, end: 1 }, button('more'), []).value).toBe(
      'a<!--more-->b',
    );
  });
});
