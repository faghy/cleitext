import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  color,
  defaultLayer,
  defaultSlider,
  normalizeSlider,
  optionalNum,
} from '../src/model/normalize';
import type { Layer, LayerStyle, SliderData } from '../src/model/types';
import { BASE_CSS } from '../src/render/base-css';
import { layerDeclarations, shadowDeclaration, sliderCss } from '../src/render/css';
import { SliderView } from '../src/render/render';
import { MEDIA, sample } from './fixtures';

/** A slider made before Diorama 1.3, as it was saved. */
const OLD = {
  v: 1,
  type: 'slider',
  layout: 'fullwidth',
  navigation: {
    arrows: true,
    bullets: true,
    progress: false,
    style: 'circle',
    color: '#ffffff',
    size: 44,
    hideArrowsOnMobile: true,
  },
  slides: [
    {
      id: 's1',
      layers: [
        {
          id: 'h1',
          type: 'heading',
          content: { text: 'Hello' },
          style: { base: { shadow: true } },
        },
        {
          id: 'b1',
          type: 'button',
          content: { text: 'Go' },
          style: { base: { shadow: true } },
        },
      ],
    },
    { id: 's2', layers: [] },
  ],
};

function heading(style: Partial<LayerStyle>, tablet?: Partial<LayerStyle>): Layer {
  const layer = defaultLayer('heading');
  layer.id = 'h1';
  layer.style = { base: { ...layer.style.base, ...style }, ...(tablet ? { tablet } : {}) };
  return layer;
}

