import { settings, type SiteTransaction } from '@cleitext/db';
import { CORE_SETTINGS_DEFAULTS } from '@cleitext/shared';
import { and, eq } from 'drizzle-orm';

/** Comments of a new entry: open when its type has them and the site's default says so. */
export async function newCommentStatus(
  tx: SiteTransaction,
  supports: readonly string[],
): Promise<'open' | 'closed'> {
  if (!supports.includes('comments')) return 'closed';
  const [row] = await tx
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.namespace, 'core'), eq(settings.key, 'commentsDefault')));
  const open = typeof row?.value === 'boolean' ? row.value : CORE_SETTINGS_DEFAULTS.commentsDefault;
  return open ? 'open' : 'closed';
}
