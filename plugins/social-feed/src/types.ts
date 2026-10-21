/**
 * The data of the Social Feed plugin: settings, the state of each channel
 * and the cached posts. Shared by the server and the admin page, so no
 * Node.js modules here.
 */

export const CHANNELS = ['instagram', 'facebook'] as const;
export type Channel = (typeof CHANNELS)[number];

/** How the Instagram account is reached: Instagram Login, or the Instagram account of the Facebook Page. */
export type InstagramVia = 'instagram' | 'facebook';

/** Copies of the pictures on the site (`local`), or Meta's own addresses (`hotlink`). */
export type MediaMode = 'local' | 'hotlink';

export interface FeedConfig {
  instagram: {
    /** Shown in the feed and refreshed. */
    enabled: boolean;
    /** The Instagram app ID of the Meta app (Instagram → API setup with Instagram login). */
    appId: string;
    via: InstagramVia;
  };
  facebook: {
    enabled: boolean;
    /** The App ID of the Meta app (Facebook Login for Business). */
    appId: string;
  };
  /** Posts fetched per channel (6–50). */
  count: number;
  /** Minutes between two refreshes (30–1440). */
  refreshMinutes: number;
  media: MediaMode;
  /** With `hotlink`, the consent category the pictures wait for (Privacy & GDPR). */
  consentCategory: 'marketing' | 'preferences';
}

export const DEFAULT_CONFIG: FeedConfig = {
  instagram: { enabled: true, appId: '', via: 'instagram' },
  facebook: { enabled: false, appId: '' },
  count: 20,
  refreshMinutes: 60,
  media: 'local',
  consentCategory: 'marketing',
};

export type PostType = 'image' | 'video' | 'carousel' | 'text' | 'link';

/** A post of either channel, in one shape. */
export interface SocialPost {
  /** `instagram:<id>` or `facebook:<id>`. */
  id: string;
  channel: Channel;
  permalink: string;
  type: PostType;
  /** Caption (Instagram) or message (Facebook), plain text. */
  text: string;
  /** The picture to show (Meta's address): the photo, a video's cover, an album's first picture. */
  image: string | null;
  /** Its copy on the site (`/social-feed/media/<key>.jpg`), when copied. */
  local: string | null;
  /** Pictures of an album (Meta's addresses), for the lightbox in `hotlink` mode. */
  album: string[];
  /** ISO 8601. */
  timestamp: string;
  likes: number | null;
  comments: number | null;
  /** Facebook link posts: the shared page. */
  link?: { url: string; title: string } | null;
}

export interface SocialProfile {
  channel: Channel;
  id: string;
  name: string;
  username: string;
  /** The profile on Instagram or Facebook. */
  url: string;
  /** Meta's address of the profile picture. */
  avatar: string | null;
  avatarLocal: string | null;
  followers: number | null;
}

/** What the last good refresh brought, kept until the next good one. */
export interface FeedCache {
  profile: SocialProfile | null;
  posts: SocialPost[];
  fetchedAt: string;
}

export type ErrorKind = 'token' | 'rate' | 'permission' | 'network' | 'api' | 'config';

export interface ChannelError {
  kind: ErrorKind;
  message: string;
  code?: number;
  at: string;
}

export type ConnectMethod = 'oauth' | 'manual' | 'page';

export interface ChannelState {
  connected: boolean;
  /** `page`: the Instagram account linked to the connected Facebook Page. */
  method: ConnectMethod | null;
  account: { id: string; name: string; username?: string } | null;
  connectedAt: string | null;
  /** When the token stops working; null when it does not expire (Page tokens). */
  tokenExpiresAt: string | null;
  /** The expiry is a guess (a pasted token Meta has not told about yet). */
  expiresEstimated?: boolean;
  /** Facebook: when the person must sign in again for the app to keep reading the Page. */
  dataAccessExpiresAt?: string | null;
  tokenRefreshedAt: string | null;
  lastRefreshAttempt: string | null;
  refreshFailures: number;
  lastFetchAt: string | null;
  lastSuccessAt: string | null;
  /** Not before then (after an error, a longer wait). */
  nextFetchAt: string | null;
  lastError: ChannelError | null;
  failures: number;
}

export const EMPTY_STATE: ChannelState = {
  connected: false,
  method: null,
  account: null,
  connectedAt: null,
  tokenExpiresAt: null,
  tokenRefreshedAt: null,
  lastRefreshAttempt: null,
  refreshFailures: 0,
  lastFetchAt: null,
  lastSuccessAt: null,
  nextFetchAt: null,
  lastError: null,
  failures: 0,
};

export type TokenStatus = 'none' | 'ok' | 'expiring' | 'expired' | 'never';

/** A Facebook Page the person can choose after connecting. */
export interface PageChoice {
  id: string;
  name: string;
  instagram: { id: string; username: string } | null;
}

/** A channel as the admin page sees it (never a token). */
export interface ChannelView extends ChannelState {
  tokenStatus: TokenStatus;
  posts: number;
  fetchedAt: string | null;
  profile: SocialProfile | null;
  preview: { id: string; image: string | null; text: string; permalink: string }[];
}

export interface SettingsView {
  config: FeedConfig;
  secrets: { instagramAppSecret: boolean; facebookAppSecret: boolean };
  channels: Record<Channel, ChannelView>;
  /** Pages waiting for a choice after connecting Facebook. */
  pages: PageChoice[];
  /** Path of the admin page, the end of the redirect address. */
  redirectPath: string;
}
