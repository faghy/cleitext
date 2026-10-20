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
  /**
   * Long forms (a theme's options): the section (tab) the field is in, by id,
   * and a heading that groups it with the next fields of the same group.
   */
  section?: string;
  group?: Label;
  /** The tab of the section the field is in (e.g. `general`, `design`), when the section has tabs. */
  tab?: string;
  /** Shown only when another field of the same form has a value (the value is kept). */
  showIf?: FieldCondition;
  /** Never shown in forms: data kept with the others (e.g. options imported from another site). */
  hidden?: boolean;
  /**
   * A value per device (`number`, `select`, `choice`, `boolean`, `spacing`,
   * `background`, `color`, `text`):
   * `{ desktop, tablet, mobile }`, each optional (a smaller screen without
   * one uses the larger one's). With `units`, also `desktopUnit`…
   */
  responsive?: boolean;
  /**
   * Drawn on the same line as the field before it, as just its control (e.g.
   * a hover color's swatch beside the normal color's); its label becomes the
   * control's tooltip. Used by the customizer look of forms.
   */
  inline?: boolean;
}

/** The devices of responsive values, largest first. */
export const DEVICES = ['desktop', 'tablet', 'mobile'] as const;
export type Device = (typeof DEVICES)[number];
/** A value per device (`responsive` fields). */
export type ResponsiveValue<T> = Partial<Record<Device, T | null>> &
  Partial<Record<`${Device}Unit`, string>>;

/**
 * When a field is shown: another field `equals` a value, is one of `in`, or
 * is not `not`; `all` / `any` combine conditions. A field without a value
 * counts as its default.
 */
export type FieldCondition =
  | { field: string; equals?: unknown; in?: unknown[]; not?: unknown }
  | { all: FieldCondition[] }
  | { any: FieldCondition[] };

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
  default?: number | ResponsiveValue<number>;
  /** `range`: a slider with the number beside it. */
  display?: 'range';
  /** Unit shown after the number, e.g. `px`. */
  unit?: string;
  /** Units to choose from (responsive numbers): the first is the default. */
  units?: string[];
}
export interface BooleanField extends BaseField {
  type: 'boolean';
  default?: boolean | ResponsiveValue<boolean>;
  /**
   * `devices` (with `responsive`): three joined buttons, one per device,
   * pressed where the value is on (e.g. an element's visibility).
   */
  display?: 'devices';
}
export interface DateField extends BaseField {
  /** `date`: YYYY-MM-DD · `datetime`: ISO 8601 with time zone. */
  type: 'date' | 'datetime';
  default?: string;
}
export interface SelectField extends BaseField {
  type: 'select';
  options: { value: string; label: Label }[];
  default?: string | ResponsiveValue<string>;
}
export interface MediaField extends BaseField {
  /** A media library item (uuid). */
  type: 'media';
}
export interface ColorField extends BaseField {
  /**
   * A color: `#rrggbb`, with `alpha` also `#rrggbbaa`; empty for none. With
   * `palette`, also a color of the theme's palette, `var(<prefix><index>)`.
   */
  type: 'color';
  alpha?: boolean;
  default?: string;
  palette?: ColorPalette;
}

/**
 * The theme's global colors: a list field of the same form whose items have
 * a `color` (and a `name`), used as CSS variables `<prefix>0`, `<prefix>1`…
 */
export interface ColorPalette {
  field: string;
  prefix: string;
}
export interface ChoiceField extends BaseField {
  /**
   * One of a few options shown side by side: as buttons, or as pictures
   * (`image`: an SVG or image address, e.g. a sketch of a header layout).
   */
  type: 'choice';
  options: { value: string; label: Label; image?: string }[];
  display?: 'buttons' | 'images';
  default?: string | ResponsiveValue<string>;
}
export interface CodeField extends BaseField {
  /** Code typed by an administrator: CSS added to every page. */
  type: 'code';
  language: 'css';
  default?: string;
}
export interface ListField extends BaseField {
  /**
   * A list of items with the same fields, added, removed and dragged into
   * order (e.g. social profiles, footer columns). `itemLabel`: the field
   * whose value names an item.
   */
  type: 'list';
  fields: ListItemField[];
  itemLabel?: string;
  max?: number;
  default?: FieldValues[];
}

