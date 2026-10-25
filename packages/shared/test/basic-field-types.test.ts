/**
 * The core's basic field types of plugin API 1.48 (relations to entries,
 * terms and members, rich text, files, links, times), the rich-text
 * cleaner, options pages and their location rule.
 */
import { describe, expect, it } from 'vitest';
import { fieldValueKind, type FieldFormatContext } from '../src/field-types.js';
import { mayMatchOptionsPage, matchesLocation, type LocationRules } from '../src/field-groups.js';
import {
  exportFieldValues,
  fieldDefinitionSchema,
  fieldIndexValue,
  fieldListSchema,
  fieldsValidator,
  formatFieldValues,
  importFieldRefs,
  type FieldDefinition,
} from '../src/fields.js';
import { optionsPageSchema, translatableField } from '../src/options-pages.js';
import { richTextToPlain, sanitizeRichText } from '../src/rich-text.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const fields: FieldDefinition[] = [
  { name: 'related', type: 'entry', label: 'Related', types: ['article'], multiple: true, max: 2 },
  { name: 'main', type: 'entry', label: 'Main' },
  { name: 'topic', type: 'term', label: 'Topic', taxonomy: 'category' },
  { name: 'people', type: 'user', label: 'People', multiple: true },
  { name: 'bio', type: 'richtext', label: 'Bio' },
  { name: 'brochure', type: 'file', label: 'Brochure', accept: ['application/pdf'] },
  { name: 'cta', type: 'link', label: 'Call to action' },
  { name: 'opens', type: 'time', label: 'Opens' },
  { name: 'tint', type: 'color', label: 'Tint' },
  { name: 'day', type: 'date', label: 'Day' },
];

describe('definitions', () => {
  it('accepts the new types and their settings', () => {
    expect(fieldListSchema.safeParse(fields).success).toBe(true);
    expect(
      fieldDefinitionSchema.safeParse({ name: 'f', type: 'file', label: 'F', accept: ['nope'] })
        .success,
    ).toBe(false);
    expect(
      fieldDefinitionSchema.safeParse({ name: 'e', type: 'entry', label: 'E', max: 0 }).success,
    ).toBe(false);
  });

  it('offers each type to dynamic data with its kind', () => {
    const kind = (name: string) => fieldValueKind(fields.find((f) => f.name === name)!);
    expect(kind('related')).toBe('list');
    expect(kind('main')).toBe('entry');
    expect(kind('topic')).toBe('term');
    expect(kind('people')).toBe('list');
    expect(kind('bio')).toBe('richtext');
    expect(kind('brochure')).toBe('file');
    expect(kind('cta')).toBe('link');
    expect(kind('opens')).toBe('text');
  });
});

describe('values', () => {
  const check = (values: Record<string, unknown>) => fieldsValidator(fields).safeParse(values);

  it('checks ids, lists, links and times', () => {
    expect(check({ related: [A, B], main: C, topic: A, people: [B] }).success).toBe(true);
    expect(check({ related: [A, B, C] }).success).toBe(false); // max 2
    expect(check({ main: [A] }).success).toBe(false); // single
    expect(check({ topic: 'news' }).success).toBe(false);
    expect(
      check({ cta: { url: 'https://example.com', label: 'Go', target: '_blank' } }).success,
    ).toBe(true);
    expect(check({ cta: { url: 'javascript:alert(1)' } }).success).toBe(false);
    expect(check({ cta: { url: '/x', extra: 1 } }).success).toBe(false);
    expect(check({ opens: '09:30' }).success).toBe(true);
    expect(check({ opens: '25:00' }).success).toBe(false);
    expect(check({ brochure: 'not-an-id' }).success).toBe(false);
  });

  it('saves values normalized: rich text cleaned, relations once each, links trimmed', () => {
    const result = check({
      bio: '<p onclick="x()">Hi <b>there</b><script>alert(1)</script></p>',
      related: [A, A],
      cta: { url: ' /contact ', label: '  ' },
    });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      bio: '<p>Hi <b>there</b></p>',
      related: [A],
      cta: { url: '/contact' },
    });
  });

  it('a required link needs an address', () => {
    const required = fieldsValidator([{ name: 'cta', type: 'link', label: 'CTA', required: true }]);
    expect(required.safeParse({ cta: { url: '' } }).success).toBe(false);
    expect(required.safeParse({ cta: { url: '/x' } }).success).toBe(true);
  });

  it('indexes rich text and links as text, relations not at all', () => {
    const field = (name: string) => fields.find((f) => f.name === name)!;
    expect(fieldIndexValue(field('bio'), '<p>One</p><p>Two &amp; three</p>')).toBe(
      'One\nTwo & three',
    );
    expect(fieldIndexValue(field('cta'), { url: '/x', label: 'Book' })).toBe('Book');
    expect(fieldIndexValue(field('main'), A)).toBeNull();
  });
});

