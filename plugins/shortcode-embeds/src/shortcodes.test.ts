import { describe, expect, it } from 'vitest';
import {
  blockFromSpreaker,
  embedFromFve,
  providerOf,
  safeUrl,
  spreakerAttrs,
  spreakerSrc,
} from './shortcodes';

describe('[fve]', () => {
  it('makes an Embed block of a YouTube or Facebook address', () => {
    const yt = embedFromFve('https://www.youtube.com/watch?v=nj7mBO9G5qo');
    expect(yt?.type).toBe('core/embed');
    expect(yt?.attrs).toEqual({
      url: 'https://www.youtube.com/watch?v=nj7mBO9G5qo',
      providerNameSlug: 'youtube',
      type: 'video',
      responsive: true,
    });
    expect(
      embedFromFve('https://www.facebook.com/problemidivolley/videos/1234/')?.attrs
        .providerNameSlug,
    ).toBe('facebook');
    expect(embedFromFve(' <a href="x">https://youtu.be/abc</a> ')?.attrs.url).toBe(
      'https://youtu.be/abc',
    );
    expect(embedFromFve('https://www.youtube.com/watch?v=r7E0ttQ0S7Q&amp;t=11s')?.attrs.url).toBe(
      'https://www.youtube.com/watch?v=r7E0ttQ0S7Q&t=11s',
    );
  });

  it('leaves other content alone', () => {
    expect(embedFromFve('')).toBeNull();
    expect(embedFromFve('javascript:alert(1)')).toBeNull();
    expect(embedFromFve('https://example.com/video')).toBeNull();
    expect(providerOf('not a url')).toBe('');
    expect(safeUrl('ftp://x')).toBe('');
  });
});

describe('[spreaker]', () => {
  it('keeps the episode and the options of the shortcode', () => {
    const block = blockFromSpreaker({
      type: 'player',
      resource: 'episode_id=25796536',
      width: '100%',
      height: '200px',
      theme: 'light',
      playlist: 'false',
      'hide-logo': 'false',
      'chapters-image': 'true',
      bogus: 'x',
    });
    expect(block?.type).toBe('shortcode-embeds/spreaker');
    expect(block?.attrs).toEqual({
      resource: 'episode_id=25796536',
      height: 200,
      theme: 'light',
      playlist: 'false',
      options: { 'hide-logo': false, 'chapters-image': true },
    });
    expect(spreakerSrc(spreakerAttrs(block!.attrs))).toBe(
      'https://widget.spreaker.com/player?episode_id=25796536&theme=light&chapters-image=true&hide-logo=false',
    );
  });

  it('refuses what is not a player of a known resource', () => {
    expect(blockFromSpreaker({ resource: 'episode_id=1"><script>' })).toBeNull();
    expect(blockFromSpreaker({ type: 'other', resource: 'episode_id=1' })).toBeNull();
    expect(spreakerAttrs({ resource: 'show_id=9', height: '5000', theme: 'neon' })).toMatchObject({
      resource: 'show_id=9',
      height: 1000,
      theme: 'light',
    });
  });
});
