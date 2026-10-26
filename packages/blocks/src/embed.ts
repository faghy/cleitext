/**
 * Embeds known from their address alone (RF-EDT-02): no request to the
 * provider is needed, so previews and pages never depend on third-party
 * oEmbed endpoints, and the player addresses use privacy-friendly hosts.
 *
 * Social networks (since 0.84.0) are embedded with the iframes their
 * providers offer, which need no third-party script on the page: TikTok's
 * player and profile, Instagram's posts and reels, Facebook's post, video
 * and Page plugins, X's posts. What the providers cannot embed in a frame
 * (Instagram and X profiles, TikTok's short links) becomes a link card.
 */
export type EmbedProvider =
  'youtube' | 'vimeo' | 'spotify' | 'dailymotion' | 'tiktok' | 'instagram' | 'facebook' | 'twitter';

export interface EmbedInfo {
  /** Provider slug, as Gutenberg's `providerNameSlug` (`twitter` for X). */
  provider: EmbedProvider;
  providerName: string;
  /** `link`: no frame, a card linking to the page (`src`). */
  type: 'video' | 'rich' | 'link';
  /** Address of the player, for an iframe; the page itself for a link card. */
  src: string;
  /** Width of the frame, its largest one for frames with a fixed height. */
  width: number;
  height: number;
  /**
   * How the frame is sized: `aspect` keeps the ratio of width and height
   * (videos), `fixed` is as wide as the column up to `width` and `height`
   * tall, `card` is a link card without a frame.
   */
  layout: 'aspect' | 'fixed' | 'card';
  /** Accessible name of the frame or card ("TikTok video", "Instagram profile @name"). */
  title: string;
  /** For cards: the account (`@name`) or the page. */
  handle?: string;
}

/** The parts of a WHATWG URL used here. */
interface ParsedUrl {
  protocol: string;
  hostname: string;
  pathname: string;
  search: string;
  searchParams: { get(name: string): string | null };
}

// WHATWG URL exists in every runtime; this package is built without the DOM
// or Node libraries, hence the lookup on globalThis.
const parseUrl = (input: string): ParsedUrl =>
  new (globalThis as unknown as { URL: new (input: string) => ParsedUrl }).URL(input);

const ID = /^[\w-]{1,64}$/;
const DIGITS = /^\d{1,25}$/;
/** TikTok and Instagram user names: letters, digits, dots and underscores. */
const USER = /^[\w.]{1,30}$/;
/** X user names. */
const X_USER = /^\w{1,15}$/;
/** Facebook page names (dots and dashes too). */
const FB_NAME = /^[\w.-]{1,100}$/;

/** Paths of X and Instagram that are not profiles. */
const NOT_PROFILES = new Set([
  'accounts',
  'direct',
  'explore',
  'hashtag',
  'home',
  'i',
  'intent',
  'login',
  'messages',
  'notifications',
  'search',
  'settings',
  'share',
  'signup',
  'stories',
  'tos',
  'privacy',
  'about',
  'developer',
  'legal',
  'web',
]);

/** Paths of Facebook that are neither posts, videos nor pages. */
const FB_NOT_PAGES = new Set([
  ...NOT_PROFILES,
  'groups',
  'events',
  'marketplace',
  'gaming',
  'help',
  'policies',
  'pages',
  'plugins',
  'dialog',
  'sharer',
  'sharer.php',
  'login.php',
  'profile.php',
  'people',
  'business',
  'ads',
  'friends',
  'bookmarks',
  'reel',
  'watch',
  'photo',
  'photo.php',
  'story.php',
  'permalink.php',
  'video.php',
]);

