import { describe, expect, it } from 'vitest';
import { balanceCss, scanCssBraces } from './css-braces';

describe('braces of the imported Additional CSS', () => {
  it('ignores braces in comments, strings and escapes', () => {
    expect(scanCssBraces('.a::after{content:"}"} /* { */ .b\\{{x:y}')).toEqual({
      open: [],
      stray: [],
      comment: -1,
      quote: '',
    });
  });

  it('ends what is left open, as a browser reads the CSS alone', () => {
    expect(balanceCss('.a{} /* note')).toMatchObject({ css: '.a{} /* note*/', ended: true });
    expect(balanceCss(".a{content:'x")).toMatchObject({ css: ".a{content:'x'\n}", closed: 1 });
    expect(balanceCss('.a{}}')).toMatchObject({ css: '.a{}', stray: 1 });
    expect(balanceCss('.a{}@media print{').css).toBe('.a{}');
  });
});
