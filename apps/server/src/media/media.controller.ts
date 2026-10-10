import {
  listMediaQuerySchema,
  updateMediaRequestSchema,
  type MediaListResponse,
  type MediaUsageView,
  type MediaView,
} from '@cleitext/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { MediaService } from './media.service.js';

const uuid = new ParseUUIDPipe();

/** Media library (docs/SPECIFICATIONS.md §6.3). */
@Controller('media')
@RequireCapability('upload_media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  list(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Query() query: Record<string, unknown>,
  ): Promise<MediaListResponse> {
    return this.mediaService.list(site.id, auth, parseBody(listMediaQuerySchema, query));
  }

  /** Multipart upload with a single `file` field (RF-MED-01). */
  @Post()
  async upload(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
  ): Promise<MediaView> {
    if (!request.isMultipart())
      throw new BadRequestException('Send the file as multipart/form-data.');
    const part = await request.file();
    if (!part || part.fieldname !== 'file') throw new BadRequestException('Missing "file" field.');
    let data: Buffer;
    try {
      data = await part.toBuffer();
    } catch {
      throw new HttpException('The file is too large.', HttpStatus.PAYLOAD_TOO_LARGE);
    }
    if (data.length === 0) throw new BadRequestException('The file is empty.');
    return this.mediaService.upload(site.id, auth, { filename: part.filename, data }, request.ip);
  }

  @Get(':id')
  get(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
  ): Promise<MediaView> {
    return this.mediaService.get(site.id, auth, id);
  }

  @Get(':id/usage')
  usage(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
  ): Promise<MediaUsageView[]> {
    return this.mediaService.usage(site.id, auth, id);
  }

  @Patch(':id')
  update(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
  ): Promise<MediaView> {
    return this.mediaService.update(site.id, auth, id, parseBody(updateMediaRequestSchema, body));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.mediaService.remove(site.id, auth, id, request.ip);
  }
}
