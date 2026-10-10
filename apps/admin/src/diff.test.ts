import { describe, expect, it } from 'vitest';
import { diffWords, documentLines } from './diff';

describe('diffWords', () => {
  it('marks added and removed words', () => {
    expect(diffWords('the quick fox', 'the slow fox jumps')).toEqual([
      { text: 'the ', change: 'same' },
      { text: 'quick', change: 'removed' },
      { text: 'slow', change: 'added' },
      { text: ' fox', change: 'same' },
      { text: ' jumps', change: 'added' },
    ]);
    expect(diffWords('same', 'same')).toEqual([{ text: 'same', change: 'same' }]);
  });

  it('turns documents into lines of text', () => {
    expect(
      documentLines({
        schema: 1,
        blocks: [
          { id: 'h', type: 'core/heading', v: 1, attrs: {}, content: [{ text: 'Title' }] },
          { id: 'i', type: 'core/image', v: 1, attrs: { alt: 'A cat' } },
          {
            id: 'g',
            type: 'core/group',
            v: 1,
            attrs: {},
            children: [
              { id: 'p', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Body' }] },
            ],
          },
        ],
      }),
    ).toEqual(['Title', '[A cat]', 'Body']);
  });
});