describe('defaults and older sliders (Diorama 1.3)', () => {
  it('starts with the soft shadow and the style’s arrows', () => {
    const slider = defaultSlider();
    expect(slider.navigation).toMatchObject({
      arrowOffset: null,
      arrowBackground: '',
      arrowHoverBackground: '',
    });
    expect(defaultLayer('heading').style.base).toMatchObject({
      shadow: false,
      shadowMode: 'preset',
      shadowX: 0,
      shadowY: 2,
      shadowBlur: 14,
      shadowColor: '#00000073',
    });
  });

  it('reads a slider saved before 1.3 with the new values at their defaults', () => {
    const slider = normalizeSlider(OLD);
    expect(slider.navigation.arrowOffset).toBeNull();
    expect(slider.navigation.arrowBackground).toBe('');
    expect(slider.navigation.arrowHoverBackground).toBe('');
    const [h, b] = slider.slides[0]!.layers;
    expect(h!.style.base.shadow).toBe(true);
    expect(h!.style.base.shadowMode).toBe('preset');
    expect(b!.style.base.shadowMode).toBe('preset');
  });

  it('draws a slider saved before 1.3 exactly as before', () => {
    const css = sliderCss(normalizeSlider(OLD), 'k');
    expect(css).toContain('.dio-sk .dio-lh1{');
    expect(css).toContain('text-shadow:0 2px 14px rgba(0,0,0,.45)');
    expect(css).toContain('box-shadow:0 14px 40px rgba(0,0,0,.3)');
    expect(css).not.toContain('--dio-arrow-x');
    expect(css).not.toContain('.dio__arrow');
    // The arrows keep their automatic place.
    expect(BASE_CSS).toContain('.dio__arrow--prev{left:var(--dio-arrow-x,clamp(8px,2cqw,24px))}');
    expect(BASE_CSS).toContain('.dio__arrow--next{right:var(--dio-arrow-x,clamp(8px,2cqw,24px))}');
  });

  it('normalizes to itself', () => {
    const once = normalizeSlider(OLD);
    expect(normalizeSlider(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });
});

describe('colours', () => {
  it('turns rgb() and rgba() into hexadecimal colours', () => {
    expect(color('rgba(0,0,0,.5)', '')).toBe('#00000080');
    expect(color('rgba(255, 255, 255, 0.25)', '')).toBe('#ffffff40');
    expect(color('rgb(17 34 51 / 50%)', '')).toBe('#11223380');
    expect(color('rgb(255,0,0)', '')).toBe('#ff0000');
    expect(color('rgba(0,0,0,1)', '')).toBe('#000000');
    expect(color('rgba(0,0,0,2)', '')).toBe('#000000');
    expect(color('#000', '')).toBe('#000');
    expect(color('transparent', '')).toBe('transparent');
  });

  it('refuses what is not a colour', () => {
    expect(color('rgb(300,0,0)', 'x')).toBe('x');
    expect(color('rgba(0,0,0)garbage', 'x')).toBe('x');
    expect(color('red;background:url(x)', 'x')).toBe('x');
    expect(color(12, 'x')).toBe('x');
  });

  it('keeps an optional number bounded, or none', () => {
    expect(optionalNum(30, 0, 400)).toBe(30);
    expect(optionalNum('30', 0, 400)).toBe(30);
    expect(optionalNum(-5, 0, 400)).toBe(0);
    expect(optionalNum(9999, 0, 400)).toBe(400);
    expect(optionalNum(null, 0, 400)).toBeNull();
    expect(optionalNum(undefined, 0, 400)).toBeNull();
    expect(optionalNum('', 0, 400)).toBeNull();
    expect(optionalNum('abc', 0, 400)).toBeNull();
  });
});

describe('custom shadows', () => {
  it('bounds and cleans the values', () => {
    const slider = normalizeSlider({
      slides: [
        {
          id: 's1',
          layers: [
            {
              id: 'h1',
              type: 'heading',
              style: {
                base: {
                  shadow: true,
                  shadowMode: 'custom',
                  shadowX: 999,
                  shadowY: -999,
                  shadowBlur: -3,
                  shadowColor: 'rgba(0,0,0,.5)',
                },
                tablet: { shadowMode: 'nope', shadowBlur: 4, shadowColor: 'url(x)' },
              },
            },
          ],
        },
      ],
    });
    const style = slider.slides[0]!.layers[0]!.style;
    expect(style.base).toMatchObject({
      shadowMode: 'custom',
      shadowX: 200,
      shadowY: -200,
      shadowBlur: 0,
      shadowColor: '#00000080',
    });
    // Invalid overrides fall back to the larger device's values.
    expect(style.tablet).toEqual({
      shadowMode: 'custom',
      shadowBlur: 4,
      shadowColor: '#00000080',
    });
  });

  it('writes Slider Revolution’s 0 10px 10px #000 on the letters', () => {
    const layer = heading({
      shadow: true,
      shadowMode: 'custom',
      shadowX: 0,
      shadowY: 10,
      shadowBlur: 10,
      shadowColor: '#000',
    });
    expect(shadowDeclaration(layer, layer.style.base)).toBe('text-shadow:0px 10px 10px #000');
    expect(layerDeclarations(layer, 'desktop', true, true)).toContain(
      'text-shadow:0px 10px 10px #000',
    );
  });

  it('casts a box’s shadow for buttons, pictures and shapes', () => {
    const button = defaultLayer('button');
    const s: LayerStyle = {
      ...button.style.base,
      shadow: true,
      shadowMode: 'custom',
      shadowX: -2,
      shadowY: 4,
      shadowBlur: 8,
      shadowColor: '#ff000080',
    };
    expect(shadowDeclaration(button, s)).toBe('box-shadow:-2px 4px 8px #ff000080');
    expect(shadowDeclaration(button, { ...s, shadowMode: 'preset' })).toBe(
      'box-shadow:0 14px 40px rgba(0,0,0,.3)',
    );
  });

  it('writes nothing without a shadow, whatever the custom values', () => {
    const layer = heading({ shadow: false, shadowMode: 'custom', shadowY: 10 });
    expect(shadowDeclaration(layer, layer.style.base)).toBe('');
    expect(layerDeclarations(layer, 'desktop', true, true)).not.toContain('shadow');
  });

  it('changes per device, and takes the shadow off where it is turned off', () => {
    const slider = defaultSlider({
      slides: [
        {
          ...normalizeSlider({ slides: [{ id: 's1' }] }).slides[0]!,
          layers: [
            heading(
              { shadow: true, shadowMode: 'custom', shadowY: 10, shadowBlur: 10 },
              { shadowY: 4 },
            ),
          ],
        },
      ],
    });
    const css = sliderCss(slider, 'k');
    expect(css).toContain('text-shadow:0px 10px 10px #00000073');
    expect(css).toMatch(/@media \(max-width:\d+px\)\{[^@]*text-shadow:0px 4px 10px #00000073/);

    const off = defaultSlider({
      slides: [{ ...slider.slides[0]!, layers: [heading({ shadow: true }, { shadow: false })] }],
    });
    expect(layerDeclarations(off.slides[0]!.layers[0]!, 'tablet', true, true)).toContain(
      'text-shadow:none',
    );
    // Phones follow the tablet's rule already (media queries add up).
    expect(layerDeclarations(off.slides[0]!.layers[0]!, 'mobile', true, true)).not.toContain(
      'shadow',
    );
  });
});

describe('the arrows’ place and background', () => {
  const custom = (navigation: Partial<SliderData['navigation']>) => {
    const base = sample();
    return normalizeSlider({ ...base, navigation: { ...base.navigation, ...navigation } });
  };

  it('bounds the values and reads rgba()', () => {
    const slider = custom({
      arrowOffset: 9999,
      arrowBackground: 'rgba(0,0,0,.5)',
      arrowHoverBackground: 'javascript:alert(1)',
    });
    expect(slider.navigation.arrowOffset).toBe(400);
    expect(slider.navigation.arrowBackground).toBe('#00000080');
    expect(slider.navigation.arrowHoverBackground).toBe('');
  });

  it('places the arrows at the distance set, on the page and in the editor', () => {
    const slider = custom({ arrowOffset: 30 });
    expect(sliderCss(slider, 'k')).toMatch(/\.dio-sk\{[^}]*--dio-arrow-x:30px/);
    for (const device of ['desktop', 'tablet', 'mobile'] as const)
      expect(sliderCss(slider, 'k', { device })).toContain('--dio-arrow-x:30px');
    expect(sliderCss(custom({ arrowOffset: 0 }), 'k')).toContain('--dio-arrow-x:0px');
  });

  it('gives the arrows their own background and one under the mouse', () => {
    const slider = custom({ arrowBackground: '#00000080', arrowHoverBackground: '#000000bf' });
    const css = sliderCss(slider, 'k');
    expect(css).toContain('.dio-sk .dio__arrow{background:#00000080}');
    expect(css).toContain('.dio-sk .dio__arrow:not([disabled]):hover{background:#000000bf}');
    const canvas = sliderCss(slider, 'k', { device: 'mobile' });
    expect(canvas).toContain('.dio-sk .dio__arrow{background:#00000080}');
    // Only the background: the hover follows the style.
    const only = sliderCss(custom({ arrowBackground: '#00000080' }), 'k');
    expect(only).toContain('.dio-sk .dio__arrow{background:#00000080}');
    expect(only).not.toContain(':hover');
  });

  it('puts the rules in the slider’s markup, after the shared CSS', () => {
    const slider = custom({ arrowOffset: 30, arrowBackground: '#00000080' });
    for (const mode of [undefined, 'canvas'] as const) {
      const markup = renderToStaticMarkup(
        <SliderView
          slider={slider}
          scope="abc"
          uid="dio-b1"
          title="Home"
          locale="en"
          media={MEDIA}
          withBaseCss
          {...(mode ? { mode, device: 'desktop' as const } : {})}
        />,
      );
      const style = /<style>([\s\S]*?)<\/style>/.exec(markup)![1]!;
      expect(style).toContain('--dio-arrow-x:30px');
      expect(style.indexOf('.dio-sabc .dio__arrow{background:#00000080}')).toBeGreaterThan(
        style.indexOf('.dio-nav--circle .dio__arrow{'),
      );
      expect(markup).toContain('dio__arrow--prev');
    }
  });
});