export type Side = 'top' | 'right' | 'bottom' | 'left';
/** Space or widths on the four sides, in a unit (`unit` default: the first of `units`). */
export type SpacingValue = Partial<Record<Side, number | null>> & { unit?: string };

export interface SpacingField extends BaseField {
  /** Padding, margin, border widths or radii: four numbers and a unit. */
  type: 'spacing';
  /** Default `['px', 'em', '%']`. */
  units?: string[];
  /** The sides shown (default all four), e.g. `['top', 'bottom']`. */
  sides?: Side[];
  /** The corners' names instead of the sides' (border radius). */
  corners?: boolean;
  default?: SpacingValue | ResponsiveValue<SpacingValue>;
}

/** A background: a color, a gradient or an image. */
export interface BackgroundValue {
  type?: 'color' | 'gradient' | 'image';
  color?: string;
  /** A CSS gradient, e.g. `linear-gradient(90deg, #fff 0%, #000 100%)`. */
  gradient?: string;
  /** A media library image. */
  image?: string;
  position?: string;
  size?: 'auto' | 'cover' | 'contain';
  repeat?: 'repeat' | 'no-repeat' | 'repeat-x' | 'repeat-y';
  attachment?: 'scroll' | 'fixed';
  /** A color laid over the image. */
  overlay?: string;
}

export interface BackgroundField extends BaseField {
  type: 'background';
  palette?: ColorPalette;
  default?: BackgroundValue | ResponsiveValue<BackgroundValue>;
}

/** A font and its look; `size` per device. */
export interface TypographyValue {
  /** A font family name (a Google font, or `inherit` / empty for the default). */
  family?: string;
  weight?: string;
  size?: ResponsiveValue<number>;
  lineHeight?: number | null;
  lineHeightUnit?: string;
  letterSpacing?: number | null;
  letterSpacingUnit?: string;
  transform?: '' | 'none' | 'capitalize' | 'uppercase' | 'lowercase';
  decoration?: '' | 'none' | 'underline' | 'line-through';
}

export interface TypographyField extends BaseField {
  type: 'typography';
  /** Units of the size (default `['px', 'em', 'rem', 'vw']`). */
  units?: string[];
  default?: TypographyValue;
}

/** A device with its own layout in a zones field. */
export type ZoneDevice = 'desktop' | 'mobile';

/** A zone of a row. */
export interface ZoneDefinition {
  name: string;
  label?: Label;
  /**
   * Shown in the builder only when this other zone of the row has elements
   * (or this one has): the zones beside the center of a header.
   */
  whenUsed?: string;
  /** Devices that have this zone (default: all), e.g. the zones beside a desktop center. */
  devices?: ZoneDevice[];
}

/** A row of a zones field (e.g. the header's main row, a footer row). */
export interface ZoneRow {
  name: string;
  label: Label;
  /**
   * The row's zones, in order (e.g. `left`, `center`, `right`; `1`…`6` for
   * the columns of a footer row). An empty name is not allowed.
   */
  zones: ZoneDefinition[];
  /** Devices that have this row (default: all), e.g. an off-canvas panel only on mobile. */
  devices?: ZoneDevice[];
  /** The settings section of the row, opened by its gear. */
  section?: string;
  /**
   * A number field of the same form that tells how many of the zones are
   * used (a footer row's columns): the others are hidden.
   */
  columnsField?: string;
  /** Zones laid out as a column (an off-canvas panel) instead of in a line. */
  stacked?: boolean;
}

/** An element placed in the zones (logo, menu, button…). */
export interface ZoneItem {
  name: string;
  label: Label;
  /** A simple icon name (e.g. `logo`, `menu`, `button`, `search`). */
  icon?: string;
  /** The settings section of the element, opened by a click on it. */
  section?: string;
  /** Devices where the element can be placed (default: all). */
  devices?: ZoneDevice[];
  /** Rows where the element can be placed (default: all). */
  rows?: string[];
}

/** Where each element is: device → row → zone → element names, in order. */
export type ZonesValue = Partial<Record<ZoneDevice, Record<string, Record<string, string[]>>>>;

export interface ZonesField extends BaseField {
  /**
   * A drag-and-drop builder (a theme's header or footer): rows split into
   * zones, where elements are placed, with a layout per device. Each
   * element is used at most once per device.
   */
  type: 'zones';
  devices: ZoneDevice[];
  rows: ZoneRow[];
  items: ZoneItem[];
  default?: ZonesValue;
}

