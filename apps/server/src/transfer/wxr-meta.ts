import type { WxrMetaResult } from '@cleitext/plugin-sdk';
import type { TransferDocument } from './model.js';

/** An empty `import.wxrMeta` result: what the filter starts from. */
export function emptyWxrMetaResult(): WxrMetaResult {
  return { entries: {}, terms: {}, fieldGroups: [], optionsPages: [], options: [], warnings: [] };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Field values added to a record's: a group's values merged with the group's, others replaced. */
function mergeValues(
  current: Record<string, unknown> | undefined,
  added: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...current };
  for (const [key, value] of Object.entries(added)) {
    out[key] =
      isRecord(value) && isRecord(out[key])
        ? { ...(out[key] as Record<string, unknown>), ...value }
        : value;
  }
  return out;
}

/**
 * A transfer document with what the plugins made of a WordPress export's
 * meta (`import.wxrMeta`, plugin API 1.48): field values of entries and
 * terms by ref, field groups, options pages and option values (the
 * importer creates definitions before values). Unknown refs are reported.
 */
export function withWxrMeta(document: TransferDocument, result: WxrMetaResult): string[] {
  const warnings = [...(Array.isArray(result.warnings) ? result.warnings : [])].filter(
    (w): w is string => typeof w === 'string',
  );
  const entries = new Map(document.entries.map((e) => [e.ref, e]));
  let missing = 0;
  for (const [ref, values] of Object.entries(isRecord(result.entries) ? result.entries : {})) {
    const entry = entries.get(ref);
    if (!entry || !isRecord(values)) {
      missing++;
      continue;
    }
    entry.fields = mergeValues(entry.fields, values);
  }
  const terms = new Map(document.terms.map((t) => [t.ref, t]));
  for (const [ref, values] of Object.entries(isRecord(result.terms) ? result.terms : {})) {
    const term = terms.get(ref);
    if (!term || !isRecord(values)) {
      missing++;
      continue;
    }
    term.fields = mergeValues(term.fields, values);
  }
  if (missing > 0) {
    warnings.push(`${missing} set(s) of field values were for items that are not imported.`);
  }
  if (Array.isArray(result.fieldGroups))
    document.fieldGroups.push(
      ...result.fieldGroups.filter(isRecord).map((g) => g as unknown as Record<string, unknown>),
    );
  if (Array.isArray(result.optionsPages))
    document.optionsPages.push(
      ...result.optionsPages.filter(isRecord).map((p) => p as unknown as Record<string, unknown>),
    );
  if (Array.isArray(result.options)) {
    for (const option of result.options) {
      if (!isRecord(option) || typeof option.page !== 'string' || !isRecord(option.fields))
        continue;
      document.options.push({
        page: option.page,
        ...(typeof option.locale === 'string' ? { locale: option.locale } : {}),
        fields: option.fields,
      });
    }
  }
  return warnings;
}
