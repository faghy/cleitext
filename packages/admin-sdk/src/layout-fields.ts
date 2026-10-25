import type { CustomField, FieldDefinition } from '@cleitext/shared';
import type { AdminFieldTypeDefinition } from './field-types.js';

/** A field as a form draws it: on its own, or a layout field with the fields it groups. */
export interface LayoutSlot {
  field: FieldDefinition;
  /** Its position among the fields given. */
  index: number;
  /** Drawn by its admin type with `layout` (plugin API 1.49). */
  layout: boolean;
  /** The fields after it that it groups (layout fields only). */
  grouped: FieldDefinition[];
}

/**
 * The fields of a form as it draws them (plugin API 1.49): a layout field
 * (`layout: true`) takes the fields its `groups` names after it, which the
 * form then leaves to it.
 */
export function planLayout(
  fields: readonly FieldDefinition[],
  typeOf: (type: string) => AdminFieldTypeDefinition | undefined,
): LayoutSlot[] {
  const slots: LayoutSlot[] = [];
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index]!;
    const type = field.type.includes('/') ? typeOf(field.type) : undefined;
    if (!type?.layout) {
      slots.push({ field, index, layout: false, grouped: [] });
      continue;
    }
    const following = fields.slice(index + 1);
    let count: number;
    try {
      count = Math.trunc(Number(type.groups?.(field as CustomField, following) ?? 0));
    } catch {
      count = 0;
    }
    if (!Number.isFinite(count) || count < 0) count = 0;
    const grouped = following.slice(0, Math.min(count, following.length));
    slots.push({ field, index, layout: true, grouped });
    index += grouped.length;
  }
  return slots;
}
