import { describe, expect, it } from 'vitest';
import { printSheet, safeColor, settingsSheet, withControlDefaults } from './css.js';
import {
  DEFAULT_BREAKPOINTS,
  activeDevices,
  deviceRange,
  inheritChain,
  rangeMedia,
  type Breakpoints,
  type Control,
} from './model.js';

const controls: Control[] = [
  {
    name: 'padding',
    type: 'box',
    label: 'Padding',
    tab: 'style',
    section: 'Spacing',
    responsive: true,
    selectors: { '{{el}}': 'padding: {{value}}' },
  },
  {
    name: 'color',
    type: 'color',
    label: 'Color',
    tab: 'style',
    section: 'Text',
    hover: true,
    default: '#333',
    selectors: { '{{el}} h2': 'color: {{value}}' },
  },
  {
    name: 'title',
    type: 'typography',
    label: 'Title',
    tab: 'style',
    section: 'Text',
    selector: '{{el}} h2',
  } as Control,
];

describe('settings → CSS', () => {
  it('writes defaults, devices and hover, scoped to the element', () => {
    const attrs = {
      padding: { top: 40, right: 0, bottom: 40, left: 0, unit: 'px' },
      'padding@mobile': { top: 10, right: 10, bottom: 10, left: 10, unit: 'px' },
      'color:hover': 'var(--wp--preset--color--accent)',
      title_size: { size: 3, unit: 'rem' },
      'title_size@tablet': { size: 2, unit: 'rem' },
    };
    const css = printSheet(
      settingsSheet(controls, withControlDefaults(controls, attrs), attrs, '.pr-x', {
        prefix: 'pr',
      }),
      DEFAULT_BREAKPOINTS,
    );
    expect(css).toBe(
      '.pr-x{padding:40px 0 40px 0}.pr-x h2{color:#333;font-size:3rem}' +
        '.pr-x h2:hover{color:var(--wp--preset--color--accent)}' +
        '@media (max-width:1024px){.pr-x h2{font-size:2rem}}' +
        '@media (max-width:767px){.pr-x{padding:10px 10px 10px 10px}}',
    );
  });

  it('drops values that could write other CSS', () => {
    expect(safeColor('red;}body{display:none')).toBeNull();
    expect(safeColor('var(--ast-global-color-1)')).toBe('var(--ast-global-color-1)');
    const attrs = { padding: { top: '1px;x', right: 0, bottom: 0, left: 0, unit: 'px}' } };
    const css = printSheet(
      settingsSheet(controls, withControlDefaults(controls, attrs), attrs, '.pr-y'),
      DEFAULT_BREAKPOINTS,
    );
    expect(css).not.toContain(';x');
    expect(css).not.toContain('px}');
  });
});

