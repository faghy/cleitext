import type { WxrMetaResult } from '@cleitext/plugin-sdk';
import type { TransferDocument } from './model.js';

/** An empty `import.wxrMeta` result: what the filter starts from. */
export function emptyWxrMetaResult(): WxrMetaResult {
  return { entries: {}, terms: {}, fieldGroups: [], optionsPages: [], options: [], warnings: [] };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isSlug = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(value);

/** Names by language (`{ en: 'Books' }`), or undefined when there are none. */
function labels(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [locale, text] of Object.entries(value)) {
    if (/^[a-z]{2,3}(-[A-Z]{2})?$/.test(locale) && typeof text === 'string' && text.trim())
      out[locale] = text.trim().slice(0, 100);
  }
  return Object.keys(out).length ? out : undefined;
}

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
 * importer creates definitions before values); since 1.49 also content
 * types and taxonomies (by slug: added, or their names and settings
 * replaced). Unknown refs are reported.
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
  // Content types and taxonomies described by plugins (plugin API 1.49), e.g. ACF's.
  for (const type of Array.isArray(result.contentTypes) ? result.contentTypes : []) {
    if (!isRecord(type) || !isSlug(type.slug)) continue;
    const name = labels(type.name);
    const found = document.contentTypes.find((t) => t.slug === type.slug);
    const permalink =
      typeof type.permalink === 'string' &&
      type.permalink.startsWith('/') &&
      type.permalink.length <= 200
        ? type.permalink
        : undefined;
    if (found) {
      if (name) found.name = name;
      if (typeof type.hierarchical === 'boolean') found.hierarchical = type.hierarchical;
      if (permalink) found.permalink = permalink;
    } else {
      document.contentTypes.push({
        slug: type.slug,
        name: name ?? { en: type.slug },
        hierarchical: type.hierarchical === true,
        permalink: permalink ?? `/${type.slug}/{slug}`,
      });
    }
  }
  for (const taxonomy of Array.isArray(result.taxonomies) ? result.taxonomies : []) {
    if (!isRecord(taxonomy) || !isSlug(taxonomy.slug)) continue;
    const name = labels(taxonomy.name);
    const types = Array.isArray(taxonomy.contentTypes)
      ? taxonomy.contentTypes.filter(isSlug).slice(0, 50)
      : [];
    const found = document.taxonomies.find((t) => t.slug === taxonomy.slug);
    if (found) {
      if (name) found.name = name;
      if (typeof taxonomy.hierarchical === 'boolean') found.hierarchical = taxonomy.hierarchical;
      found.contentTypes = [...new Set([...found.contentTypes, ...types])];
    } else {
      document.taxonomies.push({
        slug: taxonomy.slug,
        name: name ?? { en: taxonomy.slug },
        hierarchical: taxonomy.hierarchical === true,
        contentTypes: types,
      });
    }
  }
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
