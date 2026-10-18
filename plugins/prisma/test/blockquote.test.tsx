import type { CxdBlock } from '@cleitext/plugin-sdk';
import { describe, expect, it } from 'vitest';
import { blockquote } from '../src/blocks/blockquote';
import type { Attrs, SpectraSource } from '../src/lib/types';
import { renderBlock, text } from './render';

const B = '.pr-block-test0001';

/** A fake import source over saved HTML. */
function source(html: string): SpectraSource {
  const inner = (tag: string, className: string) =>
    new RegExp(
      `<${tag}\\b[^>]*class="(?:[^"]*\\s)?${className}(?:\\s[^"]*)?"[^>]*>([\\s\\S]*?)</${tag}>`,
    ).exec(html)?.[1] ?? '';
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
    innerAny: (className: string) => inner('(?:div|span|p|h[1-6])', className),
  };
}

describe('blockquote', () => {
  it('draws the quote, the author and the share link', () => {
    const { html } = renderBlock(blockquote, {
      descriptionText: text('Stay hungry'),
      author: text('Steve'),
      iconShareVia: '@prisma',
    });
    expect(html).toContain('pr-blockquote--skin-border');
    expect(html).not.toContain('pr-blockquote--align-');
    expect(html).toContain(
      'pr-blockquote--with-tweet pr-blockquote--tweet-style-classic pr-blockquote--tweet-icon_text',
    );
    expect(html).toContain('<blockquote class="pr-blockquote__quote">');
    expect(html).toContain('<div class="pr-blockquote__content">Stay hungry</div>');
    expect(html).toContain('<cite class="pr-blockquote__author"><span>Steve</span></cite>');
    expect(html).toContain('pr-blockquote__author-wrap pr-blockquote__author-wrap--left');
    expect(html).toContain(
      'https://x.com/intent/tweet?text=Stay+hungry+%E2%80%94+Steve&amp;via=prisma',
    );
    expect(html).toContain('data-pr-blockquote=""');
    expect(html).toContain('Tweet</a>');
    expect(html).not.toContain('pr-blockquote__icon');
  });

  it('draws the quotation skin with its icon and a custom address', () => {
    const { html } = renderBlock(blockquote, {
      skinStyle: 'quotation',
      align: 'center',
      quoteStyle: 'style_1',
      iconView: 'icon',
      iconTargetUrl: 'custom',
      customUrl: 'https://example.com/a',
      authorImage: { url: 'https://example.com/me.jpg', alt: 'Me' },
      authorImgPosition: 'top',
    });
    expect(html).toContain('pr-blockquote--align-center pr-blockquote--style-style_1');
    expect(html).toContain('<span class="pr-blockquote__icon"><svg');
    expect(html).toContain('url=https%3A%2F%2Fexample.com%2Fa');
    expect(html).not.toContain('data-pr-blockquote');
    expect(html).toContain('aria-label="Tweet"');
    expect(html).toContain(
      '<img src="https://example.com/me.jpg" alt="Me" width="40" height="40" loading="lazy"/>',
    );
    expect(html).toContain('pr-blockquote__author-wrap--top');
  });

  it('writes the CSS of each device', () => {
    const { css } = renderBlock(blockquote, { descColor: '#123456', stack: 'tablet' });
    expect(css).toContain(
      `${B} .pr-blockquote__content{color:#123456;margin-bottom:25px;text-align:left;font-style:italic;font-size:18px;line-height:1.5em}`,
    );
    expect(css).toContain(
      `${B}.pr-blockquote--skin-border .pr-blockquote__quote{border-color:#abb8c3;border-left-style:solid;border-left-width:4px;padding-left:15px}`,
    );
    // The author line has no bottom space outside a centered quotation.
    expect(css).toContain(`${B} .pr-blockquote__author-wrap{margin-bottom:0px}`);
    expect(css).toContain(
      `${B}.pr-blockquote--tweet-style-classic a.pr-blockquote__tweet{color:#fff;background-color:#1DA1F2;padding-left:10px;padding-right:10px;padding-top:10px;padding-bottom:10px}`,
    );
    expect(css).toContain(`${B} a.pr-blockquote__tweet svg{width:15px;height:15px}`);
    const tablet = css.slice(
      css.indexOf('@media (max-width:976px)'),
      css.indexOf('@media (max-width:767px)'),
    );
    const mobile = css.slice(css.indexOf('@media (max-width:767px)'));
    expect(tablet).toContain(`${B} .pr-blockquote__content{margin-bottom:20px}`);
    expect(tablet).toContain(
      `${B} .pr-blockquote__author-wrap img{width:35px;height:35px;border-radius:100%}`,
    );
    expect(tablet).toContain(
      `${B} .pr-blockquote__author-wrap--left img{margin-right:0px;margin-bottom:10px}`,
    );
    expect(mobile).toContain(`${B} .pr-blockquote__content{margin-bottom:15px}`);
    expect(mobile).toContain(
      `${B} .pr-blockquote__author-wrap--left img{margin-right:0px;margin-bottom:10px}`,
    );
  });

  it('keeps the centered quotation spacing and the explicit button padding', () => {
    const { css } = renderBlock(blockquote, {
      skinStyle: 'quotation',
      align: 'center',
      iconSkin: 'bubble',
      paddingBtnTop: 4,
      paddingBtnBottom: 6,
    });
    expect(css).toContain(`${B} .pr-blockquote__author-wrap{margin-bottom:15px}`);
    expect(css).toContain(
      `${B}.pr-blockquote--skin-quotation .pr-blockquote__icon{background:#f4f4f4;border-radius:100%;margin-bottom:15px;margin-right:20px;padding:10px}`,
    );
    expect(css).toContain('padding-top:4px;padding-bottom:6px');
    expect(css).toContain(
      `${B}.pr-blockquote--tweet-style-bubble a.pr-blockquote__tweet::before{border-right-color:#1DA1F2}`,
    );
  });

  it('imports a Spectra blockquote with the texts of its saved HTML', () => {
    const html =
      '<div class="wp-block-uagb-blockquote uagb-block-abc uagb-blockquote__skin-border"><blockquote class="uagb-blockquote"><div class="uagb-blockquote__content">To be <strong>or not</strong></div><footer><div class="uagb-blockquote__author-wrap uagb-blockquote__author-at-left"><img class="" src="https://site.test/a-150x150.jpg" alt="A"/><cite class="uagb-blockquote__author">Will</cite></div></footer></blockquote></div>';
    const [out] = blockquote.spectra!['uagb/blockquote']!(
      { skinStyle: 'border', authorImage: { id: 5, url: 'https://site.test/a.jpg' } },
      source(html),
    );
    expect(out!.type).toBe('prisma/blockquote');
    expect(out!.attrs.descriptionText).toBe('To be <strong>or not</strong>');
    expect(out!.attrs.author).toBe('Will');
    expect(out!.attrs.authorImage).toEqual({ id: 5, url: 'https://site.test/a-150x150.jpg' });
  });

  it('imports a quote without an author as empty', () => {
    const html =
      '<div class="wp-block-uagb-blockquote"><blockquote class="uagb-blockquote"><div class="uagb-blockquote__content">Hi</div><footer><div class="uagb-blockquote__author-wrap"></div></footer></blockquote></div>';
    const [out] = blockquote.spectra!['uagb/blockquote']!({}, source(html));
    expect(out!.attrs.author).toBe('');
  });
});
