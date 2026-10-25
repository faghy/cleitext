import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  fieldGroupSchema,
  locationObjects,
  matchesLocation,
  mayMatchType,
  sortFieldGroups,
  typesLocation,
  type LocationRule,
  type LocationRules,
  type LocationScreen,
} from '../src/field-groups.js';
import {
  fieldType,
  isEmptyValue,
  registerFieldType,
  unregisterFieldType,
} from '../src/field-types.js';
import {
  ensureRowIds,
  exportFieldValues,
  fieldDefinitionSchema,
  fieldIndexValue,
  fieldsValidator,
  fieldVisible,
  formatFieldValues,
  importFieldRefs,
  type CustomField,
  type FieldDefinition,
} from '../src/fields.js';

const rule = (
  param: LocationRule['param'],
  value: string,
  operator: '==' | '!=' = '==',
): LocationRule => ({
  param,
  operator,
  value,
});

const page: LocationScreen = {
  object: 'entry',
  contentType: 'page',
  entryId: 'e1',
  template: 'landing',
  parentId: 'p1',
  terms: ['t1', 't2'],
  status: 'draft',
  currentUserRole: 'editor',
};

describe('location rules', () => {
  it('test every entry parameter with == and !=', () => {
    const cases: [LocationRule, boolean][] = [
      [rule('contentType', 'page'), true],
      [rule('contentType', 'article'), false],
      [rule('contentType', '*'), true],
      [rule('contentType', 'article', '!='), true],
      [rule('entry', 'e1'), true],
      [rule('entry', 'e2'), false],
      [rule('entry', 'e1', '!='), false],
      [rule('template', 'landing'), true],
      [rule('template', 'default'), false],
      [rule('template', 'default', '!='), true],
      [rule('parent', 'p1'), true],
      [rule('parent', 'none'), false],
      [rule('term', 't2'), true],
      [rule('term', 't3'), false],
      [rule('term', 't3', '!='), true],
      [rule('status', 'draft'), true],
      [rule('status', 'published', '!='), true],
    ];
    for (const [r, expected] of cases) {
      expect(matchesLocation([[r]], page), `${r.param} ${r.operator} ${r.value}`).toBe(expected);
    }
  });

  it('read a missing template and parent as default and none', () => {
    const top: LocationScreen = {
      object: 'entry',
      contentType: 'page',
      template: null,
      parentId: null,
    };
    expect(matchesLocation([[rule('template', 'default')]], top)).toBe(true);
    expect(matchesLocation([[rule('template', '')]], top)).toBe(true);
    expect(matchesLocation([[rule('parent', 'none')]], top)).toBe(true);
    // A new entry has no id yet.
    expect(matchesLocation([[rule('entry', 'e1', '!=')]], top)).toBe(true);
  });

  it('combine rules: every rule of a list, any list', () => {
    const and: LocationRules = [[rule('contentType', 'page'), rule('template', 'landing')]];
    expect(matchesLocation(and, page)).toBe(true);
    expect(matchesLocation(and, { ...page, template: 'other' })).toBe(false);
    const or: LocationRules = [[rule('contentType', 'article')], [rule('term', 't1')]];
    expect(matchesLocation(or, page)).toBe(true);
    expect(matchesLocation(or, { ...page, terms: [] })).toBe(false);
    expect(matchesLocation([], page)).toBe(false);
    expect(matchesLocation([[]], page)).toBe(false);
  });

  it('match only the object they test; the editing role goes with any', () => {
    const term: LocationScreen = {
      object: 'term',
      taxonomy: 'category',
      currentUserRole: 'editor',
    };
    expect(matchesLocation([[rule('taxonomy', 'category')]], term)).toBe(true);
    expect(matchesLocation([[rule('taxonomy', '*')]], term)).toBe(true);
    expect(matchesLocation([[rule('taxonomy', 'tag')]], term)).toBe(false);
    expect(matchesLocation([[rule('contentType', '*')]], term)).toBe(false);
    expect(matchesLocation([[rule('taxonomy', 'category')]], page)).toBe(false);
    // Rules of two objects in one list never match.
    expect(
      matchesLocation([[rule('contentType', 'page'), rule('taxonomy', 'category')]], page),
    ).toBe(false);
    // The role alone is no place.
    expect(matchesLocation([[rule('currentUserRole', 'editor')]], page)).toBe(false);
    expect(
      matchesLocation([[rule('contentType', 'page'), rule('currentUserRole', 'editor')]], page),
    ).toBe(true);
    expect(
      matchesLocation(
        [[rule('contentType', 'page'), rule('currentUserRole', 'administrator')]],
        page,
      ),
    ).toBe(false);
    expect(
      matchesLocation(
        [[rule('contentType', 'page'), rule('currentUserRole', 'author', '!=')]],
        page,
      ),
    ).toBe(true);
  });

  it('test users by role and form', () => {
    const profile: LocationScreen = { object: 'user', userRole: 'author', userForm: 'profile' };
    expect(matchesLocation([[rule('userRole', 'author')]], profile)).toBe(true);
    expect(matchesLocation([[rule('userRole', '*')]], profile)).toBe(true);
    expect(matchesLocation([[rule('userRole', 'editor')]], profile)).toBe(false);
    expect(matchesLocation([[rule('userForm', 'profile')]], profile)).toBe(true);
    expect(matchesLocation([[rule('userForm', 'all')]], profile)).toBe(true);
    expect(matchesLocation([[rule('userForm', 'edit')]], profile)).toBe(false);
    expect(matchesLocation([[rule('userForm', 'edit', '!=')]], profile)).toBe(true);
    // Not a member of the site.
    expect(
      matchesLocation([[rule('userRole', 'author')]], { object: 'user', userRole: null }),
    ).toBe(false);
  });

  it('leave room for options pages', () => {
    const options: LocationScreen = { object: 'options', optionsPage: 'site-settings' };
    expect(matchesLocation([[rule('optionsPage', 'site-settings')]], options)).toBe(true);
    expect(matchesLocation([[rule('optionsPage', 'site-settings')]], page)).toBe(false);
    expect([...locationObjects([[rule('optionsPage', 'x')]])]).toEqual(['options']);
  });

  it('tell the objects and types a group may show on', () => {
    expect([
      ...locationObjects([[rule('contentType', 'page')], [rule('taxonomy', 'tag')]]),
    ]).toEqual(['entry', 'term']);
    expect(locationObjects([[rule('contentType', 'page'), rule('taxonomy', 'tag')]]).size).toBe(0);
    expect(mayMatchType([[rule('template', 'landing')]], 'page')).toBe(true);
    expect(mayMatchType([[rule('contentType', 'article')]], 'page')).toBe(false);
    expect(mayMatchType([[rule('contentType', 'article', '!=')]], 'page')).toBe(true);
    expect(mayMatchType([[rule('taxonomy', 'tag')]], 'page')).toBe(false);
    expect(typesLocation(['*'])).toEqual([[rule('contentType', '*')]]);
    expect(typesLocation(['a', 'b'])).toEqual([
      [rule('contentType', 'a')],
      [rule('contentType', 'b')],
    ]);
  });

  it('check groups and sort them by order, then title', () => {
    const group = {
      id: 'team',
      title: 'Team',
      fields: [{ name: 'name', type: 'text', label: 'Name' }],
      location: [[rule('contentType', 'page')]],
    };
    expect(fieldGroupSchema.safeParse(group).success).toBe(true);
    expect(fieldGroupSchema.safeParse({ ...group, id: 'Team!' }).success).toBe(false);
    expect(fieldGroupSchema.safeParse({ ...group, location: [] }).success).toBe(false);
    expect(
      fieldGroupSchema.safeParse({
        ...group,
        location: [[{ ...rule('status', 'x'), operator: '>' }]],
      }).success,
    ).toBe(false);
    const sorted = sortFieldGroups([
      { title: 'B', order: 1 },
      { title: 'C' },
      { title: 'A', order: 1 },
      { title: { en: 'D', it: 'Z' }, order: -1 },
    ]);
    expect(sorted.map((g) => (typeof g.title === 'string' ? g.title : g.title.en))).toEqual([
      'D',
      'C',
      'A',
      'B',
    ]);
  });
});

