import { describe, expect, it } from 'vitest';
import {
  effectiveConfig,
  installServerApi,
  isUnlocked,
  keptFeatures,
  limitsFor,
  PRO_MODULES,
} from './pro.js';

describe('Vetta SEO without and with Pro', () => {
  it('a new site has one keyword, no term SEO and none of the Pro modules', () => {
    const limits = limitsFor(false, []);
    expect(limits.keywords).toBe(1);
    expect(limits.terms).toBe(false);
    for (const m of PRO_MODULES) expect(limits.modules[m]).toBe(false);
  });

  it('Pro lifts everything', () => {
    const limits = limitsFor(true, []);
    expect(limits.keywords).toBe(5);
    expect(limits.terms).toBe(true);
    for (const m of PRO_MODULES) expect(limits.modules[m]).toBe(true);
  });

  it('a site that used Vetta before 2.0 keeps what it had on', () => {
    // IndexNow is on unless switched off; the log of pages not found was switched on.
    const kept = keptFeatures({ module_monitor404: true });
    expect(kept.sort()).toEqual(['indexNow', 'keywords', 'monitor404', 'terms']);
    const limits = limitsFor(false, kept);
    expect(limits.keywords).toBe(5);
    expect(limits.terms).toBe(true);
    expect(limits.modules).toEqual({
      localSeo: false,
      monitor404: true,
      indexNow: true,
      llms: false,
    });
  });

  it('the modules a site may not use are off in its settings', () => {
    const limits = limitsFor(false, ['llms']);
    const config = effectiveConfig(
      { module_llms: true, module_localSeo: true, separator: '|' },
      limits,
    );
    expect(config.module_llms).toBe(true);
    expect(config.module_localSeo).toBe(false);
    expect(config.module_indexNow).toBe(false);
    expect(config.separator).toBe('|');
  });

  it('asks Vetta SEO Pro on globalThis; a failing answer counts as no', async () => {
    const api = installServerApi();
    expect((globalThis as Record<symbol, unknown>)[Symbol.for('cleitext.vetta')]).toBe(api);
    expect(await isUnlocked(api, 's1')).toBe(false);
    api.unlocked.push(() => {
      throw new Error('down');
    });
    api.unlocked.push(async (site) => (site === 's1' ? true : null));
    expect(await isUnlocked(api, 's1')).toBe(true);
    expect(await isUnlocked(api, 's2')).toBe(false);
  });
});
