/**
 * Meta's answers → the plugin's own shape of posts and profiles, and the
 * merged feed of both channels. Pure functions: easy to test.
 */
import type {
  FacebookAttachment,
  FacebookPage,
  FacebookPost,
  InstagramMedia,
  InstagramUser,
} from './meta';
import type { Channel, PostType, SocialPost, SocialProfile } from './types';

/** Instagram allows 2,200 characters; Facebook more. Enough for a feed. */
const MAX_TEXT = 2200;

const https = (value: unknown): string | null =>
  typeof value === 'string' && /^https:\/\//i.test(value) ? value : null;

const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;

const date = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(time) ? null : new Date(time).toISOString();
};

const text = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, MAX_TEXT) : '';

// ---- Instagram -------------------------------------------------------------------------

/** The picture of an Instagram post: a photo, a video's cover, an album's first picture. */
function instagramPicture(media: {
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
}): string | null {
  // A video's media_url is the video file: its cover is thumbnail_url.
  if (media.media_type === 'VIDEO') return https(media.thumbnail_url);
  return https(media.media_url) ?? https(media.thumbnail_url);
}

export function normalizeInstagram(items: InstagramMedia[]): SocialPost[] {
  const out: SocialPost[] = [];
  for (const item of items) {
    const timestamp = date(item.timestamp);
    const permalink = https(item.permalink);
    if (!item.id || !timestamp || !permalink) continue;
    const children = item.children?.data ?? [];
    const type: PostType =
      item.media_type === 'CAROUSEL_ALBUM'
        ? 'carousel'
        : item.media_type === 'VIDEO'
          ? 'video'
          : 'image';
    const album = children.map(instagramPicture).filter((u): u is string => u !== null);
    // An album's media_url is its first item, a video file when that is a video.
    const image =
      type === 'carousel' ? (album[0] ?? instagramPicture(item)) : instagramPicture(item);
    out.push({
      id: `instagram:${item.id}`,
      channel: 'instagram',
      permalink,
      type,
      text: text(item.caption),
      image,
      local: null,
      album: type === 'carousel' ? album.slice(0, 10) : [],
      timestamp,
      likes: count(item.like_count),
      comments: count(item.comments_count),
    });
  }
  return out;
}

export function instagramProfileOf(user: InstagramUser, fallbackId: string): SocialProfile {
  const username = typeof user.username === 'string' ? user.username : '';
  return {
    channel: 'instagram',
    id: String(user.user_id ?? user.id ?? fallbackId),
    name: (typeof user.name === 'string' && user.name.trim()) || username,
    username,
    url: username
      ? `https://www.instagram.com/${encodeURIComponent(username)}/`
      : 'https://www.instagram.com/',
    avatar: https(user.profile_picture_url),
    avatarLocal: null,
    followers: count(user.followers_count),
  };
}

// ---- Facebook --------------------------------------------------------------------------

function attachmentPicture(attachment: FacebookAttachment | undefined): string | null {
  return https(attachment?.media?.image?.src);
}

export function normalizeFacebook(items: FacebookPost[]): SocialPost[] {
  const out: SocialPost[] = [];
  for (const item of items) {
    const timestamp = date(item.created_time);
    const permalink = https(item.permalink_url);
    if (!item.id || !timestamp || !permalink) continue;
    const message = text(item.message) || text(item.story);
    const attachment = item.attachments?.data?.[0];
    const subs = attachment?.subattachments?.data ?? [];
    const kind = `${attachment?.media_type ?? ''} ${attachment?.type ?? ''}`.toLowerCase();
    let type: PostType;
    if (subs.length > 1 || kind.includes('album')) type = 'carousel';
    else if (kind.includes('video')) type = 'video';
    else if (kind.includes('photo')) type = 'image';
    else if (kind.includes('share') || kind.includes('link')) type = 'link';
    else type = https(item.full_picture) ? 'image' : 'text';
    const album = subs.map(attachmentPicture).filter((u): u is string => u !== null);
    const image = https(item.full_picture) ?? attachmentPicture(attachment) ?? album[0] ?? null;
    const linkUrl = https(attachment?.unshimmed_url) ?? https(attachment?.url);
    // Photos and videos posted on the Page link to Facebook itself.
    const outside = linkUrl && !/^https:\/\/([a-z0-9-]+\.)*facebook\.com\//i.test(linkUrl);
    out.push({
      id: `facebook:${item.id}`,
      channel: 'facebook',
      permalink,
      type,
      text: message,
      image,
      local: null,
      album: type === 'carousel' ? album.slice(0, 10) : [],
      timestamp,
      likes: count(item.reactions?.summary?.total_count),
      comments: count(item.comments?.summary?.total_count),
      link:
        type === 'link' && outside
          ? { url: linkUrl, title: text(attachment?.title).slice(0, 300) }
          : null,
    });
  }
  return out;
}

export function facebookProfileOf(page: FacebookPage, fallbackId: string): SocialProfile {
  const id = String(page.id ?? fallbackId);
  const username = typeof page.username === 'string' ? page.username : '';
  return {
    channel: 'facebook',
    id,
    name: typeof page.name === 'string' ? page.name : username,
    username,
    url: https(page.link) ?? `https://www.facebook.com/${encodeURIComponent(username || id)}`,
    avatar: https(page.picture?.data?.url),
    avatarLocal: null,
    followers: count(page.followers_count) ?? count(page.fan_count),
  };
}

// ---- The feed --------------------------------------------------------------------------

/**
 * The posts of several channels in one feed: newest first, each post once,
 * at most `limit`. Equal times keep Instagram first, then the id, so the
 * order never changes between two renders.
 */
export function mergeFeeds(lists: SocialPost[][], limit: number): SocialPost[] {
  const seen = new Set<string>();
  const all: SocialPost[] = [];
  for (const list of lists)
    for (const post of list) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      all.push(post);
    }
  const rank: Record<Channel, number> = { instagram: 0, facebook: 1 };
  all.sort(
    (a, b) =>
      b.timestamp.localeCompare(a.timestamp) ||
      rank[a.channel] - rank[b.channel] ||
      a.id.localeCompare(b.id),
  );
  return all.slice(0, Math.max(0, limit));
}

/** A short text: whole words, an ellipsis when cut. */
export function excerpt(value: string, length: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (length <= 0 || clean.length <= length) return clean;
  const cut = clean.slice(0, length + 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > length * 0.6 ? cut.slice(0, space) : cut.slice(0, length)).replace(/[\s.,;:!?-]+$/, '')}…`;
}

/** Alternative text of a post's picture: its text, or what it is. */
export function altText(post: SocialPost, locale: string): string {
  const words = excerpt(post.text.replace(/#\S+/g, '').replace(/@(\w)/g, '$1'), 120);
  if (words) return words;
  const it = locale.toLowerCase().startsWith('it');
  const network = post.channel === 'instagram' ? 'Instagram' : 'Facebook';
  if (post.type === 'video') return it ? `Video su ${network}` : `Video on ${network}`;
  return it ? `Post su ${network}` : `${network} post`;
}

/** A fingerprint of a feed, to know whether pages showing it must be refreshed. */
export function feedSignature(posts: SocialPost[]): string {
  return posts
    .map(
      (p) =>
        `${p.id}|${p.timestamp}|${p.likes ?? ''}|${p.comments ?? ''}|${p.local ?? ''}|${p.text.length}`,
    )
    .join(',');
}
