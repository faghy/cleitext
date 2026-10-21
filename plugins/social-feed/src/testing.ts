/**
 * Fakes for the tests: storage, secrets, pictures and Meta's answers, with
 * a clock that tests move by hand. Never imported by the plugin itself.
 */
import type { FeedDeps } from './feed';
import type { ImageStore, StoredImage } from './images';
import type { HttpSend } from './meta';

/** A tiny JPEG (its first bytes are enough for the checks). */
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

export interface Call {
  url: string;
  method: string;
  body: string;
}

export type Answer = { status?: number; json?: unknown; bytes?: Buffer } | undefined;

export function fakeDeps(
  respond: (call: Call) => Answer,
  start = new Date('2026-10-01T10:00:00Z'),
) {
  const storage = new Map<string, unknown>();
  const secrets = new Map<string, string>();
  const images = new Map<string, StoredImage & { bytes: Buffer }>();
  const calls: Call[] = [];
  const invalidated: number[] = [];
  let now = start;
  const http: HttpSend = async (request) => {
    const call = {
      url: request.url,
      method: request.method ?? 'POST',
      body: request.body ?? '',
    };
    calls.push(call);
    const answer = respond(call);
    if (!answer)
      return {
        status: 404,
        type: 'application/json',
        text: '{"error":{"message":"Not mocked","code":100}}',
      };
    if (answer.bytes)
      return {
        status: answer.status ?? 200,
        type: 'image/jpeg',
        text: '',
        base64: answer.bytes.toString('base64'),
      };
    return {
      status: answer.status ?? 200,
      type: 'application/json',
      text: JSON.stringify(answer.json ?? {}),
    };
  };
  const store: ImageStore = {
    list: async () =>
      [...images.values()].map(({ key, mime, size, createdAt }) => ({
        key,
        mime,
        size,
        createdAt,
      })),
    get: async (_s, key) => {
      const i = images.get(key);
      return i ? { mime: i.mime, bytes: i.bytes } : null;
    },
    put: async (_s, key, mime, bytes) =>
      void images.set(key, { key, mime, bytes, size: bytes.length, createdAt: now }),
    remove: async (_s, keys) => keys.forEach((k) => images.delete(k)),
  };
  const deps: FeedDeps = {
    http,
    storage: {
      get: async <T>(_s: string, key: string) =>
        storage.has(key) ? (structuredClone(storage.get(key)) as T) : null,
      set: async (_s, key, value) => void storage.set(key, structuredClone(value)),
      delete: async (_s, key) => void storage.delete(key),
    },
    secrets: {
      get: async (_s, name) => secrets.get(name) ?? null,
      set: async (_s, name, value) => void secrets.set(name, value),
      delete: async (_s, name) => void secrets.delete(name),
    },
    images: store,
    invalidate: async () => void invalidated.push(now.getTime()),
    log: { info: () => {}, warn: () => {} },
    now: () => now,
  };
  return {
    deps,
    storage,
    secrets,
    images,
    calls,
    invalidated,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
    get now() {
      return now;
    },
  };
}

// ---- Meta's answers, as documented ------------------------------------------------------

export const IG_PROFILE = {
  user_id: '17841400000000001',
  username: 'trattoria.da.mario',
  name: 'Trattoria da Mario',
  profile_picture_url: 'https://scontent.cdninstagram.com/v/avatar.jpg?oh=1',
  followers_count: 1234,
};

export const IG_MEDIA = {
  data: [
    {
      id: '1801',
      caption: 'Pasta fresca di oggi 🍝 #pasta @mario',
      media_type: 'IMAGE',
      media_url: 'https://scontent.cdninstagram.com/v/1801.jpg?oh=a',
      permalink: 'https://www.instagram.com/p/AAA/',
      timestamp: '2026-09-30T18:00:00+0000',
      like_count: 42,
      comments_count: 3,
    },
    {
      id: '1802',
      caption: 'Il forno a legna',
      media_type: 'VIDEO',
      media_url: 'https://scontent.cdninstagram.com/v/1802.mp4?oh=b',
      thumbnail_url: 'https://scontent.cdninstagram.com/v/1802-cover.jpg?oh=b',
      permalink: 'https://www.instagram.com/reel/BBB/',
      timestamp: '2026-09-28T12:00:00+0000',
      like_count: 10,
      comments_count: 0,
    },
    {
      id: '1803',
      caption: '',
      media_type: 'CAROUSEL_ALBUM',
      media_url: 'https://scontent.cdninstagram.com/v/1803-first.mp4?oh=c',
      permalink: 'https://www.instagram.com/p/CCC/',
      timestamp: '2026-09-20T08:30:00+0000',
      children: {
        data: [
          {
            media_type: 'VIDEO',
            media_url: 'https://scontent.cdninstagram.com/v/c1.mp4',
            thumbnail_url: 'https://scontent.cdninstagram.com/v/c1.jpg',
          },
          { media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/v/c2.jpg' },
        ],
      },
    },
  ],
};

export const FB_PAGE = {
  id: '100200300',
  name: 'Trattoria da Mario',
  username: 'trattoriadamario',
  link: 'https://www.facebook.com/trattoriadamario',
  picture: { data: { url: 'https://scontent.xx.fbcdn.net/v/page.jpg?oh=p' } },
  followers_count: 5678,
};

export const FB_POSTS = {
  data: [
    {
      id: '100200300_1',
      message: 'Stasera musica dal vivo!',
      created_time: '2026-09-29T20:00:00+0000',
      permalink_url: 'https://www.facebook.com/trattoriadamario/posts/1',
      full_picture: 'https://scontent.xx.fbcdn.net/v/post1.jpg?oh=1',
      attachments: { data: [{ media_type: 'photo', type: 'photo' }] },
      reactions: { summary: { total_count: 15 } },
      comments: { summary: { total_count: 2 } },
    },
    {
      id: '100200300_2',
      message: 'Leggete la nostra intervista',
      created_time: '2026-09-25T09:00:00+0000',
      permalink_url: 'https://www.facebook.com/trattoriadamario/posts/2',
      full_picture: 'https://external.xx.fbcdn.net/emg1/link.jpg',
      attachments: {
        data: [
          {
            media_type: 'link',
            type: 'share',
            title: 'Le trattorie da non perdere',
            unshimmed_url: 'https://giornale.example/trattorie',
          },
        ],
      },
    },
    {
      id: '100200300_3',
      message: 'Chiusi lunedì per ferie.',
      created_time: '2026-09-21T07:00:00+0000',
      permalink_url: 'https://www.facebook.com/trattoriadamario/posts/3',
    },
  ],
};

/** Meta's answers for a connected site: every picture is a JPEG. */
export function metaAnswers(extra: (call: Call) => Answer = () => undefined) {
  return (call: Call): Answer => {
    const custom = extra(call);
    if (custom) return custom;
    const url = new URL(call.url);
    if (url.hostname.startsWith('scontent') || url.hostname.startsWith('external'))
      return { bytes: JPEG };
    if (url.hostname === 'graph.instagram.com') {
      if (url.pathname.endsWith('/me/media')) return { json: IG_MEDIA };
      if (url.pathname.endsWith('/me')) return { json: IG_PROFILE };
      if (url.pathname === '/refresh_access_token')
        return { json: { access_token: 'IGQ-refreshed-token-0000000000', expires_in: 5184000 } };
    }
    if (url.hostname === 'graph.facebook.com') {
      if (url.pathname.endsWith('/posts')) return { json: FB_POSTS };
      if (url.pathname.endsWith('/100200300')) return { json: FB_PAGE };
    }
    return undefined;
  };
}
