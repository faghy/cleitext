import { describe, expect, it } from 'vitest';
import {
  altText,
  excerpt,
  facebookProfileOf,
  instagramProfileOf,
  mergeFeeds,
  normalizeFacebook,
  normalizeInstagram,
} from './normalize';
import { FB_PAGE, FB_POSTS, IG_MEDIA, IG_PROFILE } from './testing';
import type { SocialPost } from './types';

describe('Instagram posts', () => {
  const posts = normalizeInstagram(IG_MEDIA.data);

  it('keeps a photo with its counts and an ISO date', () => {
    expect(posts[0]).toEqual({
      id: 'instagram:1801',
      channel: 'instagram',
      permalink: 'https://www.instagram.com/p/AAA/',
      type: 'image',
      text: 'Pasta fresca di oggi 🍝 #pasta @mario',
      image: 'https://scontent.cdninstagram.com/v/1801.jpg?oh=a',
      local: null,
      album: [],
      timestamp: '2026-09-30T18:00:00.000Z',
      likes: 42,
      comments: 3,
    });
  });

  it('shows a video by its cover, never the video file', () => {
    expect(posts[1]).toMatchObject({
      type: 'video',
      image: 'https://scontent.cdninstagram.com/v/1802-cover.jpg?oh=b',
    });
  });

  it('shows an album by its first picture, also when it starts with a video', () => {
    expect(posts[2]).toMatchObject({
      type: 'carousel',
      image: 'https://scontent.cdninstagram.com/v/c1.jpg',
      album: [
        'https://scontent.cdninstagram.com/v/c1.jpg',
        'https://scontent.cdninstagram.com/v/c2.jpg',
      ],
      likes: null,
      comments: null,
    });
  });

  it('skips items without id, date or link, and addresses that are not https', () => {
    const out = normalizeInstagram([
      { id: '', permalink: 'https://x.test/', timestamp: '2026-01-01T00:00:00+0000' },
      { id: '1', permalink: 'https://x.test/', timestamp: 'not a date' },
      { id: '2', permalink: 'javascript:alert(1)', timestamp: '2026-01-01T00:00:00+0000' },
      {
        id: '3',
        media_type: 'IMAGE',
        media_url: 'http://insecure.test/a.jpg',
        permalink: 'https://www.instagram.com/p/D/',
        timestamp: '2026-01-01T00:00:00+0000',
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.image).toBeNull();
  });

  it('reads the profile', () => {
    expect(instagramProfileOf(IG_PROFILE, '')).toEqual({
      channel: 'instagram',
      id: '17841400000000001',
      name: 'Trattoria da Mario',
      username: 'trattoria.da.mario',
      url: 'https://www.instagram.com/trattoria.da.mario/',
      avatar: 'https://scontent.cdninstagram.com/v/avatar.jpg?oh=1',
      avatarLocal: null,
      followers: 1234,
    });
  });
});

describe('Facebook posts', () => {
  const posts = normalizeFacebook(FB_POSTS.data);

  it('keeps a photo post with reactions and comments', () => {
    expect(posts[0]).toMatchObject({
      id: 'facebook:100200300_1',
      type: 'image',
      text: 'Stasera musica dal vivo!',
      image: 'https://scontent.xx.fbcdn.net/v/post1.jpg?oh=1',
      likes: 15,
      comments: 2,
      link: null,
    });
  });

  it('keeps the shared page of a link post', () => {
    expect(posts[1]).toMatchObject({
      type: 'link',
      link: { url: 'https://giornale.example/trattorie', title: 'Le trattorie da non perdere' },
    });
  });

  it('keeps a text-only post without picture', () => {
    expect(posts[2]).toMatchObject({ type: 'text', image: null, likes: null });
  });

  it('reads albums and videos', () => {
    const [album, video] = normalizeFacebook([
      {
        id: 'a',
        created_time: '2026-09-01T00:00:00+0000',
        permalink_url: 'https://www.facebook.com/p/a',
        attachments: {
          data: [
            {
              type: 'album',
              subattachments: {
                data: [
                  { media: { image: { src: 'https://scontent.test/1.jpg' } } },
                  { media: { image: { src: 'https://scontent.test/2.jpg' } } },
                ],
              },
            },
          ],
        },
      },
      {
        id: 'v',
        created_time: '2026-09-02T00:00:00+0000',
        permalink_url: 'https://www.facebook.com/p/v',
        full_picture: 'https://scontent.test/v.jpg',
        attachments: { data: [{ media_type: 'video', type: 'video_inline' }] },
      },
    ]);
    expect(album).toMatchObject({ type: 'carousel', image: 'https://scontent.test/1.jpg' });
    expect(album!.album).toHaveLength(2);
    expect(video).toMatchObject({ type: 'video', image: 'https://scontent.test/v.jpg' });
  });

  it('reads the Page', () => {
    expect(facebookProfileOf(FB_PAGE, '')).toMatchObject({
      channel: 'facebook',
      id: '100200300',
      url: 'https://www.facebook.com/trattoriadamario',
      followers: 5678,
    });
  });
});

describe('the merged feed', () => {
  const post = (id: string, channel: SocialPost['channel'], timestamp: string): SocialPost => ({
    id: `${channel}:${id}`,
    channel,
    permalink: 'https://x.test/',
    type: 'image',
    text: '',
    image: null,
    local: null,
    album: [],
    timestamp,
    likes: null,
    comments: null,
  });

  it('sorts both channels by date, newest first, and cuts at the limit', () => {
    const ig = normalizeInstagram(IG_MEDIA.data);
    const fb = normalizeFacebook(FB_POSTS.data);
    const merged = mergeFeeds([ig, fb], 5);
    expect(merged.map((p) => p.id)).toEqual([
      'instagram:1801', // 30 Sep
      'facebook:100200300_1', // 29 Sep
      'instagram:1802', // 28 Sep
      'facebook:100200300_2', // 25 Sep
      'facebook:100200300_3', // 21 Sep
    ]);
  });

  it('keeps each post once and a stable order for equal times', () => {
    const t = '2026-09-01T00:00:00.000Z';
    const merged = mergeFeeds(
      [
        [post('b', 'facebook', t), post('1', 'instagram', t)],
        [post('1', 'instagram', t), post('a', 'facebook', t)],
      ],
      10,
    );
    expect(merged.map((p) => p.id)).toEqual(['instagram:1', 'facebook:a', 'facebook:b']);
  });
});

describe('texts', () => {
  it('cuts at a word with an ellipsis', () => {
    expect(excerpt('Una giornata di sole al mare', 15)).toBe('Una giornata di…');
    expect(excerpt('Breve', 15)).toBe('Breve');
    expect(excerpt('  spazi \n  multipli ', 50)).toBe('spazi multipli');
  });

  it('writes alternative text from the caption, without hashtags', () => {
    const [photo, , album] = normalizeInstagram(IG_MEDIA.data);
    expect(altText(photo!, 'en')).toBe('Pasta fresca di oggi 🍝 mario');
    expect(altText(album!, 'it')).toBe('Post su Instagram');
    expect(altText({ ...album!, type: 'video' }, 'en')).toBe('Video on Instagram');
  });
});
