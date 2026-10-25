import { describe, expect, it } from 'vitest';
import { renameCssSelectors } from './css-names.js';

const MAP = { 'old-': 'new-', 'oldtheme-': 'newtheme-' };

describe('class and id names of imported CSS renamed for the active theme', () => {
  it('renames class and id selectors, nested in at-rules too', () => {
    const css =
      '.old-article-inner, #old-header > a.old-x:hover { padding: 0 } @media (max-width: 921px) { body .oldtheme-a { margin: 1.5em } }';
    expect(renameCssSelectors(css, MAP)).toEqual({
      css: '.new-article-inner, #new-header > a.new-x:hover { padding: 0 } @media (max-width: 921px) { body .newtheme-a { margin: 1.5em } }',
      renamed: 4,
      rewrites: { 'old-': 'new-', 'oldtheme-': 'newtheme-' },
    });
  });

  it('leaves values, strings, urls and comments alone', () => {
    const css =
      '/* .old-a { } */ .a::before { content: ".old-b"; background: url(img/.old-c.png); font-family: old-font; } [class*="old-"] { color: #fff }';
    expect(renameCssSelectors(css, MAP)).toEqual({ css, renamed: 0, rewrites: {} });
  });

  it('works after declarations of nested rules and without a map', () => {
    expect(renameCssSelectors('.a { color: red; .old-b { color: blue } }', MAP).css).toBe(
      '.a { color: red; .new-b { color: blue } }',
    );
    expect(renameCssSelectors('.old-a{}', {})).toEqual({
      css: '.old-a{}',
      renamed: 0,
      rewrites: {},
    });
    expect(renameCssSelectors("@import url('x.css'); .old-a{}", MAP).css).toBe(
      "@import url('x.css'); .new-a{}",
    );
  });
});

describe('whole class names (core 0.83, plugins’ `import.cssClasses`)', () => {
  it('rename only that class or id, before the prefixes', () => {
    const names = { 'uagb-ifb-separator': 'pr-info-box__separator', 'bad name': 'x', a: 'b c' };
    expect(
      renameCssSelectors(
        '.custom-infobox .uagb-ifb-separator, .uagb-ifb-separator-x, #uagb-ifb-separator:hover { background-image: url(brush.uagb-ifb-separator.png) } .old-uagb-ifb-separator{}',
        MAP,
        names,
      ),
    ).toEqual({
      css: '.custom-infobox .pr-info-box__separator, .uagb-ifb-separator-x, #pr-info-box__separator:hover { background-image: url(brush.uagb-ifb-separator.png) } .new-uagb-ifb-separator{}',
      renamed: 3,
      rewrites: { 'uagb-ifb-separator': 'pr-info-box__separator', 'old-': 'new-' },
    });
    expect(renameCssSelectors('.a{}', {}, { a: 'b' }).css).toBe('.b{}');
  });
});
