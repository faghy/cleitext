import type { WxrMetaItem, WxrMetaResult } from '@cleitext/plugin-sdk';

/**
 * The place of each imported entry from a WordPress meta (an ACF field such as
 * `comune`, or any post meta): added to the entries' values of `group`.
 */
export function importPlaces(
  result: WxrMetaResult,
  items: Pick<WxrMetaItem, 'ref' | 'imported' | 'meta'>[],
  key: string,
  group: string,
): WxrMetaResult {
  const entries = { ...result.entries };
  let count = 0;
  for (const item of items) {
    const value = item.meta[key]?.trim();
    // ACF also keeps `_comune` = `field_…` (the field's key): only the value counts.
    if (!item.imported || !value || /^field_[0-9a-f]+$/i.test(value)) continue;
    entries[item.ref] = { ...(entries[item.ref] ?? {}), [group]: { place: value.slice(0, 120) } };
    count++;
  }
  if (count === 0) return result;
  return {
    ...result,
    entries,
    warnings: [...result.warnings, `Setax: the place (${key}) of ${count} entries was imported.`],
  };
}
