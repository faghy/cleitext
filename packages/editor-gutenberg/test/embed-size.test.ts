import { describe, expect, it } from 'vitest';
import { embedPreviewSize } from '../src/embed-size';

describe('embedPreviewSize', () => {
  it('gives fixed frames and link cards the size the page gives them', () => {
    expect(embedPreviewSize('https://www.tiktok.com/@linomissio')).toEqual({
      className: 'cx-embed-fixed',
      width: 780,
      height: 479,
    });
    expect(embedPreviewSize('https://www.instagram.com/someone/')).toMatchObject({
      className: 'cx-embed-card',
    });
  });

  it('leaves videos to their aspect ratio, and unknown or missing addresses alone', () => {
    expect(embedPreviewSize('https://youtu.be/dQw4w9WgXcQ')).toBeNull();
    expect(embedPreviewSize('https://example.com/page')).toBeNull();
    expect(embedPreviewSize(undefined)).toBeNull();
  });
});
