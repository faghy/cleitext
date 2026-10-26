import { describe, expect, it } from 'vitest';
import type { CxdBlock } from '../src/index.js';
import { htmlToCxd } from '../src/html.js';

function convert(html: string, oembed?: Record<string, string>) {
  const warnings: string[] = [];
  const { blocks } = htmlToCxd(html, {
    keepUnknown: true,
    warn: (m) => warnings.push(m),
    ...(oembed ? { oembedHtml: (url: string) => oembed[url] } : {}),
  });
  return { blocks: blocks as CxdBlock[], warnings };
}

/** WordPress's Embed block as it saves it. */
const wpEmbed = (url: string, slug: string, type = 'rich', caption = '') =>
  `<!-- wp:embed {"url":"${url}","type":"${type}","providerNameSlug":"${slug}","responsive":true} -->
<figure class="wp-block-embed is-type-${type} is-provider-${slug} wp-block-embed-${slug}"><div class="wp-block-embed__wrapper">
${url}
</div>${caption ? `<figcaption class="wp-element-caption">${caption}</figcaption>` : ''}</figure>
<!-- /wp:embed -->`;

describe('WordPress embeds on import', () => {
  it('keeps a TikTok creator embed (linomissio.com, "Canale Tik Tok")', () => {
    const { blocks, warnings } = convert(
      wpEmbed('https://www.tiktok.com/@linomissio', 'tiktok', 'rich', 'Il <em>canale</em>'),
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: 'core/embed',
      attrs: {
        url: 'https://www.tiktok.com/@linomissio',
        providerNameSlug: 'tiktok',
        type: 'rich',
        caption: [{ text: 'Il ' }, { text: 'canale', marks: ['italic'] }],
      },
    });
    expect(warnings).toEqual([
      'Embed of TikTok kept: TikTok profile @linomissio, https://www.tiktok.com/@linomissio',
    ]);
  });

  it('keeps Instagram, Facebook and X posts', () => {
    const { blocks, warnings } = convert(
      [
        wpEmbed('https://www.instagram.com/p/C1a2B3c4D5e/', 'instagram'),
        wpEmbed('https://www.facebook.com/cleitext/posts/pfbid02abc', 'facebook'),
        wpEmbed('https://twitter.com/cleitext/status/1790000000000000000', 'twitter'),
      ].join('\n'),
    );
    expect(blocks.map((b) => [b.type, b.attrs.providerNameSlug])).toEqual([
      ['core/embed', 'instagram'],
      ['core/embed', 'facebook'],
      ['core/embed', 'twitter'],
    ]);
    expect(warnings).toEqual([
      'Embed of Instagram kept: Instagram post, https://www.instagram.com/p/C1a2B3c4D5e/',
      'Embed of Facebook kept: Facebook post, https://www.facebook.com/cleitext/posts/pfbid02abc',
      'Embed of X kept: X post, https://twitter.com/cleitext/status/1790000000000000000',
    ]);
  });

  it('reports profiles without a frame as link cards', () => {
    const { blocks, warnings } = convert(
      wpEmbed('https://www.instagram.com/someone/', 'instagram'),
    );
    expect(blocks[0]).toMatchObject({
      type: 'core/embed',
      attrs: { providerNameSlug: 'instagram' },
    });
    expect(warnings[0]).toBe(
      'Embed of Instagram shown as a link card: Instagram profile @someone, https://www.instagram.com/someone/',
    );
  });

  it('keeps an unknown provider as a card, or its cached oEmbed HTML held until consent', () => {
    const track = 'https://soundcloud.com/artist/track';
    const other = 'https://example.com/a-post';
    const html = [wpEmbed(track, 'soundcloud', 'rich', 'Listen'), wpEmbed(other, 'example')].join(
      '',
    );
    const plain = convert(html);
    expect(plain.blocks.map((b) => [b.type, b.attrs.url])).toEqual([
      ['core/embed', track],
      ['core/embed', other],
    ]);
    expect(plain.blocks[0]!.attrs.caption).toEqual([{ text: 'Listen' }]);
    expect(plain.warnings).toEqual([
      `Embed of SoundCloud shown as a link card (no player for it): ${track}`,
      `Embed of example.com shown as a link card (no player for it): ${other}`,
    ]);
    const cached = convert(html, {
      [track]:
        '<iframe width="100%" height="400" src="https://w.soundcloud.com/player/?url=x"></iframe><script src="https://w.soundcloud.com/x.js"></script>',
    });
    expect(cached.blocks[0]).toMatchObject({
      type: 'core/html',
      attrs: {
        content:
          '<iframe width="100%" height="400" src="https://w.soundcloud.com/player/?url=x"></iframe><script data-cx-embed="SoundCloud" src="https://w.soundcloud.com/x.js"></script>',
      },
    });
    expect(cached.warnings[0]).toBe(
      `Embed of SoundCloud kept with WordPress's HTML, held until consent with the Privacy plugin: ${track}`,
    );
  });

  it('reads the older names and forms of embeds', () => {
    const { blocks, warnings } = convert(
      [
        '<!-- wp:core-embed/youtube {"url":"https://youtu.be/dQw4w9WgXcQ","align":"wide"} --><figure class="wp-block-embed-youtube alignwide wp-block-embed is-type-video"><div class="wp-block-embed__wrapper">https://youtu.be/dQw4w9WgXcQ</div></figure><!-- /wp:core-embed/youtube -->',
        '<!-- wp:shortcode -->[embed width="300"]https://x.com/cleitext/status/1790000000000000000[/embed]<!-- /wp:shortcode -->',
        '<!-- wp:paragraph --><p>https://www.tiktok.com/@linomissio/video/7212345678901234567</p><!-- /wp:paragraph -->',
        '<!-- wp:paragraph --><p>https://example.com/not-an-embed</p><!-- /wp:paragraph -->',
      ].join(''),
    );
    expect(blocks.map((b) => [b.type, b.attrs.providerNameSlug ?? null])).toEqual([
      ['core/embed', 'youtube'],
      ['core/embed', 'twitter'],
      ['core/embed', 'tiktok'],
      ['core/paragraph', null],
    ]);
    expect(blocks[0]!.attrs.align).toBe('wide');
    expect(warnings).toEqual([
      'Embed of YouTube kept: YouTube, https://youtu.be/dQw4w9WgXcQ',
      'Embed of X kept (from an [embed] shortcode): X post, https://x.com/cleitext/status/1790000000000000000',
      'Embed of TikTok kept (from an address alone on its line): TikTok video, https://www.tiktok.com/@linomissio/video/7212345678901234567',
    ]);
  });

  it('turns classic content and pasted embed code into Embed blocks', () => {
    const { blocks, warnings } = convert(
      [
        'Intro',
        '',
        'https://www.instagram.com/reel/C1a2B3c4D5e/',
        '',
        '[embed]https://vimeo.com/76979871[/embed]',
        '<figure class="wp-block-embed is-type-rich is-provider-tiktok wp-block-embed-tiktok"><div class="wp-block-embed__wrapper">https://www.tiktok.com/@linomissio</div></figure>',
        '<blockquote class="twitter-tweet"><p>Hi</p>&mdash; Cleitext (@cleitext) <a href="https://twitter.com/cleitext/status/1790000000000000000?ref_src=twsrc%5Etfw">May 1, 2024</a></blockquote><script async src="https://platform.twitter.com/widgets.js"></script>',
        '<iframe src="https://www.tiktok.com/embed/v2/7212345678901234567" width="325" height="740"></iframe>',
        'https://example.com/plain-address',
      ].join('\n'),
    );
    expect(blocks.map((b) => [b.type, b.attrs.providerNameSlug ?? null])).toEqual([
      ['core/paragraph', null],
      ['core/embed', 'instagram'],
      ['core/embed', 'vimeo'],
      ['core/embed', 'tiktok'],
      ['core/embed', 'twitter'],
      ['core/embed', 'tiktok'],
      ['core/paragraph', null],
    ]);
    expect(blocks[4]!.attrs.url).toBe(
      'https://twitter.com/cleitext/status/1790000000000000000?ref_src=twsrc%5Etfw',
    );
    expect(warnings.filter((w) => w.startsWith('Embed of'))).toHaveLength(5);
  });

  it('turns the HTML block of a pasted TikTok embed into the Embed block', () => {
    // Server8's workaround on linomissio.com, and TikTok's own embed code.
    const { blocks, warnings } = convert(
      [
        '<!-- wp:html --><blockquote class="tiktok-embed" cite="https://www.tiktok.com/@linomissio" data-unique-id="linomissio" data-embed-type="creator" style="max-width:780px;min-width:288px"><section><a target="_blank" href="https://www.tiktok.com/@linomissio?refer=creator_embed">@linomissio</a></section></blockquote><script async src="https://www.tiktok.com/embed.js"></script><!-- /wp:html -->',
        '<!-- wp:html --><blockquote class="tiktok-embed" cite="https://www.tiktok.com/@linomissio"></blockquote><p>And a note</p><!-- /wp:html -->',
        '<!-- wp:html --><iframe src="https://www.google.com/maps/embed?pb=1"></iframe><!-- /wp:html -->',
      ].join(''),
    );
    expect(blocks.map((b) => b.type)).toEqual(['core/embed', 'core/html', 'core/html']);
    expect(blocks[0]!.attrs.url).toBe('https://www.tiktok.com/@linomissio');
    expect(warnings).toEqual([
      'Embed of TikTok kept (from pasted HTML): TikTok profile @linomissio, https://www.tiktok.com/@linomissio',
    ]);
  });
});
