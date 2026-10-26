// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { bannerHtml, gateEmbeds } from './banner';
import { categoryLabel, textsFor, withDefaults } from './config';

const en = textsFor('en');
const texts = { ...en.embed, preferences: en.preferences };

/** The markup of the Embed block for a TikTok profile, as the renderer writes it. */
const TIKTOK =
  '<figure class="wp-block-embed is-type-rich is-provider-tiktok wp-block-embed-tiktok"><div class="wp-block-embed__wrapper"><iframe src="https://www.tiktok.com/embed/@linomissio" title="TikTok profile @linomissio" width="780" height="479" loading="lazy" style="border:0;display:block;width:100%;max-width:780px;height:479px"></iframe></div></figure>';

/** A social post kept by an import: the provider's blockquote and its script. */
const SCRIPT_EMBED =
  '<blockquote class="reddit-embed-bq"><a href="https://www.reddit.com/r/x/comments/1/">Post</a></blockquote><script async src="https://embed.reddit.com/widgets.js" data-cx-embed="Reddit"></script>';

const page = (body: string) => `<html><head></head><body>${body}</body></html>`;

describe('embeds held until consent', () => {
  it('holds a TikTok profile with a notice naming TikTok and the category', () => {
    const html = gateEmbeds(page(TIKTOK), texts);
    expect(html).toContain(
      '<iframe data-cx-category="marketing" data-cx-src="https://www.tiktok.com/embed/@linomissio" srcdoc="',
    );
    expect(html).not.toMatch(/<iframe[^>]*\ssrc="https:\/\/www\.tiktok/);
    // The frame keeps its size and title, so nothing moves when it is shown.
    expect(html).toContain('title="TikTok profile @linomissio"');
    expect(html).toContain('height:479px');
    const notice = /srcdoc="([^"]*)"/.exec(html)![1]!;
    expect(notice).toContain('Content of TikTok');
    expect(notice).toContain('“Marketing”');
    expect(notice).toContain('data-cx-allow=&#34;marketing&#34;');
    expect(notice).toContain('data-cx-open');
  });

  it('uses the chosen category, or the one an embed names when it is offered', () => {
    const it = textsFor('it');
    const html = gateEmbeds(
      page(
        `${TIKTOK}<iframe src="https://platform.twitter.com/embed/Tweet.html?id=1" data-cx-category="preferences"></iframe><iframe data-cx-category="bogus" src="https://www.instagram.com/p/abcdef/embed/"></iframe>`,
      ),
      { ...it.embed, preferences: it.preferences },
      '#0f4c81',
      {
        category: 'statistics',
        offered: ['statistics', 'preferences'],
        label: (c) => categoryLabel(it, c),
      },
    );
    const frames = [...html.matchAll(/<iframe([^>]*)>/g)].map((m) => m[1]!);
    expect(frames[0]).toContain('data-cx-category="statistics"');
    expect(frames[0]).toContain('“Statistiche”');
    expect(frames[1]).toContain('data-cx-category="preferences"');
    expect(frames[1]).toContain('Contenuto di X');
    expect(frames[2]).toContain('data-cx-category="statistics"');
    expect(frames[2]).toContain('Contenuto di Instagram');
    for (const frame of frames) expect(frame.match(/data-cx-category=/g)).toHaveLength(1);
  });

  it('holds the script of an embed, with the notice before it', () => {
    const html = gateEmbeds(page(SCRIPT_EMBED), texts);
    expect(html).toContain(
      '<div class="cx-embed-notice" data-cx-notice="marketing" role="group" aria-label="Content of Reddit"',
    );
    expect(html).toMatch(
      /<script type="text\/plain" data-cx-category="marketing" async src="https:\/\/embed\.reddit\.com\/widgets\.js" data-cx-embed="Reddit">/,
    );
    // Already held: left alone.
    expect(gateEmbeds(html, texts)).toBe(html);
  });
});

describe('consent flow', () => {
  it('shows the embed after "Accept and show", without loading the page again', () => {
    const cfg = withDefaults(null);
    const banner = bannerHtml(
      { ...cfg, banner: { ...cfg.banner, categories: ['statistics', 'marketing'] } },
      'en',
      {},
      '1',
    );
    const body = /<body>([\s\S]*)<\/body>/.exec(
      gateEmbeds(page(TIKTOK + SCRIPT_EMBED), texts),
    )![1]!;
    document.cookie = 'cx_consent=; Max-Age=0; Path=/';
    // The consent record goes to the server: answered here.
    const sent = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', sent);
    document.body.innerHTML = body + banner.replace(/<script>[\s\S]*<\/script>/, '');
    for (const [, code] of banner.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(code!)();

    const frame = () => document.querySelector('iframe')!;
    expect(frame().getAttribute('src')).toBeNull();
    expect(document.querySelector('[data-cx-notice]')).not.toBeNull();
    // The notice of the script embed answers in the page.
    (document.querySelector('[data-cx-notice] [data-cx-allow]') as HTMLButtonElement).click();

    expect(frame().getAttribute('src')).toBe('https://www.tiktok.com/embed/@linomissio');
    expect(frame().hasAttribute('srcdoc')).toBe(false);
    expect(frame().getAttribute('title')).toBe('TikTok profile @linomissio');
    expect(document.querySelector('[data-cx-notice]')).toBeNull();
    const script = document.querySelector('script[data-cx-embed]')!;
    expect(script.getAttribute('type')).toBeNull();
    expect(script.getAttribute('src')).toBe('https://embed.reddit.com/widgets.js');
    expect(decodeURIComponent(document.cookie)).toContain('"c":["marketing"]');
    expect(sent).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
    document.cookie = 'cx_consent=; Max-Age=0; Path=/';
  });
});
