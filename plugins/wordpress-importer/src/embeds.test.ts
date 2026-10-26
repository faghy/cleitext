import type { CxdBlock } from '@cleitext/blocks';
import { describe, expect, it } from 'vitest';
import { oembedLookup } from './embeds';
import { wxrToDocument } from './wxr';

const cdata = (v: string) => `<![CDATA[${v}]]>`;

const embed = (url: string, slug: string) =>
  `<!-- wp:embed {"url":"${url}","type":"rich","providerNameSlug":"${slug}","responsive":true} -->
<figure class="wp-block-embed is-type-rich is-provider-${slug} wp-block-embed-${slug}"><div class="wp-block-embed__wrapper">
${url}
</div></figure>
<!-- /wp:embed -->`;

const SOUNDCLOUD = 'https://soundcloud.com/artist/track';
const SOUNDCLOUD_HTML =
  '<iframe title="Track by Artist" width="500" height="400" scrolling="no" frameborder="no" src="https://w.soundcloud.com/player/?visual=true&url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F1&show_artwork=true"></iframe>';

function exportOf(content: string, meta = ''): string {
  return `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Lino</title><wp:wxr_version>1.2</wp:wxr_version><wp:base_blog_url>https://linomissio.example</wp:base_blog_url>
<item><title>Canale Tik Tok</title><wp:post_id>40</wp:post_id><wp:post_name>canale-tik-tok</wp:post_name><wp:status>publish</wp:status><wp:post_type>page</wp:post_type><content:encoded>${cdata(content)}</content:encoded>${meta}</item>
<item><title>${'a1b2c3d4e5f60718293a4b5c6d7e8f90'}</title><wp:post_id>41</wp:post_id><wp:post_name>a1b2</wp:post_name><wp:status>publish</wp:status><wp:post_type>oembed_cache</wp:post_type><content:encoded>${cdata('<blockquote class="wp-embedded-content"><a href="https://other.example/x">X</a></blockquote>')}</content:encoded></item>
</channel></rss>`;
}

const blocksOf = (xml: string) => {
  const { document, warnings } = wxrToDocument(xml, { locale: 'it' });
  const entry = document.entries!.find((e) => e.ref === 'post:40')!;
  return { blocks: (entry.document as { blocks: CxdBlock[] }).blocks, warnings };
};

describe('embeds of a WordPress export', () => {
  it('keeps TikTok, Instagram, Facebook and X embeds, cards and cached HTML for the rest', () => {
    const { blocks, warnings } = blocksOf(
      exportOf(
        [
          embed('https://www.tiktok.com/@linomissio', 'tiktok'),
          embed('https://www.instagram.com/p/C1a2B3c4D5e/', 'instagram'),
          embed('https://www.facebook.com/linomissio/posts/pfbid02abc', 'facebook'),
          embed('https://x.com/linomissio/status/1790000000000000000', 'twitter'),
          embed(SOUNDCLOUD, 'soundcloud'),
          embed('https://unknown.example/post/1', 'unknown'),
        ].join('\n'),
        `<wp:postmeta><wp:meta_key>_oembed_0123456789abcdef0123456789abcdef</wp:meta_key><wp:meta_value>${cdata(SOUNDCLOUD_HTML.replace('&url=https%3A%2F%2Fapi', `&amp;url=${encodeURIComponent(SOUNDCLOUD)}&amp;x=https%3A%2F%2Fapi`))}</wp:meta_value></wp:postmeta><wp:postmeta><wp:meta_key>_oembed_time_0123456789abcdef0123456789abcdef</wp:meta_key><wp:meta_value>1700000000</wp:meta_value></wp:postmeta><wp:postmeta><wp:meta_key>_oembed_ffffffffffffffffffffffffffffffff</wp:meta_key><wp:meta_value>{{unknown}}</wp:meta_value></wp:postmeta>`,
      ),
    );
    expect(blocks.map((b) => [b.type, b.attrs.providerNameSlug ?? null])).toEqual([
      ['core/embed', 'tiktok'],
      ['core/embed', 'instagram'],
      ['core/embed', 'facebook'],
      ['core/embed', 'twitter'],
      ['core/html', null],
      ['core/embed', null],
    ]);
    expect(blocks[0]!.attrs.url).toBe('https://www.tiktok.com/@linomissio');
    expect(blocks[4]!.attrs.content).toContain('src="https://w.soundcloud.com/player/');
    expect(blocks[5]!.attrs.url).toBe('https://unknown.example/post/1');
    // Every embed is in the report, with its page.
    const lines = warnings.filter((w) => w.includes('Embed of'));
    expect(lines).toEqual([
      'Canale Tik Tok: Embed of TikTok kept: TikTok profile @linomissio, https://www.tiktok.com/@linomissio',
      'Canale Tik Tok: Embed of Instagram kept: Instagram post, https://www.instagram.com/p/C1a2B3c4D5e/',
      'Canale Tik Tok: Embed of Facebook kept: Facebook post, https://www.facebook.com/linomissio/posts/pfbid02abc',
      'Canale Tik Tok: Embed of X kept: X post, https://x.com/linomissio/status/1790000000000000000',
      `Canale Tik Tok: Embed of SoundCloud kept with WordPress's HTML, held until consent with the Privacy plugin: ${SOUNDCLOUD}`,
      'Canale Tik Tok: Embed of unknown.example shown as a link card (no player for it): https://unknown.example/post/1',
    ]);
  });

  it('matches cached HTML to the address it shows, and ignores failed lookups', () => {
    const text = (v: unknown) => String(v ?? '');
    const row = (key: string, value: string) => ({ 'wp:meta_key': key, 'wp:meta_value': value });
    const lookup = oembedLookup(
      [
        row('_oembed_0123456789abcdef0123456789abcdef', '{{unknown}}'),
        row(
          '_oembed_1123456789abcdef0123456789abcdef',
          '<a href="https://www.reddit.com/r/x/comments/1/">r</a>',
        ),
        row('_oembed_time_1123456789abcdef0123456789abcdef', '1700000000'),
        row('_thumbnail_id', '<b>https://soundcloud.com/a</b>'),
      ],
      text,
      [
        '<iframe src="https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fa%2Fb"></iframe>',
      ],
    );
    expect(lookup('https://reddit.com/r/x/comments/1/?utm=1')).toContain(
      'reddit.com/r/x/comments/1',
    );
    expect(lookup('https://soundcloud.com/a/b')).toContain('w.soundcloud.com');
    expect(lookup('https://example.com/nothing')).toBeUndefined();
    expect(oembedLookup([], text)('https://soundcloud.com/a/b')).toBeUndefined();
  });
});
