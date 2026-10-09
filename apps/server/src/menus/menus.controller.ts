import {
  createMenuRequestSchema,
  replaceMenuItemsRequestSchema,
  updateMenuRequestSchema,
  type MenuView,
  type ThemeInfo,
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
} from '@nestjs/common';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { MenusService } from './menus.service.js';

const uuid = new ParseUUIDPipe();

/** Menus and the active theme's locations (docs/SPECIFICATIONS.md §6.3). */
@Controller()
@RequireCapability('manage_menus')
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Get('themes/current')
  theme(@CurrentSite() site: SiteContext, @CurrentAuth() auth: AuthContext): Promise<ThemeInfo> {
    return this.menusService.currentTheme(site.id, auth);
  }

  @Get('menus')
  list(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Query('locale') locale: string | undefined,
  ): Promise<MenuView[]> {
    return this.menusService.list(site.id, auth, locale);
  }

  @Post('menus')
  create(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<MenuView> {
    return this.menusService.create(site.id, auth, parseBody(createMenuRequestSchema, body));
  }

  @Get('menus/:id')
  get(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
  ): Promise<MenuView> {
    return this.menusService.get(site.id, auth, id);
  }

  @Patch('menus/:id')
  update(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
  ): Promise<MenuView> {
    return this.menusService.update(site.id, auth, id, parseBody(updateMenuRequestSchema, body));
  }

  @Put('menus/:id/items')
  replaceItems(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
  ): Promise<MenuView> {
    const { items } = parseBody(replaceMenuItemsRequestSchema, body);
    return this.menusService.replaceItems(site.id, auth, id, items);
  }

  @Delete('menus/:id')
  @HttpCode(204)
  async remove(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
  ): Promise<void> {
    await this.menusService.remove(site.id, auth, id);
  }
}