describe('formatting', () => {
  const context: Omit<FieldFormatContext, 'format'> = {
    siteId: 's',
    locale: 'en',
    media: async (id) => ({
      id,
      url: `/media/${id}.png`,
      alt: '',
      width: 10,
      height: 10,
      mime: 'image/png',
      sizes: {},
    }),
    file: async (id) =>
      id === C
        ? {
            id,
            url: `/media/${id}.pdf`,
            alt: '',
            width: null,
            height: null,
            mime: 'application/pdf',
            sizes: {},
            filename: 'menu.pdf',
          }
        : null,
    entry: async (id) =>
      id === B ? null : { id, type: 'article', title: `Entry ${id.slice(0, 1)}`, url: `/e/${id}` },
    term: async (id) => ({ id, taxonomy: 'category', name: 'News', slug: 'news', url: '/news' }),
    user: async (id) => ({ id, name: 'Ann', avatarUrl: null, url: null }),
  };

  it('gives templates the records (published entries only), links and files', async () => {
    const out = await formatFieldValues(
      fields,
      {
        related: [A, B],
        main: A,
        topic: C,
        people: [A],
        brochure: C,
        cta: { url: '/book' },
        bio: '<p>Hi<img src=x onerror=alert(1)></p>',
      },
      context,
    );
    expect(out.related).toEqual([{ id: A, type: 'article', title: 'Entry 1', url: `/e/${A}` }]);
    expect(out.main).toMatchObject({ id: A, title: 'Entry 1' });
    expect(out.topic).toMatchObject({ name: 'News', taxonomy: 'category' });
    expect(out.people).toEqual([{ id: A, name: 'Ann', avatarUrl: null, url: null }]);
    expect(out.brochure).toMatchObject({ filename: 'menu.pdf', mime: 'application/pdf' });
    expect(out.cta).toEqual({ url: '/book', label: '/book', target: null });
    expect(out.bio).toBe('<p>Hi</p>');
  });

  it('works on older contexts without terms or members', async () => {
    const old = { ...context } as Partial<typeof context>;
    delete old.term;
    delete old.user;
    delete old.file;
    const out = await formatFieldValues(
      fields,
      { topic: A, people: [A], brochure: C },
      old as typeof context,
    );
    expect(out.topic).toBeNull();
    expect(out.people).toEqual([]);
    expect(out.brochure).toMatchObject({ url: `/media/${C}.png` });
  });
});

describe('transfer', () => {
  it('writes references as refs and reads them back', () => {
    const exported = exportFieldValues(fields, {
      related: [A, B],
      main: A,
      topic: B,
      people: [C],
      brochure: C,
      cta: { url: '/x' },
    });
    expect(exported).toMatchObject({
      related: [{ $entry: A }, { $entry: B }],
      main: { $entry: A },
      topic: { $term: B },
      people: [{ $user: C }],
      brochure: { $media: C },
      cta: { url: '/x' },
    });
    const imported = importFieldRefs(exported, {
      entry: (ref) => (ref === A ? 'new-a' : null),
      term: () => 'new-t',
      user: () => 'new-u',
      media: () => 'new-m',
    });
    expect(imported).toMatchObject({
      related: ['new-a', null],
      main: 'new-a',
      topic: 'new-t',
      people: ['new-u'],
      brochure: 'new-m',
    });
  });
});

