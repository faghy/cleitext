import { describe, expect, it } from 'vitest';
import {
  fieldDefaults,
  fieldDefinitionSchema,
  fieldVisible,
  fieldsValidator,
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
