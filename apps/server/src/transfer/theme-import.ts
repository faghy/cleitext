import type { WxrMetaInput } from '@cleitext/plugin-sdk';
import { fieldsValidator, renameCssSelectors } from '@cleitext/shared';
import type { ThemeDefinition } from '@cleitext/theme-sdk';
import type { TransferDocument } from './model.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * What the active theme makes of a WordPress import (core 0.82): its page
 * options from each item's post meta (`importEntryMeta`, kept in the
 * entry's `document.editor.data` as the editor keeps them), and the
 * Additional CSS with its class and id names (`importCssPrefixes`). Returns
 * lines for the import report.
 */
export function withThemeImport(
  document: TransferDocument,
  theme: ThemeDefinition,
  wxrMeta: WxrMetaInput | undefined,
): string[] {
  const warnings: string[] = [];
  if (document.source.kind !== 'wordpress') return warnings;

  // Page options from the post meta: only values the theme's fields accept.
  const fields = theme.entryFields?.fields ?? [];
  if (theme.importEntryMeta && fields.length > 0 && wxrMeta && Array.isArray(wxrMeta.items)) {
    const entries = new Map(document.entries.map((e) => [e.ref, e]));
    let pages = 0;
    for (const item of wxrMeta.items) {
      const entry = item.imported ? entries.get(item.ref) : undefined;
      if (!entry || !isRecord(item.meta)) continue;
      let values: Record<string, unknown> | null;
      try {
        values = theme.importEntryMeta({ type: String(item.type ?? ''), meta: item.meta });
      } catch {
        values = null;
      }
      if (!isRecord(values)) continue;
      const accepted: Record<string, unknown> = {};
      for (const field of fields) {
        if (!(field.name in values)) continue;
        if (fieldsValidator([field]).safeParse({ [field.name]: values[field.name] }).success)
          accepted[field.name] = values[field.name];
      }
      if (Object.keys(accepted).length === 0) continue;
      const editor = entry.document.editor ?? { id: 'blocks' };
      // What the importer already set (a page builder's settings) stays.
      editor.data = { ...accepted, ...(editor.data ?? {}) };
      entry.document = { ...entry.document, editor };
      pages++;
    }
    if (pages > 0) {
      warnings.push(
        `${pages} entr${pages === 1 ? 'y keeps its' : 'ies keep their'} page options of the WordPress theme (container, background…) as ${theme.name}'s.`,
      );
    }
  }

  // Additional CSS written for the classes the theme renames.
  const prefixes = theme.importCssPrefixes;
  const css = document.site.additionalCss?.site;
  if (prefixes && isRecord(prefixes) && css) {
    const renamed = renameCssSelectors(css, prefixes as Record<string, string>);
    if (renamed.renamed > 0) {
      document.site.additionalCss = { ...document.site.additionalCss, site: renamed.css };
      warnings.push(
        `The Additional CSS names ${theme.name}'s classes: ${renamed.renamed} class and id name${renamed.renamed === 1 ? ' was' : 's were'} renamed (${Object.entries(
          prefixes,
        )
          .map(([from, to]) => `.${from} → .${to}`)
          .join(', ')}), in selectors only.`,
      );
    }
  }
  return warnings;
}