describe('sanitizeRichText', () => {
  it('keeps the small set of tags and safe links only', () => {
    expect(
      sanitizeRichText(
        '<h2 class="x">Title</h2><p style="color:red">A <a href="https://x.test" onclick="y()" target="_blank">link</a> and <a href="javascript:alert(1)">bad</a></p>',
      ),
    ).toBe(
      '<h2>Title</h2><p>A <a href="https://x.test" target="_blank" rel="noopener noreferrer">link</a> and <a>bad</a></p>',
    );
    expect(sanitizeRichText('<a href="java&#115;cript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeRichText('<a href=" jav\tascript:alert(1)">x</a>')).toBe('<a>x</a>');
  });

  it('drops scripts and styles with their content, keeps text of other tags', () => {
    expect(
      sanitizeRichText('<div><span>Kept</span><style>p{}</style><script>x</script></div>'),
    ).toBe('Kept');
    expect(sanitizeRichText('<iframe src="x">inside</iframe>after')).toBe('after');
  });

  it('closes what is left open and escapes stray brackets', () => {
    expect(sanitizeRichText('<p><strong>bold')).toBe('<p><strong>bold</strong></p>');
    expect(sanitizeRichText('5 < 6 & 7 > 3')).toBe('5 &lt; 6 &amp; 7 &gt; 3');
    expect(sanitizeRichText('</em>stray<ul><li>one</ul>')).toBe('stray<ul><li>one</li></ul>');
    expect(sanitizeRichText('<img src=x onerror=alert(1)>')).toBe('');
  });

  it('gives plain text', () => {
    expect(richTextToPlain('<ul><li>a</li><li>b</li></ul><p>c&nbsp;d</p>')).toBe('a\nb\nc d');
  });
});

describe('options pages', () => {
  it('checks a page', () => {
    expect(
      optionsPageSchema.safeParse({
        slug: 'contacts',
        title: { en: 'Contacts', it: 'Contatti' },
        parent: '/settings',
        icon: 'settings',
        position: 5,
        capability: 'edit_theme_settings',
        fields: [{ name: 'phone', type: 'text', label: 'Phone' }],
      }).success,
    ).toBe(true);
    expect(optionsPageSchema.safeParse({ slug: 'Bad Slug', title: 'X' }).success).toBe(false);
    expect(optionsPageSchema.safeParse({ slug: 'x', title: 'X', parent: 'a b' }).success).toBe(
      false,
    );
    expect(
      optionsPageSchema.safeParse({ slug: 'x', title: 'X', icon: 'M4 4h16v16H4z' }).success,
    ).toBe(true);
    expect(optionsPageSchema.safeParse({ slug: 'x', title: 'X', icon: '<svg>' }).success).toBe(
      false,
    );
  });

  it('attaches groups with the optionsPage rule', () => {
    const rules: LocationRules = [[{ param: 'optionsPage', operator: '==', value: 'contacts' }]];
    expect(matchesLocation(rules, { object: 'options', optionsPage: 'contacts' })).toBe(true);
    expect(matchesLocation(rules, { object: 'options', optionsPage: 'footer' })).toBe(false);
    expect(matchesLocation(rules, { object: 'entry', contentType: 'page' })).toBe(false);
    const byRole: LocationRules = [
      [
        { param: 'optionsPage', operator: '==', value: 'contacts' },
        { param: 'currentUserRole', operator: '==', value: 'editor' },
      ],
    ];
    expect(mayMatchOptionsPage(byRole, 'contacts')).toBe(true);
    expect(mayMatchOptionsPage(byRole, 'footer')).toBe(false);
    expect(
      mayMatchOptionsPage([[{ param: 'contentType', operator: '==', value: '*' }]], 'contacts'),
    ).toBe(false);
  });

  it('translates every field but those copied', () => {
    expect(translatableField({ name: 'a', type: 'text', label: 'A' })).toBe(true);
    expect(translatableField({ name: 'a', type: 'text', label: 'A', translation: 'ignore' })).toBe(
      true,
    );
    expect(translatableField({ name: 'a', type: 'text', label: 'A', translation: 'copy' })).toBe(
      false,
    );
  });
});
