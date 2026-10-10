import { z } from 'zod';

/**
 * Field DSL (docs/SPECIFICATIONS.md §10): custom fields of content types,
 * block attributes and plugin settings are described with the same small
 * vocabulary. The server validates values with `fieldsValidator()`; the admin
 * builds its forms from the same definitions.
 */

/** A label, either plain or per locale: `{ en: 'Date', it: 'Data' }`. */
export type Label = string | Record<string, string>;

interface BaseField {
  /** Key of the value, e.g. `startsAt`. */
  name: string;
  label: Label;
  help?: Label;
  required?: boolean;
  /**
   * In other languages (with a language plugin): `translate` (default) is
   * copied into a new translation and then edited there; `copy` stays the
   * same as in the original; `ignore` starts empty. Like WPML's
   * custom-field settings.
   */
  translation?: 'translate' | 'copy' | 'ignore';
}

export interface TextField extends BaseField {
  type: 'text';
  maxLength?: number;
  multiline?: boolean;
  default?: string;
}
export interface UrlField extends BaseField {
  type: 'url';
  default?: string;
}
export interface NumberField extends BaseField {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
  default?: number;
}
export interface BooleanField extends BaseField {
  type: 'boolean';
  default?: boolean;
}
export interface DateField extends BaseField {
  /** `date`: YYYY-MM-DD · `datetime`: ISO 8601 with time zone. */
  type: 'date' | 'datetime';
  default?: string;
}
export interface SelectField extends BaseField {
  type: 'select';
  options: { value: string; label: Label }[];
  default?: string;
}
export interface MediaField extends BaseField {
  /** A media library item (uuid). */
  type: 'media';
}

export type FieldDefinition =
  TextField | UrlField | NumberField | BooleanField | DateField | SelectField | MediaField;

export type FieldType = FieldDefinition['type'];
export type FieldValues = Record<string, unknown>;

const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const label = z.union([z.string().min(1).max(200), z.record(z.string(), z.string().max(200))]);
const base = {
  name: z.string().regex(NAME_RE, 'Field names start with a letter: letters, digits, _'),
  label,
  help: label.optional(),
  required: z.boolean().optional(),
  translation: z.enum(['translate', 'copy', 'ignore']).optional(),
};

/** Validates field definitions (from plugin code or stored content types). */
export const fieldDefinitionSchema: z.ZodType<FieldDefinition> = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('text'),
    maxLength: z.number().int().min(1).max(100_000).optional(),
    multiline: z.boolean().optional(),
    default: z.string().optional(),
  }),
  z.object({ ...base, type: z.literal('url'), default: z.string().optional() }),
  z.object({
    ...base,
    type: z.literal('number'),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    default: z.number().optional(),
  }),
  z.object({ ...base, type: z.literal('boolean'), default: z.boolean().optional() }),
  z.object({
    ...base,
    type: z.enum(['date', 'datetime']),
    default: z.string().optional(),
  }),
  z.object({
    ...base,
    type: z.literal('select'),
    options: z
      .array(z.object({ value: z.string().min(1).max(200), label }))
      .min(1)
      .max(200),
    default: z.string().optional(),
  }),
  z.object({ ...base, type: z.literal('media') }),
]) as z.ZodType<FieldDefinition>;

export const fieldListSchema = z
  .array(fieldDefinitionSchema)
  .max(100)
  .refine((fields) => new Set(fields.map((f) => f.name)).size === fields.length, {
    message: 'Field names must be unique',
  });

/** Text of a label in a locale, falling back to English, then to any. */
export function labelText(value: Label | undefined, locale = 'en'): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  const language = locale.split('-')[0]!;
  return value[locale] ?? value[language] ?? value.en ?? Object.values(value)[0] ?? '';
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function valueSchema(field: FieldDefinition): z.ZodType<unknown> {
  switch (field.type) {
    case 'text':
      return z.string().max(field.maxLength ?? (field.multiline ? 10_000 : 1_000));
    case 'url':
      return z
        .string()
        .max(2_000)
        .refine((v) => v === '' || /^(https?:\/\/|\/|mailto:|tel:)/i.test(v), 'Enter a valid link');
    case 'number': {
      let schema = z.number();
      if (field.min !== undefined) schema = schema.min(field.min);
      if (field.max !== undefined) schema = schema.max(field.max);
      return schema;
    }
    case 'boolean':
      return z.boolean();
    case 'date':
      return z.string().regex(DATE_RE, 'Use the YYYY-MM-DD format');
    case 'datetime':
      return z.iso.datetime({ offset: true });
    case 'select':
      return z.enum(field.options.map((o) => o.value) as [string, ...string[]]);
    case 'media':
      return z.uuid();
  }
}

/**
 * Validator for the values of a set of fields. Unknown keys are kept, so
 * that values of a field removed from the definition are not lost. Empty
 * optional values may be `null`.
 */
export function fieldsValidator(fields: readonly FieldDefinition[]): z.ZodType<FieldValues> {
  const shape: Record<string, z.ZodType<unknown>> = {};
  for (const field of fields) {
    const schema = valueSchema(field);
    shape[field.name] = field.required ? schema : schema.nullable().optional();
  }
  return z.object(shape).loose() as z.ZodType<FieldValues>;
}

/** Default values of a set of fields. */
export function fieldDefaults(fields: readonly FieldDefinition[]): FieldValues {
  const values: FieldValues = {};
  for (const field of fields) {
    if ('default' in field && field.default !== undefined) values[field.name] = field.default;
  }
  return values;
}
