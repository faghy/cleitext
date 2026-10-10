import {
  entries,
  media,
  siteMembers,
  taxonomies,
  terms,
  users,
  withContext,
  type DatabaseClient,
} from '@cleitext/db';
import type { AdminSearchResult } from '@cleitext/shared';
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { and, desc, eq, ilike, ne, or } from 'drizzle-orm';
import { CurrentAuth, CurrentSite } from '../common/decorators.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';

const LIMIT = 6;

/** Global admin search (docs/SPECIFICATIONS.md §6.4), for the command palette. */
@Controller('search')
export class SearchController {
  constructor(@Inject(DATABASE) private readonly database: DatabaseClient) {}

  @Get()
  async search(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Query('q') q: string | undefined,
  ): Promise<AdminSearchResult> {
    const text = (q ?? '').trim().slice(0, 100);
    if (text.length < 2) return { entries: [], media: [], terms: [], users: [] };
    const pattern = `%${text.replace(/[\\%_]/g, '\\$&')}%`;
    const can = (capability: string) => auth.capabilities.includes(capability);
    return withContext(this.database.db, { siteId: site.id, userId: auth.userId }, async (tx) => ({
      entries: can('edit_entries')
        ? await tx
            .select({
              id: entries.id,
              type: entries.typeSlug,
              title: entries.title,
              status: entries.status,
            })
            .from(entries)
            .where(
              and(
                ilike(entries.title, pattern),
                ne(entries.status, 'trashed'),
                // Private entries of others only for those who may read them.
                can('read_private_entries')
                  ? undefined
                  : or(ne(entries.status, 'private'), eq(entries.authorId, auth.userId)),
              ),
            )
            .orderBy(desc(entries.updatedAt))
            .limit(LIMIT)
        : [],
      media: can('upload_media')
        ? await tx
            .select({ id: media.id, filename: media.filename, mime: media.mime })
            .from(media)
            .where(ilike(media.filename, pattern))
            .orderBy(desc(media.createdAt))
            .limit(LIMIT)
        : [],
      terms: can('manage_terms')
        ? await tx
            .select({ id: terms.id, name: terms.name, taxonomy: taxonomies.slug })
            .from(terms)
            .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
            .where(ilike(terms.name, pattern))
            .limit(LIMIT)
        : [],
      users: can('manage_users')
        ? await tx
            .select({ id: users.id, displayName: users.displayName, email: users.email })
            .from(users)
            .innerJoin(siteMembers, eq(siteMembers.userId, users.id))
            .where(
              and(
                eq(siteMembers.siteId, site.id),
                or(ilike(users.displayName, pattern), ilike(users.email, pattern)),
              ),
            )
            .limit(LIMIT)
        : [],
    }));
  }
}