export function resolveEmbed(address: string): EmbedInfo | null {
  let url: ParsedUrl;
  try {
    url = parseUrl(address.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|mobile|web)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    const id =
      host === 'youtu.be'
        ? parts[0]
        : parts[0] === 'watch'
          ? url.searchParams.get('v')
          : ['embed', 'shorts', 'live', 'v'].includes(parts[0] ?? '')
            ? parts[1]
            : undefined;
    if (!id || !ID.test(id)) return null;
    const start = Number.parseInt(
      url.searchParams.get('t') ?? url.searchParams.get('start') ?? '',
      10,
    );
    const info = video(
      'youtube',
      'YouTube',
      `https://www.youtube-nocookie.com/embed/${id}${start > 0 ? `?start=${start}` : ''}`,
    );
    // Shorts are vertical: a 9:16 player, as WordPress shows them.
    return parts[0] === 'shorts' && host !== 'youtu.be'
      ? { ...info, width: 360, height: 640 }
      : info;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = parts.find((part) => /^\d{1,20}$/.test(part));
    return id ? video('vimeo', 'Vimeo', `https://player.vimeo.com/video/${id}?dnt=1`) : null;
  }
  if (host === 'dailymotion.com' || host === 'dai.ly') {
    const id = host === 'dai.ly' ? parts[0] : parts[0] === 'video' ? parts[1] : parts[2];
    return id && ID.test(id)
      ? video('dailymotion', 'Dailymotion', `https://www.dailymotion.com/embed/video/${id}`)
      : null;
  }
  if (host === 'open.spotify.com') {
    const items = parts[0] === 'embed' ? parts.slice(1) : parts;
    const [kind, id] = items.filter((part) => !part.startsWith('intl-'));
    if (!kind || !id || !['track', 'album', 'playlist', 'episode', 'show', 'artist'].includes(kind))
      return null;
    if (!ID.test(id)) return null;
    const height = kind === 'track' || kind === 'episode' ? 152 : 352;
    return {
      provider: 'spotify',
      providerName: 'Spotify',
      type: 'rich',
      src: `https://open.spotify.com/embed/${kind}/${id}`,
      width: 640,
      height,
      layout: 'fixed',
      title: 'Spotify',
    };
  }
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return tiktok(host, parts);
  if (host === 'instagram.com' || host === 'instagr.am') return instagram(parts);
  if (host === 'facebook.com' || host === 'fb.watch' || host === 'fb.com') {
    return facebook(host, parts, url);
  }
  if (host === 'x.com' || host === 'twitter.com' || host === 'platform.twitter.com') {
    return twitter(host, parts, url);
  }
  return null;
}

/** Gutenberg's ratios (embed/constants.js), widest first. */
const ASPECT_RATIOS: [number, string][] = [
  [2.33, '21-9'],
  [2.0, '18-9'],
  [1.78, '16-9'],
  [1.33, '4-3'],
  [1.0, '1-1'],
  [0.56, '9-16'],
  [0.5, '1-2'],
];

/**
 * Gutenberg's class for the ratio of a frame (`wp-embed-aspect-16-9`…), the
 * one its Embed block picks from the preview's width and height.
 */
export function embedAspectClass(width: number, height: number): string | null {
  if (!(width > 0 && height > 0)) return null;
  const ratio = Number((width / height).toFixed(2));
  for (const [min, name] of ASPECT_RATIOS) {
    if (ratio >= min) return ratio - min > 0.1 ? null : `wp-embed-aspect-${name}`;
  }
  return null;
}

/** The ratio class WordPress saved in an Embed block's class (`wp-embed-aspect-9-16`), if any. */
export function embedAspectOf(className: string | undefined): string | null {
  return /(?:^|\s)(wp-embed-aspect-\d+-\d+)(?=\s|$)/.exec(className ?? '')?.[1] ?? null;
}

function video(provider: EmbedProvider, providerName: string, src: string): EmbedInfo {
  return {
    provider,
    providerName,
    type: 'video',
    src,
    width: 640,
    height: 360,
    layout: 'aspect',
    title: providerName,
  };
}

function fixed(
  provider: EmbedProvider,
  providerName: string,
  title: string,
  src: string,
  width: number,
  height: number,
): EmbedInfo {
  return { provider, providerName, type: 'rich', src, width, height, layout: 'fixed', title };
}

