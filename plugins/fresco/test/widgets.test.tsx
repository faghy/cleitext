/**
 * Widgets' options added for Elementor parity (Fresco 2.3): hover and
 * per-device entrance animations, text stroke, the container overlay, Button,
 * Image, Video, Tabs, Accordion, Image carousel and the other free widgets.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HOVER_ANIMATIONS, rootProps } from '../src/core/common.js';
import { setIconData, type IconData } from '../src/core/icons.js';
import icons from '../src/public/icons.json';
import { conditionMet, elementCss, withDefaults } from '../src/core/css.js';
import {
  DEFAULT_BREAKPOINTS,
  type ElementDefinition,
  type FrescoNode,
  type RenderContext,
} from '../src/core/model.js';
import { button, heading, image } from '../src/elements/basic.js';
import { container } from '../src/elements/container.js';
import { icon, iconBox, imageBox, video, videoEmbed } from '../src/elements/general.js';
import { accordionWidget, tabs } from '../src/elements/nested.js';
import {
  alert,
  audio,
  counter,
  gallery,
  imageCarousel,
  progress,
  socialIcons,
  starRating,
  textPath,
} from '../src/elements/widgets.js';

setIconData(icons as unknown as IconData);

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

const html = (
  definition: ElementDefinition,
  attrs: Record<string, unknown>,
  kids?: FrescoNode[],
) => {
  const n = node(definition.type, attrs, kids ?? (definition.container ? [] : undefined));
  const items = kids?.map((k) => <div key={k.id} />);
  return renderToStaticMarkup(
    <>
      {definition.render({
        node: n,
        settings: withDefaults(definition, attrs),
        context,
        ...(items ? { items, children: items } : {}),
      })}
    </>,
  );
};
const css = (definition: ElementDefinition, attrs: Record<string, unknown>) =>
  elementCss(definition, node(definition.type, attrs), DEFAULT_BREAKPOINTS);

const MEDIA = { id: null, url: '/a.jpg', alt: 'A' };
const item = (id: string, attrs: Record<string, unknown> = {}): FrescoNode => ({
  id,
  type: 'fresco/container',
  v: 1,
  attrs: { _title: `Item ${id}`, ...attrs },
  children: [],
});

describe('animations', () => {
  it('offers Elementor’s 27 hover animations on the widgets that have one', () => {
    expect(HOVER_ANIMATIONS.filter((a) => a.value)).toHaveLength(27);
    expect(html(image, { image: MEDIA, hover_effect: 'wobble-skew' })).toContain(
      'fr-image__img fr-hover-wobble-skew',
    );
    expect(html(button, { hover_effect: 'buzz-out' })).toContain('fr-hover-buzz-out');
    expect(html(icon, { hover_effect: 'hang' })).toContain('fr-icon-wrap fr-hover-hang');
    expect(html(iconBox, { hover_effect: 'bob' })).toContain('fr-box__icon fr-hover-bob');
    expect(html(imageBox, { image: MEDIA, hover_effect: 'sink' })).toContain('fr-hover-sink');
    expect(html(socialIcons, { hover_effect: 'pop' })).toContain('fr-social__link fr-hover-pop');
    expect(html(textPath, { hover_effect: 'float' })).toContain('fr-text-path__svg fr-hover-float');
    expect(html(button, { hover_effect: 'bogus' })).not.toContain('fr-hover-');
  });

  it('writes each device’s entrance animation, and none where it is off', () => {
    const props = rootProps(
      node('fresco/heading', {
        _animation: 'fade-up',
        '_animation@tablet': 'zoom-in',
        '_animation@mobile': 'none',
      }),
      { _animation: 'fade-up' },
      'fr-heading',
      false,
    );
    expect(props['data-fr-anim']).toBe('fade-up');
    expect(props['data-fr-anim-tablet']).toBe('zoom-in');
    expect(props['data-fr-anim-mobile']).toBe('none');
    expect(props.className).toContain('fr-anim fr-anim-normal');
    // Only on phones: the element still waits for the script (an empty desktop value).
    const phones = rootProps(
      node('fresco/heading', { '_animation@mobile': 'bounce-in' }),
      { _animation: '' },
      'fr-heading',
      false,
    );
    expect(phones['data-fr-anim']).toBe('');
    expect(phones['data-fr-anim-mobile']).toBe('bounce-in');
    // "None" on desktop, nothing elsewhere: no animation at all.
    const none = rootProps(node('fresco/heading', {}), { _animation: 'none' }, 'fr-heading', false);
    expect(none['data-fr-anim']).toBeUndefined();
    expect(none.className).not.toContain('fr-anim');
  });
});

describe('text stroke and shadows', () => {
  it('writes the stroke width per device and its color', () => {
    const out = css(heading, {
      title_stroke: { size: 2, unit: 'px' },
      'title_stroke@mobile': { size: 1, unit: 'px' },
      title_stroke_color: '#ff0000',
    });
    expect(out).toContain(
      '.fr-e-abc123 .fr-heading__title{-webkit-text-stroke-width:2px;stroke-width:2px;-webkit-text-stroke-color:#ff0000;stroke:#ff0000}',
    );
    expect(out).toContain(
      '@media (max-width:767px){.fr-e-abc123 .fr-heading__title{-webkit-text-stroke-width:1px;stroke-width:1px}}',
    );
  });

  it('adds text shadows where Elementor has them', () => {
    expect(
      css(iconBox, { description_shadow: { x: 1, y: 2, blur: 3, color: '#000000' } }),
    ).toContain('.fr-e-abc123 .fr-box__description{text-shadow:1px 2px 3px #000000}');
    expect(css(alert, { title_shadow: { x: 0, y: 1, blur: 0, color: '#ffffff' } })).toContain(
      '.fr-e-abc123 .fr-alert__title{text-shadow:0px 1px 0px #ffffff}',
    );
  });
});

describe('container overlay and backgrounds', () => {
  it('has hover, CSS filters, blend mode and a transition', () => {
    const attrs = {
      overlay_bg_type: 'classic',
      overlay_bg_color: '#000000',
      overlay_filters_blur: { size: 2, unit: 'px' },
      overlay_blend: 'multiply',
      overlay_hover_bg_type: 'classic',
      overlay_hover_bg_color: '#ff0000',
      overlay_hover_opacity: { size: 0.8, unit: '' },
      overlay_hover_filters_brightness: { size: 120, unit: '%' },
      overlay_hover_transition: { size: 0.5, unit: 's' },
    };
    const out = css(container, attrs);
    expect(out).toContain(
      '.fr-e-abc123::before{background-color:#000000;filter:blur(2px);mix-blend-mode:multiply;transition:background 0.5s, opacity 0.5s, filter 0.5s, border-radius 0.5s}',
    );
    expect(out).toContain(
      '.fr-e-abc123:hover::before{background-color:#ff0000;opacity:0.8;filter:brightness(120%)}',
    );
    expect(html(container, attrs)).toContain('fr-has-overlay');
    // A hover overlay alone also gets the overlay layer.
    expect(html(container, { overlay_hover_bg_type: 'classic' })).toContain('fr-has-overlay');
  });

  it('shows the old "Overlay color" only on pages that use it, and keeps its CSS', () => {
    const control = container.controls.find((c) => c.name === 'overlay_color')!;
    expect(conditionMet(control, withDefaults(container, {}))).toBe(false);
    expect(conditionMet(control, withDefaults(container, { overlay_color: '#000' }))).toBe(true);
    expect(css(container, { overlay_color: '#000000' })).toContain('background-color:#000000');
  });

  it('writes custom positions and sizes, and gradients per device', () => {
    const out = css(container, {
      background_type: 'classic',
      background_position: 'custom',
      background_xpos: { size: 20, unit: 'px' },
      background_ypos: { size: 40, unit: '%' },
      'background_ypos@mobile': { size: 10, unit: '%' },
      background_size: 'custom',
      background_bg_width: { size: 60, unit: '%' },
      background_hover_type: 'gradient',
      background_hover_color: '#000000',
      background_hover_color_b: '#ffffff',
      'background_hover_angle@mobile': { size: 90, unit: 'deg' },
    });
    expect(out).toContain('background-position-x:20px;background-position-y:40%');
    expect(out).toContain('background-size:60% auto');
    expect(out).not.toContain('background-position:custom');
    expect(out).toContain(
      '@media (max-width:767px){.fr-e-abc123{background-position-y:10%}.fr-e-abc123:hover{background-image:linear-gradient(90deg, #000000 0%, #ffffff 100%)}}',
    );
  });
});

describe('button, image and boxes', () => {
  it('has types, content alignment, gradients, a hover shadow and a transition', () => {
    const attrs = {
      button_type: 'warning',
      align: 'justify',
      content_align: 'space-between',
      button_background_type: 'gradient',
      button_background_color: '#111111',
      button_background_color_b: '#222222',
      shadow_hover: { x: 0, y: 4, blur: 8, spread: 0, color: '#000000' },
      hover_transition: { size: 0.4, unit: 's' },
    };
    expect(html(button, attrs)).toContain('fr-button--warning');
    const out = css(button, attrs);
    expect(out).toContain('justify-content:space-between');
    expect(out).toContain('background-image:linear-gradient(180deg, #111111 0%, #222222 100%)');
    expect(out).toContain(
      '.fr-e-abc123 .fr-button__link:hover, .fr-e-abc123 .fr-button__link:focus-visible{box-shadow:0px 4px 8px 0px #000000}',
    );
    expect(out).toContain('transition-duration:0.4s');
  });

  it('crops images where asked, filters them on hover and shows the attachment caption', () => {
    const out = css(image, {
      object_fit: 'cover',
      object_position: 'top left',
      filters_hover_saturate: { size: 0, unit: '%' },
    });
    expect(out).toContain('.fr-e-abc123 img{object-fit:cover;object-position:top left}');
    expect(out).toContain('.fr-e-abc123:hover img{filter:saturate(0%)}');
    expect(html(image, { image: MEDIA, caption_source: 'attachment' })).toContain(
      '<figcaption>A</figcaption>',
    );
  });

  it('puts the image of a box below the text', () => {
    expect(html(imageBox, { image: MEDIA, position: 'bottom' })).toContain('fr-box fr-box--bottom');
    expect(html(iconBox, { position: 'top', 'position@mobile': 'bottom' })).toContain(
      'fr-box--mobile-bottom',
    );
  });
});

describe('video', () => {
  it('embeds Dailymotion, YouTube without privacy mode and with an end, Vimeo’s options', () => {
    expect(
      videoEmbed('dailymotion', 'https://www.dailymotion.com/video/x8abc12', {
        autoplay: true,
        start: 5,
        end: 20,
        logo: false,
        color: 'ff0000',
      }),
    ).toBe(
      'https://www.dailymotion.com/embed/video/x8abc12?autoplay=1&start=5&end=20&ui-logo=0&ui-highlight=ff0000',
    );
    expect(
      videoEmbed('youtube', 'https://youtu.be/XHOmBV4js_E', {
        privacy: false,
        end: 30,
        related: true,
      }),
    ).toBe('https://www.youtube.com/embed/XHOmBV4js_E?end=30&rel=1');
    expect(
      videoEmbed('vimeo', 'https://vimeo.com/123', {
        title: false,
        byline: false,
        color: '00adef',
      }),
    ).toBe('https://player.vimeo.com/video/123?dnt=1&title=0&byline=0&color=00adef');
    // As before when nothing new is set.
    expect(videoEmbed('youtube', 'https://youtu.be/XHOmBV4js_E', { start: 3 })).toBe(
      'https://www.youtube-nocookie.com/embed/XHOmBV4js_E?start=3&rel=0',
    );
  });

  it('plays files from an address, with an end, without the download button', () => {
    const out = html(video, {
      source: 'hosted',
      external: true,
      external_url: 'https://cdn.test/v.mp4',
      start: 2,
      end: 9,
      download: false,
      preload: 'none',
    });
    expect(out).toContain('src="https://cdn.test/v.mp4#t=2,9"');
    expect(out).toContain('controlsList="nodownload"');
    expect(out).toContain('preload="none"');
  });

  it('shows a play icon of one’s choice and opens in a lightbox', () => {
    const out = html(video, {
      poster: MEDIA,
      play_icon: { set: 'solid', name: 'play' },
      lightbox: true,
    });
    expect(out).toContain('data-fr-video-lightbox=""');
    expect(out).toContain('fr-video__play fr-video__play--icon');
    expect(html(video, { poster: MEDIA, show_play_icon: false })).not.toContain('fr-video__play');
  });
});

describe('tabs and accordion', () => {
  it('has a direction per device, icons per tab and horizontal scroll', () => {
    const kids = [
      item('a', {
        _icon: { set: 'solid', name: 'star' },
        _icon_active: { set: 'solid', name: 'check' },
      }),
      item('b'),
    ];
    const out = html(
      tabs,
      { tabs_direction: 'bottom', horizontal_scroll: true, hover_effect: 'grow' },
      kids,
    );
    expect(out).toContain('fr-tabs fr-tabs--bottom fr-tabs--accordion fr-tabs--scroll');
    expect(out).toContain(
      'fr-tabs__title fr-tabs__title--icon fr-tabs__title--active-icon fr-hover-grow',
    );
    expect(out).toContain('fr-tabs__icon fr-tabs__icon--active');
    expect(out).toContain('<span class="fr-tabs__text">Item a</span>');
    // A tab without an icon: its title only, as before.
    expect(out).toMatch(/class="fr-tabs__title fr-hover-grow"[^>]*>Item b<\/button>/);
    const styles = css(tabs, { 'tabs_direction@mobile': 'left', 'icon_position@tablet': 'top' });
    expect(styles).toContain('@media (max-width:767px){.fr-e-abc123.fr-tabs{--fr-tabs-flow:row;');
    expect(styles).toContain(
      '.fr-e-abc123 > .fr-tabs__nav > .fr-tabs__title{flex-direction:column}',
    );
  });

  it('keeps the old title position when the new direction is not set', () => {
    expect(html(tabs, { direction: 'left' }, [item('a')])).toContain('fr-tabs fr-tabs--left');
    expect(html(tabs, { direction: 'left', tabs_direction: 'right' }, [item('a')])).toContain(
      'fr-tabs fr-tabs--right',
    );
  });

  it('positions accordion titles and animates the items', () => {
    expect(css(accordionWidget, { title_align: 'center' })).toContain(
      '.fr-e-abc123 .fr-acc__title{justify-content:center;--fr-acc-grow:0}',
    );
    expect(html(accordionWidget, { animation_duration: 300 }, [item('a')])).toContain(
      'fr-accordion fr-acc--animated',
    );
    expect(css(accordionWidget, { icon_open_color: '#ff0000' })).toContain(
      '.fr-e-abc123 .fr-acc__item[open] > .fr-acc__title .fr-acc__icon{color:#ff0000}',
    );
  });
});

describe('image carousel', () => {
  it('fades, scrolls several slides, has captions, icons and other paginations', () => {
    const attrs = {
      images: [MEDIA, { id: null, url: '/b.jpg', alt: 'B' }],
      effect: 'fade',
      speed: 800,
      pause_interaction: true,
      pagination: 'fraction',
      prev_icon: { set: 'solid', name: 'star' },
      arrows_position: 'outside',
      dots_position: 'inside',
      caption_type: 'alt',
      'per_scroll@mobile': 2,
    };
    const out = html(imageCarousel, attrs);
    expect(out).toContain('data-fr-effect="fade"');
    expect(out).toContain('data-fr-speed="800"');
    expect(out).toContain('data-fr-pause-interaction=""');
    expect(out).toContain(
      'class="fr-carousel fr-carousel--fade fr-carousel--arrows-outside fr-carousel--dots-inside"',
    );
    expect(out).toContain('class="fr-carousel__slide is-active"');
    expect(out).toContain('<div class="fr-carousel__caption">A</div>');
    expect(out).toContain('data-fr-fraction=""');
    expect(out).not.toContain('data-fr-dots');
    expect(out).toMatch(/fr-carousel__prev"[^>]*><svg/);
    // Slides to scroll: per device, not with the fade.
    expect(css(imageCarousel, { 'per_scroll@mobile': 2 })).toContain(
      '@media (max-width:767px){.fr-e-abc123 .fr-carousel__track{--fr-per-scroll:2}}',
    );
    expect(css(imageCarousel, attrs)).not.toContain('--fr-per-scroll');
  });
});

describe('other widgets', () => {
  it('counter: title beside the number, its own separator and tag', () => {
    const out = html(counter, {
      end: 12500,
      title_position: 'start',
      separator_char: '.',
      title_tag: 'h4',
    });
    expect(out).toContain('class="fr-e fr-e-abc123 fr-counter fr-counter--side"');
    expect(out).toContain('data-fr-separator-char="."');
    expect(out).toContain('12.500');
    expect(out.indexOf('<h4 class="fr-counter__title">')).toBeLessThan(
      out.indexOf('fr-counter__number'),
    );
  });

  it('progress: type, title tag and a hidden title', () => {
    expect(html(progress, { progress_type: 'success', title_tag: 'h5' })).toContain(
      'fr-progress__fill fr-progress__fill--success',
    );
    expect(html(progress, { title_tag: 'h5' })).toContain('<h5 class="fr-progress__title">');
    expect(html(progress, { show_title: false })).not.toContain('fr-progress__title');
  });

  it('star rating: any scale, unicode and outline stars', () => {
    const out = html(starRating, {
      scale: '7',
      rating: 3,
      star_style: 'unicode',
      unmarked_style: 'outline',
    });
    expect(out.match(/class="fr-star"/g)).toHaveLength(7);
    expect(out).toContain('☆');
    expect(html(starRating, { unmarked_style: 'outline' })).toContain(
      'fr-rating fr-rating--outline',
    );
  });

  it('social icons: own colors per network, columns and hover border', () => {
    const out = html(socialIcons, {
      items: [
        {
          _id: 'a',
          icon: { set: 'brands', name: 'facebook-f' },
          item_color: 'custom',
          item_primary: '#ff0000',
          item_secondary: '#00ff00',
        },
      ],
    });
    expect(out).toContain('style="background-color:#ff0000;color:#00ff00"');
    expect(css(socialIcons, { columns: 3, hover_border_color: '#000000' })).toContain(
      'display:inline-grid;grid-template-columns:repeat(3, auto)',
    );
  });

  it('alert, SoundCloud, gallery and text path', () => {
    expect(html(alert, { dismiss_icon: { set: 'solid', name: 'star' } })).toMatch(
      /fr-alert__close"[^>]*><svg/,
    );
    const player = html(audio, {
      url: 'https://soundcloud.com/a/b',
      sc_buying: false,
      sc_show_user: false,
    });
    expect(player).toContain('buying=false');
    expect(player).toContain('show_user=false');
    expect(html(gallery, { images: [MEDIA], random: true })).toContain('data-fr-handler="shuffle"');
    const path = html(textPath, {
      path: 'custom',
      custom_path: { id: null, url: '/p.svg' },
      text_direction: 'rtl',
    });
    expect(path).toContain('data-fr-path="/p.svg"');
    expect(path).toContain('<text direction="rtl">');
  });
});