describe('the field type registry', () => {
  it('has the core types, which keep working as before', () => {
    expect(fieldType('text')?.kind).toBe('text');
    expect(fieldType('media')?.kind).toBe('media');
    const validator = fieldsValidator([{ name: 'n', type: 'number', label: 'N', max: 3 }]);
    expect(validator.safeParse({ n: 2 }).success).toBe(true);
    expect(validator.safeParse({ n: 4 }).success).toBe(false);
  });

  it('takes plugin types: definitions, values, empty values, index', () => {
    registerFieldType({
      type: 'kit/rating',
      settings: z.object({ max: z.number().int().max(10).optional() }),
      value: (field) =>
        z
          .number()
          .min(1)
          .max(Number(((field as CustomField).settings as { max?: number } | undefined)?.max ?? 5)),
      isEmpty: (value) => value === 0,
      index: (value) => `${String(value)} stars`,
      kind: 'number',
    });
    try {
      const field: FieldDefinition = {
        name: 'score',
        type: 'kit/rating',
        label: 'Score',
        required: true,
        settings: { max: 3 },
      };
      expect(fieldDefinitionSchema.safeParse(field).success).toBe(true);
      const bad = fieldDefinitionSchema.safeParse({ ...field, settings: { max: 20 } });
      expect(bad.success).toBe(false);
      expect(bad.error!.issues[0]!.path).toEqual(['settings', 'max']);
      // A bad name is a bad name for every type.
      expect(fieldDefinitionSchema.safeParse({ ...field, name: '1' }).success).toBe(false);
      const validator = fieldsValidator([field]);
      expect(validator.safeParse({ score: 3 }).success).toBe(true);
      expect(validator.safeParse({ score: 4 }).success).toBe(false);
      // Required: missing, or empty as the type says.
      expect(validator.safeParse({}).success).toBe(false);
      expect(validator.safeParse({ score: 0 }).success).toBe(false);
      expect(isEmptyValue(0, field)).toBe(true);
      expect(fieldIndexValue(field, 2)).toBe('2 stars');
    } finally {
      unregisterFieldType('kit/rating');
    }
  });

  it('keeps values of types whose plugin is not loaded', () => {
    const field = { name: 'map', type: 'gone/map', label: 'Map' } as FieldDefinition;
    expect(fieldDefinitionSchema.safeParse(field).success).toBe(true);
    const parsed = fieldsValidator([field]).safeParse({ map: { lat: 1, lng: 2 } });
    expect(parsed.success && parsed.data).toEqual({ map: { lat: 1, lng: 2 } });
    expect(fieldDefinitionSchema.safeParse({ ...field, type: 'Gone/Map' }).success).toBe(false);
  });
});

