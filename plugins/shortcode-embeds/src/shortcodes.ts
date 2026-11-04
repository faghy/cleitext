/**
 * What the shortcodes of WordPress become, as plain functions (tested on their own).
 *
 * - `[fve]https://…[/fve]` (the "Facebook Video Embed" plugin, used for YouTube and Facebook videos alike):
 *   Cleitext's Embed block with that address. The core draws the player (YouTube without cookies,
 *   Facebook's video plugin) and the Privacy plugin holds it until consent.
 * - `[spreaker type=player resource="episode_id=…" …]` (the "Spreaker Shortcode" plugin): this plugin's
 *   Spreaker player block, with the same options the shortcode had.
 */

export const SPREAKER_BLOCK = 'shortcode-embeds/spreaker';

export interface SpreakerAttrs {
  /** `episode_id=123`, `show_id=123` or `playlist_id=123`. */
  resource: string;
  height: number;
  theme: 'light' | 'dark';
  playlist: 'false' | 'show' | 'user';
  /** Player options passed on as they were (`chapters-image`, `hide-logo`…): true or false. */
  options: Record<string, boolean>;
}

export interface Block {
  v: 1;
  id: string;
  type: string;
  attrs: Record<string, unknown>;
  children?: Block[];
}

const RESOURCE_RE = /^(episode_id|show_id|playlist_id|user_id)=(\d{1,15})$/;
/** Options of Spreaker's player that are flags (https://developers.spreaker.com/widgets/player/). */
export const FLAGS = [
  'autoplay',
  'live-autoplay',
  'chapters-image',
  'hide-logo',
  'hide-likes',
  'hide-comments',
  'hide-sharing',
  'hide-download',
  'hide-episode-description',
  'cover-image-position',
  'playlist-continuous',
  'playlist-loop',
  'playlist-autoupdate',
] as const;

let seq = 0;
const newId = () => `se${Date.now().toString(36)}${(seq++).toString(36)}`;

/** A safe http(s) address, or ''. */
export function safeUrl(value: unknown): string {
  const text = typeof value === 'string' ? value.trim().replace(/&amp;/g, '&') : '';
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

/** The provider slug of a video address, as Gutenberg names it (`youtube`, `facebook`, `vimeo`), or ''. */
export function providerOf(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^(www|m|mobile)\./, '');
  } catch {
    return '';
  }
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com')
    return 'youtube';
  if (host === 'facebook.com' || host === 'fb.watch' || host === 'fb.com') return 'facebook';
  if (host === 'vimeo.com' || host === 'player.vimeo.com') return 'vimeo';
  if (host === 'dailymotion.com' || host === 'dai.ly') return 'dailymotion';
  return '';
}

/** `[fve]url[/fve]` → an Embed block, or null when the content is not a video address. */
export function embedFromFve(content: string | undefined): Block | null {
  const url = safeUrl((content ?? '').replace(/<[^>]*>/g, ''));
  const provider = url ? providerOf(url) : '';
  if (!provider) return null;
  return {
    v: 1,
    id: newId(),
    type: 'core/embed',
    attrs: { url, providerNameSlug: provider, type: 'video', responsive: true },
  };
}

/** The attributes of the Spreaker block from a block's or a shortcode's values. */
export function spreakerAttrs(attrs: Record<string, unknown>): SpreakerAttrs {
  const resource = String(attrs.resource ?? '').trim();
  const height = Number.parseInt(String(attrs.height ?? '200'), 10);
  const options: Record<string, boolean> = {};
  const given = (
    attrs.options && typeof attrs.options === 'object' ? attrs.options : attrs
  ) as Record<string, unknown>;
  for (const flag of FLAGS) {
    const v = given[flag];
    if (v === true || v === 'true') options[flag] = true;
    else if (v === false || v === 'false') options[flag] = false;
  }
  const playlist = String(attrs.playlist ?? 'false');
  return {
    resource: RESOURCE_RE.test(resource) ? resource : '',
    height: Number.isFinite(height) ? Math.min(1000, Math.max(80, height)) : 200,
    theme: attrs.theme === 'dark' ? 'dark' : 'light',
    playlist: playlist === 'show' || playlist === 'user' ? playlist : 'false',
    options,
  };
}

/** `[spreaker type=player resource="episode_id=…"]` → the Spreaker block, or null without a valid resource. */
export function blockFromSpreaker(attrs: Record<string, string>): Block | null {
  if (attrs.type && attrs.type !== 'player') return null;
  const value = spreakerAttrs(attrs);
  if (!value.resource) return null;
  return { v: 1, id: newId(), type: SPREAKER_BLOCK, attrs: { ...value } };
}

/** The address of Spreaker's player for the block. */
export function spreakerSrc(attrs: SpreakerAttrs): string {
  const params = new URLSearchParams();
  const [key, id] = attrs.resource.split('=') as [string, string];
  params.set(key, id);
  params.set('theme', attrs.theme);
  if (attrs.playlist !== 'false') params.set('playlist', attrs.playlist);
  for (const [flag, on] of Object.entries(attrs.options)) params.set(flag, on ? 'true' : 'false');
  return `https://widget.spreaker.com/player?${params.toString()}`;
}
