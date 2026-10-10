import type { CxdDocument } from '@cleitext/blocks';
import { patterns, users, withContext, type DatabaseClient } from '@cleitext/db';
import type { PatternView } from '@cleitext/shared';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import type { AuthContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { PageCacheService } from '../public/page-cache.service.js';
import { validateDocument } from './entries.service.js';

type Row = typeof patterns.$inferSelect;

/** Block patterns of a site (RF-EDT-07). */
@Injectable()
export class PatternsService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly cache: PageCacheService,
  ) {}

  private run<T>(siteId: string, auth: AuthContext, fn: Parameters<typeof withContext<T>>[2]) {
    return withContext(this.database.db, { siteId, userId: auth.userId }, fn);
  }

  async list(siteId: string, auth: AuthContext): Promise<PatternView[]> {
    const rows = await this.run(siteId, auth, (tx) =>
      tx
        .select({ pattern: patterns, author: users.displayName })
        .from(patterns)
        .leftJoin(users, eq(users.id, patterns.createdBy))
        .orderBy(asc(patterns.title)),
    );
    return rows.map(({ pattern, author }) => toView(pattern, author));
  }

  async create(
    siteId: string,
    auth: AuthContext,
    input: { title: string; document: unknown; synced: boolean },
  ): Promise<PatternView> {
    const document = withoutPatterns(validateDocument(input.document, auth));
    const [row] = await this.run(siteId, auth, (tx) =>
      tx
        .insert(patterns)
        .values({
          siteId,
          title: input.title,
          document,
          synced: input.synced,
          createdBy: auth.userId,
        })
        .returning(),
    );
    return toView(row!, auth.displayName);
  }

  async update(
    siteId: string,
    auth: AuthContext,
    id: string,
    input: { title?: string | undefined; document?: unknown },
  ): Promise<PatternView> {
    const document =
      input.document === undefined
        ? undefined
        : withoutPatterns(validateDocument(input.document, auth));
    const row = await this.run(siteId, auth, async (tx) => {
      await this.assertCanChange(tx, auth, id);
      const [updated] = await tx
        .update(patterns)
        .set({
          ...(input.title ? { title: input.title } : {}),
          ...(document ? { document } : {}),
          updatedAt: sql`now()`,
        })
        .where(eq(patterns.id, id))
        .returning();
      return updated!;
    });
    // Synced patterns are rendered in every page that uses them.
    if (row.synced) await this.cache.invalidate(siteId, ['site']);
    return toView(row, null);
  }

  async remove(siteId: string, auth: AuthContext, id: string): Promise<void> {
    await this.run(siteId, auth, async (tx) => {
      await this.assertCanChange(tx, auth, id);
      await tx.delete(patterns).where(eq(patterns.id, id));
    });
    await this.cache.invalidate(siteId, ['site']);
  }

  private async assertCanChange(
    tx: Parameters<Parameters<typeof withContext>[2]>[0],
    auth: AuthContext,
    id: string,
  ): Promise<void> {
    const [row] = await tx.select().from(patterns).where(eq(patterns.id, id));
    if (!row) throw new NotFoundException('Pattern not found.');
    if (row.createdBy !== auth.userId && !auth.capabilities.includes('edit_others_entries')) {
      throw new ForbiddenException('You cannot change the patterns of others.');
    }
  }
}

/** A pattern never contains synced patterns (no loops, one level of rendering). */
function withoutPatterns(document: CxdDocument): CxdDocument {
  const strip = (blocks: CxdDocument['blocks']): CxdDocument['blocks'] =>
    blocks
      .filter((block) => block.type !== 'cleitext/pattern')
      .map((block) => (block.children ? { ...block, children: strip(block.children) } : block));
  return { ...document, blocks: strip(document.blocks) };
}

function toView(row: Row, author: string | null): PatternView {
  return {
    id: row.id,
    title: row.title,
    document: row.document,
    synced: row.synced,
    createdBy: row.createdBy ? { id: row.createdBy, displayName: author ?? '' } : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