describe('conditions', () => {
  const values = {
    title: 'Hello world',
    count: 5,
    tags: ['a', 'b'],
    empty: '',
    date: '2026-10-25',
  };
  const visible = (showIf: Parameters<typeof fieldVisible>[0]['showIf']) =>
    fieldVisible({ showIf }, values);

  it('have every operator: ==, !=, empty, not empty, contains, >, <', () => {
    expect(visible({ field: 'count', equals: 5 })).toBe(true);
    expect(visible({ field: 'count', not: 5 })).toBe(false);
    expect(visible({ field: 'empty', empty: true })).toBe(true);
    expect(visible({ field: 'missing', empty: true })).toBe(true);
    expect(visible({ field: 'tags', empty: false })).toBe(true);
    expect(visible({ field: 'title', contains: 'world' })).toBe(true);
    expect(visible({ field: 'tags', contains: 'c' })).toBe(false);
    expect(visible({ field: 'count', gt: 4 })).toBe(true);
    expect(visible({ field: 'count', lt: 5 })).toBe(false);
    expect(visible({ field: 'date', gt: Date.parse('2026-01-01') })).toBe(true);
    expect(visible({ field: 'title', gt: 1 })).toBe(false);
    expect(
      visible({
        all: [
          { field: 'count', gt: 1 },
          { field: 'title', contains: 'x' },
        ],
      }),
    ).toBe(false);
    expect(
      visible({
        any: [
          { field: 'count', gt: 1 },
          { field: 'title', contains: 'x' },
        ],
      }),
    ).toBe(true);
  });

  it('are checked in definitions', () => {
    const field = { name: 'a', type: 'text', label: 'A' };
    expect(
      fieldDefinitionSchema.safeParse({ ...field, showIf: { field: 'b', gt: 3 } }).success,
    ).toBe(true);
    expect(
      fieldDefinitionSchema.safeParse({ ...field, showIf: { field: 'b', gt: 'three' } }).success,
    ).toBe(false);
  });

  it('let a required field hidden by its condition stay empty', () => {
    const fields: FieldDefinition[] = [
      { name: 'paid', type: 'boolean', label: 'Paid' },
      {
        name: 'price',
        type: 'number',
        label: 'Price',
        required: true,
        showIf: { field: 'paid', equals: true },
      },
    ];
    expect(fieldsValidator(fields).safeParse({ paid: false }).success).toBe(true);
    const shown = fieldsValidator(fields).safeParse({ paid: true });
    expect(shown.success).toBe(false);
    expect(shown.error!.issues[0]).toMatchObject({
      path: ['price'],
      message: 'This field is required.',
    });
  });
});

