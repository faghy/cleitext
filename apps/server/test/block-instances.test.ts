/** Plugin blocks with one id in two documents of a page (a header template and the entry). */
import type { CxdBlock, CxdDocument } from '@cleitext/blocks';
import { describe, expect, it } from 'vitest';
import { pluginBlockInstances } from '../src/public/block-instances.js';

const block = (
  id: string,
  attrs: Record<string, unknown> = {},
  children?: CxdBlock[],
  type = 'fresco/heading',
): CxdBlock => ({ id, type, v: 1, attrs, ...(children ? { children } : {}) }) as CxdBlock;
const doc = (...blocks: CxdBlock[]): CxdDocument => ({ schema: 1, blocks }) as CxdDocument;
const isPlugin = (type: string) => type.startsWith('fresco/');

describe('pluginBlockInstances', () => {
  it('keeps every block as it is when ids are unique', () => {
    const a = block('a', { title: 'A' });
    const b = block('b', {}, [block('c')], 'fresco/container');
    const { instances, resolve } = pluginBlockInstances([doc(a), doc(b)], isPlugin);
    expect(instances.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(resolve(a)).toBe(a);
    expect(resolve(b)).toBe(b);
  });

  it('gives the later of two different blocks with one id a new id', () => {
    const page = block('x1', { title: 'Page' });
    const header = block('x1', { title: 'Header' });
    const { instances, resolve } = pluginBlockInstances([doc(page), doc(header)], isPlugin);
    expect(resolve(page)).toBe(page);
    expect(resolve(header)).toMatchObject({ id: 'x1-2', attrs: { title: 'Header' } });
    expect(instances).toHaveLength(2);
  });

  it('never takes an id in use, and resolves nested twins', () => {
    const inner = block('k', { title: 'Inner' });
    const { resolve } = pluginBlockInstances(
      [
        doc(block('k', { title: 'Top' }), block('k-2')),
        doc(block('wrap', {}, [inner], 'fresco/container')),
      ],
      isPlugin,
    );
    expect(resolve(inner).id).toBe('k-3');
  });

  it('keeps one instance for the same object or the same content met twice', () => {
    const shared = block('s', { title: 'Synced' });
    const copy = block('s', { title: 'Synced' });
    const { instances, resolve } = pluginBlockInstances(
      [doc(shared), doc(shared), doc(copy)],
      isPlugin,
    );
    expect(instances).toEqual([shared]);
    expect(resolve(copy)).toBe(shared);
  });

  it('leaves blocks of other kinds alone', () => {
    const core = block('p', {}, undefined, 'core/paragraph');
    const { instances, resolve } = pluginBlockInstances([doc(core), doc(block('p'))], isPlugin);
    expect(instances.map((i) => i.id)).toEqual(['p']);
    expect(resolve(core)).toBe(core);
  });
});
