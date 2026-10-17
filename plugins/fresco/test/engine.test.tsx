import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cssValue, elementCss, safeColor, safeFont, withDefaults } from '../src/core/css.js';
import { DEFAULT_KIT, kitCss, normalizeKit } from '../src/core/kit.js';
import { DEFAULT_BREAKPOINTS, type FrescoNode, type RenderContext } from '../src/core/model.js';
import { sanitizeRich } from '../src/core/sanitize.js';
import { button, heading, text } from '../src/elements/basic.js';
import { container } from '../src/elements/container.js';
import { videoEmbed } from '../src/elements/general.js';
import { pluginBlock } from '../src/elements/plugin-block.js';

const node = (
  type: string,
  attrs: Record<string, unknown>,
  children?: FrescoNode[],
): FrescoNode => ({
  id: 'abc123',
  type,
  v: 1,
  attrs,
  ...(children ? { children } : {}),
});

const context: RenderContext = {
  media: new Map(),
  locale: 'en',
  editing: false,
  site: { title: '', tagline: '', home: '/' },
};

describe('css engine', () => {
  it('scopes rules to the element and adds media queries per device', () => {
    const css = elementCss(
      heading,
      node('fresco/heading', {
        title_color: '#ff0000',
        'title_color:hover': 'var(--fr-c-accent)',
        align: 'left',
        'align@tablet': 'center',
        'align@mobile': 'right',
      }),
      DEFAULT_BREAKPOINTS,
    );
    expect(css).toContain('.fr-e-abc123 .fr-heading__title{color:#ff0000}');
    expect(css).toContain('.fr-e-abc123 .fr-heading__title:hover{color:var(--fr-c-accent)}');
    expect(css).toContain('.fr-e-abc123{text-align:left}');
    expect(css).toContain('@media (max-width:1024px){.fr-e-abc123{text-align:center}}');
    expect(css).toContain('@media (max-width:767px){.fr-e-abc123{text-align:right}}');
    // Tablet rules come before mobile ones, so mobile wins on phones.
    expect(css.indexOf('max-width:1024px')).toBeLessThan(css.indexOf('max-width:767px'));
  });

  it('writes sizes, boxes and typography groups', () => {
    const css = elementCss(
      button,
      node('fresco/button', {
        padding: { top: 10, right: 20, bottom: '', left: 20, unit: 'px' },
        typography_size: { size: 1.25, unit: 'rem' },
        'typography_size@mobile': { size: 14, unit: 'px' },
        typography_weight: '700',
        typography_line: { size: 1.4, unit: '' },
        border_style: 'solid',
        border_width: { top: 2, right: 2, bottom: 2, left: 2, unit: 'px' },
        border_radius: { top: 50, right: 50, bottom: 50, left: 50, unit: '%' },
      }),
      DEFAULT_BREAKPOINTS,
    );
    expect(css).toContain('padding:10px 20px 0 20px');
    expect(css).toContain('font-size:1.25rem');
    expect(css).toContain('font-weight:700');
    expect(css).toContain('line-height:1.4');
    expect(css).toContain(
      '@media (max-width:767px){.fr-e-abc123 .fr-button__link{font-size:14px}}',
    );
    expect(css).toContain('border-style:solid;border-width:2px 2px 2px 2px');
    expect(css).toContain('border-radius:50% 50% 50% 50%');
  });

  it('uses global fonts through the kit variables', () => {
    const css = elementCss(
      heading,
      node('fresco/heading', { title_typography_global: 'primary' }),
      DEFAULT_BREAKPOINTS,
    );
    expect(css).toContain('font-family:var(--fr-t-primary-family)');
    expect(css).toContain('font-weight:var(--fr-t-primary-weight)');
  });

  it('applies controls only when their condition holds', () => {
    const flex = elementCss(
      container,
      node('fresco/container', { grid_columns: 4 }),
      DEFAULT_BREAKPOINTS,
    );
    expect(flex).not.toContain('grid-template-columns');
    const grid = elementCss(
      container,
      node('fresco/container', { container_type: 'grid', grid_columns: 4, flex_direction: 'row' }),
      DEFAULT_BREAKPOINTS,
    );
    expect(grid).toContain('grid-template-columns:repeat(4, minmax(0, 1fr))');
    expect(grid).not.toContain('flex-direction');
  });

  it('never lets a setting write arbitrary CSS', () => {
    expect(safeColor('red;} body{display:none')).toBeNull();
    expect(safeColor('url(javascript:alert(1))')).toBeNull();
    expect(safeColor('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
    expect(safeFont('Inter</style><script>')).toBeNull();
    expect(safeFont('Open Sans, sans-serif')).toBe('"Open Sans", sans-serif');
    expect(cssValue({ type: 'slider' }, { size: '10px;color:red', unit: 'px' })).toBeNull();
    expect(cssValue({ type: 'slider' }, { size: 10, unit: 'px;color:red' })).toBe('10px');
    expect(cssValue({ type: 'select' }, 'center; } * { color: red')).toBeNull();
    const css = elementCss(
      heading,
      node('fresco/heading', { title_color: '</style><script>' }),
      DEFAULT_BREAKPOINTS,
    );
    expect(css).not.toContain('<');
  });

  it('fills in defaults without storing them', () => {
    const settings = withDefaults(heading, { title: 'Hello' });
    expect(settings).toMatchObject({ title: 'Hello', tag: 'h2' });
  });
});

describe('kit', () => {
  it('turns global colors and fonts into variables, with breakpoint utilities', () => {
    const css = kitCss(DEFAULT_KIT);
    expect(css).toContain('--fr-c-primary:#1d4ed8');
    expect(css).toContain('--fr-t-primary-family:"Inter"');
    expect(css).toContain('--fr-container-width:1140px');
    expect(css).toContain('@media (max-width:767px){.fr-hide-mobile{display:none!important}}');
  });

  it('keeps the system colors and drops unsafe values', () => {
    const kit = normalizeKit({
      colors: [
        { id: 'primary', title: 'Brand', value: '#123456' },
        { id: 'evil', title: 'Evil', value: 'red;}' },
        { id: 'sand', title: 'Sand', value: '#e7d8b4' },
      ],
      breakpoints: { tablet: 900, mobile: 1000 },
    });
    expect(kit.colors.map((c) => c.id)).toEqual(['primary', 'secondary', 'text', 'accent', 'sand']);
    expect(kit.colors[0]!.value).toBe('#123456');
    expect(kit.breakpoints).toEqual(DEFAULT_BREAKPOINTS);
  });
});

describe('rendering', () => {
  it('renders a container with its children and the element classes', () => {
    const html = renderToStaticMarkup(
      container.render({
        node: node('fresco/container', { _css_classes: 'hero bad"class', _animation: 'fade-up' }),
        settings: withDefaults(container, {
          _css_classes: 'hero bad"class',
          _animation: 'fade-up',
        }),
        children: <p>child</p>,
        context,
      }),
    );
    expect(html).toContain(
      'class="fr-e fr-e-abc123 fr-container fr-container--flex fr-container--boxed hero fr-anim fr-anim-normal"',
    );
    expect(html).toContain('data-fr-anim="fade-up"');
    expect(html).toContain('<div class="fr-container__in"><p>child</p></div>');
    expect(html).not.toContain('data-fr-id');
  });

  it('plays a background video behind the content, muted', () => {
    const settings = withDefaults(container, {
      background_video: { id: 'v1', url: '/media/clip.mp4' },
    });
    const html = renderToStaticMarkup(
      container.render({
        node: node('fresco/container', {}),
        settings,
        children: <p>over it</p>,
        context,
      }),
    );
    expect(html).toContain('fr-has-video');
    expect(html).toMatch(
      /<video class="fr-bg-video fr-bg-video--wide" src="\/media\/clip.mp4"[^>]* muted=""/,
    );
    expect(html).toContain('<div class="fr-container__in"><p>over it</p></div>');
    const unsafe = renderToStaticMarkup(
      container.render({
        node: node('fresco/container', {}),
        settings: withDefaults(container, { background_video: { url: 'javascript:alert(1)' } }),
        context,
      }),
    );
    expect(unsafe).not.toContain('<video');
  });

  it('marks elements for the editor only when editing', () => {
    const html = renderToStaticMarkup(
      heading.render({
        node: node('fresco/heading', {}),
        settings: withDefaults(heading, {
          title: 'Line one\nLine two',
          link: { url: 'javascript:alert(1)' },
        }),
        context: { ...context, editing: true },
      }),
    );
    expect(html).toContain('data-fr-id="abc123"');
    expect(html).toContain('<span>Line one</span><span><br/>Line two</span>');
    expect(html).not.toContain('javascript');
  });

  it('wraps a plugin block: rendered by Cleitext on the page, by the editor in the canvas', () => {
    const inner = node('shop/products', { limit: 4 });
    const block = node('fresco/block', { _css_classes: 'grid' }, [inner]);
    const settings = withDefaults(pluginBlock, block.attrs);
    const page = renderToStaticMarkup(
      pluginBlock.render({ node: block, settings, children: <ul>products</ul>, context }),
    );
    expect(page).toContain('fr-block grid');
    expect(page).toContain('<ul>products</ul>');
    const editing = renderToStaticMarkup(
      pluginBlock.render({
        node: block,
        settings,
        children: <p>not used</p>,
        context: {
          ...context,
          editing: true,
          pluginBlock: (b) => <em>{`preview of ${b.type}`}</em>,
        },
      }),
    );
    expect(editing).toContain('<em>preview of shop/products</em>');
    expect(editing).not.toContain('not used');
    // Nothing can be dropped into it.
    expect(pluginBlock.accepts?.('fresco/heading')).toBe(false);
  });

  it('sanitizes rich text', () => {
    const html = renderToStaticMarkup(
      text.render({
        node: node('fresco/text', {}),
        settings: withDefaults(text, {
          content:
            '<p onclick="x()">Hi <a href="javascript:alert(1)">there</a> <a href="/ok" target="_blank">ok</a></p><script>alert(1)</script><style>p{}</style>',
        }),
        context,
      }),
    );
    expect(html).toContain(
      '<p>Hi <a>there</a> <a href="/ok" target="_blank" rel="noopener">ok</a></p>',
    );
    expect(html).not.toContain('script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('p{}');
  });
});

describe('sanitizeRich', () => {
  it('closes what was left open and escapes text', () => {
    expect(sanitizeRich('<p><strong>bold <em>both</p>')).toBe(
      '<p><strong>bold <em>both</em></strong></p>',
    );
    expect(sanitizeRich('5 < 6 & "x"')).toBe('5 &lt; 6 &amp; "x"');
    expect(sanitizeRich('<img src="data:x" onerror="y"><img src="/a.png" alt="A">')).toBe(
      '<img><img src="/a.png" alt="A">',
    );
  });
});

describe('videos', () => {
  it('turns links into privacy-friendly embeds', () => {
    expect(videoEmbed('youtube', 'https://youtu.be/XHOmBV4js_E?t=4', { mute: true })).toBe(
      'https://www.youtube-nocookie.com/embed/XHOmBV4js_E?mute=1&rel=0',
    );
    expect(videoEmbed('vimeo', 'https://vimeo.com/76979871', {})).toBe(
      'https://player.vimeo.com/video/76979871?dnt=1',
    );
    expect(videoEmbed('youtube', 'https://evil.test/watch?v=XHOmBV4js_E', {})).toBeNull();
  });
});
