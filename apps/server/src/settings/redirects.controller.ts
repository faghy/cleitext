import { redirects, withContext, type DatabaseClient, type SiteTransaction } from '@cleitext/db';
import {
  redirectImportSchema,
  redirectRequestSchema,
  type RedirectImportResult,
  type RedirectView,
} from '@cleitext/shared';
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { and, asc, eq, ilike, ne, or } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { AuditService } from '../audit/audit.service.js';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { PageCacheService } from '../public/page-cache.service.js';

const uuid = new ParseUUIDPipe();
type Row = typeof redirects.$inferSelect;

/** Redirects (RF-NAV-04): path to path or to another site, 410 Gone, CSV import. */
@Controller('redirects')
@RequireCapability('manage_settings')
export class RedirectsController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly cache: PageCacheService,
    private readonly audit: AuditService,
  ) {}

  private run<T>(site: SiteContext, auth: AuthContext, fn: (tx: SiteTransaction) => Promise<T>) {
    return withContext(this.database.db, { siteId: site.id, userId: auth.userId }, fn);
  }

  @Get()
  async list(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Query('q') q: string | undefined,
  ): Promise<RedirectView[]> {
    const pattern = q?.trim() ? `%${q.trim().replace(/[\\%_]/g, '\\$&')}%` : null;
    const rows = await this.run(site, auth, (tx) =>
      tx
        .select()
        .from(redirects)
        .where(
          pattern
            ? or(ilike(redirects.fromPath, pattern), ilike(redirects.toPath, pattern))
            : undefined,
        )
        .orderBy(asc(redirects.fromPath))
        .limit(1_000),
    );
    return rows.map(toView);
  }

  @Post()
  async create(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<RedirectView> {
    const input = parseBody(redirectRequestSchema, body);
    const view = await this.run(site, auth, async (tx) => {
      const [taken] = await tx
        .select({ id: redirects.id })
        .from(redirects)
        .where(eq(redirects.fromPath, input.from));
      if (taken) throw new ConflictException(`${input.from} already redirects somewhere.`);
      const [row] = await tx
        .insert(redirects)
        .values({ siteId: site.id, fromPath: input.from, toPath: input.to, status: input.status })
        .returning();
      await this.record(tx, site, auth, 'redirect.created', row!.id, request.ip, input.from);
      return toView(row!);
    });
    await this.cache.invalidate(site.id, ['site']);
    return view;
  }

  @Patch(':id')
  async update(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<RedirectView> {
    const input = parseBody(redirectRequestSchema, body);
    const view = await this.run(site, auth, async (tx) => {
      const [clash] = await tx
        .select({ id: redirects.id })
        .from(redirects)
        .where(and(eq(redirects.fromPath, input.from), ne(redirects.id, id)));
      if (clash) throw new ConflictException(`${input.from} already redirects somewhere.`);
      const [row] = await tx
        .update(redirects)
        .set({ fromPath: input.from, toPath: input.to, status: input.status })
        .where(eq(redirects.id, id))
        .returning();
      if (!row) throw new NotFoundException('Redirect not found.');
      await this.record(tx, site, auth, 'redirect.updated', id, request.ip, input.from);
      return toView(row);
    });
    await this.cache.invalidate(site.id, ['site']);
    return view;
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.run(site, auth, async (tx) => {
      const [row] = await tx.delete(redirects).where(eq(redirects.id, id)).returning();
      if (!row) throw new NotFoundException('Redirect not found.');
      await this.record(tx, site, auth, 'redirect.deleted', id, request.ip, row.fromPath);
    });
    await this.cache.invalidate(site.id, ['site']);
  }

  /**
   * CSV import: `from,to[,status]` per line (a header line is skipped).
   * Existing sources are updated; lines with errors are reported and skipped.
   */
  @Post('import')
  @HttpCode(200)
  async import(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<RedirectImportResult> {
    const { csv } = parseBody(redirectImportSchema, body);
    const result: RedirectImportResult = { saved: 0, errors: [] };
    await this.run(site, auth, async (tx) => {
      const lines = csv.split(/\r?\n/);
      for (const [index, raw] of lines.entries()) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const cells = parseCsvLine(line);
        if (index === 0 && !cells[0]?.startsWith('/')) continue; // header
        const parsed = redirectRequestSchema.safeParse({
          from: cells[0] ?? '',
          to: cells[1] ?? '',
          ...(cells[2] ? { status: Number(cells[2]) } : {}),
        });
        if (!parsed.success) {
          result.errors.push({ line: index + 1, message: parsed.error.issues[0]!.message });
          continue;
        }
        const { from, to, status } = parsed.data;
        await tx
          .insert(redirects)
          .values({ siteId: site.id, fromPath: from, toPath: to, status })
          .onConflictDoUpdate({
            target: [redirects.siteId, redirects.fromPath],
            set: { toPath: to, status },
          });
        result.saved++;
      }
      await this.record(tx, site, auth, 'redirect.imported', null, request.ip, `${result.saved}`);
    });
    await this.cache.invalidate(site.id, ['site']);
    return result;
  }

  private record(
    tx: SiteTransaction,
    site: SiteContext,
    auth: AuthContext,
    action: string,
    targetId: string | null,
    ip: string,
    detail: string,
  ) {
    return this.audit.record(tx, {
      siteId: site.id,
      userId: auth.userId,
      action,
      targetType: 'redirect',
      ...(targetId ? { targetId } : {}),
      meta: { path: detail },
      ip,
    });
  }
}

function toView(row: Row): RedirectView {
  return {
    id: row.id,
    from: row.fromPath,
    to: row.toPath,
    status: row.status as RedirectView['status'],
    hits: row.hits,
  };
}

/** One CSV line: commas, double quotes around values, "" for a quote. */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',' || char === ';') {
      cells.push(cell.trim());
      cell = '';
    } else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}
