import { describe, expect, it } from 'vitest';
import type { CxdDocument } from '../src/cxd.js';
import { documentStats } from '../src/stats.js';

const heading = (id: string, level: number, text: string) => ({
  id,
  type: 'core/heading',
  v: 1,
  attrs: { level },
  content: [{ text }],
});

describe('documentStats', () => {
  it('counts words and reading time, captions included', () => {
    const doc: CxdDocument = {
      schema: 1,
      blocks: [
        {
          id: 'p',
          type: 'core/paragraph',
          v: 1,
          attrs: {},
          content: [{ text: 'One two — three, ' }, { text: 'four', marks: ['bold'] }],
        },
        { id: 'i', type: 'core/image', v: 1, attrs: { caption: [{ text: 'five six' }] } },
      ],
    };
    expect(documentStats(doc)).toMatchObject({ words: 6, readingMinutes: 1 });
    expect(documentStats({ schema: 1, blocks: [] })).toMatchObject({ words: 0, readingMinutes: 0 });
  });

  it('skips lists in plugin attributes that are not text', () => {
    const doc: CxdDocument = {
      schema: 1,
      blocks: [
        {
          id: 'f',
          type: 'fresco-pro/form',
          v: 1,
          attrs: {
            fields: [{ _id: 'a', type: 'text', label: 'Name' }],
            note: [{ type: 'link', href: '/', children: [{ text: 'one two' }] }],
          },
        },
      ],
    };
    expect(documentStats(doc)).toMatchObject({ words: 2 });
  });

  it('flags H1 in the content and skipped heading levels', () => {
    const doc: CxdDocument = {
      schema: 1,
      blocks: [
        heading('a', 2, 'Intro'),
        heading('b', 4, 'Deep'),
        heading('c', 3, 'Back'),
        heading('d', 1, 'Title'),
      ],
    };
    expect(documentStats(doc).headings.map((h) => h.problem)).toEqual([
      null,
      'skipped',
      null,
      'h1',
    ]);
  });
});