/** Fields an item of a list may have (no list inside a list). */
export type ListItemField = Exclude<FieldDefinition, ListField | ZonesField>;

export type FieldDefinition =
  | TextField
  | UrlField
  | NumberField
  | BooleanField
  | DateField
  | SelectField
  | MediaField
  | ColorField
  | ChoiceField
  | CodeField
  | ListField
  | ZonesField
  | SpacingField
  | BackgroundField
  | TypographyField;

export type FieldType = FieldDefinition['type'];
export type FieldValues = Record<string, unknown>;

const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const label = z.union([z.string().min(1).max(200), z.record(z.string(), z.string().max(200))]);
const condition: z.ZodType<FieldCondition> = z.lazy(() =>
  z.union([
    z.object({
      field: z.string().regex(NAME_RE),
      equals: z.unknown().optional(),
      in: z.array(z.unknown()).max(50).optional(),
      not: z.unknown().optional(),
    }),
    z.object({ all: z.array(condition).max(10) }),
    z.object({ any: z.array(condition).max(10) }),
  ]),
) as z.ZodType<FieldCondition>;

const palette = z.object({
  field: z.string().regex(NAME_RE),
  prefix: z.string().regex(/^--[a-z0-9-]{1,40}$/),
});

const base = {
  name: z.string().regex(NAME_RE, 'Field names start with a letter: letters, digits, _'),
  label,
  help: label.optional(),
  required: z.boolean().optional(),
  translation: z.enum(['translate', 'copy', 'ignore']).optional(),
  section: z.string().max(64).optional(),
  group: label.optional(),
  tab: z.string().max(32).optional(),
  showIf: condition.optional(),
  responsive: z.boolean().optional(),
  inline: z.boolean().optional(),
  hidden: z.boolean().optional(),
};
const UNIT_RE = /^(px|em|rem|%|vw|vh|)$/;
const units = z.array(z.string().regex(UNIT_RE)).min(1).max(6).optional();
const loose = z.unknown().optional();

const zoneDevice = z.enum(['desktop', 'mobile']);
const ZONE_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/;