describe('breakpoints', () => {
  const all: Breakpoints = {
    mobile: 767,
    mobile_extra: 880,
    tablet: 1024,
    tablet_extra: 1200,
    laptop: 1366,
    widescreen: 2400,
  };
  const attrs = {
    padding: { top: 1, right: 1, bottom: 1, left: 1, unit: 'px' },
    'padding@widescreen': { top: 2, right: 2, bottom: 2, left: 2, unit: 'px' },
    'padding@laptop': { top: 3, right: 3, bottom: 3, left: 3, unit: 'px' },
    'padding@tablet_extra': { top: 4, right: 4, bottom: 4, left: 4, unit: 'px' },
    'padding@tablet': { top: 5, right: 5, bottom: 5, left: 5, unit: 'px' },
    'padding@mobile_extra': { top: 6, right: 6, bottom: 6, left: 6, unit: 'px' },
    'padding@mobile': { top: 7, right: 7, bottom: 7, left: 7, unit: 'px' },
  };
  const sheet = () => settingsSheet(controls, withControlDefaults(controls, attrs), attrs, '.x');

  it('writes every active device: desktop, widescreen, then the smaller ones from the widest', () => {
    expect(printSheet(sheet(), all)).toBe(
      '.x{padding:1px 1px 1px 1px}.x h2{color:#333}' +
        '@media (min-width:2400px){.x{padding:2px 2px 2px 2px}}' +
        '@media (max-width:1366px){.x{padding:3px 3px 3px 3px}}' +
        '@media (max-width:1200px){.x{padding:4px 4px 4px 4px}}' +
        '@media (max-width:1024px){.x{padding:5px 5px 5px 5px}}' +
        '@media (max-width:880px){.x{padding:6px 6px 6px 6px}}' +
        '@media (max-width:767px){.x{padding:7px 7px 7px 7px}}',
    );
  });

  it('leaves out the devices that are off, as before', () => {
    expect(printSheet(sheet(), DEFAULT_BREAKPOINTS)).toBe(
      '.x{padding:1px 1px 1px 1px}.x h2{color:#333}' +
        '@media (max-width:1024px){.x{padding:5px 5px 5px 5px}}' +
        '@media (max-width:767px){.x{padding:7px 7px 7px 7px}}',
    );
  });

  it('inherits from the next larger active device, then desktop', () => {
    expect(activeDevices(DEFAULT_BREAKPOINTS)).toEqual(['desktop', 'tablet', 'mobile']);
    expect(activeDevices(all)).toHaveLength(7);
    expect(inheritChain('mobile', DEFAULT_BREAKPOINTS)).toEqual(['tablet', 'desktop']);
    expect(inheritChain('mobile', all)).toEqual([
      'mobile_extra',
      'tablet',
      'tablet_extra',
      'laptop',
      'desktop',
    ]);
    expect(inheritChain('tablet', { ...DEFAULT_BREAKPOINTS, laptop: 1366 })).toEqual([
      'laptop',
      'desktop',
    ]);
    expect(inheritChain('laptop', all)).toEqual(['desktop']);
    expect(inheritChain('widescreen', all)).toEqual(['desktop']);
    expect(inheritChain('desktop', all)).toEqual([]);
  });

  it('gives each device its own width range', () => {
    const media = (d: Parameters<typeof deviceRange>[0], bp: Breakpoints) =>
      rangeMedia(deviceRange(d, bp)!);
    expect(media('desktop', DEFAULT_BREAKPOINTS)).toBe('(min-width:1025px)');
    expect(media('tablet', DEFAULT_BREAKPOINTS)).toBe('(min-width:768px) and (max-width:1024px)');
    expect(media('mobile', DEFAULT_BREAKPOINTS)).toBe('(max-width:767px)');
    expect(media('desktop', all)).toBe('(min-width:1367px) and (max-width:2399px)');
    expect(media('widescreen', all)).toBe('(min-width:2400px)');
    expect(media('mobile_extra', all)).toBe('(min-width:768px) and (max-width:880px)');
    expect(deviceRange('laptop', DEFAULT_BREAKPOINTS)).toBeNull();
  });
});

describe('dictionaries and patterns', () => {
  const dictionary: Control = {
    name: 'order',
    type: 'choose',
    label: 'Order',
    tab: 'advanced',
    section: 'Layout',
    responsive: true,
    dictionary: { start: '-99999', grow: 'flex-grow: 1; flex-shrink: 0', custom: '', true: '-1' },
    selectors: { '{{el}}': 'order: {{value}}' },
  };
  const pattern: Control = {
    name: 'tracks',
    type: 'text',
    label: 'Tracks',
    tab: 'content',
    section: 'Grid',
    pattern: '(\\d+fr ?)+',
    selectors: { '{{el}}': 'grid-template-columns: {{value}}' },
  };
  const css = (control: Control, attrs: Record<string, unknown>) =>
    printSheet(settingsSheet([control], attrs, attrs, '.x'), DEFAULT_BREAKPOINTS);

  it('writes the CSS of a value from the dictionary, or nothing for an empty one', () => {
    expect(css(dictionary, { order: 'start', 'order@mobile': 'custom' })).toBe('.x{order:-99999}');
    expect(css({ ...dictionary, selectors: { '{{el}}': '{{value}}' } }, { order: 'grow' })).toBe(
      '.x{flex-grow:1;flex-shrink:0}',
    );
    // Switches: `true`.
    expect(css({ ...dictionary, type: 'switch' }, { order: true })).toBe('.x{order:-1}');
    // Values not in the dictionary are written as usual.
    expect(css(dictionary, { order: 'inherit' })).toBe('.x{order:inherit}');
  });

  it('writes text matching the pattern as it is, else only a plain keyword', () => {
    expect(css(pattern, { tracks: ' 1fr  2fr ' })).toBe('.x{grid-template-columns:1fr 2fr}');
    expect(css(pattern, { tracks: '1fr;color:red' })).toBe('');
    expect(css(pattern, { tracks: 'url(x)' })).toBe('');
    expect(css(pattern, { tracks: 'auto' })).toBe('.x{grid-template-columns:auto}');
  });
});

