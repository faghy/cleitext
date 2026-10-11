import {
  autosaveRequestSchema,
  bulkEntriesRequestSchema,
  type BulkEntriesResponse,
  type EntryLockView,
  publishRequestSchema,
  createEntryRequestSchema,
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
import { LocksService } from './locks.service.js';
import { EntriesService } from './entries.service.js';
import { EntryStatesService } from './entry-states.service.js';

const uuid = new ParseUUIDPipe();

/** Content API (docs/SPECIFICATIONS.md §6.2). Per-entry rules are enforced by the service. */
@Controller()
@RequireCapability('edit_entries')
export class EntriesController {
  constructor(
    private readonly entries: EntriesService,
    private readonly locks: LocksService,
    private readonly states: EntryStatesService,
  ) {}

  @Get('content-types')
  contentTypes(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<ContentTypeView[]> {
    return this.entries.listTypes(site.id, auth);
  }

  @Get('entries')
  async list(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Query() query: Record<string, unknown>,
  ): Promise<EntryListResponse> {
    const list = await this.entries.list(site.id, auth, parseBody(listEntriesQuerySchema, query));
    return { ...list, items: await this.states.annotate(site.id, list.items) };
  }

  @Post('entries/bulk')
  @HttpCode(200)
  bulk(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<BulkEntriesResponse> {
    const { ids, action } = parseBody(bulkEntriesRequestSchema, body);
    return this.entries.bulk(site.id, auth, ids, action, request.ip);
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
  async get(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
  ): Promise<EntryView> {
    const [entry] = await this.states.annotate(site.id, [
      await this.entries.get(site.id, auth, id),
    ]);
    return entry!;
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
    @Body() body: unknown,
  ) {
    const { visibility } = parseBody(publishRequestSchema, body ?? {});
    return this.entries.publish(site.id, auth, id, request.ip, visibility);
  }

  @Post('entries/:id/preview')
  @HttpCode(200)
  preview(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
  ): Promise<{ url: string }> {
    return this.entries.previewUrl(site.id, auth, id);
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

  /** Takes the editing lock, or refreshes it; `?takeover=1` takes someone else's. */
  @Post('entries/:id/lock')
  @HttpCode(200)
  lock(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Query('takeover') takeover: string | undefined,
  ): Promise<EntryLockView> {
    return this.locks.acquire(site.id, auth, id, takeover === '1');
  }

  @Get('entries/:id/lock')
  lockStatus(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
  ): Promise<EntryLockView> {
    return this.locks.status(site.id, auth, id);
  }

  @Delete('entries/:id/lock')
  @HttpCode(204)
  unlock(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
  ): Promise<void> {
    return this.locks.release(site.id, auth, id);
  }

  @Post('entries/:id/duplicate')
  duplicate(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.entries.duplicate(site.id, auth, id, request.ip);
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
}
