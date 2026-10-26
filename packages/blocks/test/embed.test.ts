import { describe, expect, it } from 'vitest';
import { embedAspectClass, embedAspectOf, embedProviderName, resolveEmbed } from '../src/embed.js';

describe('resolveEmbed', () => {
  it('recognizes the players of known providers', () => {
    const src = (url: string) => resolveEmbed(url)?.src;
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://m.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ]) {
      expect(src(url)).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    }
    expect(src('https://youtu.be/dQw4w9WgXcQ?t=42')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42',
    );
    expect(src('https://vimeo.com/76979871')).toBe('https://player.vimeo.com/video/76979871?dnt=1');
    expect(src('https://vimeo.com/channels/staffpicks/76979871')).toBe(
      'https://player.vimeo.com/video/76979871?dnt=1',
    );
    expect(src('https://open.spotify.com/intl-it/track/4uLU6hMCjMI75M1A2tKUQC')).toBe(
      'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC',
    );
    expect(src('https://www.dailymotion.com/video/x8abc12')).toBe(
      'https://www.dailymotion.com/embed/video/x8abc12',
    );
  });

  it('gives YouTube Shorts a vertical player, as WordPress shows them', () => {
    const size = (url: string) => {
      const e = resolveEmbed(url);
      return e && [e.width, e.height, e.layout];
    };
    expect(size('https://youtube.com/shorts/dQw4w9WgXcQ')).toEqual([360, 640, 'aspect']);
    expect(size('https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share')).toEqual([
      360,
      640,
      'aspect',
    ]);
    expect(size('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual([640, 360, 'aspect']);
    expect(embedAspectClass(360, 640)).toBe('wp-embed-aspect-9-16');
    expect(embedAspectClass(640, 360)).toBe('wp-embed-aspect-16-9');
    expect(embedAspectClass(640, 480)).toBe('wp-embed-aspect-4-3');
    expect(embedAspectClass(500, 100)).toBeNull();
    expect(embedAspectOf('own wp-embed-aspect-9-16 wp-has-aspect-ratio')).toBe(
      'wp-embed-aspect-9-16',
    );
    expect(embedAspectOf('wp-embed-aspect-x')).toBeNull();
    expect(embedAspectOf(undefined)).toBeNull();
  });

  it('refuses anything else', () => {
    for (const url of [
      'not a url',
      'javascript:alert(1)',
      'https://example.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=<script>',
      'https://www.youtube.com/channel/abc',
      'https://evil.youtube.com.example.org/watch?v=abc',
      'https://open.spotify.com/user/someone',
    ]) {
      expect(resolveEmbed(url)).toBeNull();
    }
  });
});

describe('social embeds', () => {
  const info = (url: string) => resolveEmbed(url);

  it('TikTok: videos in its player, profiles in the creator frame, short links as cards', () => {
    for (const url of [
      'https://www.tiktok.com/@linomissio/video/7212345678901234567?lang=it',
      'https://m.tiktok.com/v/7212345678901234567.html',
      'https://www.tiktok.com/embed/v2/7212345678901234567',
      'https://www.tiktok.com/@linomissio/photo/7212345678901234567',
    ]) {
      expect(info(url), url).toMatchObject({
        provider: 'tiktok',
        src: 'https://www.tiktok.com/embed/v2/7212345678901234567',
        layout: 'fixed',
        title: 'TikTok video',
        width: 325,
        height: 740,
      });
    }
    for (const url of [
      'https://www.tiktok.com/@linomissio',
      'https://www.tiktok.com/embed/@linomissio',
    ]) {
      expect(info(url), url).toMatchObject({
        provider: 'tiktok',
        type: 'rich',
        src: 'https://www.tiktok.com/embed/@linomissio',
        layout: 'fixed',
        height: 479,
        title: 'TikTok profile @linomissio',
      });
    }
    expect(info('https://vm.tiktok.com/ZMabc123/')).toMatchObject({
      layout: 'card',
      type: 'link',
      src: 'https://vm.tiktok.com/ZMabc123',
    });
    for (const url of [
      'https://www.tiktok.com/@linomissio/video/abc',
      'https://www.tiktok.com/@lino<missio',
      'https://www.tiktok.com/discover/food',
      'https://www.tiktok.com/',
    ]) {
      expect(info(url), url).toBeNull();
    }
  });

  it('Instagram: posts and reels in its frame, profiles as cards', () => {
    expect(info('https://www.instagram.com/p/C1a2B3c4D5e/?igsh=xyz')).toMatchObject({
      provider: 'instagram',
      src: 'https://www.instagram.com/p/C1a2B3c4D5e/embed/',
      layout: 'fixed',
      title: 'Instagram post',
    });
    expect(info('https://instagram.com/someone/p/C1a2B3c4D5e/')?.src).toBe(
      'https://www.instagram.com/p/C1a2B3c4D5e/embed/',
    );
    expect(info('https://www.instagram.com/tv/C1a2B3c4D5e')?.src).toBe(
      'https://www.instagram.com/p/C1a2B3c4D5e/embed/',
    );
    for (const url of [
      'https://www.instagram.com/reel/C1a2B3c4D5e/',
      'https://www.instagram.com/reels/C1a2B3c4D5e/',
    ]) {
      expect(info(url), url).toMatchObject({
        src: 'https://www.instagram.com/reel/C1a2B3c4D5e/embed/',
        title: 'Instagram reel',
      });
    }
    expect(info('https://www.instagram.com/some.one_/')).toMatchObject({
      provider: 'instagram',
      layout: 'card',
      src: 'https://www.instagram.com/some.one_/',
      handle: '@some.one_',
      title: 'Instagram profile @some.one_',
    });
    for (const url of [
      'https://www.instagram.com/explore/',
      'https://www.instagram.com/p/',
      'https://www.instagram.com/p/a"b/',
      'https://www.instagram.com/stories/someone/123/',
    ]) {
      expect(info(url), url).toBeNull();
    }
  });

  it('Facebook: posts, videos and pages in its plugins', () => {
    const href = (url: string) => {
      const src = info(url)?.src;
      return src ? new URL(src).searchParams.get('href') : null;
    };
    const post = info('https://www.facebook.com/cleitext/posts/pfbid02abc?ref=embed_post');
    expect(post).toMatchObject({ provider: 'facebook', layout: 'fixed', title: 'Facebook post' });
    expect(post?.src).toMatch(/^https:\/\/www\.facebook\.com\/plugins\/post\.php\?href=/);
    expect(href('https://www.facebook.com/cleitext/posts/pfbid02abc?ref=embed_post')).toBe(
      'https://www.facebook.com/cleitext/posts/pfbid02abc',
    );
    expect(href('https://m.facebook.com/permalink.php?story_fbid=123&id=456&x=1')).toBe(
      'https://www.facebook.com/permalink.php?story_fbid=123&id=456',
    );
    expect(href('https://www.facebook.com/share/p/1AbCd2/')).toBe(
      'https://www.facebook.com/share/p/1AbCd2/',
    );
    const video = info('https://www.facebook.com/cleitext/videos/1234567890/');
    expect(video).toMatchObject({ type: 'video', layout: 'aspect', title: 'Facebook video' });
    expect(video?.src).toContain('/plugins/video.php?href=');
    expect(href('https://www.facebook.com/watch/?v=987')).toBe(
      'https://www.facebook.com/watch/?v=987',
    );
    expect(href('https://fb.watch/abcDEF/')).toBe('https://fb.watch/abcDEF/');
    expect(info('https://www.facebook.com/reel/555')).toMatchObject({ title: 'Facebook reel' });
    const pagePlugin = info('https://www.facebook.com/cleitext');
    expect(pagePlugin).toMatchObject({ layout: 'fixed', title: 'Facebook page cleitext' });
    expect(pagePlugin?.src).toContain('/plugins/page.php?href=');
    expect(pagePlugin?.src).toContain('tabs=timeline');
    // The plugin's own address is the same embed.
    expect(info(post!.src)?.src).toBe(post!.src);
    for (const url of [
      'https://www.facebook.com/',
      'https://www.facebook.com/groups',
      'https://www.facebook.com/events/123',
      'https://www.facebook.com/watch/?v=abc',
      'https://www.facebook.com/plugins/post.php?href=https://evil.example/',
    ]) {
      expect(info(url), url).toBeNull();
    }
  });

  it('X: posts in its frame, profiles as cards', () => {
    for (const url of [
      'https://x.com/cleitext/status/1790000000000000000',
      'https://twitter.com/cleitext/status/1790000000000000000?s=20',
      'https://mobile.twitter.com/cleitext/status/1790000000000000000/photo/1',
      'https://platform.twitter.com/embed/Tweet.html?id=1790000000000000000',
    ]) {
      expect(info(url), url).toMatchObject({
        provider: 'twitter',
        providerName: 'X',
        src: 'https://platform.twitter.com/embed/Tweet.html?id=1790000000000000000&dnt=true',
        layout: 'fixed',
        title: 'X post',
      });
    }
    expect(info('https://x.com/cleitext')).toMatchObject({
      layout: 'card',
      src: 'https://x.com/cleitext',
      title: 'X profile @cleitext',
    });
    for (const url of [
      'https://x.com/cleitext/status/abc',
      'https://x.com/home',
      'https://x.com/search?q=x',
      'https://x.com/a/b',
    ]) {
      expect(info(url), url).toBeNull();
    }
  });

  it('names the providers WordPress embeds, for imports', () => {
    expect(embedProviderName('https://soundcloud.com/artist/track')).toBe('SoundCloud');
    expect(embedProviderName('https://www.tiktok.com/@linomissio')).toBe('TikTok');
    expect(embedProviderName('https://example.com/page')).toBeNull();
    expect(embedProviderName('nonsense')).toBeNull();
  });
});
