import { fieldGroups, sites, withContext, type DatabaseClient } from '@cleitext/db';
import {
  ensureRowIds,
  fieldGroupSchema,
  fieldsValidator,
  locationObjects,
  matchesLocation,
  sortFieldGroups,
  typesLocation,
  type FieldDefinition,
  type FieldGroupInput,
  type FieldGroupView,
  type FieldObject,
  type FieldValues,
  type LocationScreen,
} from '@cleitext/shared';
import type { PageTemplate } from '@cleitext/theme-sdk';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { LEGACY_GROUP, PluginHost } from '../plugins/plugin-host.service.js';
import { themeFor } from '../public/themes.js';

/** A problem with a field value, as the editor shows it (`fields.<group>.<name>`). */
export interface FieldIssue {
  path: string;
  message: string;
}

export type FieldCheck =
  { ok: true; values: FieldValues; groups: FieldGroupView[] } | { ok: false; errors: FieldIssue[] };

/** Ids no group of the site's owners can take. */
export const RESERVED_IDS = new Set(['theme', 'core', 'fields', 'seo']);
/** The theme's page options (`entryFields`), stored in the document. */
export const THEME_GROUP_ID = 'theme';

/**
 * Field groups (plugin API 1.47): the site owners' (stored here), the
 * plugins' and the theme's page options, with the location rules that say
 * where each shows; and the checks of the values saved with entries, terms
 * and users.
 */