function card(
  provider: EmbedProvider,
  providerName: string,
  what: string,
  src: string,
  handle?: string,
): EmbedInfo {
  return {
    provider,
    providerName,
    type: 'link',
    src,
    width: 0,
    height: 0,
    layout: 'card',
    title: handle ? `${what} ${handle}` : what,
    ...(handle ? { handle } : {}),
  };
}

/**
 * TikTok: videos and photo posts (`/@name/video/<id>`) in TikTok's player
 * (`/embed/v2/<id>`), profiles (`/@name`) in its creator frame
 * (`/embed/@name`); short links (`vm.tiktok.com/…`, `/t/…`) only name a
 * video once followed, so they become a card.
 */
function tiktok(host: string, parts: string[]): EmbedInfo | null {
  if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com' || (parts[0] === 't' && parts[1])) {
    const code = host === 'vm.tiktok.com' || host === 'vt.tiktok.com' ? parts[0] : parts[1];
    if (!code || !ID.test(code)) return null;
    return card('tiktok', 'TikTok', 'TikTok video', `https://${host}/${parts.join('/')}`);
  }
  if (host !== 'tiktok.com') return null;
  let id: string | undefined;
  if (parts[0] === 'embed') id = parts[1] === 'v2' ? parts[2] : parts[1];
  else if (parts[0] === 'v' || parts[0] === 'player') id = parts.at(-1)?.replace(/\.html$/, '');
  else if (parts[0]?.startsWith('@') && (parts[1] === 'video' || parts[1] === 'photo')) {
    id = parts[2];
  }
  if (id && !id.startsWith('@')) {
    return DIGITS.test(id)
      ? fixed('tiktok', 'TikTok', 'TikTok video', `https://www.tiktok.com/embed/v2/${id}`, 325, 740)
      : null;
  }
  const at = parts[0] === 'embed' ? parts[1] : parts.length === 1 ? parts[0] : undefined;
  const user = at?.startsWith('@') ? at.slice(1) : undefined;
  if (!user || !USER.test(user)) return null;
  return fixed(
    'tiktok',
    'TikTok',
    `TikTok profile @${user}`,
    `https://www.tiktok.com/embed/@${user}`,
    780,
    479,
  );
}

/**
 * Instagram: posts, reels and IGTV (`/p/<id>`, `/reel/<id>`, `/tv/<id>`,
 * also after the user name) in Instagram's `/embed` frame. Instagram has no
 * embed for profiles: they become a card.
 */
function instagram(parts: string[]): EmbedInfo | null {
  const kinds = ['p', 'reel', 'reels', 'tv'];
  const at = kinds.includes(parts[0] ?? '') ? 0 : kinds.includes(parts[1] ?? '') ? 1 : -1;
  if (at >= 0) {
    const kind = parts[at]!;
    const id = parts[at + 1];
    if (!id || !/^[\w-]{5,64}$/.test(id)) return null;
    const reel = kind === 'reel' || kind === 'reels';
    return fixed(
      'instagram',
      'Instagram',
      reel ? 'Instagram reel' : 'Instagram post',
      `https://www.instagram.com/${reel ? 'reel' : 'p'}/${id}/embed/`,
      540,
      reel ? 880 : 700,
    );
  }
  const user = parts.length === 1 ? parts[0]! : undefined;
  if (!user || !USER.test(user) || NOT_PROFILES.has(user.toLowerCase())) return null;
  return card(
    'instagram',
    'Instagram',
    'Instagram profile',
    `https://www.instagram.com/${user}/`,
    `@${user}`,
  );
}

/**
 * Facebook: posts (`/<page>/posts/…`, `permalink.php`, `story.php`, photos,
 * `/share/p/…`) in the post plugin, videos and reels (`/<page>/videos/…`,
 * `/watch?v=`, `/reel/…`, `fb.watch`, `/share/v/…`) in the video plugin,
 * pages (`/<page>`, `profile.php?id=`) in the Page plugin with its timeline.
 * The plugins take the address of the post (`href`); the plugins' own
 * addresses are recognized too.
 */
