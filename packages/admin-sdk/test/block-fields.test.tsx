import type { FieldGroupView } from '@cleitext/shared';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { blockFields, fieldsOfBlock, useBlockFields } from '../src/block-fields.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const group = (
  id: string,
  block: string,
  names: string[],
  op: '==' | '!=' = '==',
): FieldGroupView => ({
  id,
  title: id,
  fields: names.map((name) => ({ name, type: 'text', label: name })),
  location: [[{ param: 'block', operator: op, value: block }]],
});

const groups: FieldGroupView[] = [
  group('hero', 'acme/hero', ['title', 'image']),
  group('more', 'acme/hero', ['title', 'link']),
  group('card', 'acme/card', ['name']),
  group('any', '*', ['note']),
  {
    id: 'entry',
    title: 'Entry',
    fields: [],
    location: [[{ param: 'contentType', operator: '==', value: 'page' }]],
  },
];

function respond(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

afterEach(() => vi.unstubAllGlobals());

describe('fieldsOfBlock', () => {
  it('keeps the groups naming the block, in order, and the first field of a name', () => {
    const out = fieldsOfBlock(groups, 'acme/hero');
    expect(out.groups.map((g) => g.id)).toEqual(['hero', 'more', 'any']);
    expect(out.fields.map((f) => f.name)).toEqual(['title', 'image', 'link', 'note']);
    expect(fieldsOfBlock(groups, 'acme/none').fields.map((f) => f.name)).toEqual(['note']);
  });
});

describe('blockFields', () => {
  it('reads the block screen once, and again on refresh', async () => {
    const fetch = respond({ groups, templates: [] });
    vi.stubGlobal('fetch', fetch);
    const first = await blockFields('acme/card', { refresh: true });
    expect(first.fields.map((f) => f.name)).toEqual(['name', 'note']);
    await blockFields('acme/hero');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe('/api/v1/field-screens/block');
    await blockFields('acme/hero', { refresh: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('asks again after a failure', async () => {
    vi.stubGlobal('fetch', respond({ title: 'Down', status: 500 }, 500));
    await expect(blockFields('acme/hero', { refresh: true })).rejects.toThrow('Down');
    const fetch = respond({ groups: [group('x', 'acme/x', ['a'])], templates: [] });
    vi.stubGlobal('fetch', fetch);
    expect((await blockFields('acme/x')).fields.map((f) => f.name)).toEqual(['a']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('useBlockFields', () => {
  function Probe({ name }: { name: string }) {
    const { fields, loading } = useBlockFields(name);
    return <p>{loading ? 'loading' : fields.map((f) => f.name).join(',')}</p>;
  }

  it('loads the fields of a block, and is empty when the groups cannot be read', async () => {
    vi.stubGlobal('fetch', respond({ groups, templates: [] }));
    await blockFields('acme/hero', { refresh: true });
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(<Probe name="acme/hero" />));
    expect(container.textContent).toBe('title,image,link,note');
    await act(async () => root.render(<Probe name="acme/card" />));
    expect(container.textContent).toBe('name,note');

    vi.stubGlobal('fetch', respond({ title: 'Down', status: 500 }, 500));
    await blockFields('acme/hero', { refresh: true }).catch(() => {});
    await act(async () => root.render(<Probe name="acme/other" />));
    expect(container.textContent).toBe('');
    act(() => root.unmount());
  });
});
