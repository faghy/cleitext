import { describe, expect, it } from 'vitest';
import { atomicKitCss, stylePropCss, STYLE_PROPS, variantsCss } from '../src/core/atomic.js';
import { elementCss } from '../src/core/css.js';
import { DEFAULT_KIT, kitCss, normalizeKit } from '../src/core/kit.js';
import { DEFAULT_BREAKPOINTS } from '../src/core/model.js';
import { setVariantProp } from '../src/editor/atomic-style.js';
import { aHeading } from '../src/elements/atomic.js';

const prop = (key: string) => STYLE_PROPS.find((p) => p.key === key)!;

describe('atomic styles', () => {
  it('writes variants per device and state', () => {
    const css = variantsCss(
      '.x',
      [
        {
          device: 'desktop',
          state: '',
          props: {
            color: '#111111',
            padding: { top: 10, right: 20, bottom: 10, left: 20, unit: 'px' },
          },
        },
        { device: 'desktop', state: 'hover', props: { color: 'var(--fr-c-accent)' } },
        {
          device: 'mobile',
          state: '',
          props: { fontSize: { size: 14, unit: 'px' }, display: 'none' },
        },
      ],
      DEFAULT_BREAKPOINTS,
    );
    expect(css).toBe(
      '.x{color:#111111;padding:10px 20px 10px 20px}.x:hover{color:var(--fr-c-accent)}@media (max-width:767px){.x{font-size:14px;display:none}}',
    );
  });

  it('drops unsafe values', () => {
    expect(stylePropCss(prop('display'), 'grid;}body{x')).toBeNull();
    expect(stylePropCss(prop('backgroundImage'), 'javascript:alert(1)')).toBeNull();
    expect(stylePropCss(prop('backgroundImage'), '/media/a.jpg')).toBe('url("/media/a.jpg")');
    expect(stylePropCss(prop('width'), { size: '1;color:red', unit: 'px' })).toBeNull();
    expect(stylePropCss(prop('color'), 'var(--fr-v-brand)')).toBe('var(--fr-v-brand)');
    expect(stylePropCss(prop('gridTemplateColumns'), 3)).toBe('repeat(3, minmax(0, 1fr))');
  });

  it('styles atomic elements from their variants, and global classes and variables in the kit', () => {
    const css = elementCss(
      aHeading,
      {
        id: 'h1',
        type: 'fresco/a-heading',
        v: 1,
        attrs: { _styles: [{ device: 'tablet', state: '', props: { textAlign: 'center' } }] },
      },
      DEFAULT_BREAKPOINTS,
    );
    expect(css).toBe('@media (max-width:1024px){.fr-e-h1{text-align:center}}');
    const kit = normalizeKit({
      ...DEFAULT_KIT,
      classes: [
        {
          id: 'card',
          label: 'Card',
          variants: [
            {
              device: 'desktop',
              state: 'hover',
              props: { boxShadow: { x: 0, y: 8, blur: 24, color: 'rgba(0,0,0,.2)' } },
            },
          ],
        },
      ],
      variables: [
        { id: 'brand', label: 'Brand', type: 'color', value: '#c2410c' },
        { id: 'bad', label: 'Bad', type: 'size', value: '1px;color:red' },
      ],
    });
    expect(atomicKitCss(kit.classes, kit.variables, kit.breakpoints)).toBe(
      ':root{--fr-v-brand:#c2410c}.fr-g-card:hover{box-shadow:0px 8px 24px 0px rgba(0,0,0,.2)}',
    );
    expect(kitCss(kit)).toContain('.fr-g-card:hover');
  });

  it('edits one property of a variant, removing empty variants', () => {
    let variants = setVariantProp([], 'mobile', 'hover', 'color', '#fff');
    expect(variants).toEqual([{ device: 'mobile', state: 'hover', props: { color: '#fff' } }]);
    variants = setVariantProp(variants, 'mobile', 'hover', 'color', undefined);
    expect(variants).toEqual([]);
  });
});