function facebook(host: string, parts: string[], url: ParsedUrl): EmbedInfo | null {
  if (parts[0] === 'plugins') {
    const href = url.searchParams.get('href');
    if (!href) return null;
    const inner = resolveEmbed(href);
    return inner?.provider === 'facebook' ? inner : null;
  }
  const query = (keys: string[]) => {
    const kept = keys
      .map((key) => [key, url.searchParams.get(key)] as const)
      .filter(
        (pair): pair is readonly [string, string] => !!pair[1] && /^[\w.-]{1,64}$/.test(pair[1]),
      );
    return kept.length ? `?${kept.map(([k, v]) => `${k}=${v}`).join('&')}` : '';
  };
  const page = (path: string) => `https://www.facebook.com/${path}`;
  const plugin = (kind: 'post' | 'video', href: string, reel = false): EmbedInfo =>
    kind === 'video' && !reel
      ? {
          provider: 'facebook',
          providerName: 'Facebook',
          type: 'video',
          src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&show_text=false&width=560`,
          width: 560,
          height: 315,
          layout: 'aspect',
          title: 'Facebook video',
        }
      : fixed(
          'facebook',
          'Facebook',
          reel ? 'Facebook reel' : 'Facebook post',
          `https://www.facebook.com/plugins/${kind}.php?href=${encodeURIComponent(href)}&show_text=true&width=500`,
          reel ? 340 : 500,
          reel ? 700 : 640,
        );
  const safe = parts.every((part) => /^[\w.-]{1,120}$/.test(part));
  if (!safe) return null;
  if (host === 'fb.watch') {
    return parts[0] ? plugin('video', `https://fb.watch/${parts[0]}/`) : null;
  }
  const [first, second, third] = parts;
  if (first === 'watch') {
    const v = url.searchParams.get('v');
    return v && DIGITS.test(v) ? plugin('video', page(`watch/?v=${v}`)) : null;
  }
  if (first === 'reel' && second && DIGITS.test(second)) {
    return plugin('video', page(`reel/${second}`), true);
  }
  if (first === 'share' && second && third && ID.test(third)) {
    if (second === 'v') return plugin('video', page(`share/v/${third}/`));
    if (second === 'r') return plugin('video', page(`share/r/${third}/`), true);
    if (second === 'p') return plugin('post', page(`share/p/${third}/`));
    return null;
  }
  if (first === 'permalink.php' || first === 'story.php') {
    const q = query(['story_fbid', 'id']);
    return url.searchParams.get('story_fbid') ? plugin('post', page(`${first}${q}`)) : null;
  }
  if (first === 'photo.php' || first === 'photo') {
    const q = query(['fbid', 'set']);
    return url.searchParams.get('fbid') ? plugin('post', page(`photo.php${q}`)) : null;
  }
  if (first === 'video.php') {
    const v = url.searchParams.get('v');
    return v && DIGITS.test(v) ? plugin('video', page(`video.php?v=${v}`)) : null;
  }
  if (first === 'groups' && second && third === 'posts' && parts[3]) {
    return plugin('post', page(parts.slice(0, 4).join('/')));
  }
  if (first === 'profile.php') {
    const id = url.searchParams.get('id');
    return id && DIGITS.test(id) ? pagePlugin(page(`profile.php?id=${id}`), id) : null;
  }
  if (!first || !FB_NAME.test(first) || FB_NOT_PAGES.has(first.toLowerCase())) return null;
  if (second === 'videos' && parts.at(-1) && DIGITS.test(parts.at(-1)!)) {
    return plugin('video', page(`${first}/videos/${parts.at(-1)}/`));
  }
  if ((second === 'posts' || second === 'photos') && third) {
    return plugin('post', page(parts.join('/')));
  }
  if (second) return null;
  return pagePlugin(page(first), first);
}

/** Facebook's Page plugin, with the page's timeline. */
function pagePlugin(href: string, name: string): EmbedInfo {
  return fixed(
    'facebook',
    'Facebook',
    `Facebook page ${name}`,
    `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(href)}&tabs=timeline&width=500&height=600&small_header=false&adapt_container_width=true&hide_cover=false&show_facepile=false`,
    500,
    600,
  );
}

