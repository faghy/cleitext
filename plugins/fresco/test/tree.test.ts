import { describe, expect, it } from 'vitest';
import type { FrescoNode } from '../src/core/model.js';
import {
  duplicate,
  find,
  insert,
  move,
  pathTo,
  placeOf,
  remove,
  setSettings,
} from '../src/editor/tree.js';

const n = (id: string, children?: FrescoNode[]): FrescoNode => ({
  id,
  type: children ? 'fresco/container' : 'fresco/heading',
  v: 1,
  attrs: {},
  ...(children ? { children } : {}),
});

const tree = () => [n('a', [n('a1'), n('a2'), n('a3')]), n('b', [n('b1', [n('b11')])]), n('c')];
const ids = (list: FrescoNode[]): unknown[] =>
  list.map((node) => (node.children ? { [node.id]: ids(node.children) } : node.id));

describe('tree', () => {
  it('finds nodes, their place and path', () => {
    expect(find(tree(), 'b11')?.id).toBe('b11');
    expect(placeOf(tree(), 'a2')).toEqual({ parent: 'a', index: 1 });
    expect(placeOf(tree(), 'c')).toEqual({ parent: null, index: 2 });
    expect(pathTo(tree(), 'b11')).toEqual(['b', 'b1', 'b11']);
  });

  it('moves within the same parent counting the index before the move', () => {
    // Drop a1 after a2 (index 2 as shown before the move).
    expect(ids(move(tree(), 'a1', { parent: 'a', index: 2 }))).toEqual([
      { a: ['a2', 'a1', 'a3'] },
      { b: [{ b1: ['b11'] }] },
      'c',
    ]);
    expect(ids(move(tree(), 'a3', { parent: 'a', index: 0 }))[0]).toEqual({
      a: ['a3', 'a1', 'a2'],
    });
  });

  it('moves across parents and to the top, never inside itself', () => {
    expect(ids(move(tree(), 'b11', { parent: null, index: 0 }))).toEqual([
      'b11',
      { a: ['a1', 'a2', 'a3'] },
      { b: [{ b1: [] }] },
      'c',
    ]);
    expect(move(tree(), 'b', { parent: 'b1', index: 0 })).toEqual(tree());
  });

  it('keeps settings sparse and duplicates with new ids', () => {
    const t1 = setSettings(tree(), 'c', { title: 'Hi', color: '#000' });
    const t2 = setSettings(t1, 'c', { color: '' });
    expect(find(t2, 'c')?.attrs).toEqual({ title: 'Hi' });
    const { tree: t3, id } = duplicate(tree(), 'a');
    expect(t3).toHaveLength(4);
    expect(id).not.toBe('a');
    expect(t3[1]!.children!.map((c) => c.id)).not.toContain('a1');
    expect(ids(remove(insert(tree(), n('x'), { parent: 'b', index: 9 }), 'a'))).toEqual([
      { b: [{ b1: ['b11'] }, 'x'] },
      'c',
    ]);
  });
});
