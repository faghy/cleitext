import { describe, expect, it } from 'vitest';
import {
  canIndent,
  dropDepths,
  indent,
  MAX_DEPTH,
  moveDown,
  moveTo,
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

  it('drops a subtree anywhere, at an allowed depth', () => {
    // Without "a" and its children the list is [d]: before d, after d.
    expect(shape(moveTo(sample, 0, 1, 0))).toEqual(['d', 'a', '-b', '-c']);
    expect(shape(moveTo(sample, 0, 1, 1))).toEqual(['d', '-a', '--b', '--c']);
    // "d" dropped between b and c: a sibling of them, or a child of b.
    expect(dropDepths(sample, 3, 2)).toEqual({ min: 0, max: 2 });
    expect(shape(moveTo(sample, 3, 2, 2))).toEqual(['a', '-b', '--d', '-c']);
    // Before c (depth 1) the item must stay at depth 0 at least, and the
    // requested depth is clamped.
    expect(shape(moveTo(sample, 3, 0, 3))).toEqual(['d', 'a', '-b', '-c']);
    // "b" dropped at the end, under d.
    expect(shape(moveTo(sample, 1, 3, 9))).toEqual(['a', '-c', 'd', '-b']);
  });

  it('keeps dropped subtrees within the maximum depth', () => {
    const tall = [item('a', 0), item('b', 0), item('c', 1), item('d', 2)];
    // b spans two levels: under a it can go one level deep at most.
    expect(dropDepths(tall, 1, 1).max).toBe(1);
    const deep = Array.from({ length: MAX_DEPTH + 1 }, (_, i) => item(`x${i}`, i));
    expect(dropDepths([...deep, ...tall.slice(1)], MAX_DEPTH + 1, MAX_DEPTH + 1).max).toBe(
      MAX_DEPTH - 2,
    );
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
