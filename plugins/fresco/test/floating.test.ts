import { describe, expect, it } from 'vitest';
import { placePopover } from '../src/editor/floating.js';

const rect = (left: number, top: number, width = 28, height = 28) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});
const picker = { width: 252, height: 330 };

describe('popover placement', () => {
  it('lines up right edges below the anchor when there is room', () => {
    expect(placePopover(rect(600, 100), picker, { width: 1280, height: 800 })).toEqual({
      left: 628 - 252,
      top: 134,
    });
  });

  it('opens rightward from a swatch at the left of the window (issue #46)', () => {
    // The swatch of a global color, first in its row, near the left edge.
    const spot = placePopover(rect(20, 200), picker, { width: 366, height: 537 });
    expect(spot.left).toBe(20);
    expect(spot.left + picker.width).toBeLessThanOrEqual(366 - 8);
  });

  it('stays inside a window narrower than anchor plus popover', () => {
    const spot = placePopover(rect(150, 100), picker, { width: 300, height: 800 });
    expect(spot.left).toBeGreaterThanOrEqual(8);
    expect(spot.left + picker.width).toBeLessThanOrEqual(300 - 8);
  });

  it('keeps the margin when the popover is wider than the window', () => {
    expect(placePopover(rect(10, 10), picker, { width: 200, height: 800 }).left).toBe(8);
  });

  it('opens above when there is no room below', () => {
    const spot = placePopover(rect(20, 450), picker, { width: 366, height: 537 });
    expect(spot.top).toBe(450 - 6 - 330);
  });

  it('is pushed up into the window when it fits neither below nor above', () => {
    const spot = placePopover(rect(20, 200), picker, { width: 366, height: 500 });
    expect(spot.top).toBe(500 - 330 - 8);
    expect(spot.maxHeight).toBeUndefined();
  });

  it('scrolls inside when taller than the window', () => {
    expect(placePopover(rect(20, 100), picker, { width: 366, height: 300 })).toEqual({
      left: 20,
      top: 8,
      maxHeight: 284,
    });
  });
});
