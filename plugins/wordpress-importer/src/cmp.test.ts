import { describe, expect, it } from 'vitest';
import { cmpWarning, emptyCmpReport, stripCmpBlocks, stripCmpCss, stripCmpHtml } from './cmp';

describe('cookie banners’ leftovers', () => {
  it('lose their CSS rules, keeping the others', () => {
    const report = emptyCmpReport();
    expect(
      stripCmpCss(
        'a.cky-banner-element{padding:0}.note{color:red}.cmplz-btn,.x{margin:0}@media (max-width:600px){#CybotCookiebotDialog{top:0}}@font-face{font-family:A}',
        report,
      ),
    ).toBe('.note{color:red}.x{margin:0}@font-face{font-family:A}');
    expect(report.rules).toBe(3);
    expect([...report.managers]).toEqual(['CookieYes', 'Complianz', 'Cookiebot']);
  });

  it('lose their style blocks and scripts; their settings links open the Privacy plugin’s', () => {
    const report = emptyCmpReport();
    const html = stripCmpHtml(
      '<style id="cky-style">.cky-x{a:b}</style><style>.cky-btn{a:b}</style><p>Hi <a class="cky-banner-element">Cookie settings</a> · <a href="javascript: Cookiebot.renew()">Change</a> <button class="cmplz-show-banner x">Manage</button> <a class="cky-other" href="/p">kept</a></p><script id="CookieDeclaration" src="https://consent.cookiebot.com/1/cd.js" async></script>',
      report,
    );
    expect(html).toBe(
      '<p>Hi <a href="#cookie-preferences">Cookie settings</a> · <a href="#cookie-preferences">Change</a> <a href="#cookie-preferences">Manage</a> <a class="cky-other" href="/p">kept</a></p>',
    );
    expect(report).toMatchObject({ rules: 2, links: 3, scripts: 1 });
    expect(cmpWarning(report)).toContain(
      '2 CSS rule(s) or style block(s) removed, 1 script(s) removed, 3 "Cookie settings" link(s)',
    );
    expect(cmpWarning(emptyCmpReport())).toBeNull();
  });

  it('leave everything else as it is, and drop HTML blocks left empty', () => {
    const report = emptyCmpReport();
    const plain = [{ type: 'core/html', attrs: { content: '<style>.cookie{a:b}</style>' } }];
    expect(stripCmpBlocks(plain, report)).toBe(plain);
    const blocks = stripCmpBlocks(
      [
        { type: 'core/html', attrs: { content: '<style>.cky-a{a:b}</style>' } },
        {
          type: 'core/group',
          attrs: {},
          children: [
            { type: 'core/paragraph', attrs: { html: '<a class="cky-banner-element">C</a>' } },
          ],
        },
      ],
      report,
    );
    expect(blocks).toEqual([
      {
        type: 'core/group',
        attrs: {},
        children: [
          { type: 'core/paragraph', attrs: { html: '<a href="#cookie-preferences">C</a>' } },
        ],
      },
    ]);
  });
});
