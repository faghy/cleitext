import type { EntryStatus } from '@cleitext/shared';
import type { AuthContext } from '../common/request-context.js';

/**
 * Entry permissions (docs/SPECIFICATIONS.md §3), modeled on WordPress:
 * - Contributors edit and delete their own drafts and submit them for review;
 * - Authors also publish (and keep editing) their own entries;
 * - Editors and Administrators act on everyone's entries.
 */
export interface EntryRef {
  authorId: string | null;
  status: EntryStatus;
}

const has = (auth: AuthContext, capability: string) =>
  auth.capabilities.includes(capability as never);

const isOwn = (auth: AuthContext, entry: EntryRef) => entry.authorId === auth.userId;

const isPublic = (status: EntryStatus) =>
  status === 'published' || status === 'scheduled' || status === 'private';

export function canPublish(auth: AuthContext, entry: EntryRef): boolean {
  return isOwn(auth, entry) ? has(auth, 'publish_entries') : has(auth, 'publish_others_entries');
}

export function canEdit(auth: AuthContext, entry: EntryRef): boolean {
  if (entry.status === 'trashed') return false;
  const base = isOwn(auth, entry) ? has(auth, 'edit_entries') : has(auth, 'edit_others_entries');
  // Changing published or scheduled content requires the right to publish it.
  return base && (!isPublic(entry.status) || canPublish(auth, entry));
}

export function canDelete(auth: AuthContext, entry: EntryRef): boolean {
  if (!isOwn(auth, entry)) return has(auth, 'edit_others_entries');
  if (!has(auth, 'delete_entries')) return false;
  // Without publishing rights, only drafts and pending entries can be deleted.
  return !isPublic(entry.status) || canPublish(auth, entry);
}

export function canRead(auth: AuthContext, entry: EntryRef): boolean {
  if (isOwn(auth, entry)) return has(auth, 'edit_entries');
  if (entry.status === 'private') return has(auth, 'read_private_entries');
  return has(auth, 'edit_entries');
}
