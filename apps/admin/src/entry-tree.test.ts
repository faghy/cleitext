import { describe, expect, it } from 'vitest';
import { descendantsOf, entryTree } from './entry-tree';

const page = (id: string, parentId: string | null, position = 0, title = id) => ({
  id,
  parentId,
  position,
  title,
});

describe('entry tree', () => {
  const pages = [
    page('team', 'about', 2),
    page('contact', null, 1),
    page('about', null, 0),
    page('history', 'about', 1),
    page('founders', 'history', 0),
    page('orphan', 'missing', 0, 'Orphan'),
  ];

  it('orders children under their parent by position, then title', () => {
    expect(entryTree(pages).map((r) => `${'-'.repeat(r.depth)}${r.entry.id}`)).toEqual([
      'about',
      '-history',
      '--founders',
      '-team',
      'orphan',
      'contact',
    ]);
  });

  it('finds the descendants of an entry', () => {
    expect([...descendantsOf(pages, 'about')].sort()).toEqual([
      'about',
      'founders',
      'history',
      'team',
    ]);
  });
});
