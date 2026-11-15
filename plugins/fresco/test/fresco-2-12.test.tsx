/**
 * Fresco 2.12: list markers in texts, responsive images with a maximum
 * width, containers with calc() widths and negative margins, background
 * videos held until consent, the Flip box and a link per carousel image.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CSS_SIZE_PATTERN } from '../src/core/common.js';
import { toBlocks } from '../src/core/convert.js';
import { elementCss, withDefaults } from '../src/core/css.js';
import {
  DEFAULT_BREAKPOINTS,
  type ElementDefinition,
  type RenderContext,
} from '../src/core/model.js';
import { sanitizeRich } from '../src/core/sanitize.js';
import { image } from '../src/elements/basic.js';
import { container } from '../src/elements/container.js';
import { flipBox } from '../src/elements/flip-box.js';
import { FREE_ELEMENTS } from '../src/elements/index.js';
import { imageCarousel } from '../src/elements/widgets.js';

const context: RenderContext = {
  media: new Map(),
  locale: 'en',
  editing: false,
  site: { title: '', tagline: '', home: '/' },
};

const node = (type: string, attrs: Record<string, unknown>) => ({
  id: 'abc123',
  type,
  v: 1,
  attrs,
});

const css = (definition: ElementDefinition, attrs: Record<string, unknown>) =>
  elementCss(definition, node(definition.type, attrs), DEFAULT_BREAKPOINTS);

const html = (definition: ElementDefinition, attrs: Record<string, unknown>, editing = false) =>
  renderToStaticMarkup(
    definition.render({
      node: node(definition.type, attrs),
      settings: withDefaults(definition, attrs),
      children: null,
      context: { ...context, editing },
    }) as React.ReactElement,
  );

describe('lists in texts', () => {
  it('keeps list markers: list-style-type and the type attribute', () => {
    expect(
      sanitizeRich(
        '<ul style="list-style-type: square"><li style="list-style-type: circle">a</li></ul><ol type="I" start="3"><li value="5">b</li></ol><ul style="list-style: decimal inside">c</ul>',
      ),
    ).toBe(
      '<ul style="list-style-type: square"><li style="list-style-type: circle">a</li></ul><ol type="I" start="3"><li value="5">b</li></ol><ul style="list-style: decimal inside">c</ul>',
    );
  });

  it('drops anything else', () => {
    expect(
      sanitizeRich(
        '<ul style="list-style-type: url(x); list-style-image: url(y)" type="javascript"><li value="x">a</li></ul><p style="list-style-type: square">b</p>',
      ),
    ).toBe('<ul><li>a</li></ul><p>b</p>');
  });
});

describe('images with a maximum width', () => {
  it('stay within their box, so they keep their proportions', () => {
    expect(css(image, { max_width: { size: 500, unit: 'px' } })).toContain(
      '.fr-e-abc123 img{max-width:min(100%, 500px)}',
    );
    expect(css(image, { 'max_width@mobile': { size: 80, unit: '%' } })).toContain(
      'max-width:min(100%, 80%)',
    );
  });
});

describe('containers', () => {
  it('take a width written as calc()', () => {
    expect(css(container, { width: 'calc(100% - 40px)' })).toContain(
      'width:calc(100% - 40px);flex:0 1 auto',
    );
    expect(css(container, { 'width@tablet': 'min(90vw, 600px)' })).toContain(
      'width:min(90vw, 600px)',
    );
    expect(
      css(container, { content_width: 'boxed', boxed_width: 'clamp(300px, 80%, 1200px)' }),
    ).toContain('max-width:clamp(300px, 80%, 1200px)');
    // Sizes as numbers still work, anything else is dropped.
    expect(css(container, { width: { size: 50, unit: '%' } })).toContain('width:50%');
    for (const bad of ['calc(1px);color:red', 'url(x)', 'calc(var(--x))', 'expression(1)']) {
      expect(css(container, { width: bad })).not.toContain('width:');
    }
    expect(new RegExp(`^(?:${CSS_SIZE_PATTERN})$`).test('calc(50% + 2rem)')).toBe(true);
  });

  it('take negative margins', () => {
    expect(
      css(container, { _margin: { top: -40, right: '', bottom: '-12.5', left: '', unit: 'px' } }),
    ).toContain('margin:-40px 0 -12.5px 0');
  });
});

describe('background videos', () => {
  it('keep YouTube and Vimeo frames waiting for consent on pages', () => {
    const out = html(container, {
      background_video: { url: 'https://youtu.be/J01iDyHq2p0' },
      background_image: { id: null, url: '/media/poster.jpg' },
    });
    expect(out).toContain('data-fr-video-bg=""');
    expect(out).toContain('data-cx-src="https://www.youtube-nocookie.com/embed/J01iDyHq2p0?');
    expect(out).toContain('data-cx-category="marketing"');
    expect(out).not.toMatch(/<iframe[^>]* src=/);
  });
});

describe('Flip box', () => {
  it('is a free element', () => {
    expect(FREE_ELEMENTS).toContain(flipBox);
  });

  it('shows a front and a back, focusable, with the button’s link', () => {
    const out = html(flipBox, {
      front_title: 'Front',
      front_text: 'Hello',
      back_title: 'Back',
      back_text: 'More',
      button_text: 'Go',
      link: { url: '/shop/', newTab: true },
    });
    expect(out).toContain('data-fr-handler="flip-box"');
    expect(out).toContain(
      '<div class="fr-flip fr-flip--flip fr-flip--left" tabindex="0" role="group" aria-label="Front">',
    );
    expect(out).toMatch(
      /fr-flip__front.*<h3 class="fr-flip__title">Front<\/h3><p class="fr-flip__text">Hello<\/p>/,
    );
    expect(out).toContain('<span class="fr-flip__icon">');
    expect(out).toContain(
      '<a class="fr-flip__button" href="/shop/" target="_blank" rel="noopener">Go</a>',
    );
  });

  it('fades or flips in a direction; nothing unsafe gets through', () => {
    expect(html(flipBox, { effect: 'fade', direction: 'up' })).toContain(
      'class="fr-flip fr-flip--fade"',
    );
    expect(html(flipBox, { direction: 'down' })).toContain('fr-flip--flip fr-flip--down');
    const bad = html(flipBox, {
      effect: '"><script>',
      direction: 'x',
      title_tag: 'script',
      back_title: '<b>x</b>',
      link: { url: 'javascript:alert(1)' },
    });
    expect(bad).toContain('fr-flip--flip fr-flip--left');
    expect(bad).toContain('<h3 class="fr-flip__title">&lt;b&gt;x&lt;/b&gt;</h3>');
    expect(bad).toContain('<span class="fr-flip__button">');
    expect(bad).not.toContain('javascript');
    // In the editor it does not run frontend.js.
    expect(html(flipBox, {}, true)).not.toContain('data-fr-handler');
  });

  it('styles its faces and gives its backgrounds to the media list', () => {
    const out = css(flipBox, {
      height: { size: 320, unit: 'px' },
      front_bg_type: 'classic',
      front_bg_color: '#112233',
      back_title_color: '#ffffff',
      duration: { size: 0.4, unit: 's' },
    });
    expect(out).toContain('.fr-e-abc123 .fr-flip{height:320px;--fr-flip-duration:0.4s}');
    expect(out).toContain('.fr-e-abc123 .fr-flip__front{background-color:#112233}');
    expect(out).toContain('.fr-e-abc123 .fr-flip__back .fr-flip__title{color:#ffffff}');
    expect(
      flipBox.media?.({
        front_bg_image: { id: 'm1', url: '/a.jpg' },
        back_bg_image: { id: 'm2', url: '/b.jpg' },
      }),
    ).toEqual(['m1', 'm2']);
  });

  it('becomes headings, paragraphs and a button in the block editor', () => {
    const { blocks } = toBlocks({
      schema: 1,
      blocks: [
        node('fresco/flip-box', {
          front_title: 'Front',
          back_text: 'More',
          button_text: 'Go',
          link: { url: '/shop/' },
        }),
      ],
    } as never);
    expect(blocks.map((b) => b.type)).toEqual(['core/heading', 'core/paragraph', 'core/buttons']);
  });
});

describe('Image carousel', () => {
  it('links each image to its own address, over the carousel’s link', () => {
    const out = html(imageCarousel, {
      images: [
        { id: null, url: '/a.jpg', link: { url: '/one/' } },
        { id: null, url: '/b.jpg' },
        { id: null, url: '/c.jpg', link: { url: 'javascript:alert(1)' } },
      ],
      link_to: 'file',
    });
    expect(out).toContain('<a href="/one/"><img');
    expect(out).toContain('<a href="/b.jpg" data-fr-lightbox="c-abc123"');
    expect(out).toContain('<a href="/c.jpg" data-fr-lightbox="c-abc123"');
    expect(out).not.toContain('javascript');
    // The editor offers a link per image.
    const control = imageCarousel.controls.find((c) => c.name === 'images')!;
    expect(control.fields?.map((f) => [f.name, f.type])).toEqual([['link', 'url']]);
  });
});
