import { withContext, type DatabaseClient, type SiteTransaction } from '@cleitext/db';
import {
  addDomainRequestSchema,
  createSiteRequestSchema,
  updateDomainRequestSchema,
  updateSiteRequestSchema,
  type SiteView,
} from '@cleitext/shared';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { PageCacheService } from '../public/page-cache.service.js';

const uuid = new ParseUUIDPipe();

interface SiteRow {
  id: string;
  slug: string;
  name: string;
  status: SiteView['status'];
  default_locale: string;
  created_at: Date | string;
  domains: SiteView['domains'];
}

/**
 * Sites of the installation (RF-SIT-03), for super admins. The database
 * functions check the super admin role again (sites are read-only otherwise).
 */
@Controller('sites')
@RequireCapability('manage_sites')
export class SitesController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly cache: PageCacheService,
  ) {}

  private run<T>(
    site: SiteContext,
    auth: AuthContext,
    fn: (tx: SiteTransaction) => Promise<T>,
  ): Promise<T> {
    if (!auth.isSuperAdmin) throw new ForbiddenException('Only super admins can manage sites.');
    return withContext(this.database.db, { siteId: site.id, userId: auth.userId }, fn).catch(
      (error: unknown) => {
        throw translate(error);
      },
    );
  }

  @Get()
  list(@CurrentSite() site: SiteContext, @CurrentAuth() auth: AuthContext): Promise<SiteView[]> {
    return this.run(site, auth, (tx) => listSites(tx));
  }

  @Post()
  async create(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<SiteView[]> {
    const input = parseBody(createSiteRequestSchema, body);
    const sites = await this.run(site, auth, async (tx) => {
      await tx.execute(
        sql`select cleitext_app_create_site(${input.slug}, ${input.name}, ${input.host}, ${input.locale}, ${input.forceHttps})`,
      );
      return listSites(tx);
    });
    await this.changed(site);
    return sites;
  }

  @Patch(':id')
  async update(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
  ): Promise<SiteView[]> {
    const input = parseBody(updateSiteRequestSchema, body);
    if (id === site.id && input.status === 'archived') {
      throw new BadRequestException('You cannot archive the site you are working on.');
    }
    const sites = await this.run(site, auth, async (tx) => {
      await tx.execute(
        sql`select cleitext_app_update_site(${id}::uuid, ${input.name ?? null}, ${input.status ?? null})`,
      );
      return listSites(tx);
    });
    await this.changed(site);
    return sites;
  }

  @Post(':id/domains')
  async addDomain(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
  ): Promise<SiteView[]> {
    const input = parseBody(addDomainRequestSchema, body);
    const sites = await this.run(site, auth, async (tx) => {
      await tx.execute(
        sql`select cleitext_app_add_domain(${id}::uuid, ${input.host}, ${input.isPrimary}, ${input.forceHttps})`,
      );
      return listSites(tx);
    });
    await this.changed(site);
    return sites;
  }

  @Patch('domains/:domain')
  async updateDomain(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('domain', uuid) domain: string,
    @Body() body: unknown,
  ): Promise<SiteView[]> {
    const input = parseBody(updateDomainRequestSchema, body);
    const sites = await this.run(site, auth, async (tx) => {
      await tx.execute(
        sql`select cleitext_app_update_domain(${domain}::uuid, ${input.isPrimary ?? false}, ${input.forceHttps ?? null})`,
      );
      return listSites(tx);
    });
    await this.changed(site);
    return sites;
  }

  @Delete('domains/:domain')
  @HttpCode(200)
  async removeDomain(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('domain', uuid) domain: string,
  ): Promise<SiteView[]> {
    const sites = await this.run(site, auth, async (tx) => {
      await tx.execute(sql`select cleitext_app_remove_domain(${domain}::uuid)`);
      return listSites(tx);
    });
    await this.changed(site);
    return sites;
  }

  /** Every process re-reads hosts and statuses. */
  private async changed(site: SiteContext): Promise<void> {
    await this.cache.invalidate(site.id, ['site'], { sites: true });
  }
}

async function listSites(tx: SiteTransaction): Promise<SiteView[]> {
  const rows = (await tx.execute(
    sql`select * from cleitext_app_list_sites()`,
  )) as unknown as SiteRow[];
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    status: r.status,
    defaultLocale: r.default_locale,
    createdAt: new Date(r.created_at).toISOString(),
    domains: r.domains,
  }));
}

/** Database errors as readable answers. */
function translate(error: unknown): unknown {
  const cause = (error as { cause?: { code?: string; constraint_name?: string; message?: string } })
    .cause;
  if (!cause?.code) return error;
  if (cause.code === '23505') {
    return new ConflictException(
      cause.constraint_name?.includes('host')
        ? 'This domain is already used by a site.'
        : 'A site with this slug already exists.',
    );
  }
  if (cause.code === 'P0002') return new NotFoundException(cause.message);
  if (cause.code === '22023') return new BadRequestException(cause.message);
  if (cause.code === '42501') return new ForbiddenException('Only super admins can manage sites.');
  return error;
}
