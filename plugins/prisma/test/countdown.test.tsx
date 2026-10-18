import { describe, expect, it } from 'vitest';
import { countdown, endTime, remaining } from '../src/blocks/countdown';
import type { SpectraSource } from '../src/lib/types';
import { renderBlock } from './render';

const source = (children: SpectraSource['children'] = []): SpectraSource => ({
  html: '',
  children,
  block: (n, a, c) => ({
    id: 'x',
    type: `prisma/${n}`,
    v: 1,
    attrs: a,
    ...(c ? { children: c } : {}),
  }),
  rich: (h) => [{ text: h.replace(/<[^>]+>/g, '') }],
  inner: () => '',
  innerAny: () => '',
});

const ALL = { showDays: true, showHours: true, showMinutes: true };

describe('countdown', () => {
  it('splits the time left, a hidden unit adding to the next one', () => {
    const t = ((2 * 24 + 3) * 60 + 4) * 60000 + 5000;
    expect(remaining(ALL, t, 0)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 });
    expect(remaining({ ...ALL, showDays: false }, t, 0)).toEqual({
      days: 2,
      hours: 51,
      minutes: 4,
      seconds: 5,
    });
    expect(remaining(ALL, 0, 1000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(
      endTime(
        { timerType: 'evergreen', evergreenDays: 1, evergreenHrs: 2, evergreenMinutes: 3 },
        0,
      ),
    ).toBe((26 * 60 + 3) * 60000);
  });

  it('shows the time left when the page is made, with labels', () => {
    const { html } = renderBlock(countdown, { endDateTime: '2999-01-01T00:00:00Z' });
    expect(html).toContain(
      'class="wp-block-prisma-countdown pr-countdown pr-block-test0001 pr-countdown--end-zero"',
    );
    expect(html).toMatch(
      /<div class="pr-countdown__box pr-countdown__box--days"><div role="timer" aria-live="off" class="pr-countdown__time pr-countdown__time--days">\d+<\/div><div class="pr-countdown__label">DAYS<\/div><\/div>/,
    );
    expect(html).toContain(
      'data-pr-countdown="{&quot;type&quot;:&quot;date&quot;,&quot;end&quot;:&quot;2999-01-01T00:00:00.000Z&quot;',
    );
    expect(html).not.toContain('pr-countdown--ended');
    expect(renderBlock(countdown, { showLabels: false }).html).not.toContain('pr-countdown__label');
  });

  it('marks a timer already over, and shows its message only for that action', () => {
    const over = renderBlock(
      countdown,
      { endDateTime: '2020-01-01T00:00:00Z', timerEndAction: 'content' },
      { children: '<p>Sold out</p>' },
    ).html;
    expect(over).toContain('pr-countdown--end-content pr-countdown--ended');
    expect(over).toContain('<div class="pr-countdown__content"><div><p>Sold out</p></div></div>');
    expect(over).toContain('pr-countdown__time--seconds">0<');
    expect(renderBlock(countdown, {}, { children: '<p>x</p>' }).html).not.toContain(
      'pr-countdown__content',
    );
    const go = renderBlock(countdown, {
      timerEndAction: 'redirect',
      redirectURL: { url: 'https://example.com/next' },
    }).html;
    expect(go).toContain('&quot;redirect&quot;:&quot;https://example.com/next&quot;');
  });

  it('writes boxes, spacing and separators', () => {
    const { css } = renderBlock(countdown, {
      boxWidth: 120,
      boxBgType: 'color',
      boxBgColor: '#eee',
      showSeconds: false,
      separatorType: '|',
      digitFontSizeMobile: 20,
    });
    const R = '.pr-block-test0001.pr-countdown';
    expect(css).toContain(
      `${R} .pr-countdown__box{aspect-ratio:1;width:120px;height:120px;flex-direction:column;justify-content:center;align-items:center;background-color:#eee;`,
    );
    expect(css).toContain(
      `${R} .pr-countdown__box.pr-countdown__box--minutes:not(:last-child){margin-right:unset}`,
    );
    expect(css).toContain(`${R} .pr-countdown__box--seconds{display:none}`);
    expect(css).toContain(
      `${R} .pr-countdown__box:not(:last-child) .pr-countdown__time::after{content:'|';right:-26px}`,
    );
    expect(css).toContain(
      `${R} .pr-countdown__box.pr-countdown__box--minutes:not(:last-child) .pr-countdown__time.pr-countdown__time--minutes::after{display:none}`,
    );
    expect(css).toMatch(
      /@media \(max-width: ?767px\)\{[^@]*\.pr-countdown__time\{font-size:20px\}/,
    );
    expect(renderBlock(countdown, { showSeparator: false }).css).not.toContain('::after');
  });

  it('imports Spectra countdowns with their end message', () => {
    const child = { id: 'c', type: 'prisma/heading', v: 1, attrs: {} };
    const [b] = countdown.spectra!['uagb/countdown']!(
      { endDateTime: '2030-05-01T10:00:00Z', timerEndAction: 'content' },
      source([child]),
    );
    expect(b).toMatchObject({
      type: 'prisma/countdown',
      attrs: { endDateTime: '2030-05-01T10:00:00Z', timerEndAction: 'content' },
      children: [child],
    });
  });
});
