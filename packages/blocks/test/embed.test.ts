import { describe, expect, it } from 'vitest';
import { resolveEmbed } from '../src/embed.js';

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
