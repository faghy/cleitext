import {
  entries,
  roles,
  siteMembers,
  taxonomies,
  terms,
  users,
  withContext,
  type DatabaseClient,
} from '@cleitext/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, ne, type SQL } from 'drizzle-orm';
import { DATABASE } from '../database/database.module.js';

/** A record offered by a relation field's picker. */
export interface PickerItem {
  id: string;
  label: string;
  /** A few words beside it: the type and status, the taxonomy, the role. */
  hint: string;
}

export interface PickerQuery {
  /** Words of the title or name. */
  q?: string;
  /** Content types (entries), the taxonomy (terms), roles (members). */
  types?: string[];
  taxonomy?: string;
  roles?: string[];
  /** These records only (the ones chosen, to show their names). */
  ids?: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT = 20;

/** `%words%` for ILIKE, with its wildcards escaped. */
function like(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * What the pickers of relation fields offer (plugin API 1.48): entries,
 * terms and members of the site, found by name, at most 20 at a time.
 */
@Injectable()
export class FieldPickersService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseClient) {}

  async find(
    siteId: string,
    kind: 'entry' | 'term' | 'user',
    query: PickerQuery,
  ): Promise<PickerItem[]> {
    const ids = (query.ids ?? []).filter((id) => UUID_RE.test(id)).slice(0, 100);
    const q = query.q?.trim().slice(0, 100);
    return withContext(this.database.db, { siteId }, async (tx) => {
      if (kind === 'entry') {
        const where: SQL[] = [ne(entries.status, 'trashed')];
        if (query.types?.length) where.push(inArray(entries.typeSlug, query.types));
        if (ids.length) where.push(inArray(entries.id, ids));
        if (q) where.push(ilike(entries.title, like(q)));
        const rows = await tx
          .select({
            id: entries.id,
            title: entries.title,
            type: entries.typeSlug,
            status: entries.status,
            locale: entries.locale,
          })
          .from(entries)
          .where(and(...where))
          .orderBy(desc(entries.updatedAt))
          .limit(ids.length || LIMIT);
        return rows.map((row) => ({
          id: row.id,
          label: row.title || '—',
          hint: [row.type, row.status === 'published' ? '' : row.status, row.locale]
            .filter(Boolean)
            .join(' · '),
        }));
      }
      if (kind === 'term') {
        const where: SQL[] = [];
        if (query.taxonomy) where.push(eq(taxonomies.slug, query.taxonomy));
        if (ids.length) where.push(inArray(terms.id, ids));
        if (q) where.push(ilike(terms.name, like(q)));
        const rows = await tx
          .select({
            id: terms.id,
            name: terms.name,
            taxonomy: taxonomies.slug,
            locale: terms.locale,
          })
          .from(terms)
          .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
          .where(where.length ? and(...where) : undefined)
          .orderBy(asc(terms.name))
          .limit(ids.length || LIMIT);
        return rows.map((row) => ({
          id: row.id,
          label: row.name,
          hint: [row.taxonomy, row.locale].join(' · '),
        }));
      }
      const where: SQL[] = [];
      if (query.roles?.length) where.push(inArray(roles.slug, query.roles));
      if (ids.length) where.push(inArray(users.id, ids));
      if (q) where.push(ilike(users.displayName, like(q)));
      const rows = await tx
        .select({ id: users.id, name: users.displayName, role: roles.name })
        .from(siteMembers)
        .innerJoin(users, eq(users.id, siteMembers.userId))
        .innerJoin(roles, eq(roles.id, siteMembers.roleId))
        .where(where.length ? and(...where) : undefined)
        .orderBy(asc(users.displayName))
        .limit(ids.length || LIMIT);
      return rows.map((row) => ({ id: row.id, label: row.name, hint: row.role }));
    });
  }
}
