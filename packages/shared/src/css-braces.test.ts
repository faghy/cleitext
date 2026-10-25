import { describe, expect, it } from 'vitest';
import { balanceCss, cssBraceProblem, scanCssBraces } from './css-braces.js';
import { additionalCssProblem } from './themes.js';

describe('braces of a style sheet (core 0.82)', () => {
  it('ignores braces inside comments, strings and escapes', () => {
    const css = '.a::before{content:"}{"} /* } { */ .b{content:\'{\'} .c\\{{x:y}';
    expect(scanCssBraces(css)).toEqual({ open: [], stray: [], comment: -1, quote: '' });
    expect(cssBraceProblem(css)).toBeNull();
    // A line break ends a string, as browsers read it.
    expect(cssBraceProblem('.a{content:"x\n}')).toBeNull();
  });

  it('says what does not match', () => {
    expect(cssBraceProblem('.a{}}')).toBe('The CSS has a } with no { before it.');
    expect(cssBraceProblem('.a{} /* x')).toBe(
      'The CSS has a comment that is never closed with */.',
    );
    expect(cssBraceProblem('.a{content:"x')).toBe('The CSS has a string that is never closed.');
    expect(cssBraceProblem('@media print{.a{}')).toBe('The CSS has a { that is never closed.');
    expect(additionalCssProblem('@media print{')).toBe('The CSS has a { that is never closed.');
    expect(additionalCssProblem('@media print{.a{}}')).toBeNull();
  });

  it('removes an empty block left open at the end (bolognaolistica.com)', () => {
    const css =
      '.smartslider3 {\n    display:initial;\n    position: relative;\n}@media screen and (max-width: 580px){';
    expect(balanceCss(css)).toEqual({
      css: '.smartslider3 {\n    display:initial;\n    position: relative;\n}',
      closed: 0,
      dropped: 1,
      stray: 0,
      ended: false,
    });
    // Nested empty blocks go too, comments inside them count as empty.
    expect(balanceCss('.a{}\n@media print{ .b { /* later */').css).toBe('.a{}');
    expect(balanceCss('.a{}; @supports (x:y){ @media print{').css).toBe('.a{};');
  });

  it('closes a block with content, as a browser reads it alone', () => {
    expect(balanceCss('@media print{.a{color:red}')).toMatchObject({
      css: '@media print{.a{color:red}\n}',
      closed: 1,
    });
    expect(balanceCss('.a{color:red').css).toBe('.a{color:red\n}');
    // An empty inner block goes, its parent with content is closed.
    expect(balanceCss('@media print{.a{} .b{').css).toBe('@media print{.a{}\n}');
  });

  it('removes stray } and ends comments and strings', () => {
    expect(balanceCss('.a{}} .b{}')).toMatchObject({ css: '.a{} .b{}', stray: 1 });
    expect(balanceCss('.a{} /* note')).toMatchObject({ css: '.a{} /* note*/', ended: true });
    expect(balanceCss('.a{content:"x').css).toBe('.a{content:"x"\n}');
    expect(balanceCss('.a{color:red}')).toEqual({
      css: '.a{color:red}',
      closed: 0,
      dropped: 0,
      stray: 0,
      ended: false,
    });
    for (const css of ['@media print{.a{}', '.a{}}', '.a{} /* x', 'x{', '}{', '.a{"']) {
      expect(cssBraceProblem(balanceCss(css).css)).toBeNull();
    }
  });
});
