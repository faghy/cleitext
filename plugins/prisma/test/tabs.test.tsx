import { describe, expect, it } from 'vitest';
import { tab, tabs } from '../src/blocks/tabs';
import type { Attrs, SpectraSource } from '../src/lib/types';
import { renderBlock } from './render';

function source(html: string, children: SpectraSource['children'] = []): SpectraSource {
  return {
    html,
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
  };
}

describe('tabs', () => {
  it('draws the titles as an accessible tab list, the starting tab active', () => {
    const { html } = renderBlock(tabs, {
      tabHeaders: ['One', 'Two'],
      tabActiveFrontend: 1,
      showIcon: true,
      icon: 'star',
      iconPosition: 'right',
    });
    expect(html).toContain(
      'class="wp-block-prisma-tabs pr-tabs pr-block-test0001 pr-tabs--hstyle1-desktop pr-tabs--vstyle6-tablet pr-tabs--stack1-mobile"',
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('data-pr-tabs="{&quot;active&quot;:1}"');
    expect(html).toContain('<li class="pr-tabs__tab" role="none"><a href="#pr-tabs-test0001-0"');
    expect(html).toMatch(
      /<li class="pr-tabs__tab pr-tabs__tab--active" role="none"><a [^>]*aria-selected="true"/,
    );
    expect(html).toMatch(/<div class="pr-tabs__title">Two<\/div><span class="pr-tabs__icon"><svg/);
    expect(html).toContain('<div class="pr-tabs__body">');
  });

  it('writes the default border, title padding and the starting panel', () => {
    const { css } = renderBlock(tabs, { tabHeaders: ['A', 'B', 'C'], tabActiveFrontend: 2 });
    const B = '.pr-block-test0001';
    expect(css).toContain(
      `${B}.pr-tabs--hstyle1-desktop > .pr-tabs__panel .pr-tabs__tab{border-top-width:1px;border-left-width:1px;border-right-width:1px;border-bottom-width:1px;border-color:#e0e0e0;border-style:solid}`,
    );
    expect(css).toContain(`${B} .pr-tabs__panel .pr-tabs__tab a{font-weight:500}`);
    expect(css).toContain(`${B} ul.pr-tabs__panel{margin-right:auto;margin-left:0}`);
    expect(css).toContain(`> .pr-tabs__body > .pr-tab--2{display:block}`);
    expect(css).toContain(`${B} .pr-tabs__icon svg{height:16px;width:16px}`);
  });

  it('uses the older paddings and the layouts of each device', () => {
    const { css } = renderBlock(tabs, {
      tabTitleVertPadding: 8,
      tabTitleLeftPadding: 20,
      tabTitleTopPaddingTablet: 4,
      tabsStyleD: 'hstyle4',
      tabsStyleM: 'vstyle7',
      tabBorderStyle: 'dashed',
      tabBorderTopWidthMobile: 3,
    });
    expect(css).toContain('padding-top:8px;padding-bottom:8px;padding-left:20px');
    expect(css).toContain('.pr-tabs--hstyle4-desktop .pr-tabs__tab{border-radius:30px');
    expect(css).toMatch(/@media[^{]*976px[^{]*\{[^@]*li\.pr-tabs__tab a\{padding-top:4px\}/);
    expect(css).toMatch(
      /@media[^{]*767px[^{]*\{[^@]*\.pr-tabs--vstyle7-mobile \.pr-tabs__tab\{border-top-width:3px/,
    );
  });

  it('imports Spectra tabs: titles from the saved list, panels numbered', () => {
    const html =
      '<div class="wp-block-uagb-tabs uagb-tabs__wrap"><ul class="uagb-tabs__panel uagb-tabs__align-left" role="tablist">' +
      '<li class="uagb-tab uagb-tabs__active" role="none"><a href="#uagb-tabs__tab0" class="uagb-tabs-list uagb-tabs__icon-position-left" data-tab="0" role="tab"><span class="uagb-tabs__icon"><svg><path d="M0"></path></svg></span><div>Rooms</div></a></li>' +
      '<li class="uagb-tab " role="none"><a href="#uagb-tabs__tab1" class="uagb-tabs-list uagb-tabs__icon-position-left" data-tab="1" role="tab"><div><strong>Prices</strong></div></a></li>' +
      '</ul><div class="uagb-tabs__body-wrap"></div></div>';
    const children = [
      { id: 'a', type: 'prisma/tab', v: 1, attrs: { id: 5 } },
      { id: 'b', type: 'prisma/tab', v: 1, attrs: { id: 9 } },
    ];
    const [out] = tabs.spectra!['uagb/tabs']!({ tabsStyleD: 'vstyle8' }, source(html, children));
    expect(out!.attrs).toMatchObject({ tabHeaders: ['Rooms', 'Prices'], tabsStyleD: 'vstyle8' });
    expect(out!.children!.map((c) => (c.attrs as Attrs).id)).toEqual([0, 1]);
    const [fromAttrs] = tabs.spectra!['uagb/tabs']!(
      { tabHeaders: ['<em>X</em>', 'Y'] },
      source(''),
    );
    expect(fromAttrs!.attrs.tabHeaders).toEqual(['X', 'Y']);
  });

  it('draws a panel holding its blocks and imports only its own attributes', () => {
    const { html } = renderBlock(tab, { id: 2 }, { children: '<p>Hi</p>' });
    expect(html).toBe(
      '<div class="wp-block-prisma-tab pr-tab pr-tab--2 pr-block-test0001"><div><p>Hi</p></div></div>',
    );
    const [out] = tab.spectra!['uagb/tabs-child']!(
      { id: 1, tabHeaders: ['a'], headerBgColor: '#000', blockId: 'abc' },
      source(''),
    );
    expect(out!.attrs).toEqual({ id: 1, blockId: 'abc' });
  });
});
