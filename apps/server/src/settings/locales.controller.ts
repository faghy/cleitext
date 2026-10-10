import { entries, menus, siteLocales, terms, withContext, type DatabaseClient } from '@cleitext/db';
import {
  createLocaleRequestSchema,
  updateLocaleRequestSchema,
  type SiteLocaleView,
} from '@cleitext/shared';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { asc, count, eq, sql } from 'drizzle-orm';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { PageCacheService } from '../public/page-cache.service.js';

/** Languages of the site (RF-SET-01). */
@Controller('site/locales')
@RequireCapability('manage_settings')
export class LocalesController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly cache: PageCacheService,
  ) {}

  private run<T>(site: SiteContext, auth: AuthContext, fn: Parameters<typeof withContext<T>>[2]) {
    return withContext(this.database.db, { siteId: site.id, userId: auth.userId }, fn);
  }

  @Get()
  list(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<SiteLocaleView[]> {
    return this.run(site, auth, async (tx) => {
      const rows = await tx
        .select()
        .from(siteLocales)
        .orderBy(asc(siteLocales.position), asc(siteLocales.code));
      const usage = await tx
        .select({ locale: entries.locale, n: count() })
        .from(entries)
        .groupBy(entries.locale);
      const used = new Map(usage.map((u) => [u.locale, Number(u.n)]));
      return rows.map((l) => ({
        code: l.code,
        name: l.name,
        isDefault: l.isDefault,
        urlPrefix: l.urlPrefix,
        position: l.position,
        entries: used.get(l.code) ?? 0,
      }));
    });
  }

  @Post()
  async create(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<SiteLocaleView[]> {
    const input = parseBody(createLocaleRequestSchema, body);
    await this.run(site, auth, async (tx) => {
      const existing = await tx.select().from(siteLocales);
      if (existing.some((l) => l.code === input.code)) {
        throw new ConflictException(`The language ${input.code} is already enabled.`);
      }
      await tx.insert(siteLocales).values({
        siteId: site.id,
        code: input.code,
        name: input.name,
        isDefault: false,
        position: existing.length,
        urlPrefix: input.urlPrefix ?? null,
      });
    });
    await this.changed(site);
    return this.list(site, auth);
  }

  @Patch(':code')
  async update(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('code') code: string,
    @Body() body: unknown,
  ): Promise<SiteLocaleView[]> {
    const input = parseBody(updateLocaleRequestSchema, body);
    await this.run(site, auth, async (tx) => {
      const [locale] = await tx.select().from(siteLocales).where(eq(siteLocales.code, code));
      if (!locale) throw new NotFoundException('Language not found.');
      const changes: Partial<typeof siteLocales.$inferInsert> = {};
      if (input.name !== undefined) changes.name = input.name;
      if (input.urlPrefix !== undefined) changes.urlPrefix = input.urlPrefix;
      if (input.position !== undefined) changes.position = input.position;
      if (Object.keys(changes).length) {
        await tx.update(siteLocales).set(changes).where(eq(siteLocales.code, code));
      }
      if (input.isDefault) await tx.execute(sql`select cleitext_app_set_default_locale(${code})`);
    });
    await this.changed(site);
    return this.list(site, auth);
  }

  /** Removes a language that nothing uses yet. */
  @Delete(':code')
  @HttpCode(200)
  async remove(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('code') code: string,
  ): Promise<SiteLocaleView[]> {
    await this.run(site, auth, async (tx) => {
      const [locale] = await tx.select().from(siteLocales).where(eq(siteLocales.code, code));
      if (!locale) throw new NotFoundException('Language not found.');
      if (locale.isDefault) throw new BadRequestException('Choose another default language first.');
      const [used] = await tx.select({ n: count() }).from(entries).where(eq(entries.locale, code));
      const [usedTerms] = await tx.select({ n: count() }).from(terms).where(eq(terms.locale, code));
      const [usedMenus] = await tx.select({ n: count() }).from(menus).where(eq(menus.locale, code));
      const total = Number(used?.n ?? 0) + Number(usedTerms?.n ?? 0) + Number(usedMenus?.n ?? 0);
      if (total > 0) {
        throw new ConflictException(
          `This language is used by ${Number(used?.n ?? 0)} entries, ${Number(usedTerms?.n ?? 0)} terms and ${Number(usedMenus?.n ?? 0)} menus: delete or move them first.`,
        );
      }
      await tx.delete(siteLocales).where(eq(siteLocales.code, code));
    });
    await this.changed(site);
    return this.list(site, auth);
  }

  private async changed(site: SiteContext): Promise<void> {
    // Addresses, language switchers and sitemaps change everywhere.
    await this.cache.invalidate(site.id, ['site']);
  }
}
