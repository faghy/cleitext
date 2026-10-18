import { describe, expect, it } from 'vitest';
import { contentTimeline, contentTimelineItem, layouts } from '../src/blocks/content-timeline';
import { formatDate } from '../src/blocks/content-timeline/timeline';
import type { SpectraSource } from '../src/lib/types';
import { renderBlock, text } from './render';

function source(html: string): SpectraSource {
  const inner = (tag: string, className: string) =>
    new RegExp(
      `<${tag}\\b[^>]*class="(?:[^"]*\\s)?${className}(?:\\s[^"]*)?"[^>]*>([\\s\\S]*?)</${tag}>`,
    ).exec(html)?.[1] ?? '';
  return {
    html,
    children: [],
    block: (n, a, c) => ({
      id: 'x',
      type: `prisma/${n}`,
      v: 1,
      attrs: a,
      ...(c ? { children: c } : {}),
    }),
    rich: (h) => [{ text: h.replace(/<[^>]+>/g, '') }],
    inner,
    innerAny: (className) =>
      new RegExp(
        `<(h[1-6]|p|div|span)\\b[^>]*class="(?:[^"]*\\s)?${className}(?:\\s[^"]*)?"[^>]*>([\\s\\S]*?)</\\1>`,
      ).exec(html)?.[2] ?? '',
  };
}

const part = (css: string, max: number | null) => {
  if (max === null) return css.split('@media')[0]!;
  const at = css.indexOf(`(max-width:${max}px)`);
  return at === -1 ? '' : css.slice(at).split('@media')[0]!;
};

describe('content timeline', () => {
  it('draws the line before the items, with the layout of each device', () => {
    const { html } = renderBlock(contentTimeline, {}, { children: '<article>A</article>' });
    expect(html).toContain(
      'class="wp-block-prisma-content-timeline pr-timeline pr-timeline--desktop-center pr-timeline--tablet-left pr-timeline--mobile-left pr-timeline--arrow-center pr-block-test0001"',
    );
    expect(html).toContain(
      '<div class="pr-timeline__line" data-pr-content-timeline=""><div class="pr-timeline__line-inner"></div></div><div><article>A</article></div>',
    );
  });

  it('chooses each device layout like Spectra (own value, then the stack device)', () => {
    expect(layouts({ timelinAlignment: 'right', stack: 'none' })).toEqual([
      'right',
      'right',
      'right',
    ]);
    expect(layouts({ timelinAlignment: 'center', stack: 'mobile' })).toEqual([
      'center',
      'center',
      'left',
    ]);
    expect(
      layouts({
        timelinAlignment: 'left',
        timelinAlignmentTablet: 'center',
        timelinAlignmentMobile: 'right',
        stack: 'tablet',
      }),
    ).toEqual(['left', 'center', 'right']);
  });

  it('writes the default colors and sizes', () => {
    const { css } = renderBlock(contentTimeline, {});
    const desktop = part(css, null);
    expect(desktop).toContain(
      '.pr-block-test0001.pr-timeline{--pr-timeline-card:#eee;--pr-timeline-line-offset:calc(35px / 2);--pr-timeline-gap:10px}',
    );
    expect(desktop).toContain(
      '.pr-timeline-item__marker{background-color:#eee;min-height:35px;min-width:35px;line-height:35px;border:0px solid #eee}',
    );
    expect(desktop).toContain('.pr-timeline-item__arrow{height:35px}');
    expect(desktop).toContain('> .pr-timeline-item{margin-bottom:15px}');
    expect(desktop).toContain('.pr-timeline-item__heading{margin-bottom:5px}');
    expect(desktop).toContain('.pr-timeline-item__date{font-size:12px;color:#333}');
    expect(desktop).toContain('.pr-timeline__line{background-color:#eee;width:3px}');
    expect(desktop).toContain('.pr-timeline__line-inner{background-color:#0693e3}');
    expect(desktop).toContain(
      '.pr-timeline-item__marker.is-in-view{background:#0693e3;border-color:#0693e3}',
    );
    expect(desktop).toContain('.pr-timeline-item__events{background-color:#eee;border-radius:2px}');
    expect(desktop).toContain('.pr-timeline-item__marker svg{color:#333;fill:#333;width:12px}');
  });

  it('writes tablet and phone values', () => {
    const { css } = renderBlock(contentTimeline, {
      connectorBgsizeTablet: 50,
      horizontalSpaceMobile: 2,
      horizontalSpaceUnitMobile: 'em',
      topPaddingMobile: 8,
      borderRadiusTablet: 6,
      alignTablet: 'left',
    });
    const tablet = part(css, 976);
    const mobile = part(css, 767);
    expect(tablet).toContain('min-height:50px');
    expect(tablet).toContain('.pr-timeline-item__arrow{height:50px}');
    expect(tablet).toContain('.pr-timeline-item__content{border-radius:6px}');
    expect(tablet).toContain('.pr-timeline-item__heading{text-align:left}');
    expect(mobile).toContain('{--pr-timeline-gap:2em}');
    expect(mobile).toContain('.pr-timeline-item__content{padding-top:8px}');
  });

  it('imports Spectra timelines without their editor data', () => {
    const out = contentTimeline.spectra!['uagb/content-timeline']!(
      { timelinAlignment: 'left', tm_content: [], t_date: [] },
      source(''),
    );
    expect(out[0]!.attrs).toEqual({ timelinAlignment: 'left' });
  });
});

