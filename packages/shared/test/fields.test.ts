import { describe, expect, it } from 'vitest';
import {
  fieldDefaults,
  fieldDefinitionSchema,
  fieldVisible,
  fieldsValidator,
  deviceValue,
  paletteIndex,
  zoneItems,
  type FieldDefinition,
} from '../src/fields.js';

const fields: FieldDefinition[] = [
  { name: 'accent', label: 'Accent', type: 'color', default: '#1e73be' },
  { name: 'overlay', label: 'Overlay', type: 'color', alpha: true },
  {
    name: 'header',
    label: 'Header',
    type: 'choice',
    display: 'images',
    options: [
      { value: 'left', label: 'Logo left', image: '/a.svg' },
      { value: 'center', label: 'Logo center' },
    ],
    default: 'left',
  },
  { name: 'size', label: 'Size', type: 'number', display: 'range', min: 10, max: 30, unit: 'px' },
  { name: 'css', label: 'CSS', type: 'code', language: 'css' },
  {
    name: 'social',
    label: 'Social',
    type: 'list',
    max: 3,
    fields: [
      {
        name: 'network',
        label: 'Network',
        type: 'select',
        options: [{ value: 'facebook', label: 'Facebook' }],
      },
      { name: 'url', label: 'Address', type: 'url' },
    ],
    default: [],
  },
  {
    name: 'phone',
    label: 'Phone',
    type: 'text',
    showIf: {
      all: [
        { field: 'header', equals: 'center' },
        { field: 'size', not: 10 },
      ],
    },
  },
];

describe('theme option fields', () => {
  it('are valid definitions', () => {
    for (const field of fields) expect(fieldDefinitionSchema.safeParse(field).success).toBe(true);
    expect(
      fieldDefinitionSchema.safeParse({
        name: 'nested',
        label: 'Nested',
        type: 'list',
        fields: [{ name: 'inner', label: 'Inner', type: 'list', fields: [] }],
      }).success,
    ).toBe(false);
  });

  it('validate colors, choices, code and lists', () => {
    const validator = fieldsValidator(fields);
    const ok = validator.safeParse({
      accent: '#fff',
      overlay: '#00000080',
      header: 'center',
      size: 20,
      css: '.a { color: red }',
      social: [{ network: 'facebook', url: 'https://facebook.com/x' }],
    });
    expect(ok.success).toBe(true);
    for (const bad of [
      { accent: '#00000080' },
      { accent: 'red' },
      { header: 'right' },
      { css: '</style><script>' },
      { social: [{ network: 'myspace' }] },
      { social: [{}, {}, {}, {}] },
    ]) {
      expect(validator.safeParse(bad).success).toBe(false);
    }
    expect(fieldDefaults(fields)).toEqual({ accent: '#1e73be', header: 'left', social: [] });
  });

  it('show fields by conditions, with defaults for empty values', () => {
    const phone = fields.at(-1)!;
    const defaults = fieldDefaults(fields);
    expect(fieldVisible(phone, {}, defaults)).toBe(false);
    expect(fieldVisible(phone, { header: 'center', size: 20 }, defaults)).toBe(true);
    expect(fieldVisible(phone, { header: 'center', size: 10 }, defaults)).toBe(false);
    expect(fieldVisible({ showIf: { any: [{ field: 'a', in: [1, 2] }] } }, { a: 2 })).toBe(true);
    expect(fieldVisible({}, {})).toBe(true);
  });
});

