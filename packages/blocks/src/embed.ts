/**
 * Embeds known from their address alone (RF-EDT-02): no request to the
 * provider is needed, so previews and pages never depend on third-party
 * oEmbed endpoints, and the player addresses use privacy-friendly hosts.
 */
export interface EmbedInfo {
  /** Provider slug, as Gutenberg's `providerNameSlug`. */
  provider: 'youtube' | 'vimeo' | 'spotify' | 'dailymotion';
  providerName: string;
  type: 'video' | 'rich';
  /** Address of the player, for an iframe. */
  src: string;
  width: number;
  height: number;
}

/** The parts of a WHATWG URL used here. */
interface ParsedUrl {
  protocol: string;
  hostname: string;
  pathname: string;
  searchParams: { get(name: string): string | null };
}

// WHATWG URL exists in every runtime; this package is built without the DOM
// or Node libraries, hence the lookup on globalThis.
const parseUrl = (input: string): ParsedUrl =>
  new (globalThis as unknown as { URL: new (input: string) => ParsedUrl }).URL(input);

const ID = /^[\w-]{1,64}$/;

export function resolveEmbed(address: string): EmbedInfo | null {
  let url: ParsedUrl;
  try {
    url = parseUrl(address.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^(www|m)\./, '');
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
    return video(
      'youtube',
      'YouTube',
      `https://www.youtube-nocookie.com/embed/${id}${start > 0 ? `?start=${start}` : ''}`,
    );
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
    };
  }
  return null;
}

function video(provider: EmbedInfo['provider'], providerName: string, src: string): EmbedInfo {
  return { provider, providerName, type: 'video', src, width: 640, height: 360 };
}
