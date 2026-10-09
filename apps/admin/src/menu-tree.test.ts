import { describe, expect, it } from 'vitest';
import {
  canIndent,
  indent,
  MAX_DEPTH,
  moveDown,
  moveUp,
  outdent,
  remove,
  toTree,
  type FlatItem,
} from './menu-tree';

const item = (key: string, depth: number): FlatItem => ({
  key,
  depth,
  kind: 'custom',
  entryId: null,
  termId: null,
  url: null,
  label: key,
  target: null,
  title: key,
});

const shape = (items: FlatItem[]) => items.map((i) => `${'-'.repeat(i.depth)}${i.key}`);

// a
// -b
// -c
// d
const sample = [item('a', 0), item('b', 1), item('c', 1), item('d', 0)];

describe('menu tree editing', () => {
  it('moves items with their children among siblings', () => {
    expect(shape(moveUp(sample, 3))).toEqual(['d', 'a', '-b', '-c']);
    expect(shape(moveDown(sample, 0))).toEqual(['d', 'a', '-b', '-c']);
    expect(shape(moveUp(sample, 2))).toEqual(['a', '-c', '-b', 'd']);
    // No previous sibling: unchanged.
    expect(moveUp(sample, 1)).toBe(sample);
    expect(moveDown(sample, 2)).toBe(sample);
  });

  it('indents under the previous sibling and outdents', () => {
    expect(shape(indent(sample, 3))).toEqual(['a', '-b', '-c', '-d']);
    expect(shape(indent(sample, 2))).toEqual(['a', '-b', '--c', 'd']);
    expect(indent(sample, 0)).toBe(sample);
    expect(shape(outdent(sample, 1))).toEqual(['a', 'b', '-c', 'd']);
    expect(outdent(sample, 0)).toBe(sample);
  });

  it('respects the maximum depth', () => {
    const deep = [
      item('a', 0),
      ...Array.from({ length: MAX_DEPTH }, (_, i) => item(`x${i}`, i + 1)),
    ];
    deep.push(item('y', MAX_DEPTH));
    expect(canIndent(deep, deep.length - 1)).toBe(false);
  });

  it('removes items with their children', () => {
    expect(shape(remove(sample, 0))).toEqual(['d']);
  });

  it('builds the nested payload for the API', () => {
    expect(toTree(sample)).toEqual([
      {
        kind: 'custom',
        label: 'a',
        target: null,
        children: [
          { kind: 'custom', label: 'b', target: null, children: [] },
          { kind: 'custom', label: 'c', target: null, children: [] },
        ],
      },
      { kind: 'custom', label: 'd', target: null, children: [] },
    ]);
  });
});