const TEAM: FieldDefinition[] = [
  { name: 'photo', type: 'media', label: 'Photo' },
  {
    name: 'team',
    type: 'list',
    label: 'Team',
    fields: [
      { name: 'name', type: 'text', label: 'Name' },
      { name: 'picture', type: 'media', label: 'Picture' },
    ],
  },
];
const M1 = '0190a0a0-0000-7000-8000-000000000001';

describe('list rows', () => {
  it('get a stable id, kept when they have one', () => {
    let n = 0;
    const values = { team: [{ name: 'Ann' }, { _id: 'keep', name: 'Bob' }] };
    const withIds = ensureRowIds(TEAM, values, () => `id${++n}`);
    expect(withIds.team).toEqual([
      { _id: 'id1', name: 'Ann' },
      { _id: 'keep', name: 'Bob' },
    ]);
    // Nothing to add: the same object.
    expect(ensureRowIds(TEAM, withIds)).toBe(withIds);
  });
});

describe('formatting', () => {
  it('gives media as images and formats list rows', async () => {
    const media = async (id: string) =>
      id === M1
        ? { id, url: '/media/x.png', alt: 'X', width: 10, height: 5, mime: 'image/png', sizes: {} }
        : null;
    const formatted = await formatFieldValues(
      TEAM,
      { photo: M1, team: [{ _id: 'r1', name: 'Ann', picture: M1 }], extra: 1 },
      { siteId: 's', locale: 'en', media, entry: async () => null },
    );
    expect(formatted.photo).toMatchObject({ url: '/media/x.png', alt: 'X' });
    expect(formatted.team).toEqual([
      { _id: 'r1', name: 'Ann', picture: expect.objectContaining({ url: '/media/x.png' }) },
    ]);
    // Only defined fields.
    expect(formatted).not.toHaveProperty('extra');
  });
});

describe('transfer', () => {
  it('writes references as refs and reads them back with the new ids', () => {
    const exported = exportFieldValues(TEAM, {
      photo: M1,
      team: [{ _id: 'r1', name: 'Ann', picture: M1 }],
      other: 'kept',
    });
    expect(exported).toEqual({
      photo: { $media: M1 },
      team: [{ _id: 'r1', name: 'Ann', picture: { $media: M1 } }],
      other: 'kept',
    });
    const imported = importFieldRefs(exported, { media: (ref) => (ref === M1 ? 'new' : null) });
    expect(imported).toEqual({
      photo: 'new',
      team: [{ _id: 'r1', name: 'Ann', picture: 'new' }],
      other: 'kept',
    });
    // Refs the maps do not know yet stay for a later pass; unknown records become null.
    expect(importFieldRefs({ a: { $entry: 'e' } }, {})).toEqual({ a: { $entry: 'e' } });
    expect(importFieldRefs({ a: { $term: 't' } }, { term: () => null })).toEqual({ a: null });
  });
});
