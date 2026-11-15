/** What the plugin keeps, and what the admin page reads. */

/** Settings chosen in the admin page. */
export interface DisbigleConfig {
  /** The Mastodon-compatible server, e.g. `https://app.disbigle.com` (no trailing slash). */
  instance: string;
  /** New articles are announced (each can still be left out in the editor). */
  announce: boolean;
  /** Replies from the fediverse are shown under the articles. */
  comments: boolean;
  /** Pictures of people of other servers too (otherwise initials). */
  remoteAvatars: boolean;
}

/** The connected account: no secrets here (they are in `ctx.secrets`). */
export interface Connection {
  instance: string;
  clientId: string;
  accountId: string;
  /** `user@host`. */
  acct: string;
  accountUrl: string;
  connectedAt: string;
  /** The site's address when it was connected, for the links of the posts. */
  siteUrl: string;
  /** The server refused the token (401/403): connect again. */
  refused?: boolean;
}

/** A sign-in started from the admin page, waiting for the way back. */
export interface OAuthPending {
  state: string;
  verifier: string;
  instance: string;
  clientId: string;
  redirectUri: string;
  siteUrl: string;
  userId: string;
  createdAt: string;
}

export interface Mention {
  /** `user@host`, lowercase. */
  acct: string;
  url: string;
}

/** The announcement of an article (of its translation group), kept under `post:<entry id>`. */
export interface Announcement {
  state: 'pending' | 'done' | 'failed';
  entryId: string;
  title: string;
  instance: string;
  /** The connected account then: its own replies are not comments. */
  accountId: string;
  /** Time of the last attempt. */
  at: string;
  attempts: number;
  /** Failed: when the scheduled task tries again (none: only by hand). */
  nextTry?: string | null;
  error?: string;
  httpStatus?: number;
  statusId?: string;
  url?: string;
  mentions?: Mention[];
  /** The entries of the translation group, the announced one first. */
  ids?: string[];
}

/** A translation of an announced article points to the announcement. */
export interface AnnouncementRef {
  ref: string;
}

export interface LogLine {
  at: string;
  entryId: string;
  title: string;
  ok: boolean;
  message: string;
  url?: string;
}

/** A reply from the fediverse, ready to show (its HTML already sanitized). */
export interface FediComment {
  id: string;
  url: string;
  displayName: string;
  acct: string;
  profileUrl: string;
  avatar: string | null;
  initials: string;
  html: string;
  spoiler: string;
  createdAt: string;
  /** 0 for direct replies to the post, more for replies to replies (at most 3). */
  depth: number;
}

/** Replies kept for a few minutes, under `comments:<status id>`. */
export interface CommentsCache {
  at: string;
  /** The last fetch failed: kept until `retryAt`. */
  retryAt?: string;
  items: FediComment[];
}

/** What the settings page gets: never a token nor a secret. */
export interface SettingsView {
  config: DisbigleConfig;
  connection: {
    acct: string;
    accountUrl: string;
    instance: string;
    connectedAt: string;
    refused: boolean;
  } | null;
  failed: { entryId: string; title: string; error: string; at: string; retrying: boolean }[];
  log: LogLine[];
}