@Injectable()
export class FieldGroupsService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly plugins: PluginHost,
    private readonly audit: AuditService,
  ) {}

  private run<T>(
    siteId: string,
    userId: string | undefined,
    fn: Parameters<typeof withContext<T>>[2],
  ) {
    return withContext(this.database.db, { siteId, ...(userId ? { userId } : {}) }, fn);
  }

  // ---- The site owners' groups --------------------------------------------------------

  async listSite(siteId: string, userId?: string): Promise<FieldGroupInput[]> {
    const rows = await this.run(siteId, userId, (tx) =>
      tx.select().from(fieldGroups).orderBy(asc(fieldGroups.key)),
    );
    return rows.flatMap((row) => {
      const parsed = fieldGroupSchema.safeParse(row.definition);
      return parsed.success ? [parsed.data as FieldGroupInput] : [];
    });
  }

  async getSite(siteId: string, id: string, userId?: string): Promise<FieldGroupInput> {
    const group = (await this.listSite(siteId, userId)).find((g) => g.id === id);
    if (!group) throw new NotFoundException('There is no field group with this id.');
    return group;
  }

  /**
   * Saves a group of the site's owners: `create` refuses an id in use,
   * otherwise the group with that id is replaced (or added).
   */
  async saveSite(
    siteId: string,
    input: unknown,
    options: { auth?: AuthContext; ip?: string; create?: boolean } = {},
  ): Promise<FieldGroupInput> {
    const parsed = fieldGroupSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'The field group is not valid.',
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const group = parsed.data as FieldGroupInput;
    if (RESERVED_IDS.has(group.id)) {
      throw new BadRequestException(`The id "${group.id}" is reserved: choose another one.`);
    }
    const taken = [...this.plugins.list()].some((p) =>
      p.fieldGroups.some((g) => g.id === group.id),
    );
    if (taken) {
      throw new ConflictException(`A plugin has a field group "${group.id}": choose another id.`);
    }
    await this.run(siteId, options.auth?.userId, async (tx) => {
      const [existing] = await tx
        .select({ key: fieldGroups.key })
        .from(fieldGroups)
        .where(eq(fieldGroups.key, group.id));
      if (existing && options.create) {
        throw new ConflictException(`There is already a field group "${group.id}".`);
      }
      if (existing) {
        await tx
          .update(fieldGroups)
          .set({ definition: group, updatedAt: new Date() })
          .where(eq(fieldGroups.key, group.id));
      } else {
        await tx.insert(fieldGroups).values({ siteId, key: group.id, definition: group });
      }
      await this.audit.record(tx, {
        siteId,
        userId: options.auth?.userId ?? null,
        action: existing ? 'field_group.updated' : 'field_group.created',
        targetType: 'field_group',
        targetId: group.id,
        ip: options.ip ?? '',
      });
    });
    return group;
  }

  /** Removes a group of the site's owners; values saved with it stay with the entries. */
  async removeSite(
    siteId: string,
    id: string,
    options: { auth?: AuthContext; ip?: string } = {},
  ): Promise<void> {
    await this.run(siteId, options.auth?.userId, async (tx) => {
      const removed = await tx
        .delete(fieldGroups)
        .where(and(eq(fieldGroups.siteId, siteId), eq(fieldGroups.key, id)))
        .returning({ key: fieldGroups.key });
      if (removed.length === 0)
        throw new NotFoundException('There is no field group with this id.');
      await this.audit.record(tx, {
        siteId,
        userId: options.auth?.userId ?? null,
        action: 'field_group.deleted',
        targetType: 'field_group',
        targetId: id,
        ip: options.ip ?? '',
      });
    });
  }

  // ---- Every group --------------------------------------------------------------------

  /** The active theme with its plugins' extensions. */
  private async theme(siteId: string) {
    const [site] = await this.run(siteId, undefined, (tx) =>
      tx.select({ theme: sites.themeSlug }).from(sites).where(eq(sites.id, siteId)),
    );
    return this.plugins.effectiveTheme(siteId, themeFor(site?.theme));
  }

  /** The theme's page options (`entryFields`) as a group, kept in the document's `editor.data`. */
  private themeGroup(entryFields: { types?: string[]; fields: FieldDefinition[] } | undefined) {
    if (!entryFields || entryFields.fields.length === 0) return null;
    const group: FieldGroupView = {
      id: THEME_GROUP_ID,
      title: { en: 'Page options', it: 'Opzioni della pagina' },
      fields: entryFields.fields,
      location: typesLocation(entryFields.types ?? ['*']),
      position: 'side',
      order: -100,
      source: 'theme',
      storage: 'document',
    };
    return group;
  }

  /** Page templates of the active theme (`pageTemplates`). */
  async pageTemplates(siteId: string): Promise<PageTemplate[]> {
    return (await this.theme(siteId)).pageTemplates ?? [];
  }

  /**
   * The groups of a site, in order: the owners' (active ones), the plugins'
   * and the theme's; only those for an object when given.
   */
  async groups(siteId: string, object?: FieldObject): Promise<FieldGroupView[]> {
    const theme = await this.theme(siteId);
    const all: FieldGroupView[] = [
      ...(await this.listSite(siteId))
        .filter((g) => g.active !== false)
        .map((g) => ({ ...withoutActive(g), source: 'site' as const })),
      ...(await this.plugins.pluginFieldGroups(siteId)),
    ];
    const themeGroup = this.themeGroup(theme.entryFields);
    if (themeGroup) all.push(themeGroup);
    const wanted = object ? all.filter((g) => locationObjects(g.location ?? []).has(object)) : all;
    return sortFieldGroups(wanted);
  }

  /** The groups whose rules match what is edited. */
  async matching(siteId: string, screen: LocationScreen): Promise<FieldGroupView[]> {
    return (await this.groups(siteId, screen.object)).filter((g) =>
      matchesLocation(g.location ?? [], screen),
    );
  }

  // ---- Checks of values -----------------------------------------------------------------

  /**
   * Checks the values of an object's own fields (top level) and of the groups
   * shown for it (under `values[<group id>]`). Drafts (`partial`) may leave
   * required fields empty. Values of groups not shown are kept as they are.
   * Every list row gets a stable `_id`.
   */
  async check(
    siteId: string,
    own: readonly FieldDefinition[],
    values: FieldValues,
    screen: LocationScreen,
    options: { partial?: boolean } = {},
  ): Promise<FieldCheck> {
    const groups = (await this.matching(siteId, screen)).filter((g) => g.storage !== 'document');
    const relax = (list: readonly FieldDefinition[]) =>
      options.partial ? list.map((f) => ({ ...f, required: false }) as FieldDefinition) : list;
    const errors: FieldIssue[] = [];
    let result: FieldValues = { ...values };
    const parsedOwn = fieldsValidator(relax(own)).safeParse(values);
    if (parsedOwn.success) result = ensureRowIds(own, { ...result, ...parsedOwn.data });
    else
      for (const i of parsedOwn.error.issues)
        errors.push({ path: `fields.${i.path.join('.')}`, message: i.message });
    for (const group of groups) {
      let value = values[group.id];
      if (value === undefined || value === null) {
        // Groups registered as before 1.47 are checked only when they have values.
        if (options.partial || (group as { [LEGACY_GROUP]?: true })[LEGACY_GROUP]) continue;
        value = {};
      }
      if (typeof value !== 'object' || Array.isArray(value)) {
        errors.push({
          path: `fields.${group.id}`,
          message: 'Expected the values of a field group',
        });
        continue;
      }
      const parsed = fieldsValidator(relax(group.fields)).safeParse(value);
      if (parsed.success) result[group.id] = ensureRowIds(group.fields, parsed.data);
      else
        for (const i of parsed.error.issues)
          errors.push({ path: `fields.${group.id}.${i.path.join('.')}`, message: i.message });
    }
    return errors.length ? { ok: false, errors } : { ok: true, values: result, groups };
  }
}

function withoutActive(group: FieldGroupInput): FieldGroupView {
  const view: FieldGroupInput = { ...group };
  delete view.active;
  return view;
}
