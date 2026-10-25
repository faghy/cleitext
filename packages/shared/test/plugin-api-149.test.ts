import { describe, expect, it } from 'vitest';
import {
  fieldGroupSchema,
  hiddenOnScreen,
  locationObjects,
  matchesLocation,
  mayMatchBlock,
} from '../src/field-groups.js';
import { fieldRows, registerFieldType, unregisterFieldType } from '../src/field-types.js';
import {
  conditionPattern,
  fieldDefinitionSchema,
  fieldVisible,
  type FieldDefinition,
} from '../src/fields.js';

describe('the block location rule (plugin API 1.49)', () => {
  const rules = [[{ param: 'block' as const, operator: '==' as const, value: 'kit/hero' }]];
  it('matches the block named, only for blocks', () => {
    expect(locationObjects(rules)).toEqual(new Set(['block']));
    expect(matchesLocation(rules, { object: 'block', block: 'kit/hero' })).toBe(true);
    expect(matchesLocation(rules, { object: 'block', block: 'kit/other' })).toBe(false);
    expect(matchesLocation(rules, { object: 'entry', contentType: 'page' })).toBe(false);
    expect(
      matchesLocation([[{ param: 'block', operator: '==', value: '*' }]], {
        object: 'block',
        block: 'x/y',
      }),
    ).toBe(true);
  });
  it('may match whatever the role of the person editing', () => {
    const withRole = [
      [
        ...rules[0]!,
        { param: 'currentUserRole' as const, operator: '==' as const, value: 'editor' },
      ],
    ];
    expect(mayMatchBlock(withRole, 'kit/hero')).toBe(true);
    expect(mayMatchBlock(withRole, 'kit/other')).toBe(false);
    expect(
      mayMatchBlock([[{ param: 'contentType', operator: '==', value: '*' }]], 'kit/hero'),
    ).toBe(false);
    expect(
      mayMatchBlock(
        [[...rules[0]!, { param: 'contentType', operator: '==', value: 'page' }]],
        'kit/hero',
      ),
    ).toBe(false);
  });
});

describe('hide on screen (plugin API 1.49)', () => {
  it('is checked and combined across the groups shown', () => {
    const base = {
      id: 'g',
      title: 'G',
      fields: [],
      location: [[{ param: 'contentType', operator: '==', value: 'page' }]],
    };
    expect(fieldGroupSchema.safeParse({ ...base, hideOnScreen: ['excerpt', 'tags'] }).success).toBe(
      true,
    );
    expect(fieldGroupSchema.safeParse({ ...base, hideOnScreen: ['content'] }).success).toBe(false);
    expect([
      ...hiddenOnScreen([
        { hideOnScreen: ['excerpt'] },
        {},
        { hideOnScreen: ['slug', 'excerpt', 'unknown' as never] },
      ]),
    ]).toEqual(['excerpt', 'slug']);
  });
});

describe('rows of lists (plugin API 1.49)', () => {
  it('come from the core’s lists and relations, and from plugin types', () => {
    const list = {
      name: 'team',
      type: 'list',
      label: 'Team',
      fields: [{ name: 'name', type: 'text', label: 'Name' }],
    } as FieldDefinition;
    expect(fieldRows(list)).toMatchObject({ kind: 'fields', fields: [{ name: 'name' }] });
    expect(
      fieldRows({ name: 'r', type: 'entry', label: 'R', multiple: true } as FieldDefinition),
    ).toEqual({
      kind: 'entry',
    });
    expect(fieldRows({ name: 'r', type: 'term', label: 'R' } as FieldDefinition)).toBeNull();
    expect(fieldRows({ name: 't', type: 'text', label: 'T' })).toBeNull();
    registerFieldType({ type: 'kit/rows', rows: () => ({ kind: 'user' }) });
    registerFieldType({
      type: 'kit/broken',
      rows: () => {
        throw new Error('no');
      },
    });
    registerFieldType({ type: 'kit/odd', rows: () => ({ kind: 'fields', fields: 'x' as never }) });
    expect(fieldRows({ name: 'a', type: 'kit/rows', label: 'A' })).toEqual({ kind: 'user' });
    expect(fieldRows({ name: 'b', type: 'kit/broken', label: 'B' })).toBeNull();
    expect(fieldRows({ name: 'c', type: 'kit/odd', label: 'C' })).toBeNull();
    for (const type of ['kit/rows', 'kit/broken', 'kit/odd']) unregisterFieldType(type);
  });
});

describe('notContains and pattern conditions (plugin API 1.49)', () => {
  const field = (showIf: object) => ({ showIf }) as Parameters<typeof fieldVisible>[0];
  it('test text and lists', () => {
    expect(fieldVisible(field({ field: 'a', notContains: 'x' }), { a: 'abc' })).toBe(true);
    expect(fieldVisible(field({ field: 'a', notContains: 'b' }), { a: 'abc' })).toBe(false);
    expect(fieldVisible(field({ field: 'a', notContains: 2 }), { a: [1, 2] })).toBe(false);
    expect(fieldVisible(field({ field: 'a', notContains: 'x' }), {})).toBe(true);
    expect(fieldVisible(field({ field: 'a', pattern: '^[A-Z]{3}$' }), { a: 'ABC' })).toBe(true);
    expect(fieldVisible(field({ field: 'a', pattern: '^[A-Z]{3}$' }), { a: 'abc' })).toBe(false);
    expect(fieldVisible(field({ field: 'a', pattern: '^4' }), { a: 42 })).toBe(true);
    expect(fieldVisible(field({ field: 'a', pattern: '^b' }), { a: ['a', 'b'] })).toBe(true);
    expect(fieldVisible(field({ field: 'a', pattern: '^$' }), { a: { x: 1 } })).toBe(true);
    expect(fieldVisible(field({ field: 'a', pattern: '(' }), { a: '(' })).toBe(false);
  });
  it('refuse patterns that are not expressions', () => {
    expect(conditionPattern('(')).toBeNull();
    expect(conditionPattern('\\p{L}+')?.test('è')).toBe(true);
    // Not valid with `u`, valid without.
    expect(conditionPattern('\\-')).not.toBeNull();
    expect(conditionPattern('x'.repeat(201))).toBeNull();
    const def = (pattern: string) => ({
      name: 'b',
      type: 'text',
      label: 'B',
      showIf: { field: 'a', pattern },
    });
    expect(fieldDefinitionSchema.safeParse(def('^a')).success).toBe(true);
    expect(fieldDefinitionSchema.safeParse(def('[')).success).toBe(false);
  });
});
