/**
 * Deterministic plugin order: a plugin after the plugins it requires, then
 * by slug. Plugin stylesheets and scripts follow it (e.g. Fresco Pro's
 * `pro.css` after Fresco's `fresco.css`).
 */
import { describe, expect, it } from 'vitest';
import { orderPluginSlugs } from '../src/plugins/plugin-order.js';

const order = (graph: Record<string, string[]>, slugs = Object.keys(graph)) =>
  orderPluginSlugs(slugs, (slug) => graph[slug] ?? []);

describe('plugin order', () => {
  it('sorts independent plugins by slug, whatever the input order', () => {
    expect(order({ shop: [], analytics: [], maps: [] })).toEqual(['analytics', 'maps', 'shop']);
    expect(order({ maps: [], shop: [], analytics: [] })).toEqual(['analytics', 'maps', 'shop']);
  });

  it('puts a plugin after the plugins it requires', () => {
    // Alphabetical order alone would put "a-pro" first.
    expect(order({ 'a-pro': ['z-base'], 'z-base': [], maps: [] })).toEqual([
      'maps',
      'z-base',
      'a-pro',
    ]);
    expect(order({ 'fresco-pro': ['fresco'], fresco: [], analytics: [] })).toEqual([
      'analytics',
      'fresco',
      'fresco-pro',
    ]);
  });

  it('follows chains of dependencies', () => {
    expect(order({ a: ['b'], b: ['c'], c: [], d: [] })).toEqual(['c', 'b', 'a', 'd']);
  });

  it('ignores dependencies that are not active and self-references', () => {
    expect(order({ b: ['missing'], a: ['a'] })).toEqual(['a', 'b']);
  });

  it('keeps every plugin of a dependency cycle', () => {
    expect(order({ x: ['y'], y: ['x'], a: [] })).toEqual(['a', 'x', 'y']);
  });

  it('accepts a set of slugs', () => {
    expect(orderPluginSlugs(new Set(['b', 'a']), () => [])).toEqual(['a', 'b']);
  });
});
