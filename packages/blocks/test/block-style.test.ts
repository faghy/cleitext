import { describe, expect, it } from 'vitest';
import { blockStyleCss, cleanBlockStyle, hasFlowGap } from '../src/index.js';

describe('block style (WordPress block supports)', () => {
  it('keeps only safe spacing, colors and text size', () => {
    expect(
      cleanBlockStyle({
        spacing: {
          margin: { top: '0', bottom: 'var:preset|spacing|20', left: 'calc(1px)', right: 12 },
          padding: { top: '1.5rem', bottom: '-2em', left: 'auto', right: '10%' },
          blockGap: { top: '80px', left: 'javascript:x' },
        },
        color: { text: '#4a4a4a', background: 'url(x)' },
        typography: { fontSize: '18px', lineHeight: 1.4 },
        border: { width: '2px' },
      }),
    ).toEqual({
      spacing: {
        margin: { top: '0', bottom: 'var:preset|spacing|20', right: '12px' },
        padding: { top: '1.5rem', bottom: '-2em', left: 'auto', right: '10%' },
        blockGap: { top: '80px' },
      },
      color: { text: '#4a4a4a' },
      typography: { fontSize: '18px', lineHeight: '1.4' },
    });
    expect(cleanBlockStyle({ typography: { lineHeight: 'normal; x' } })).toBeUndefined();
    expect(cleanBlockStyle({ spacing: { margin: 'oops' } })).toBeUndefined();
    expect(cleanBlockStyle(null)).toBeUndefined();
    expect(cleanBlockStyle('margin:0')).toBeUndefined();
    expect(cleanBlockStyle({ spacing: { margin: { top: 0 } } })).toEqual({
      spacing: { margin: { top: '0' } },
    });
  });

  it('turns it into CSS, with presets as variables', () => {
    expect(
      blockStyleCss({
        spacing: { margin: { top: '0' }, padding: { left: 'var:preset|spacing|30' } },
        color: { text: 'var(--brand)', background: '#fff' },
        typography: { fontSize: 'var:preset|font-size|large', lineHeight: '1.2' },
      }),
    ).toEqual({
      marginTop: '0',
      paddingLeft: 'var(--wp--preset--spacing--30)',
      color: 'var(--brand)',
      backgroundColor: '#fff',
      fontSize: 'var(--wp--preset--font-size--large)',
      lineHeight: '1.2',
    });
    expect(blockStyleCss({})).toBeUndefined();
  });

  it('puts the block gap between flex children, or between stacked ones', () => {
    const rows = { spacing: { blockGap: { top: '80px', left: 'var:preset|spacing|60' } } };
    expect(blockStyleCss(rows, { flex: true })).toEqual({
      rowGap: '80px',
      columnGap: 'var(--wp--preset--spacing--60)',
    });
    expect(blockStyleCss({ spacing: { blockGap: '1em' } }, { flex: true })).toEqual({
      gap: '1em',
    });
    expect(blockStyleCss({ spacing: { blockGap: '8px' } })).toEqual({ '--cx-block-gap': '8px' });
    expect(blockStyleCss(rows)).toEqual({ '--cx-block-gap': '80px' });
    expect(hasFlowGap({ spacing: { blockGap: '8px' } })).toBe(true);
    expect(hasFlowGap({ spacing: { blockGap: { left: '8px' } } })).toBe(false);
    expect(hasFlowGap(undefined)).toBe(false);
  });
});
