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
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { siteOrigin } from '../mcp/origin.js';
import { CommentsService } from './comments.service.js';

const uuid = new ParseUUIDPipe();
const ids = z.array(z.uuid()).min(1).max(500);
const statusBody = z.object({ ids, status: z.enum(['pending', 'approved', 'spam', 'trash']) });
const updateBody = z.object({
  content: z.string().max(10_000).optional(),
  authorName: z.string().max(120).optional(),
  authorEmail: z.string().max(200).optional(),
  authorUrl: z.string().max(300).nullable().optional(),
});
const replyBody = z.object({ content: z.string().trim().min(1).max(10_000) });
const entryBody = z.object({ status: z.enum(['open', 'closed']) });

/** Comment moderation (RF-COM): the queue, statuses, edits and replies. */
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('comments')
  @RequireCapability('moderate_comments')
  list(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('entry') entryId?: string,
    @Query('page') page?: string,
  ) {
    return this.comments.list(site.id, auth, {
      ...(status ? { status } : {}),
      ...(search ? { search } : {}),
      ...(entryId ? { entryId } : {}),
      page: Number(page) || 1,
    });
  }

  @Get('comments/pending-count')
  async pending(@CurrentSite() site: SiteContext, @CurrentAuth() auth: AuthContext) {
    return { count: await this.comments.pendingCount(site.id, auth) };
  }

  @Post('comments/status')
  @HttpCode(200)
  @RequireCapability('moderate_comments')
  async status(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const input = parseBody(statusBody, body);
    return {
      changed: await this.comments.setStatus(
        site.id,
        auth,
        input.ids,
        input.status,
        siteOrigin(request),
      ),
    };
  }

  @Patch('comments/:id')
  @RequireCapability('moderate_comments')
  update(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(updateBody, body);
    return this.comments.update(site.id, auth, id, {
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.authorName !== undefined ? { authorName: input.authorName } : {}),
      ...(input.authorEmail !== undefined ? { authorEmail: input.authorEmail } : {}),
      ...(input.authorUrl !== undefined ? { authorUrl: input.authorUrl } : {}),
    });
  }

  @Post('comments/:id/reply')
  @RequireCapability('moderate_comments')
  async reply(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    return {
      id: await this.comments.reply(
        site.id,
        auth,
        id,
        parseBody(replyBody, body).content,
        siteOrigin(request),
      ),
    };
  }

  @Delete('comments')
  @RequireCapability('moderate_comments')
  async remove(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ) {
    return {
      deleted: await this.comments.remove(site.id, auth, parseBody(z.object({ ids }), body).ids),
    };
  }

  @Patch('entries/:id/comments')
  @HttpCode(204)
  async entryStatus(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
  ) {
    await this.comments.setEntryStatus(site.id, auth, id, parseBody(entryBody, body).status);
  }
}
