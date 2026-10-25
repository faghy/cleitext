import { contentTypes, taxonomies, withContext, type Database } from '@cleitext/db';
import { locationObjects, mayMatchType } from '@cleitext/shared';
import { taxonomyFields } from '../content/terms.service.js';
import type { FieldGroupsService } from '../fields/field-groups.service.js';
import type { PluginHost } from '../plugins/plugin-host.service.js';
import type { ExportFieldDefinitions, FieldSet } from './exporter.js';

/**
 * A site's field definitions for an export (plugin API 1.47): field values
 * then refer to media, entries, terms and users by ref, so that an import
 * into another site points to the imported ones.
 */
export async function exportFieldDefinitions(
  db: Database,
  host: PluginHost,
  groups: FieldGroupsService,
  siteId: string,
): Promise<ExportFieldDefinitions> {
  const { types, taxonomyRows } = await withContext(db, { siteId }, async (tx) => ({
    types: await tx.select().from(contentTypes),
    taxonomyRows: await tx.select().from(taxonomies),
  }));
  const all = (await groups.groups(siteId)).filter((g) => g.storage !== 'document');
  const entrySets = new Map<string, FieldSet>();
  for (const type of types) {
    entrySets.set(type.slug, {
      own: (await host.fieldsFor(siteId, type)).fields,
      groups: all.filter((g) => mayMatchType(g.location ?? [], type.slug)),
    });
  }
  const termGroups = all.filter((g) => locationObjects(g.location ?? []).has('term'));
  return {
    entry: (type) => entrySets.get(type) ?? { own: [], groups: all },
    term: (taxonomy) => {
      const row = taxonomyRows.find((t) => t.slug === taxonomy);
      return { own: row ? taxonomyFields(row) : [], groups: termGroups };
    },
    user: { own: [], groups: all.filter((g) => locationObjects(g.location ?? []).has('user')) },
  };
}
