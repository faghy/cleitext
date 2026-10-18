import { describe, expect, it } from 'vitest';
import { howTo, howToSchema, howToStep, timeParts } from '../src/blocks/how-to';
import type { Attrs, SpectraSource } from '../src/lib/types';
import { renderBlock, text } from './render';

function source(html: string): SpectraSource {
  const inner = (tag: string, className: string) =>
    new RegExp(
      `<${tag}\\b[^>]*class="(?:[^"]*\\s)?${className}(?:\\s[^"]*)?"[^>]*>([\\s\\S]*?)</${tag}>`,
      'i',
    )
      .exec(html)?.[1]
      ?.trim() ?? '';
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
        `<(h[1-6]|p|div|span|header)\\b[^>]*class="(?:[^"]*\\s)?${className}(?:\\s[^"]*)?"[^>]*>([\\s\\S]*?)</\\1>`,
        'i',
      )
        .exec(html)?.[2]
        ?.trim() ?? '',
  };
}

const ld = (html: string) =>
  JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]!) as Record<
    string,
    unknown
  >;

describe('how-to', () => {
  it('draws title, description, time, cost, tools, materials and the steps', () => {
    const { html } = renderBlock(
      howTo,
      {
        headingTitle: text('Make bread'),
        headingDesc: text('Simple bread'),
        timeInHours: 2,
        timeInMins: 1,
        cost: text('10'),
        currencyType: text('EUR'),
        tools: [{ add_required_tools: '<strong>Oven</strong>' }, { add_required_tools: 'Bowl' }],
        materials: [{ add_required_materials: 'Flour<script>x</script>' }],
      },
      { children: '<div class="step">S</div>' },
    );
    expect(html).toContain('class="wp-block-prisma-how-to pr-how-to pr-block-test0001"');
    expect(html).toContain('<h3 class="pr-how-to__title">Make bread</h3>');
    expect(html).toContain('<p class="pr-how-to__desc">Simple bread</p>');
    expect(html).toContain(
      '<p class="pr-how-to__time-value">2</p><p class="pr-how-to__time-unit">Hours</p><p class="pr-how-to__time-value">1</p><p class="pr-how-to__time-unit">Minute</p>',
    );
    expect(html).toContain('<p class="pr-how-to__cost-value">10</p>');
    expect(html).toContain('<div class="pr-how-to__tool"><strong>Oven</strong></div>');
    expect(html).toContain('<div class="pr-how-to__material">Flour');
    expect(html).not.toContain('<script>x');
    expect(html).toContain(
      '<h4 class="pr-how-to__steps-title">Steps:</h4><div><div class="step">S</div></div>',
    );
  });

  it('hides the parts turned off and uses the old minutes only without larger units', () => {
    const { html } = renderBlock(howTo, {
      showEstcost: false,
      showTools: false,
      showMaterials: false,
    });
    expect(html).not.toContain('pr-how-to__cost');
    expect(html).not.toContain('pr-how-to__tool');
    expect(html).toContain('<p class="pr-how-to__time-value">30</p>');
    expect(timeParts({ time: '30', timeInDays: 1 })).toEqual([{ value: 1, unit: 'Day' }]);
    expect(timeParts({ time: '', timeInYears: 3, timeInMins: 5 })).toEqual([
      { value: 3, unit: 'Years' },
      { value: 5, unit: 'Minutes' },
    ]);
  });

  it('writes the HowTo structured data, safe inside the script', () => {
    const { html } = renderBlock(howTo, {
      headingTitle: text('A </script><b>title'),
      mainimage: { url: 'https://example.com/a.jpg' },
      timeInHours: 1,
      timeInMins: 30,
      schema: JSON.stringify({ step: [{ name: 'One', text: '<b>Do</b> it', url: '#' }] }),
    });
    expect(html).not.toContain('</script><b>');
    const data = ld(html);
    expect(data['@type']).toBe('HowTo');
    expect(data.name).toBe('A </script><b>title');
    expect(data.totalTime).toBe('P0Y0M0DT1H30M');
    expect(data.image).toEqual({ '@type': 'ImageObject', url: 'https://example.com/a.jpg' });
    expect(data.estimatedCost).toEqual({ '@type': 'MonetaryAmount', currency: 'USD', value: '65' });
    expect(data.tool).toEqual([{ '@type': 'HowToTool', name: '- A spade' }]);
    expect(data.step).toEqual([{ '@type': 'HowToStep', name: 'One', text: 'Do it' }]);
    expect(howToSchema({ ...howTo.defaults, showTotaltime: false }, []).totalTime).toBeUndefined();
  });

  it('writes Spectra’s CSS: alignment, row gaps by device, colors and typography', () => {
    const { css } = renderBlock(howTo, {
      overallAlignment: 'center',
      rowGapTablet: 10,
      step_gap: 12,
      headingColor: '#111',
      showTotaltimecolor: '#222',
      subHeadFontSize: 15,
      subHeadFontSizeMobile: 13,
    });
    const B = '.pr-block-test0001';
    expect(css).toContain(`${B}.pr-how-to{text-align:center}`);
    expect(css).toContain(`${B}.pr-how-to p{margin-bottom:20px}`);
    expect(css).toMatch(
      /\.pr-how-to__time, [^{]+\.pr-how-to__cost\{margin-bottom:20px;justify-content:center\}/,
    );
    expect(css).toContain(`${B} .pr-how-to-step{margin-bottom:12px}`);
    expect(css).toContain(`${B} .pr-how-to-step:last-child{margin-bottom:0px}`);
    expect(css).toContain(`${B} .pr-how-to__title{color:#111;font-weight:500}`);
    expect(css).toContain(`${B} h4{font-weight:500;font-size:18px}`);
    expect(css).toMatch(/@media \(max-width: ?976px\)\{[^@]*margin-bottom:10px/);
    expect(css).toMatch(/@media \(max-width: ?767px\)\{[^@]*font-size:13px/);
  });

  it('imports a Spectra how-to with its texts and lists from the saved HTML', () => {
    const html =
      '<div class="wp-block-uagb-how-to uagb-block-1 uagb-how-to-main-wrap"><script type="application/ld+json">{}</script>' +
      '<h2 class="uagb-howto-heading-text">Come fare</h2><p class="uagb-howto-desc-text">Desc</p>' +
      '<span class="uagb-howto__cost-wrap"><h4 class="uagb-howto-estcost-text">Costo:</h4><p class="uagb-howto-estcost-value">12</p><p class="uagb-howto-estcost-type"> EUR</p></span>' +
      '<h4 class="uagb-howto-req-tools-text">Attrezzi</h4><div class="uagb-tools__label 0">Martello</div><div class="uagb-tools__label 1"><em>Chiodi</em></div>' +
      '<h4 class="uagb-howto-req-steps-text">Passi</h4></div>';
    const [block] = howTo.spectra!['uagb/how-to']!(
      { headingTag: 'h2', block_id: 'x' } as Attrs,
      source(html),
    );
    expect(block!.type).toBe('prisma/how-to');
    expect(block!.attrs).toMatchObject({
      headingTag: 'h2',
      headingTitle: 'Come fare',
      headingDesc: 'Desc',
      estCost: 'Costo:',
      cost: '12',
      currencyType: 'EUR',
      toolsTitle: 'Attrezzi',
      stepsTitle: 'Passi',
      tools: [{ add_required_tools: 'Martello' }, { add_required_tools: '<em>Chiodi</em>' }],
    });
    expect(block!.children).toEqual([]);
  });
});

describe('how-to step', () => {
  it('draws a step linked as a whole, with its image above the title', () => {
    const { html } = renderBlock(howToStep, {
      name: text('Mix'),
      description: text('Mix it all'),
      url: 'https://example.com/mix',
      image: { url: 'https://example.com/m.jpg', alt: 'Bowl' },
    });
    expect(html).toContain('class="wp-block-prisma-how-to-step pr-how-to-step pr-block-test0001"');
    expect(html).toContain(
      '<a href="https://example.com/mix" target="_self" class="pr-how-to-step__link-all" rel="noopener noreferrer" aria-label="Mix"></a>',
    );
    expect(html).toContain('pr-how-to-step__body pr-how-to-step__body--above-title');
    expect(html).toContain(
      '<img class="pr-how-to-step__image" src="https://example.com/m.jpg" alt="Bowl"',
    );
    expect(html).toContain(
      '<div class="pr-how-to-step__name">Mix</div><p class="pr-how-to-step__desc">Mix it all</p>',
    );
  });

  it('draws a text link, or the text alone without an address', () => {
    const linked = renderBlock(howToStep, {
      urlType: 'text',
      url: '/x',
      urlText: 'More',
      urlTarget: true,
    });
    expect(linked.html).toContain(
      '<a href="/x" target="_blank" class="pr-how-to-step__link" rel="noopener noreferrer"><span class="pr-how-to-step__link-text">More</span></a>',
    );
    expect(linked.html).not.toContain('link-all');
    const bare = renderBlock(howToStep, { urlType: 'text', url: 'javascript:alert(1)' });
    expect(bare.html).toContain('<span class="pr-how-to-step__link-text">Read more</span>');
    expect(bare.html).not.toContain('javascript');
  });

  it('writes the step’s colors and typography', () => {
    const { css } = renderBlock(howToStep, {
      titleColor: '#123',
      titleFontSize: 20,
      urlColor: 'red',
    });
    expect(css).toContain('.pr-block-test0001 .pr-how-to-step__name{color:#123;font-size:20px}');
    expect(css).toContain('.pr-block-test0001 .pr-how-to-step__link-text{color:red}');
  });

  it('imports a Spectra step with its texts from the saved HTML', () => {
    const html =
      '<div class="wp-block-uagb-how-to-step uagb-how-to-step-wrap uagb-block-2"><div class="uagb-step-image-content-wrap uag-image-position-left-title">' +
      '<div class="uagb-step-content-wrap"><div class="uagb-how-to-step-name">Impasta</div><p class="uagb-how-to-step-description">Con le <strong>mani</strong></p>' +
      '<a href="/a" class="uagb-step-link"><span class="uagb-step-link-text">Leggi &amp; vai</span></a></div></div></div>';
    const [block] = howToStep.spectra!['uagb/how-to-step']!(
      { urlType: 'text', url: '/a', imgPosition: 'left-title' },
      source(html),
    );
    expect(block!.attrs).toMatchObject({
      name: 'Impasta',
      description: 'Con le <strong>mani</strong>',
      urlText: 'Leggi & vai',
      imgPosition: 'left-title',
    });
  });
});