/**
 * X (Twitter): posts (`/<name>/status/<id>`) in X's own post frame
 * (`platform.twitter.com/embed/Tweet.html`, with "do not track"); X has no
 * frame for profiles and timelines without its script: they become a card.
 */
function twitter(host: string, parts: string[], url: ParsedUrl): EmbedInfo | null {
  let id: string | null | undefined;
  if (host === 'platform.twitter.com') {
    id =
      parts[0] === 'embed' && /^Tweet\.html$/i.test(parts[1] ?? '')
        ? url.searchParams.get('id')
        : null;
  } else {
    const at = parts.findIndex((part) => part === 'status' || part === 'statuses');
    if (at > 0) id = parts[at + 1];
  }
  if (id !== undefined) {
    return id && DIGITS.test(id)
      ? fixed(
          'twitter',
          'X',
          'X post',
          `https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true`,
          550,
          600,
        )
      : null;
  }
  const user = parts.length === 1 ? parts[0]! : undefined;
  if (!user || !X_USER.test(user) || NOT_PROFILES.has(user.toLowerCase())) return null;
  return card('twitter', 'X', 'X profile', `https://x.com/${user}`, `@${user}`);
}

/**
 * Hosts of WordPress's other oEmbed providers (`wp-includes/class-wp-oembed.php`),
 * by name: their addresses are embeds in WordPress even when Cleitext has no
 * player for them, so an import keeps them as cards instead of plain text.
 */
const OEMBED_HOSTS: [RegExp, string][] = [
  [/(^|\.)soundcloud\.com$/, 'SoundCloud'],
  [/(^|\.)flickr\.com$|^flic\.kr$/, 'Flickr'],
  [/(^|\.)reddit\.com$/, 'Reddit'],
  [/(^|\.)pinterest\.[a-z.]+$/, 'Pinterest'],
  [/(^|\.)tumblr\.com$/, 'Tumblr'],
  [/(^|\.)imgur\.com$/, 'Imgur'],
  [/(^|\.)issuu\.com$/, 'Issuu'],
  [/(^|\.)mixcloud\.com$/, 'Mixcloud'],
  [/(^|\.)scribd\.com$/, 'Scribd'],
  [/(^|\.)ted\.com$/, 'TED'],
  [/(^|\.)speakerdeck\.com$/, 'Speaker Deck'],
  [/(^|\.)kickstarter\.com$|^kck\.st$/, 'Kickstarter'],
  [/(^|\.)smugmug\.com$/, 'SmugMug'],
  [/(^|\.)(animoto|video214)\.com$/, 'Animoto'],
  [/(^|\.)cloudup\.com$/, 'Cloudup'],
  [/(^|\.)reverbnation\.com$/, 'ReverbNation'],
  [/(^|\.)videopress\.com$/, 'VideoPress'],
  [/^wordpress\.tv$/, 'WordPress.tv'],
  [/(^|\.)crowdsignal\.(com|net)$|(^|\.)polldaddy\.com$|^poll\.fm$|\.survey\.fm$/, 'Crowdsignal'],
  [/(^|\.)amazon\.[a-z.]+$|^(a\.co|z\.cn|amzn\.to)$/, 'Amazon'],
  [/^bsky\.app$/, 'Bluesky'],
  [/(^|\.)wolframcloud\.com$/, 'Wolfram'],
  [/^pca\.st$/, 'Pocket Casts'],
  [/(^|\.)threads\.(net|com)$/, 'Threads'],
];

/**
 * The provider of an address to embed, by its host: Cleitext's players
 * (`resolveEmbed`), then WordPress's other oEmbed providers. Null for any
 * other address (WordPress shows those as plain text).
 */
export function embedProviderName(address: string): string | null {
  const known = resolveEmbed(address);
  if (known) return known.providerName;
  let url: ParsedUrl;
  try {
    url = parseUrl(address.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  return OEMBED_HOSTS.find(([pattern]) => pattern.test(host))?.[1] ?? null;
}
