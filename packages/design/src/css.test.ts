import { describe, expect, it } from 'vitest';
import { printSheet, safeColor, settingsSheet, withControlDefaults } from './css.js';
import { DEFAULT_BREAKPOINTS, type Control } from './model.js';

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
