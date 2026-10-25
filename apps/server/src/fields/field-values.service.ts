import { contentTypes, taxonomies, userFields, type SiteTransaction } from '@cleitext/db';
import { matchesLocation, mayMatchType } from '@cleitext/shared';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { taxonomyFields } from '../content/terms.service.js';
import { PluginHost } from '../plugins/plugin-host.service.js';
import type { UrlBuilder } from '../public/urls.js';
import { FieldGroupsService } from './field-groups.service.js';
import { formatContext, formattedFields } from './field-format.js';

/** Where formatted values are computed: the transaction and what addresses need. */
export interface FormatScope {
  tx: SiteTransaction;
  siteId: string;
  locale: string;
  /** The site's addresses, for entries referred to by fields (empty addresses without). */
  urls: UrlBuilder | null;
}

/**
 * Field values formatted for templates and dynamic data (plugin API 1.47):
 * an entry's, a term's or a person's, by field name and `group.name`.
 * Values are found by name whatever the group's rules (like ACF's `get_field`).
 */
@Injectable()
export class FieldValuesService {
  constructor(
    private readonly plugins: PluginHost,
    private readonly fieldGroups: FieldGroupsService,
  ) {}

  async entry(
    scope: FormatScope,
    typeSlug: string,
    values: Record<string, unknown>,
  ): Promise<Record<string, unknown> | undefined> {
    if (Object.keys(values).length === 0) return undefined;
    const [type] = await scope.tx
      .select()
      .from(contentTypes)
      .where(eq(contentTypes.slug, typeSlug));
    if (!type) return undefined;
    const { fields: own } = await this.plugins.fieldsFor(scope.siteId, type);
    const groups = (await this.fieldGroups.groups(scope.siteId, 'entry')).filter(
      (g) => g.storage !== 'document' && mayMatchType(g.location ?? [], type.slug),
    );
    return formattedFields(own, groups, values, this.context(scope));
  }

  async term(
    scope: FormatScope,
    taxonomySlug: string,
    values: Record<string, unknown> | undefined,
  ): Promise<Record<string, unknown> | undefined> {
    if (!values || Object.keys(values).length === 0) return undefined;
    const [taxonomy] = await scope.tx
      .select()
      .from(taxonomies)
      .where(eq(taxonomies.slug, taxonomySlug));
    if (!taxonomy) return undefined;
    const groups = (await this.fieldGroups.groups(scope.siteId, 'term')).filter((g) =>
      matchesLocation(g.location ?? [], { object: 'term', taxonomy: taxonomySlug }),
    );
    return formattedFields(taxonomyFields(taxonomy), groups, values, this.context(scope));
  }

  async user(scope: FormatScope, userId: string): Promise<Record<string, unknown> | undefined> {
    const [row] = await scope.tx.select().from(userFields).where(eq(userFields.userId, userId));
    const values = row?.fields as Record<string, unknown> | undefined;
    if (!values || Object.keys(values).length === 0) return undefined;
    const groups = await this.fieldGroups.groups(scope.siteId, 'user');
    return formattedFields([], groups, values, this.context(scope));
  }

  private context(scope: FormatScope) {
    return formatContext(scope.tx, scope.siteId, scope.locale, scope.urls);
  }
}
