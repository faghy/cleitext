import { describe, expect, it } from 'vitest';
import {
  fieldDefaults,
  fieldListSchema,
  fieldsValidator,
  labelText,
  type FieldDefinition,
} from './fields.js';

const fields: FieldDefinition[] = [
  { name: 'startsAt', type: 'date', label: 'Date', required: true },
  { name: 'seats', type: 'number', label: 'Seats', min: 1, max: 500, default: 50 },
  { name: 'kind', type: 'select', label: 'Kind', options: [{ value: 'talk', label: 'Talk' }] },
  { name: 'link', type: 'url', label: 'Link' },
  { name: 'cover', type: 'media', label: 'Cover' },
];

describe('field DSL', () => {
  it('validates values and keeps unknown keys', () => {
    const validator = fieldsValidator(fields);
    expect(validator.safeParse({ startsAt: '2030-01-02', seats: 10, extra: true }).success).toBe(
      true,
    );
    expect(validator.safeParse({ seats: 10 }).success).toBe(false); // required date
    expect(validator.safeParse({ startsAt: '2030-1-2' }).success).toBe(false);
    expect(validator.safeParse({ startsAt: '2030-01-02', seats: 0 }).success).toBe(false);
    expect(validator.safeParse({ startsAt: '2030-01-02', kind: 'party' }).success).toBe(false);
    expect(validator.safeParse({ startsAt: '2030-01-02', link: 'javascript:x' }).success).toBe(
      false,
    );
    expect(validator.safeParse({ startsAt: '2030-01-02', cover: 'nope' }).success).toBe(false);
    expect(validator.safeParse({ startsAt: '2030-01-02', link: null }).success).toBe(true);
  });

  it('checks definitions', () => {
    expect(fieldListSchema.safeParse(fields).success).toBe(true);
    expect(fieldListSchema.safeParse([...fields, fields[0]]).success).toBe(false);
    expect(fieldListSchema.safeParse([{ name: '1x', type: 'text', label: 'X' }]).success).toBe(
      false,
    );
  });

  it('gives defaults and localized labels', () => {
    expect(fieldDefaults(fields)).toEqual({ seats: 50 });
    expect(labelText({ en: 'Date', it: 'Data' }, 'it-CH')).toBe('Data');
    expect(labelText({ en: 'Date' }, 'de')).toBe('Date');
  });
});
