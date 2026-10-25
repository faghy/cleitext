import { describe, expect, it } from 'vitest';
import {
  applyBindings,
  blockBindings,
  BOUND,
  boundMedia,
  boundMediaIds,
  boundText,
  boundUrl,
  type BindingResolver,
  type BindingScope,
  type BoundValue,
  FIELD_BLOCK,
  FIELD_ROW_BLOCK,
  FIELD_ROWS_BLOCK,
  formatBoundDate,
  hasBindings,
} from '../src/bindings.js';
import type { CxdBlock, CxdDocument } from '../src/cxd.js';
import { isTransferEntryRef, resolveEntryRefs } from '../src/transfer.js';

const bind = (bindings: Record<string, string>) => ({
  metadata: {
    bindings: Object.fromEntries(
      Object.entries(bindings).map(([attr, key]) => [
        attr,
        { source: 'cleitext/field', args: { key } },
      ]),
    ),
  },
});

const block = (
  id: string,
  type: string,
  attrs: Record<string, unknown> = {},
  extra: Partial<CxdBlock> = {},
): CxdBlock => ({ id, type, v: 1, attrs, ...extra });

const doc = (...blocks: CxdBlock[]): CxdDocument => ({ schema: 1, blocks });

/** Blocks read by position (the tests know how many there are). */
const all = (blocks: CxdBlock[] | undefined) =>
  (blocks ?? []) as CxdBlock[] & Record<0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10, CxdBlock>;

const bound = (b: CxdBlock) => (b as unknown as Record<symbol, Record<string, unknown>>)[BOUND];

describe('blockBindings and hasBindings', () => {
  it('keeps only the core source with a key', () => {
    const b = block('a', 'core/paragraph', {
      metadata: {
        bindings: {
          content: { source: 'cleitext/field', args: { key: 'entry.field:x' } },
          other: { source: 'core/post-meta', args: { key: 'y' } },
          empty: { source: 'cleitext/field', args: { key: '' } },
          none: null,
        },
      },
    });
    expect(blockBindings(b)).toEqual({ content: 'entry.field:x' });
    expect(blockBindings(block('b', 'core/paragraph'))).toEqual({});
  });

  it('finds bindings, Field and Field rows blocks at any depth', () => {
    expect(hasBindings(null)).toBe(false);
    expect(hasBindings(doc(block('a', 'core/paragraph')))).toBe(false);
    expect(hasBindings(doc(block('a', FIELD_BLOCK)))).toBe(true);
    expect(hasBindings(doc(block('a', FIELD_ROWS_BLOCK)))).toBe(true);
    const nested = block(
      'g',
      'core/group',
      {},
      {
        children: [block('p', 'core/paragraph', bind({ content: 'site.title' }))],
      },
    );
    expect(hasBindings(doc(nested))).toBe(true);
  });
});

describe('bound values', () => {
  it('formats dates, or keeps what cannot be read', () => {
    expect(formatBoundDate('2026-03-05', 'en')).toBe('March 5, 2026');
    expect(formatBoundDate('2026-03-05T10:30:00Z', 'en')).toMatch(/2026/);
    expect(formatBoundDate('not a date', 'en')).toBe('not a date');
    expect(formatBoundDate('2026-03-05', 'xx-invalid-locale-$$')).toBe('2026-03-05');
  });

  it('shows values as text', () => {
    expect(boundText({ value: null })).toBe('');
    expect(boundText({ value: [] })).toBe('');
    expect(boundText({ value: 'hi' })).toBe('hi');
    expect(boundText({ value: '2026-01-02', kind: 'date' }, 'it')).toBe('2 gennaio 2026');
    expect(boundText({ value: 3 })).toBe('3');
    expect(boundText({ value: true })).toBe('✓');
    expect(boundText({ value: false })).toBe('');
    expect(boundText({ value: ['a', { title: 'B' }, null] })).toBe('a, B');
    expect(boundText({ value: { label: 'Go', url: '/x' } })).toBe('Go');
    expect(boundText({ value: { url: '/x' } })).toBe('/x');
    expect(boundText({ value: { other: 1 } })).toBe('');
  });

  it('reads addresses and images', () => {
    expect(boundUrl(' /a ')).toBe('/a');
    expect(boundUrl('  ')).toBeUndefined();
    expect(boundUrl({ url: '/b' })).toBe('/b');
    expect(boundUrl({ url: '' })).toBeUndefined();
    expect(boundUrl(4)).toBeUndefined();
    expect(boundMedia('x')).toBeUndefined();
    expect(boundMedia({ url: '/f.pdf', mime: 'application/pdf' })).toBeUndefined();
    expect(boundMedia({ id: 'm1', url: '/i.png', alt: 'A', mime: 'image/png' })).toEqual({
      id: 'm1',
      url: '/i.png',
      alt: 'A',
      mime: 'image/png',
    });
    expect(boundMedia({ url: '/i.png' })).toEqual({ id: null, url: '/i.png', alt: '' });
  });
});