describe('content timeline item', () => {
  it('draws the marker, the card with date, heading and description, and the outer date', () => {
    const { html } = renderBlock(contentTimelineItem, {
      time_heading: text('Founded'),
      time_desc: text('The first shop.'),
      t_date: '3/14/2020',
      headingTag: 'h3',
    });
    expect(html).toMatch(
      /^<article class="wp-block-prisma-content-timeline-item pr-timeline-item pr-block-test0001"><div class="pr-timeline-item__marker"><svg[^>]*viewBox="0 0 448 512"/,
    );
    expect(html).toContain(
      '<div class="pr-timeline-item__content"><div class="pr-timeline-item__date-inner">March 14, 2020</div><h3 class="pr-timeline-item__heading">Founded</h3><p class="pr-timeline-item__desc">The first shop.</p><div class="pr-timeline-item__arrow"></div></div>',
    );
    expect(html).toContain('<div class="pr-timeline-item__date">March 14, 2020</div></article>');
  });

  it('hides the date when the timeline does not show dates', () => {
    const { html } = renderBlock(contentTimelineItem, { displayPostDate: true });
    expect(html).not.toContain('pr-timeline-item__date-inner');
    expect(html).toContain('<div class="pr-timeline-item__date"></div>');
  });

  it('formats dates like WordPress', () => {
    expect(formatDate('F j, Y', '1/1/2019')).toBe('January 1, 2019');
    expect(formatDate('d/m/Y', '2019-02-03')).toBe('03/02/2019');
    expect(formatDate('M, Y', '12/25/2021')).toBe('Dec, 2021');
    expect(formatDate('jS \\o\\f F', '1/2/2020')).toBe('2nd of January');
    expect(formatDate('custom', 'Spring 1990')).toBe('Spring 1990');
    expect(formatDate('F j, Y', 'someday')).toBe('someday');
  });

  it('imports Spectra items with their texts, keeping the date as the page showed it', () => {
    const html =
      '<article class="wp-block-uagb-content-timeline-child uagb-timeline__field uagb-timeline__right"><div class="uagb-timeline__marker"></div><div class="uagb-timeline__day-right uagb-timeline__events-inner-new"><div class="uagb-timeline__events-inner--content"><div class="uagb-timeline__date-hide uagb-timeline__inner-date-new">1 gennaio 2019</div><h4 class="uagb-timeline__heading">Nascita</h4><p class="uagb-timeline-desc-content">Il <strong>primo</strong> negozio</p><div class="uagb-timeline__arrow"></div></div></div><div class="uagb-timeline__date-new">1 gennaio 2019</div></article>';
    const out = contentTimelineItem.spectra!['uagb/content-timeline-child']!(
      { content_class: 'uagb-timeline__right', dayalign_class: 'x', icon: 'star' },
      source(html),
    );
    expect(out[0]!.attrs).toEqual({
      icon: 'star',
      time_heading: 'Nascita',
      time_desc: 'Il <strong>primo</strong> negozio',
      t_date: '1 gennaio 2019',
      dateFormat: 'custom',
    });
  });

  it('keeps the date and its format when they give the same text', () => {
    const html = '<div class="uagb-timeline__date-new">January 1, 2019</div>';
    const out = contentTimelineItem.spectra!['uagb/content-timeline-child']!({}, source(html));
    expect(out[0]!.attrs).toEqual({});
  });
});