describe('background groups: custom position and size, gradients per device', () => {
  const background = {
    name: 'bg',
    type: 'background',
    label: 'Background',
    tab: 'style',
    section: 'Background',
    selector: '.x',
  } as Control;
  const css = (attrs: Record<string, unknown>) =>
    printSheet(settingsSheet([background], attrs, attrs, '.x'), DEFAULT_BREAKPOINTS);

  it('writes X and Y positions and a width instead of "custom"', () => {
    expect(
      css({
        bg_type: 'classic',
        bg_position: 'custom',
        bg_xpos: { size: 10, unit: 'px' },
        bg_ypos: { size: 50, unit: '%' },
        'bg_xpos@mobile': { size: 0, unit: 'px' },
        bg_size: 'custom',
        bg_bg_width: { size: 40, unit: '%' },
      }),
    ).toBe(
      '.x{background-position-x:10px;background-position-y:50%;background-size:40% auto}@media (max-width:767px){.x{background-position-x:0px}}',
    );
    // A keyword position on a device: no X and Y there.
    expect(
      css({
        bg_type: 'classic',
        'bg_position@tablet': 'left top',
        'bg_xpos@tablet': { size: 5, unit: 'px' },
      }),
    ).toBe('@media (max-width:1024px){.x{background-position:left top}}');
  });

  it('writes a device’s gradient from its own values and the larger devices’', () => {
    expect(
      css({
        bg_type: 'gradient',
        bg_color: '#000',
        bg_color_b: '#fff',
        bg_angle: { size: 90, unit: 'deg' },
        'bg_stop@tablet': { size: 20, unit: '%' },
        'bg_angle@mobile': { size: 0, unit: 'deg' },
      }),
    ).toBe(
      '.x{background-image:linear-gradient(90deg, #000 0%, #fff 100%)}' +
        '@media (max-width:1024px){.x{background-image:linear-gradient(90deg, #000 20%, #fff 100%)}}' +
        '@media (max-width:767px){.x{background-image:linear-gradient(0deg, #000 20%, #fff 100%)}}',
    );
    expect(
      css({
        bg_type: 'gradient',
        bg_gradient: 'radial',
        'bg_gradient_position@mobile': 'top left',
      }),
    ).toContain('@media (max-width:767px){.x{background-image:radial-gradient(at top left,');
  });
});

describe('conditions', () => {
  it('negates a condition whose key ends in "!"', () => {
    const control = {
      name: 'c',
      type: 'color',
      label: 'C',
      tab: 'style',
      section: 'S',
      condition: { 'icon!': [undefined, ''] },
      selectors: { '.x': 'color: {{value}}' },
    } as Control;
    expect(
      printSheet(settingsSheet([control], { c: '#000' }, { c: '#000' }, '.x'), DEFAULT_BREAKPOINTS),
    ).toBe('');
    const set = { c: '#000', icon: 'star' };
    expect(printSheet(settingsSheet([control], set, set, '.x'), DEFAULT_BREAKPOINTS)).toBe(
      '.x{color:#000}',
    );
  });
});
