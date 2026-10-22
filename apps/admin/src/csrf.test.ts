/** The admin's API client asks for the CSRF token once, even for requests started together (B11). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@cleitext/admin-sdk';

afterEach(() => vi.unstubAllGlobals());

describe('CSRF token', () => {
  it('is fetched once for concurrent requests', async () => {
    let asked = 0;
    const sent: (string | undefined)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/v1/auth/csrf') {
          asked++;
          await new Promise((r) => setTimeout(r, 10));
          return new Response(JSON.stringify({ token: `token-${asked}` }));
        }
        sent.push((init?.headers as Record<string, string>)['x-csrf-token']);
        return new Response(null, { status: 204 });
      }),
    );
    await Promise.all([api('POST', '/a'), api('POST', '/b'), api('DELETE', '/c')]);
    expect(asked).toBe(1);
    expect(sent).toEqual(['token-1', 'token-1', 'token-1']);
  });
});
