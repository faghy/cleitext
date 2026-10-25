import type { CxdDocument } from '@cleitext/blocks';
import { describe, expect, it } from 'vitest';
import { documentExcerpt } from '../src/document.js';

const doc = (...texts: string[]): CxdDocument => ({
  schema: 1,
  blocks: texts.map((text, i) => ({
    id: `p${i}`,
    type: 'core/paragraph',
    v: 1,
    attrs: {},
    content: [{ text }],
  })),
});

describe('automatic excerpts leave embeds out, as WordPress', () => {
  it('a post holding only a video has no excerpt', () => {
    expect(documentExcerpt(doc('https://www.youtube.com/watch?v=abcdefghijk'))).toBe('');
    expect(documentExcerpt(doc('[embed]https://youtu.be/abcdefghijk[/embed]'))).toBe('');
  });

  it('the words around an embed stay, an address inside a sentence too', () => {
    expect(
      documentExcerpt(
        doc('https://vimeo.com/123', 'Il concerto di ieri sera.', '[gallery ids="1,2"]'),
      ),
    ).toBe('Il concerto di ieri sera.');
    expect(documentExcerpt(doc('Guarda https://example.com/a per i dettagli.'))).toBe(
      'Guarda https://example.com/a per i dettagli.',
    );
  });
});