describe('zones fields', () => {
  const header: FieldDefinition = {
    name: 'header',
    label: 'Header',
    type: 'zones',
    devices: ['desktop', 'mobile'],
    rows: [
      { name: 'primary', label: 'Main row', zones: [{ name: 'left' }, { name: 'right' }] },
      { name: 'offcanvas', label: 'Off-canvas', zones: [{ name: 'main' }], devices: ['mobile'] },
    ],
    items: [
      { name: 'logo', label: 'Logo' },
      { name: 'menu', label: 'Menu' },
      { name: 'toggle', label: 'Toggle', devices: ['mobile'] },
    ],
  };

  it('accepts its definition', () => {
    expect(fieldDefinitionSchema.safeParse(header).success).toBe(true);
  });

  it('validates where the elements are', () => {
    const check = (value: unknown) =>
      fieldsValidator([header]).safeParse({ header: value }).success;
    expect(
      check({
        desktop: { primary: { left: ['logo'], right: ['menu'] } },
        mobile: { primary: { left: ['logo'], right: ['toggle'] }, offcanvas: { main: ['menu'] } },
      }),
    ).toBe(true);
    // Unknown element, zone, row; an element twice; a mobile-only element or row on desktop.
    expect(check({ desktop: { primary: { left: ['cart'] } } })).toBe(false);
    expect(check({ desktop: { primary: { middle: ['logo'] } } })).toBe(false);
    expect(check({ desktop: { below: { left: ['logo'] } } })).toBe(false);
    expect(check({ desktop: { primary: { left: ['logo'], right: ['logo'] } } })).toBe(false);
    expect(check({ desktop: { primary: { left: ['toggle'] } } })).toBe(false);
    expect(check({ desktop: { offcanvas: { main: ['menu'] } } })).toBe(false);
  });

  it('reads the elements of a zone', () => {
    const value = { desktop: { primary: { left: ['logo', 'menu'] } } };
    expect(zoneItems(value, 'desktop', 'primary', 'left')).toEqual(['logo', 'menu']);
    expect(zoneItems(value, 'mobile', 'primary', 'left')).toEqual([]);
    expect(zoneItems(null, 'desktop', 'primary', 'left')).toEqual([]);
  });

  it('cannot be an item of a list', () => {
    const list = { name: 'rows', label: 'Rows', type: 'list', fields: [header] };
    expect(fieldDefinitionSchema.safeParse(list).success).toBe(false);
  });
});

describe('compound and responsive fields', () => {
  const palette = { field: 'palette', prefix: '--zn-global-color-' };
  const fields: FieldDefinition[] = [
    { name: 'size', label: 'Size', type: 'number', responsive: true, units: ['px', 'em'] },
    { name: 'padding', label: 'Padding', type: 'spacing', responsive: true },
    { name: 'link', label: 'Link', type: 'color', palette },
    { name: 'linkHover', label: 'Hover', type: 'color', palette, inline: true },
    { name: 'visible', label: 'Visibility', type: 'boolean', responsive: true, display: 'devices' },
    { name: 'bg', label: 'Background', type: 'background', palette },
    { name: 'body', label: 'Body', type: 'typography' },
  ];
  const check = (values: Record<string, unknown>) =>
    fieldsValidator(fields).safeParse(values).success;

  it('accepts their definitions', () => {
    for (const field of fields) expect(fieldDefinitionSchema.safeParse(field).success).toBe(true);
    expect(
      fieldDefinitionSchema.safeParse({
        name: 'x',
        label: 'X',
        type: 'boolean',
        display: 'buttons',
      }).success,
    ).toBe(false);
  });

  it('validates values per device', () => {
    expect(check({ visible: { desktop: true, mobile: false } })).toBe(true);
    expect(check({ size: { desktop: 36, tablet: 30, mobile: null, desktopUnit: 'px' } })).toBe(
      true,
    );
    expect(check({ size: 36 })).toBe(false);
    expect(check({ size: { phone: 3 } })).toBe(false);
    expect(check({ padding: { desktop: { top: 15, right: 30, unit: 'px' } } })).toBe(true);
    expect(check({ padding: { desktop: { top: 'a' } } })).toBe(false);
  });

  it('takes palette colors, gradients and fonts', () => {
    expect(check({ link: 'var(--zn-global-color-0)' })).toBe(true);
    expect(check({ link: 'var(--other-0)' })).toBe(false);
    expect(
      check({ bg: { type: 'gradient', gradient: 'linear-gradient(90deg,#fff 0%,#000 100%)' } }),
    ).toBe(true);
    expect(check({ bg: { gradient: 'url(x);}' } })).toBe(false);
    expect(
      check({
        body: { family: 'Open Sans', weight: '400', size: { desktop: 16 }, lineHeight: 1.65 },
      }),
    ).toBe(true);
    expect(check({ body: { family: 'x;}<' } })).toBe(false);
    expect(paletteIndex('var(--zn-global-color-7)', palette)).toBe(7);
  });

  it('reads the value of a device from the larger ones', () => {
    const value = { desktop: 36, tablet: 30 };
    expect(deviceValue(value, 'desktop')).toBe(36);
    expect(deviceValue(value, 'mobile')).toBe(30);
    expect(deviceValue({ desktop: 36 }, 'tablet')).toBe(36);
    expect(deviceValue(undefined, 'tablet')).toBeUndefined();
  });
});
