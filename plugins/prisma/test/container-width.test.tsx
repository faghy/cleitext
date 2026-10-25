import { describe, expect, it } from 'vitest';
import { container } from '../src/blocks/container';
import { DEFAULT_GLOBALS, normalizeGlobals } from '../src/lib/globals';
import { renderBlock } from './render';

const boxedRoot = {
  isBlockRootParent: true,
  contentWidth: 'alignfull',
  innerContentWidth: 'alignwide',
};

describe('content width of full-width containers', () => {
  it('without a width of their own nor a site-wide one: the theme’s, else 1140px', () => {
    const { css } = renderBlock(container, boxedRoot);
    expect(css).toContain(
      '--inner-content-custom-width:min(100%, var(--cx-container-width, 1140px))',
    );
  });

  it('the site-wide width (Settings → Prisma) when set', () => {
    const globals = normalizeGlobals({ contentWidth: 1300 });
    const { css } = renderBlock(container, boxedRoot, { globals });
    expect(css).toContain('--inner-content-custom-width:min(100%, 1300px)');
  });

  it('the container’s own width first', () => {
    const { css } = renderBlock(container, { ...boxedRoot, innerContentCustomWidthDesktop: 900 });
    expect(css).toContain('--inner-content-custom-width:min(100%, 900px)');
  });

  it('an empty or invalid setting is unset', () => {
    expect(DEFAULT_GLOBALS.contentWidth).toBeNull();
    expect(normalizeGlobals({ contentWidth: '' }).contentWidth).toBeNull();
    expect(normalizeGlobals({}).contentWidth).toBeNull();
    expect(normalizeGlobals({ contentWidth: 10 }).contentWidth).toBeNull();
  });
});
