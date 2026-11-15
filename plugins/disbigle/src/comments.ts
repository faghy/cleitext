/**
 * The replies to an announcement, from `GET /api/v1/statuses/:id/context`,
 * as comments to show: public and unlisted replies only, not those of the
 * connected account itself (Disbigle's notices in other languages), with
 * sanitized HTML and a picture only from the connected server (which keeps
 * copies of remote pictures) unless the site allows the others. No I/O here.
 */
import { hostOf, webUrl } from './config';
import { fullAcct } from './mentions';
import { safeHref, sanitizeHtml } from './sanitize';
import type { FediComment } from './types';

export const MAX_COMMENTS = 200;
export const MAX_DEPTH = 3;

export interface CommentOptions {
  /** The post whose replies these are. */
  statusId: string;
  /** The connected account, whose replies are left out. */
  accountId: string;
  /** Host of the connected server. */
  instanceHost: string;
  remoteAvatars: boolean;
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Up to two letters of a name, for the circle shown instead of a picture. */
export function initials(name: string): string {
  const words = name
    .replace(/:[a-z0-9_]+:/gi, ' ')
    .split(/[\s._-]+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
  const letters = words
    .slice(0, 2)
    .map((w) => [...w.replace(/[^\p{L}\p{N}]/gu, '')][0] ?? '')
    .join('');
  return letters.toUpperCase() || '?';
}

/** The picture to show: `avatar_static`, https, from the connected server unless allowed. */
export function avatarOf(account: Record<string, unknown>, options: CommentOptions): string | null {
  const url = safeHref(str(account.avatar_static));
  if (!url || !url.startsWith('https://')) return null;
  if (!options.remoteAvatars && hostOf(url) !== options.instanceHost.toLowerCase()) return null;
  return url;
}

/**
 * The pictures a site shows: those of the connected server (which keeps
 * copies of remote ones), the others only when the site allows them.
 */
export function withAvatars(
  comments: FediComment[],
  instanceHost: string,
  remoteAvatars: boolean,
): FediComment[] {
  if (remoteAvatars) return comments;
  return comments.map((c) =>
    c.avatar && hostOf(c.avatar) !== instanceHost.toLowerCase() ? { ...c, avatar: null } : c,
  );
}

/** The comments of a context answer, in the order of the thread. */
export function commentsFromContext(context: unknown, options: CommentOptions): FediComment[] {
  const descendants = record(context).descendants;
  if (!Array.isArray(descendants)) return [];
  const depth = new Map<string, number>([[options.statusId, -1]]);
  const comments: FediComment[] = [];
  for (const item of descendants) {
    const status = record(item);
    const id = str(status.id);
    const parent = str(status.in_reply_to_id);
    const level = Math.min((depth.get(parent) ?? 0) + 1, MAX_DEPTH);
    if (id) depth.set(id, level);
    const account = record(status.account);
    const visibility = str(status.visibility);
    if (!id || (visibility !== 'public' && visibility !== 'unlisted')) continue;
    if (str(account.id) && str(account.id) === options.accountId) continue;
    const url = webUrl(status.url) ?? webUrl(status.uri);
    const profileUrl = webUrl(account.url);
    const acct = str(account.acct);
    if (!url || !profileUrl || !acct) continue;
    const displayName =
      str(account.display_name).trim() || str(account.username).trim() || acct.split('@')[0]!;
    comments.push({
      id,
      url,
      displayName: displayName.slice(0, 100),
      acct: fullAcct(acct, options.instanceHost),
      profileUrl,
      avatar: avatarOf(account, options),
      initials: initials(displayName),
      html: sanitizeHtml(status.content),
      spoiler: str(status.spoiler_text).trim().slice(0, 500),
      createdAt: str(status.created_at),
      depth: Math.max(level, 0),
    });
    if (comments.length >= MAX_COMMENTS) break;
  }
  return comments;
}