const choiceOptions = z
  .array(
    z.object({
      value: z.string().min(1).max(200),
      label,
      image: z.string().max(20_000).optional(),
    }),
  )
  .min(1)
  .max(200);

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
    default: loose,
    display: z.literal('range').optional(),
    unit: z.string().max(10).optional(),
    units,
  }),
  z.object({
    ...base,
    type: z.literal('boolean'),
    default: loose,
    display: z.literal('devices').optional(),
  }),
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
    default: loose,
  }),
  z.object({ ...base, type: z.literal('media') }),
  z.object({
    ...base,
    type: z.literal('color'),
    alpha: z.boolean().optional(),
    default: z.string().optional(),
    palette: palette.optional(),
  }),
  z.object({
    ...base,
    type: z.literal('choice'),
    options: choiceOptions,
    display: z.enum(['buttons', 'images']).optional(),
    default: loose,
  }),
  z.object({
    ...base,
    type: z.literal('code'),
    language: z.literal('css'),
    default: z.string().optional(),
  }),
  z.object({
    ...base,
    type: z.literal('list'),
    fields: z
      .array(z.lazy(() => listItemFieldSchema))
      .min(1)
      .max(30),
    itemLabel: z.string().optional(),
    max: z.number().int().min(1).max(200).optional(),
    default: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
  z.object({
    ...base,
    type: z.literal('spacing'),
    units,
    sides: z
      .array(z.enum(['top', 'right', 'bottom', 'left']))
      .min(1)
      .max(4)
      .optional(),
    corners: z.boolean().optional(),
    default: loose,
  }),
  z.object({ ...base, type: z.literal('background'), palette: palette.optional(), default: loose }),
  z.object({ ...base, type: z.literal('typography'), units, default: loose }),
  z.object({
    ...base,
    type: z.literal('zones'),
    devices: z.array(zoneDevice).min(1).max(2),
    rows: z
      .array(
        z.object({
          name: z.string().regex(NAME_RE),
          label,
          zones: z
            .array(
              z.object({
                name: z.string().regex(ZONE_RE),
                label: label.optional(),
                whenUsed: z.string().regex(ZONE_RE).optional(),
                devices: z.array(zoneDevice).max(2).optional(),
              }),
            )
            .min(1)
            .max(12),
          devices: z.array(zoneDevice).max(2).optional(),
          section: z.string().max(64).optional(),
          columnsField: z.string().regex(NAME_RE).optional(),
          stacked: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(12),
    items: z
      .array(
        z.object({
          name: z.string().regex(NAME_RE),
          label,
          icon: z.string().max(40).optional(),
          section: z.string().max(64).optional(),
          devices: z.array(zoneDevice).max(2).optional(),
          rows: z.array(z.string().regex(NAME_RE)).max(12).optional(),
        }),
      )
      .max(200),
    default: z.record(z.string(), z.unknown()).optional(),
  }),
]) as z.ZodType<FieldDefinition>;

/** The fields of a list's items: any field but a list or zones. */
const listItemFieldSchema: z.ZodType<ListItemField> = fieldDefinitionSchema.refine(
  (field) => field.type !== 'list' && field.type !== 'zones',
  'A list cannot hold another list or zones',
) as z.ZodType<ListItemField>;

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
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const ALPHA_COLOR_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Validator of a field's value: per device when the field is responsive. */
function valueSchema(field: FieldDefinition): z.ZodType<unknown> {
  const one = singleValueSchema(field);
  if (!field.responsive || !RESPONSIVE_TYPES.has(field.type)) return one;
  const unit = z.string().regex(UNIT_RE).optional();
  return z
    .object({
      desktop: one.nullable().optional(),
      tablet: one.nullable().optional(),
      mobile: one.nullable().optional(),
      desktopUnit: unit,
      tabletUnit: unit,
      mobileUnit: unit,
    })
    .strict();
}

const RESPONSIVE_TYPES = new Set([
  'number',
  'select',
  'choice',
  'boolean',
  'spacing',
  'background',
  'color',
  'text',
]);

/** A color, of the palette (`var(--prefix-N)`) when the field has one. */
function colorSchema(alpha: boolean | undefined, palette: ColorPalette | undefined) {
  return z
    .string()
    .max(80)
    .refine(
      (v) =>
        v === '' ||
        (alpha ? ALPHA_COLOR_RE : COLOR_RE).test(v) ||
        (palette !== undefined && paletteIndex(v, palette) !== null),
      'Enter a color like #1e73be',
    );
}

/** The index of a palette color (`var(--prefix-3)` → 3), or null. */
export function paletteIndex(value: unknown, palette: ColorPalette): number | null {
  if (typeof value !== 'string') return null;
  const match = /^var\((--[a-z0-9-]+?)(\d{1,2})\)$/.exec(value);
  return match && match[1] === palette.prefix ? Number(match[2]) : null;
}

const numberOrNull = z.number().nullable().optional();
const spacingSchema = z
  .object({
    top: numberOrNull,
    right: numberOrNull,
    bottom: numberOrNull,
    left: numberOrNull,
    unit: z.string().regex(UNIT_RE).optional(),
  })
  .strict();

function singleValueSchema(field: FieldDefinition): z.ZodType<unknown> {
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
    case 'color':
      return colorSchema(field.alpha, field.palette);
    case 'choice':
      return z.enum(field.options.map((o) => o.value) as [string, ...string[]]);
    case 'code':
      // Added to every page inside <style>: it must not close it.
      return z
        .string()
        .max(100_000)
        .refine((v) => !/<\/style/i.test(v), 'The code cannot contain </style>');
    case 'list': {
      const item = fieldsValidator(field.fields);
      return z.array(item).max(field.max ?? 200);
    }
    case 'zones':
      return zonesSchema(field);
    case 'spacing':
      return spacingSchema;
    case 'background': {
      const color = colorSchema(true, field.palette).optional();
      return z
        .object({
          type: z.enum(['color', 'gradient', 'image']).optional(),
          color,
          gradient: z
            .string()
            .max(1_000)
            .regex(
              /^((repeating-)?(linear|radial|conic)-gradient\([^;{}<>]*\))?$/,
              'Enter a CSS gradient',
            )
            .optional(),
          image: z.uuid().nullable().optional(),
          position: z
            .string()
            .regex(/^[a-z0-9.% -]{0,40}$/)
            .optional(),
          size: z.enum(['auto', 'cover', 'contain']).optional(),
          repeat: z.enum(['repeat', 'no-repeat', 'repeat-x', 'repeat-y']).optional(),
          attachment: z.enum(['scroll', 'fixed']).optional(),
          overlay: color,
        })
        .strict();
    }
    case 'typography': {
      const unit = z.string().regex(UNIT_RE).optional();
      return z
        .object({
          family: z
            .string()
            .regex(/^[A-Za-z0-9 _-]{0,60}$/, 'Enter a font name')
            .optional(),
          weight: z
            .string()
            .regex(/^(|inherit|normal|bold|[1-9]00)$/)
            .optional(),
          size: z
            .object({
              desktop: numberOrNull,
              tablet: numberOrNull,
              mobile: numberOrNull,
              desktopUnit: unit,
              tabletUnit: unit,
              mobileUnit: unit,
            })
            .strict()
            .optional(),
          lineHeight: numberOrNull,
          lineHeightUnit: unit,
          letterSpacing: numberOrNull,
          letterSpacingUnit: unit,
          transform: z.enum(['', 'none', 'capitalize', 'uppercase', 'lowercase']).optional(),
          decoration: z.enum(['', 'none', 'underline', 'line-through']).optional(),
        })
        .strict();
    }
  }
}

/** The value of a responsive field for a device: the nearest larger device's when unset. */
export function deviceValue<T>(value: unknown, device: Device): T | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as ResponsiveValue<T>;
  for (const d of DEVICES.slice(0, DEVICES.indexOf(device) + 1).reverse()) {
    const v = record[d];
    if (v !== undefined && v !== null && v !== ('' as unknown)) return v;
  }
  return undefined;
}

/**
 * A zones value: known devices, rows, zones and elements, each element
 * once per device and only where it is allowed.
 */
function zonesSchema(field: ZonesField): z.ZodType<unknown> {
  const items = new Map(field.items.map((item) => [item.name, item]));
  const zoneList = z.array(z.string()).max(50);
  return z
    .partialRecord(zoneDevice, z.record(z.string(), z.record(z.string(), zoneList)))
    .superRefine((value, ctx) => {
      for (const [device, rows] of Object.entries(value) as [ZoneDevice, typeof value.desktop][]) {
        if (!rows) continue;
        if (!field.devices.includes(device)) {
          ctx.addIssue({ code: 'custom', message: `Unknown device "${device}"` });
          continue;
        }
        const used = new Set<string>();
        for (const [rowName, zones] of Object.entries(rows)) {
          const row = field.rows.find((r) => r.name === rowName);
          if (!row || (row.devices && !row.devices.includes(device))) {
            ctx.addIssue({ code: 'custom', message: `Unknown row "${rowName}"` });
            continue;
          }
          for (const [zone, names] of Object.entries(zones)) {
            const known = row.zones.find((z) => z.name === zone);
            if (!known || (known.devices && !known.devices.includes(device))) {
              ctx.addIssue({ code: 'custom', message: `Unknown zone "${rowName}.${zone}"` });
              continue;
            }
            for (const name of names) {
              const item = items.get(name);
              if (
                !item ||
                (item.devices && !item.devices.includes(device)) ||
                (item.rows && !item.rows.includes(rowName))
              ) {
                ctx.addIssue({ code: 'custom', message: `"${name}" cannot be placed here` });
              } else if (used.has(name)) {
                ctx.addIssue({ code: 'custom', message: `"${name}" is placed twice` });
              }
              used.add(name);
            }
          }
        }
      }
    });
}

/** The elements of a zones value in a row and zone of a device, in order. */
export function zoneItems(value: unknown, device: ZoneDevice, row: string, zone: string): string[] {
  const list = (value as ZonesValue | null | undefined)?.[device]?.[row]?.[zone];
  return Array.isArray(list) ? list.filter((n): n is string => typeof n === 'string') : [];
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

/** Whether a field is shown with these values (see `FieldCondition`). */
export function fieldVisible(
  field: { showIf?: FieldCondition },
  values: FieldValues,
  defaults: FieldValues = {},
): boolean {
  const test = (c: FieldCondition): boolean => {
    if ('all' in c) return c.all.every(test);
    if ('any' in c) return c.any.some(test);
    const value = values[c.field] ?? defaults[c.field];
    if ('equals' in c && c.equals !== undefined && value !== c.equals) return false;
    if (c.in && !c.in.includes(value)) return false;
    if ('not' in c && c.not !== undefined && value === c.not) return false;
    return true;
  };
  return field.showIf ? test(field.showIf) : true;
}
