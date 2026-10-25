import {
  applyBindings,
  hasBindings,
  type BindingResolver,
  type BoundValue,
  type CxdDocument,
} from '@cleitext/blocks';
import type { BlockPage, DynamicSourceInfo } from '@cleitext/plugin-sdk';
import { fieldValueKind, labelText, type FieldDefinition } from '@cleitext/shared';
import { Injectable } from '@nestjs/common';
import { DynamicSourcesService, rowsOf } from './dynamic-sources.service.js';

/** What bindings are resolved against when a page is rendered. */
export interface BindingPageContext {
  locale: string;
  /** The page being rendered, as blocks see it (its entry, archive, site). */
  page: BlockPage;
  /** The options pages' values formatted in the page's language, when already loaded. */
  options?: Record<string, Record<string, unknown>>;
}

/**
 * Block bindings, Field and Field rows blocks (plugin API 1.48): their
 * sources resolved on the server, before rendering (which is synchronous),
 * with the dynamic sources shared with Fresco and themes.
 */
@Injectable()
export class BindingsService {
  constructor(private readonly dynamic: DynamicSourcesService) {}

  /**
   * A resolver for a page: values with their kind, rows with what each row
   * is. `rows` (plugin API 1.49) describes a row given by a plugin block
   * (`renderBlocks`): the fields of the rows whose scope has that `rowSource`.
   */
  async resolver(
    siteId: string,
    context: BindingPageContext,
    rows?: { source: string; fields: readonly FieldDefinition[] },
  ): Promise<BindingResolver> {
    const infos = new Map<string, DynamicSourceInfo>();
    const index = (list: DynamicSourceInfo[], prefix = '') => {
      for (const info of list) {
        infos.set(`${prefix}${info.id}`, info);
        if (info.rows) index(info.rows as DynamicSourceInfo[], `${prefix}${info.id}|`);
      }
    };
    index(await this.dynamic.sources(siteId, { hidden: true }));
    if (rows) {
      index(
        rows.fields.map((field) => ({
          id: `row.field:${field.name}`,
          label: labelText(field.label),
          type: fieldValueKind(field),
          ...rowsOf(field),
        })),
        `${rows.source}|`,
      );
    }
    const info = (key: string, rowSource?: string) =>
      (rowSource && key.startsWith('row.field:') ? infos.get(`${rowSource}|${key}`) : undefined) ??
      infos.get(key);
    return async (key, scope): Promise<BoundValue | undefined> => {
      const known = info(key, scope.rowSource);
      let value: unknown;
      if (key.startsWith('option.field:') && context.options) {
        const rest = key.slice('option.field:'.length);
        const dot = rest.indexOf('.');
        value = dot > 0 ? context.options[rest.slice(0, dot)]?.[rest.slice(dot + 1)] : undefined;
      } else {
        value = await this.dynamic.resolve(siteId, key, {
          locale: context.locale,
          page: context.page,
          ...(scope.entry ? { entry: scope.entry } : {}),
          ...(scope.term ? { term: scope.term } : {}),
          ...(scope.user ? { user: scope.user } : {}),
          ...(scope.row ? { row: scope.row } : {}),
        });
      }
      if (value === undefined) return undefined;
      return {
        value,
        ...(known?.type ? { kind: known.type } : {}),
        ...(known?.rowKind ? { rowKind: known.rowKind } : {}),
      };
    };
  }

  /**
   * Documents with their bindings resolved (the same objects when they have
   * none): in place, by key, for the entry, the theme's areas and
   * locations, and the synced patterns of a page.
   */
  async apply<K>(
    siteId: string,
    documents: Map<K, CxdDocument>,
    context: BindingPageContext,
  ): Promise<Map<K, CxdDocument>> {
    const bound = [...documents].filter(([, doc]) => hasBindings(doc));
    if (bound.length === 0) return documents;
    const resolve = await this.resolver(siteId, context);
    const out = new Map(documents);
    for (const [key, doc] of bound) {
      out.set(key, await applyBindings(doc, { resolve, locale: context.locale }));
    }
    return out;
  }
}
