import { describe, expect, it } from 'vitest';
import type { PluginContext } from '@cleitext/plugin-sdk';
import { DEFAULT_CONFIG } from './config';
import { policyLinks } from './server';

const entries: Record<string, { url: string; status: string; locale: string }> = {
  'en-p': { url: '/privacy-policy', status: 'published', locale: 'en' },
  'en-c': { url: '/cookie-policy', status: 'published', locale: 'en' },
  'es-p': { url: '/es/politica-de-privacidad', status: 'published', locale: 'es' },
  'es-c': { url: '/es/politica-de-cookies', status: 'published', locale: 'es' },
};
const ctx = {
  content: {
    get: async (_site: string, id: string) => entries[id] ?? null,
    translations: async (_site: string, id: string) =>
      id === 'en-p'
        ? [{ id: 'es-p', locale: 'es' }]
        : id === 'en-c'
          ? [{ id: 'es-c', locale: 'es' }]
          : [],
  },
} as unknown as PluginContext;

describe('links between the policies', () => {
  it('use the pages of the language, also written es-ES', async () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      pages: { en: { privacy: 'en-p' }, es: { privacy: 'es-p', cookies: 'es-c' } },
    };
    expect(await policyLinks(ctx, 's', cfg, 'es-ES')).toEqual({
      privacy: '/es/politica-de-privacidad',
      cookies: '/es/politica-de-cookies',
    });
  });

  it('follow the translations when only other languages have pages', async () => {
    const cfg = { ...DEFAULT_CONFIG, pages: { en: { privacy: 'en-p', cookies: 'en-c' } } };
    expect(await policyLinks(ctx, 's', cfg, 'es')).toEqual({
      privacy: '/es/politica-de-privacidad',
      cookies: '/es/politica-de-cookies',
    });
    expect(await policyLinks(ctx, 's', cfg, 'en')).toEqual({
      privacy: '/privacy-policy',
      cookies: '/cookie-policy',
    });
  });
});
