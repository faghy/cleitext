/**
 * Mask shapes of images, drawn for Prisma on a 480×380 box (so `auto` and
 * `contain` sizes frame them the same way as the shapes they replace).
 */
const SHAPES: Record<string, string> = {
  circle: '<circle cx="240" cy="190" r="184"/>',
  diamond: '<path d="M240 1 429 190 240 379 51 190Z"/>',
  hexagon: '<path d="M240 2 403 96v188L240 378 77 284V96Z"/>',
  rounded: '<rect x="59" y="9" width="362" height="362" rx="62"/>',
  blob1:
    '<path d="M64 238c-26-62 4-138 72-166 70-29 150-58 226-38 62 16 104 70 98 132-7 70-62 120-132 140-88 25-232-1-264-68Z"/>',
  blob2:
    '<path d="M300 22c78 10 140 76 142 156 2 92-60 170-152 186-86 15-196 2-240-66-38-60-14-148 52-188 54-32 134-96 198-88Z"/>',
  blob3:
    '<path d="M70 40c66-30 196-12 280 34 74 40 116 110 96 186-22 82-108 124-194 108-92-17-176-78-210-160C16 152 20 63 70 40Z"/>',
  blob4:
    '<path d="M246 20c56 4 92 52 136 72 46 21 82 66 70 118-11 50-60 70-82 112-26 50-82 66-136 52-46-12-74-54-118-70-48-18-92-50-90-104 2-56 48-80 72-120 30-50 88-64 148-60Z"/>',
};

export const MASK_SHAPES = Object.keys(SHAPES);

/** A built-in shape as a CSS `url(…)` (an inline SVG, so it works everywhere). */
export function maskUrl(shape: string): string | null {
  const body = SHAPES[shape];
  if (!body) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 380">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
