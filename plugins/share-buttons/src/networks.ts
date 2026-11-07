/**
 * The services a page can be shared on, with the address of their share page:
 * `{url}` is the page's address and `{title}` its title, both URL-encoded.
 * Fediverse servers are many: Share₂Fedi (https://s2f.kytta.dev) asks for
 * the visitor's server and covers Mastodon, Misskey, Friendica, GoToSocial
 * and others; Diaspora's own page asks for the pod.
 */
export type Group = 'social' | 'fediverse';

export interface Network {
  id: string;
  label: string;
  group: Group;
  url: string;
  /** Brand color of the icon. */
  color?: string;
  /** Instagram has no address to share a link: the link is copied, then Instagram opens. */
  copyFirst?: boolean;
}

const FEDI = 'https://s2f.kytta.dev/?text={title}%20{url}';

export const NETWORKS: Network[] = [
  {
    id: 'facebook',
    label: 'Facebook',
    group: 'social',
    color: '#1877f2',
    url: 'https://www.facebook.com/sharer/sharer.php?u={url}',
  },
  { id: 'x', label: 'X', group: 'social', url: 'https://x.com/intent/post?url={url}&text={title}' },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    group: 'social',
    color: '#0a66c2',
    url: 'https://www.linkedin.com/sharing/share-offsite/?url={url}',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    group: 'social',
    color: '#e1306c',
    url: 'https://www.instagram.com/',
    copyFirst: true,
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    group: 'social',
    color: '#25d366',
    url: 'https://wa.me/?text={title}%20{url}',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    group: 'social',
    color: '#26a5e4',
    url: 'https://t.me/share/url?url={url}&text={title}',
  },
  {
    id: 'bluesky',
    label: 'Bluesky',
    group: 'social',
    color: '#1185fe',
    url: 'https://bsky.app/intent/compose?text={title}%20{url}',
  },
  {
    id: 'threads',
    label: 'Threads',
    group: 'social',
    url: 'https://www.threads.net/intent/post?text={title}%20{url}',
  },
  {
    id: 'reddit',
    label: 'Reddit',
    group: 'social',
    color: '#ff4500',
    url: 'https://www.reddit.com/submit?url={url}&title={title}',
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    group: 'social',
    color: '#e60023',
    url: 'https://pinterest.com/pin/create/button/?url={url}&description={title}',
  },
  {
    id: 'tumblr',
    label: 'Tumblr',
    group: 'social',
    color: '#36465d',
    url: 'https://www.tumblr.com/widgets/share/tool?canonicalUrl={url}&title={title}',
  },
  {
    id: 'messenger',
    label: 'Messenger',
    group: 'social',
    color: '#0084ff',
    url: 'fb-messenger://share/?link={url}',
  },
  {
    id: 'line',
    label: 'LINE',
    group: 'social',
    color: '#06c755',
    url: 'https://social-plugins.line.me/lineit/share?url={url}',
  },
  {
    id: 'viber',
    label: 'Viber',
    group: 'social',
    color: '#7360f2',
    url: 'viber://forward?text={title}%20{url}',
  },
  {
    id: 'vk',
    label: 'VK',
    group: 'social',
    color: '#0077ff',
    url: 'https://vk.com/share.php?url={url}&title={title}',
  },
  {
    id: 'xing',
    label: 'XING',
    group: 'social',
    color: '#026466',
    url: 'https://www.xing.com/spi/shares/new?url={url}',
  },
  {
    id: 'disbigle',
    label: 'Disbigle',
    group: 'fediverse',
    color: '#7c3aed',
    url: 'https://app.disbigle.com/share?text={title}%20{url}',
  },
  {
    id: 'diaspora',
    label: 'Diaspora',
    group: 'fediverse',
    url: 'https://share.diasporafoundation.org/?title={title}&url={url}',
  },
  { id: 'mastodon', label: 'Mastodon', group: 'fediverse', color: '#6364ff', url: FEDI },
  // Label from the strings ("Others"): any other server of the fediverse.
  { id: 'fediverse', label: '', group: 'fediverse', url: FEDI },
];

export const BY_ID = new Map(NETWORKS.map((n) => [n.id, n]));

export const DEFAULT_SOCIAL = ['facebook', 'x', 'linkedin', 'instagram', 'whatsapp', 'telegram'];
export const DEFAULT_FEDIVERSE = ['disbigle', 'diaspora', 'mastodon', 'fediverse'];

/** The share address of a network for a page (null for an unknown network). */
export function shareUrl(id: string, url: string, title: string): string | null {
  const network = BY_ID.get(id);
  if (!network) return null;
  return network.url
    .replace('{url}', encodeURIComponent(url))
    .replace('{title}', encodeURIComponent(title));
}