describe('applyBindings', () => {
  const values: Record<string, BoundValue> = {
    'entry.field:title': { value: 'Bound title' },
    'entry.field:rich': { value: '<p>One <strong>two</strong></p><p>Three</p>', kind: 'richtext' },
    'entry.field:link': { value: { url: '/go', label: 'Go', target: '_blank' } },
    'entry.field:image': { value: { id: 'm9', url: '/i.jpg', alt: 'Alt text' } },
    'entry.field:image-no-id': { value: { url: '/j.jpg' } },
    'entry.field:empty': { value: '' },
    'entry.field:number': { value: 7 },
    'entry.field:pdf': { value: { url: '/f.pdf', mime: 'application/pdf' } },
  };
  const resolve: BindingResolver = (key) => {
    if (key === 'boom') throw new Error('broken source');
    return values[key];
  };
  const opts = { resolve, locale: 'en' };

  it('returns documents without bindings unchanged', async () => {
    const d = doc(block('p', 'core/paragraph'));
    expect(await applyBindings(d, opts)).toBe(d);
  });

  it('fills text, rich text, links and images, keeping the fallback', async () => {
    const d = doc(
      block('h', 'core/heading', bind({ content: 'entry.field:title' }), {
        content: [{ text: 'Typed' }],
      }),
      block('r', 'core/paragraph', bind({ content: 'entry.field:rich' })),
      block('e', 'core/paragraph', bind({ content: 'entry.field:empty' }), {
        content: [{ text: 'Fallback' }],
      }),
      block('x', 'core/paragraph', bind({ content: 'boom' }), { content: [{ text: 'Safe' }] }),
      block('b', 'core/button', bind({ text: 'entry.field:link', url: 'entry.field:link' })),
      block('u', 'core/button', bind({ url: 'entry.field:number' })),
      block('i', 'core/image', {
        id: 'old',
        ...bind({ id: 'entry.field:image', caption: 'entry.field:title' }),
      }),
      block('j', 'core/image', { id: 'old', ...bind({ url: 'entry.field:image-no-id' }) }),
      block('k', 'core/image', { id: 'keep', ...bind({ url: 'entry.field:pdf' }) }),
      block('l', 'core/image', bind({ alt: 'entry.field:number', href: 'entry.field:link' })),
      block('n', 'core/unknown', bind({ content: 'entry.field:title' })),
    );
    const [h, r, e, x, b, u, i, j, k, l, n] = all((await applyBindings(d, opts)).blocks);
    expect(h.content).toEqual([{ text: 'Bound title' }]);
    expect(JSON.stringify(r.content)).toContain('Three');
    expect(e.content).toEqual([{ text: 'Fallback' }]);
    expect(x.content).toEqual([{ text: 'Safe' }]);
    expect(b.content).toEqual([{ text: 'Go' }]);
    expect(b.attrs).toMatchObject({ url: '/go', linkTarget: '_blank' });
    expect(u.attrs.url).toBeUndefined();
    expect(i.attrs).toMatchObject({ id: 'm9', url: '/i.jpg', alt: 'Alt text' });
    expect(i.attrs.caption).toEqual([{ text: 'Bound title' }]);
    expect(j.attrs.id).toBeUndefined();
    expect(j.attrs.url).toBe('/j.jpg');
    expect(k.attrs.id).toBe('keep');
    expect(l.attrs).toMatchObject({ alt: '7', href: '/go' });
    expect(n.attrs.content).toBeUndefined();
  });

  it('gives Field blocks their value, also inside other blocks', async () => {
    const d = doc(
      block(
        'g',
        'core/group',
        {},
        {
          children: [
            block('f', FIELD_BLOCK, { source: 'entry.field:image' }),
            block('z', FIELD_BLOCK, {}),
          ],
        },
      ),
    );
    const out = await applyBindings(d, { resolve, locale: 'it' });
    const [f, z] = all(all(out.blocks)[0].children);
    expect(bound(f)).toEqual({ value: values['entry.field:image']?.value, locale: 'it' });
    expect(bound(z)).toEqual({ value: undefined, locale: 'it' });
    expect(boundMediaIds(out)).toEqual(['m9']);
  });

  it('repeats Field rows for each row with its own scope and ids', async () => {
    const scopes: BindingScope[] = [];
    const rowsResolve: BindingResolver = (key, scope) => {
      scopes.push(scope);
      if (key === 'entry.field:team') {
        return {
          value: [{ _id: 'r1', name: 'Ada' }, 'plain', { name: 'Bo' }],
          kind: 'list',
        };
      }
      if (key === 'entry.field:related') {
        return {
          value: [
            { id: 'e1', type: 'post', title: 'Post' },
            { id: 't1', taxonomy: 'category', name: 'Cat' },
            { id: 'u1', name: 'Ann', avatarUrl: '/a.png' },
          ],
        };
      }
      if (key === 'entry.field:typed') return { value: [{ id: 'x1' }], rowKind: 'user' };
      if (key === 'row.field:name') return { value: scope.row?.name };
      return undefined;
    };
    const template = [block('p', 'core/paragraph', bind({ content: 'row.field:name' }))];
    const d = doc(
      block(
        'rows',
        FIELD_ROWS_BLOCK,
        { source: 'entry.field:team', limit: 2 },
        {
          children: template,
        },
      ),
      block('rel', FIELD_ROWS_BLOCK, { source: 'entry.field:related' }, { children: template }),
      block('typed', FIELD_ROWS_BLOCK, { source: 'entry.field:typed' }, { children: template }),
      block('none', FIELD_ROWS_BLOCK, {}),
    );
    const [rows, rel, typed, none] = all(
      (await applyBindings(d, { resolve: rowsResolve, locale: 'en' })).blocks,
    );
    expect(all(rows.children).map((c) => [c.id, c.type])).toEqual([
      ['rows-r1', FIELD_ROW_BLOCK],
      ['rows-1', FIELD_ROW_BLOCK],
    ]);
    expect(all(all(rows.children)[0].children)[0]).toMatchObject({
      id: 'p~r1',
      content: [{ text: 'Ada' }],
    });
    expect(bound(rows)).toEqual({ value: 3, kind: 'rows', locale: 'en' });
    expect(rel.children).toHaveLength(3);
    expect(scopes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entry: { id: 'e1' } }),
        expect.objectContaining({ term: { id: 't1' } }),
        expect.objectContaining({ user: { id: 'u1' } }),
        expect.objectContaining({ user: { id: 'x1' } }),
        expect.objectContaining({ row: { value: 'plain' }, rowSource: 'entry.field:team' }),
      ]),
    );
    expect(typed.children).toHaveLength(1);
    expect(none.children).toEqual([]);
  });
});

describe('entry references', () => {
  it('recognises and resolves them anywhere in a value', () => {
    expect(isTransferEntryRef({ $entry: 'post:1' })).toBe(true);
    expect(isTransferEntryRef({ $entry: 'post:1', other: 1 })).toBe(false);
    expect(isTransferEntryRef(null)).toBe(false);
    const ids = (ref: string) => (ref === 'post:1' ? 'E1' : undefined);
    expect(
      resolveEntryRefs(
        {
          a: [{ $entry: 'post:1' }, { $entry: 'post:2' }],
          b: { $entry: 'post:1', prefix: 'entry:' },
          c: 3,
        },
        ids,
      ),
    ).toEqual({ a: ['E1', null], b: 'entry:E1', c: 3 });
  });
});
