import {
  fieldDefaults,
  fieldsValidator,
  menuItemFieldApplies,
  type FieldDefinition,
  type MenuItemField,
} from '@cleitext/shared';

/**
 * Values of the options a theme declares for menu items (`menuItemFields`,
 * plugin API 1.34), stored in `menu_items.data` by field name.
 */

/** The options of an item at a depth (0: first level). */
export function menuItemFieldsAt(
  items: readonly MenuItemField[] | undefined,
  depth: number,
): FieldDefinition[] {
  return (items ?? []).filter((item) => menuItemFieldApplies(item, depth)).map((i) => i.field);
}

export type MenuItemDataResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; errors: { path: string; message: string }[] };

/**
 * Checks the values given for an item against its options: unknown keys are
 * dropped, empty values removed. `stored` are the item's values saved before:
 * those of options not declared at its level now (a theme or plugin inactive)
 * are kept.
 */
export function validMenuItemData(
  fields: readonly FieldDefinition[],
  given: Record<string, unknown> | undefined,
  stored: Record<string, unknown> | undefined,
): MenuItemDataResult {
  const known = new Set(fields.map((f) => f.name));
  const parsed = fieldsValidator(fields).safeParse(
    Object.fromEntries(Object.entries(given ?? {}).filter(([key]) => known.has(key))),
  );
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }
  const kept = Object.entries(stored ?? {}).filter(([key]) => !known.has(key));
  const values = Object.entries(parsed.data).filter(
    ([key, value]) => known.has(key) && value !== null && value !== undefined,
  );
  return { ok: true, data: Object.fromEntries([...kept, ...values]) };
}

/** What the theme gets for an item: its options' values over their defaults, nothing else. */
export function publicMenuItemData(
  fields: readonly FieldDefinition[],
  stored: unknown,
): Record<string, unknown> {
  const values = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  const data: Record<string, unknown> = fieldDefaults(fields);
  for (const field of fields) {
    const value = values[field.name];
    if (value !== null && value !== undefined) data[field.name] = value;
  }
  return data;
}
