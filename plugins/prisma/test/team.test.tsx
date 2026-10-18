import type { CxdBlock } from '@cleitext/plugin-sdk';
import { describe, expect, it } from 'vitest';
import { team } from '../src/blocks/team';
import type { Attrs, SpectraSource } from '../src/lib/types';
import { renderBlock, text } from './render';

const B = '.pr-block-test0001';

const tablet = (css: string) =>
  css.slice(css.indexOf('@media (max-width:976px)'), css.indexOf('@media (max-width:767px)'));
const mobile = (css: string) => css.slice(css.indexOf('@media (max-width:767px)'));

function source(html: string): SpectraSource {
  const inner = (tag: string, className: string) =>
    new RegExp(
      `<(${tag})\\b[^>]*class="(?:[^"]*\\s)?${className}(?:\\s[^"]*)?"[^>]*>([\\s\\S]*?)</\\1>`,
    ).exec(html)?.[2] ?? '';
  return {
    html,
    children: [],
    block: (n: string, a: Attrs, c?: CxdBlock[]) => ({
      id: 'x',
      type: `prisma/${n}`,
      v: 1,
      attrs: a,
      ...(c ? { children: c } : {}),
    }),
    rich: (h: string) => [{ text: h.replace(/<[^>]+>/g, '') }],
    inner,
    innerAny: (className: string) => inner('h[1-6]|p|div|span', className),
  };
}

const photo = { id: 'm1', url: 'https://site.test/jane.jpg', alt: 'Jane' };

describe('team', () => {
  it('draws the card with the picture above and the social profiles', () => {
    const { html } = renderBlock(team, {
      title: text('Jane'),
      prefix: text('CEO'),
      description_text: text('Founder'),
      image: photo,
      imgStyle: 'circle',
      twitterLink: 'https://x.com/jane',
      pinIcon: '',
    });
    expect(html).toContain(
      '<div class="wp-block-prisma-team pr-team pr-team--image-above pr-team--align-center pr-team--stack-tablet pr-block-test0001"><div class="pr-team__content"><img class="pr-team__image pr-team__image--circle" src="https://site.test/jane.jpg" alt="Jane" height="100" width="100" loading="lazy"/><h3 class="pr-team__title">Jane</h3><span class="pr-team__prefix">CEO</span><p class="pr-team__desc">Founder</p><ul class="pr-team__social-list">',
    );
    expect(html).toContain(
      '<li class="pr-team__social-icon"><a href="https://x.com/jane" aria-label="twitter" target="_self" rel="noopener noreferrer"><svg',
    );
    expect(html.match(/pr-team__social-icon"/g)).toHaveLength(3);
  });

  it('places the picture left or right of the text and hides the profiles', () => {
    const left = renderBlock(team, { image: photo, imgPosition: 'left', socialEnable: false }).html;
    expect(left).toMatch(
      /pr-block-test0001"><img class="pr-team__image[^>]*\/><div class="pr-team__content">/,
    );
    expect(left).not.toContain('pr-team__social-list');
    const right = renderBlock(team, { image: photo, imgPosition: 'right' }).html;
    expect(right).toMatch(/<\/ul><\/div><img class="pr-team__image/);
    expect(renderBlock(team, {}).html).not.toContain('<img');
  });

  it('writes the CSS of each device', () => {
    const { css } = renderBlock(team, { socialSpaceTablet: 10, imgWidthMobile: 60 });
    expect(css).toContain(
      `${B} p.pr-team__desc{margin-bottom:18px;margin-top:11px;font-size:15px}`,
    );
    expect(css).toContain(`${B} .pr-team__prefix{color:#888888;font-size:15px}`);
    expect(css).toContain(
      `${B} .pr-team__social-icon a{color:#333;font-size:20px;width:20px;height:20px;line-height:20px}`,
    );
    expect(css).toContain(
      `${B}.pr-team--image-above.pr-team--align-center .pr-team__social-icon{margin-right:10px;margin-left:10px}`,
    );
    expect(css).toContain(
      `${B}.pr-team--image-left > .pr-team__image, ${B}.pr-team--image-right .pr-team__content + .pr-team__image, ${B}.pr-team--image-above .pr-team__image{margin-left:20px;margin-right:20px;width:100px;height:100px}`,
    );
    expect(css).toContain(`${B} .pr-team__social-list{justify-content:center}`);
    expect(css).toContain(`${B} h3.pr-team__title{margin-bottom:6px}`);
    expect(tablet(css)).toContain(
      `${B}.pr-team--image-above.pr-team--align-center .pr-team__social-icon{margin-right:5px;margin-left:5px}`,
    );
    expect(tablet(css)).toContain(
      `${B}.pr-team--image-left .pr-team__social-icon{margin-right:10px;margin-left:0px}`,
    );
    expect(mobile(css)).toContain(
      `${B}.pr-team--image-above.pr-team--align-center .pr-team__social-icon{margin-right:5px;margin-left:5px}`,
    );
    expect(mobile(css)).toContain('.pr-team__image{width:60px;height:60px}');
  });

  it('aligns a side picture in the middle', () => {
    const { css } = renderBlock(team, { imgPosition: 'right', imgAlign: 'middle', tag: 'h4' });
    expect(css).toContain(`${B} .pr-team__image{align-self:center}`);
    expect(css).toContain(`${B} .pr-team__content{align-self:center}`);
    expect(css).toContain(`${B} h4.pr-team__title{margin-bottom:6px}`);
    expect(css).not.toContain('.pr-team__social-list{');
  });

  it('imports a Spectra team member with its texts and picture', () => {
    const html =
      '<div class="wp-block-uagb-team uagb-team__image-position-above uagb-block-1"><div class="uagb-team__content"><img class="uagb-team__image-crop-circle" src="https://site.test/jane-150x150.jpg" alt="Jane" height="100" width="100" loading="lazy"/><h3 class="uagb-team__title">Jane <b>Doe</b></h3><span class="uagb-team__prefix">CEO</span><p class="uagb-team__desc"></p></div></div>';
    const [out] = team.spectra!['uagb/team']!(
      { image: { id: 3, url: 'https://site.test/jane.jpg' }, fbLink: 'https://fb.test' },
      source(html),
    );
    expect(out!.type).toBe('prisma/team');
    expect(out!.attrs.title).toBe('Jane <b>Doe</b>');
    expect(out!.attrs.prefix).toBe('CEO');
    expect(out!.attrs.description_text).toBe('');
    expect(out!.attrs.image).toEqual({ id: 3, url: 'https://site.test/jane-150x150.jpg' });
    expect(out!.attrs.fbLink).toBe('https://fb.test');
  });
});
