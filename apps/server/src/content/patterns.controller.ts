import {
  createPatternRequestSchema,
  updatePatternRequestSchema,
  type PatternView,
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
} from '@nestjs/common';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { PatternsService } from './patterns.service.js';

const uuid = new ParseUUIDPipe();

/** Block patterns (RF-EDT-07), for everyone who writes. */
@Controller('patterns')
@RequireCapability('edit_entries')
export class PatternsController {
  constructor(private readonly patterns: PatternsService) {}

  @Get()
  list(@CurrentSite() site: SiteContext, @CurrentAuth() auth: AuthContext): Promise<PatternView[]> {
    return this.patterns.list(site.id, auth);
  }

  @Post()
  create(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<PatternView> {
    return this.patterns.create(site.id, auth, parseBody(createPatternRequestSchema, body));
  }

  @Patch(':id')
  update(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
  ): Promise<PatternView> {
    return this.patterns.update(site.id, auth, id, parseBody(updatePatternRequestSchema, body));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
  ): Promise<void> {
    return this.patterns.remove(site.id, auth, id);
  }
}
