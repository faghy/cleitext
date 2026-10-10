import {
  entries,
  menuItems,
  menus,
  newId,
  sites,
  terms,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import { safeUrl } from '@cleitext/renderer';
import type { MenuItemInput, MenuItemNode, MenuView, ThemeInfo } from '@cleitext/shared';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import type { AuthContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { LanguagesService } from '../content/languages.service.js';
import { PageCacheService } from '../public/page-cache.service.js';
import { themeFor } from '../public/themes.js';
import { nextFreeSlug, slugify } from '../content/slug.js';

type MenuRow = typeof menus.$inferSelect;
type ItemRow = typeof menuItems.$inferSelect;

/** Menus and their items (RF-NAV-01/02/03). */
@Injectable()
export class MenusService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly cache: PageCacheService,
    private readonly languages: LanguagesService,
  ) {}

  private run<T>(siteId: string, auth: AuthContext, fn: (tx: SiteTransaction) => Promise<T>) {
    return withContext(this.database.db, { siteId, userId: auth.userId }, fn);
  }

  async currentTheme(siteId: string, auth: AuthContext): Promise<ThemeInfo> {
    return this.run(siteId, auth, async (tx) => {
      const [site] = await tx
        .select({ theme: sites.themeSlug })
        .from(sites)
        .where(eq(sites.id, siteId));
      const theme = themeFor(site?.theme);
      return {
        slug: theme.slug,
        name: theme.name,
        version: theme.version,
        menuLocations: theme.menuLocations,
      };
    });
  }

  list(siteId: string, auth: AuthContext, locale?: string): Promise<MenuView[]> {
    return this.run(siteId, auth, async (tx) => {
      const rows = await tx
        .select()
        .from(menus)
        .where(locale ? eq(menus.locale, locale) : undefined)
        .orderBy(asc(menus.locale), asc(menus.name));
      return Promise.all(rows.map((menu) => this.view(tx, menu)));
    });
  }

  get(siteId: string, auth: AuthContext, id: string): Promise<MenuView> {
    return this.run(siteId, auth, async (tx) => this.view(tx, await this.load(tx, id)));
  }

  async create(
    siteId: string,
    auth: AuthContext,
    input: { name: string; locale?: string | undefined; location?: string | null | undefined },
  ): Promise<MenuView> {
    const view = await this.run(siteId, auth, async (tx) => {
      const locale = input.locale ?? (await this.defaultLocale(tx, siteId));
      await this.assertLocale(tx, siteId, locale);
      const taken = await tx
        .select({ slug: menus.slug })
        .from(menus)
        .where(eq(menus.locale, locale));
      const slug = nextFreeSlug(slugify(input.name) || 'menu', new Set(taken.map((m) => m.slug)));
      const id = newId();
      await tx.insert(menus).values({ id, siteId, slug, name: input.name, locale, location: null });
      if (input.location) await this.assignLocation(tx, siteId, id, locale, input.location);
      return this.view(tx, await this.load(tx, id));
    });
    await this.cache.invalidate(siteId, [`menus:${view.locale}`]);
    return view;
  }

  async update(
    siteId: string,
    auth: AuthContext,
    id: string,
    input: { name?: string | undefined; location?: string | null | undefined },
  ): Promise<MenuView> {
    const view = await this.run(siteId, auth, async (tx) => {
      const menu = await this.load(tx, id);
      if (input.name !== undefined)
        await tx.update(menus).set({ name: input.name }).where(eq(menus.id, id));
      if (input.location !== undefined) {
        if (input.location === null)
          await tx.update(menus).set({ location: null }).where(eq(menus.id, id));
        else await this.assignLocation(tx, siteId, id, menu.locale, input.location);
      }
      return this.view(tx, await this.load(tx, id));
    });
    await this.cache.invalidate(siteId, [`menus:${view.locale}`]);
    return view;
  }

  async remove(siteId: string, auth: AuthContext, id: string): Promise<void> {
    const locale = await this.run(siteId, auth, async (tx) => {
      const menu = await this.load(tx, id);
      await tx.delete(menus).where(eq(menus.id, id));
      return menu.locale;
    });
    await this.cache.invalidate(siteId, [`menus:${locale}`]);
  }

  /** Replaces the whole item tree in one transaction. */
  async replaceItems(
    siteId: string,
    auth: AuthContext,
    id: string,
    items: MenuItemInput[],
  ): Promise<MenuView> {
    const view = await this.run(siteId, auth, async (tx) => {
      const menu = await this.load(tx, id);
      await this.validateItems(tx, menu.locale, items);
      await tx.delete(menuItems).where(eq(menuItems.menuId, id));
      const rows: (typeof menuItems.$inferInsert)[] = [];
      const walk = (list: MenuItemInput[], parentId: string | null, depth: number) => {
        if (depth > 5) throw new BadRequestException('Menus can be nested up to 5 levels.');
        list.forEach((item, position) => {
          const itemId = newId();
          rows.push({
            id: itemId,
            siteId,
            menuId: id,
            parentId,
            position,
            kind: item.kind,
            entryId: item.kind === 'entry' ? item.entryId! : null,
            termId: item.kind === 'term' ? item.termId! : null,
            url: item.kind === 'url' ? item.url!.trim() : null,
            label: item.label?.trim() || null,
            target: item.target ?? null,
          });
          walk(item.children ?? [], itemId, depth + 1);
        });
      };
      walk(items, null, 1);
      if (rows.length > 0) await tx.insert(menuItems).values(rows);
      return this.view(tx, menu);
    });
    await this.cache.invalidate(siteId, [`menus:${view.locale}`]);
    return view;
  }

  // ---- Internals ----------------------------------------------------------------

  private async validateItems(
    tx: SiteTransaction,
    locale: string,
    items: MenuItemInput[],
  ): Promise<void> {
    const all: MenuItemInput[] = [];
    const flatten = (list: MenuItemInput[]) =>
      list.forEach((i) => (all.push(i), flatten(i.children ?? [])));
    flatten(items);
    if (all.length > 200) throw new BadRequestException('A menu can have up to 200 items.');

    const entryIds = all.filter((i) => i.kind === 'entry').map((i) => i.entryId);
    const termIds = all.filter((i) => i.kind === 'term').map((i) => i.termId);
    if (entryIds.some((e) => !e) || termIds.some((t) => !t)) {
      throw new BadRequestException('Entry and term items need their id.');
    }
    if (entryIds.length) {
      const found = await tx
        .select({ id: entries.id })
        .from(entries)
        .where(
          and(
            inArray(entries.id, entryIds as string[]),
            eq(entries.locale, locale),
            ne(entries.status, 'trashed'),
          ),
        );
      if (found.length !== new Set(entryIds).size) {
        throw new BadRequestException('Some linked entries do not exist in the menu language.');
      }
    }
    if (termIds.length) {
      const found = await tx
        .select({ id: terms.id })
        .from(terms)
        .where(and(inArray(terms.id, termIds as string[]), eq(terms.locale, locale)));
      if (found.length !== new Set(termIds).size) {
        throw new BadRequestException('Some linked terms do not exist in the menu language.');
      }
    }
    for (const item of all) {
      if (item.kind === 'url' && (!item.url || !safeUrl(item.url) || !item.label?.trim())) {
        throw new BadRequestException(
          'Custom links need a label and a valid URL (http, https, mailto, tel or relative).',
        );
      }
      if (item.kind === 'custom' && !item.label?.trim()) {
        throw new BadRequestException('Text items need a label.');
      }
    }
  }

  /** A theme location shows one menu per language. */
  private async assignLocation(
    tx: SiteTransaction,
    siteId: string,
    menuId: string,
    locale: string,
    location: string,
  ): Promise<void> {
    const [site] = await tx
      .select({ theme: sites.themeSlug })
      .from(sites)
      .where(eq(sites.id, siteId));
    if (!(location in themeFor(site?.theme).menuLocations)) {
      throw new BadRequestException(`The theme has no "${location}" menu location.`);
    }
    await tx
      .update(menus)
      .set({ location: null })
      .where(and(eq(menus.locale, locale), eq(menus.location, location), ne(menus.id, menuId)));
    await tx.update(menus).set({ location }).where(eq(menus.id, menuId));
  }

  private async view(tx: SiteTransaction, menu: MenuRow): Promise<MenuView> {
    const items = await tx
      .select()
      .from(menuItems)
      .where(eq(menuItems.menuId, menu.id))
      .orderBy(asc(menuItems.position));
    const entryIds = items.map((i) => i.entryId).filter((id): id is string => Boolean(id));
    const termIds = items.map((i) => i.termId).filter((id): id is string => Boolean(id));
    const entryTitles = new Map(
      (entryIds.length
        ? await tx
            .select({ id: entries.id, title: entries.title })
            .from(entries)
            .where(inArray(entries.id, entryIds))
        : []
      ).map((e) => [e.id, e.title]),
    );
    const termNames = new Map(
      (termIds.length
        ? await tx
            .select({ id: terms.id, name: terms.name })
            .from(terms)
            .where(inArray(terms.id, termIds))
        : []
      ).map((t) => [t.id, t.name]),
    );
    const build = (parentId: string | null): MenuItemNode[] =>
      items
        .filter((i) => i.parentId === parentId)
        .map((item: ItemRow) => ({
          id: item.id,
          kind: item.kind as MenuItemNode['kind'],
          entryId: item.entryId,
          termId: item.termId,
          url: item.url,
          label: item.label,
          target: item.target === '_blank' ? '_blank' : null,
          displayLabel:
            item.label ||
            (item.entryId ? entryTitles.get(item.entryId) : undefined) ||
            (item.termId ? termNames.get(item.termId) : undefined) ||
            item.url ||
            '(untitled)',
          children: build(item.id),
        }));
    return {
      id: menu.id,
      slug: menu.slug,
      name: menu.name,
      locale: menu.locale,
      location: menu.location,
      items: build(null),
    };
  }

  private async load(tx: SiteTransaction, id: string): Promise<MenuRow> {
    const [menu] = await tx.select().from(menus).where(eq(menus.id, id));
    if (!menu) throw new NotFoundException('Menu not found.');
    return menu;
  }

  private async defaultLocale(tx: SiteTransaction, siteId: string): Promise<string> {
    const [site] = await tx
      .select({ locale: sites.defaultLocale })
      .from(sites)
      .where(eq(sites.id, siteId));
    return site?.locale ?? 'en';
  }

  private async assertLocale(tx: SiteTransaction, siteId: string, locale: string): Promise<void> {
    if (!(await this.languages.allowed(siteId, await this.defaultLocale(tx, siteId), locale)))
      throw new BadRequestException(`The language "${locale}" is not enabled on this site.`);
  }
}
