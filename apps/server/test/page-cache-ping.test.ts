/**
 * Page cache across processes: a process that stops hearing the
 * invalidations (its LISTEN connection dead without knowing it, or
 * reconnected after missing notifications) drops its pages and serves none
 * until it hears again, instead of serving stale pages until a restart.
 */
import type { DatabaseClient } from '@cleitext/db';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config/config.js';
import { PageCacheService } from '../src/public/page-cache.service.js';

function fakeDatabase() {
  const state = {
    deliver: true,
    listens: 0,
    onMessage: (_: string) => {},
    onListen: () => {},
  };
  const database = {
    async listen(_channel: string, onMessage: (p: string) => void, onListen?: () => void) {
      state.listens++;
      state.onMessage = onMessage;
      state.onListen = onListen ?? (() => {});
      return async () => {};
    },
    async notify(_channel: string, payload: string) {
      if (state.deliver) state.onMessage(payload);
    },
  } as unknown as DatabaseClient;
  return { database, state };
}

const config = { pageCache: { maxEntries: 100, ttlSeconds: 600 } } as unknown as AppConfig;
const page = { status: 200, html: '<p>hi</p>', contentType: 'text/html', tags: ['site'] };

describe('the page cache of a process that stops hearing', () => {
  it('pauses when its own ping does not come back, and resumes when it does', async () => {
    const { database, state } = fakeDatabase();
    const cache = new PageCacheService(database, { ...config, pageCache: { ...config.pageCache } });
    await cache.onApplicationBootstrap();
    await cache.onApplicationShutdown(); // no timer in the test: pings by hand
    cache.set('k', 's', page);
    await cache.ping();
    expect(cache.get('k')).not.toBeNull();

    state.deliver = false;
    await cache.ping(); // sent, never heard
    expect(cache.get('k')).not.toBeNull();
    await cache.ping(); // the previous one is missing: pause, LISTEN again
    expect(state.listens).toBe(2);
    expect(cache.active).toBe(false);
    expect(cache.get('k')).toBeNull();
    cache.set('k', 's', page);
    expect(cache.size).toBe(0);

    state.deliver = true;
    await cache.ping();
    expect(cache.active).toBe(true);
    cache.set('k', 's', page);
    expect(cache.get('k')).not.toBeNull();
  });

  it('drops its pages when the subscription comes back after a dropped connection', async () => {
    const { database, state } = fakeDatabase();
    const cache = new PageCacheService(database, { ...config, pageCache: { ...config.pageCache } });
    await cache.onApplicationBootstrap();
    await cache.onApplicationShutdown();
    cache.set('k', 's', page);
    state.onListen();
    expect(cache.size).toBe(0);
  });
});
