import {
  autosaveRequestSchema,
  createEntryRequestSchema,
  createTranslationRequestSchema,
  listEntriesQuerySchema,
  scheduleRequestSchema,
  updateEntryRequestSchema,
  type ContentTypeView,
  type EntryListResponse,
  type EntryView,
  type RevisionSummary,
  type RevisionView,
} from '@cleitext/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { EntriesService } from './entries.service.js';

const uuid = new ParseUUIDPipe();

/** Content API (docs/SPECIFICATIONS.md §6.2). Per-entry rules are enforced by the service. */
@Controller()
@RequireCapability('edit_entries')
export class EntriesController {
  constructor(private readonly entries: EntriesService) {}

  @Get('content-types')
  contentTypes(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<ContentTypeView[]> {
    return this.entries.listTypes(site.id, auth);
  }

  @Get('entries')
  list(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Query() query: Record<string, unknown>,
  ): Promise<EntryListResponse> {
    return this.entries.list(site.id, auth, parseBody(listEntriesQuerySchema, query));
  }

  @Post('entries')
  create(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<EntryView> {
    return this.entries.create(
      site.id,
      auth,
      parseBody(createEntryRequestSchema, body),
      request.ip,
    );
  }

  @Get('entries/:id')
  get(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
  ): Promise<EntryView> {
    return this.entries.get(site.id, auth, id);
  }

  @Patch('entries/:id')
  update(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<EntryView> {
    return this.entries.update(
      site.id,
      auth,
      id,
      parseBody(updateEntryRequestSchema, body),
      request.ip,
    );
  }

  @Put('entries/:id/autosave')
  autosave(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
  ): Promise<{ revisionId: string; savedAt: string }> {
    return this.entries.autosave(site.id, auth, id, parseBody(autosaveRequestSchema, body));
  }

  @Post('entries/:id/publish')
  @HttpCode(200)
  publish(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.entries.publish(site.id, auth, id, request.ip);
  }

  @Post('entries/:id/unpublish')
  @HttpCode(200)
  unpublish(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.entries.unpublish(site.id, auth, id, request.ip);
  }

  @Post('entries/:id/schedule')
  @HttpCode(200)
  schedule(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const { scheduledAt } = parseBody(scheduleRequestSchema, body);
    return this.entries.schedule(site.id, auth, id, new Date(scheduledAt), request.ip);
  }

  @Post('entries/:id/submit')
  @HttpCode(200)
  submit(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.entries.submit(site.id, auth, id, request.ip);
  }

  @Post('entries/:id/trash')
  @HttpCode(200)
  trash(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.entries.trash(site.id, auth, id, request.ip);
  }

  @Post('entries/:id/restore')
  @HttpCode(200)
  restore(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.entries.restore(site.id, auth, id, request.ip);
  }

  @Delete('entries/:id')
  @HttpCode(204)
  async remove(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.entries.remove(site.id, auth, id, request.ip);
  }

  @Get('entries/:id/revisions')
  revisions(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
  ): Promise<RevisionSummary[]> {
    return this.entries.listRevisions(site.id, auth, id);
  }

  @Get('entries/:id/revisions/:revisionId')
  revision(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Param('revisionId', uuid) revisionId: string,
  ): Promise<RevisionView> {
    return this.entries.getRevision(site.id, auth, id, revisionId);
  }

  @Post('entries/:id/revisions/:revisionId/restore')
  @HttpCode(200)
  restoreRevision(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Param('revisionId', uuid) revisionId: string,
    @Req() request: FastifyRequest,
  ): Promise<EntryView> {
    return this.entries.restoreRevision(site.id, auth, id, revisionId, request.ip);
  }

  @Post('entries/:id/translations')
  createTranslation(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<EntryView> {
    const { locale } = parseBody(createTranslationRequestSchema, body);
    return this.entries.createTranslation(site.id, auth, id, locale, request.ip);
  }
}
