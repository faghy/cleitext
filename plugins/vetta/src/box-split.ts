/**
 * The fields of Vetta's box by their `group` (Advanced, Social networks),
 * without it: the box shows the titles. Kept apart from the box's
 * component so that it is light to load (and to test).
 */
import type { FieldDefinition } from '@cleitext/plugin-sdk';

/** A label in a language (the admin's `labelText`, kept here so this file stays light). */
function labelText(value: FieldDefinition['group'], locale: string): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  const language = locale.split('-')[0]!;
  const texts = value as Record<string, string>;
  return texts[locale] ?? texts[language] ?? texts.en ?? Object.values(texts)[0] ?? '';
}

export interface Section {
  key: string;
  title: string;
  fields: FieldDefinition[];
}

export function splitFields(
  fields: readonly FieldDefinition[],
  locale: string,
): { main: FieldDefinition[]; sections: Section[] } {
  const main: FieldDefinition[] = [];
  const sections: Section[] = [];
  for (const field of fields) {
    if (field.group === undefined) {
      main.push(field);
      continue;
    }
    const key = labelText(field.group, 'en');
    let section = sections.find((s) => s.key === key);
    if (!section) {
      section = { key, title: labelText(field.group, locale), fields: [] };
      sections.push(section);
    }
    const rest = { ...field } as Partial<FieldDefinition>;
    delete rest.group;
    section.fields.push(rest as FieldDefinition);
  }
  return { main, sections };
}
