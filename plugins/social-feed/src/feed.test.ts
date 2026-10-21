import { describe, expect, it } from 'vitest';
import {
  choosePage,
  cleanupImages,
  connectFacebookToken,
  connectInstagram,
  disconnect,
  fetchChannel,
  loadCache,
  loadState,
  offerPages,
  refreshTokens,
  runScheduled,
  saveConfig,
  SECRET,
} from './feed';
import { MAX_IMAGES } from './images';
import { normalizeConfig } from './config';
import { fakeDeps, JPEG, metaAnswers, type Call } from './testing';

const DAY = 86_400_000;
const SITE = 'site-1';

/** A site with Instagram connected by sign-in. */
async function instagramSite(extra?: Parameters<typeof metaAnswers>[0]) {
  const fake = fakeDeps(metaAnswers(extra));
  await connectInstagram(fake.deps, SITE, 'IGQ-long-token-000000000000', {
    method: 'oauth',
    expiresAt: new Date(fake.now.getTime() + 60 * DAY).toISOString(),
  });
  return fake;
}

describe('connecting Instagram', () => {
  it('keeps the token as a secret, fetches the posts and copies their pictures', async () => {
    const fake = await instagramSite();
    expect(fake.secrets.get(SECRET.instagramToken)).toBe('IGQ-long-token-000000000000');
    const state = await loadState(fake.deps, SITE, 'instagram');
    expect(state).toMatchObject({
      connected: true,
      method: 'oauth',
      account: { id: '17841400000000001', username: 'trattoria.da.mario' },
      lastError: null,
      failures: 0,
    });
    const cache = (await loadCache(fake.deps, SITE, 'instagram'))!;
    expect(cache.posts.map((p) => p.id)).toEqual([
      'instagram:1801',
      'instagram:1802',
      'instagram:1803',
    ]);
    // Every picture copied once, the avatar too; addresses on the site.
    expect(fake.images.size).toBe(4);
    for (const post of cache.posts)
      expect(post.local).toMatch(/^\/social-feed\/media\/[a-f0-9]{32}\.jpg$/);
    expect(cache.profile?.avatarLocal).toMatch(/^\/social-feed\/media\//);
    // No token in what is stored outside the secrets.
    expect(JSON.stringify([...fake.storage.values()])).not.toContain('IGQ-long-token');
    expect(fake.invalidated).toHaveLength(1);
  });

  it('asks for the posts it is set to, with the token', async () => {
    const fake = fakeDeps(metaAnswers());
    await saveConfig(fake.deps, SITE, normalizeConfig({ count: 12 }));
    await connectInstagram(fake.deps, SITE, 'IGQ-long-token-000000000000', {
      method: 'oauth',
      expiresAt: null,
    });
    const media = fake.calls.find((c) => c.url.includes('/me/media'))!;
    const url = new URL(media.url);
    expect(url.pathname).toBe('/v24.0/me/media');
    expect(url.searchParams.get('limit')).toBe('12');
    expect(url.searchParams.get('access_token')).toBe('IGQ-long-token-000000000000');
  });

  it('does not copy the same picture again at the next refresh', async () => {
    const fake = await instagramSite();
    const downloads = () => fake.calls.filter((c) => c.url.includes('scontent')).length;
    const before = downloads();
    fake.advance(2 * 60 * 60 * 1000);
    await fetchChannel(fake.deps, SITE, 'instagram');
    expect(downloads()).toBe(before);
    // Same posts: pages need no refresh.
    expect(fake.invalidated).toHaveLength(1);
  });

  it('learns the expiry of a pasted token by refreshing it', async () => {
    const fake = fakeDeps(metaAnswers());
    await connectInstagram(fake.deps, SITE, 'IGQ-pasted-token-00000000000', {
      method: 'manual',
      expiresAt: null,
    });
    const state = await loadState(fake.deps, SITE, 'instagram');
    expect(state.expiresEstimated).toBe(false);
    expect(state.tokenExpiresAt).toBe(new Date(fake.now.getTime() + 5184000 * 1000).toISOString());
    expect(fake.secrets.get(SECRET.instagramToken)).toBe('IGQ-refreshed-token-0000000000');
  });

  it('guesses 60 days for a pasted token too young to refresh', async () => {
    const fake = fakeDeps(
      metaAnswers((call) =>
        call.url.includes('refresh_access_token')
          ? { status: 400, json: { error: { message: 'Token too young', code: 190 } } }
          : undefined,
      ),
    );
    await connectInstagram(fake.deps, SITE, 'IGQ-pasted-token-00000000000', {
      method: 'manual',
      expiresAt: null,
    });
    const state = await loadState(fake.deps, SITE, 'instagram');
    expect(state.expiresEstimated).toBe(true);
    expect(state.connected).toBe(true);
  });
});

describe('errors keep the last good posts', () => {
  it('records a rate limit, waits longer and keeps the cache', async () => {
    let limited = false;
    const fake = await instagramSite((call: Call) =>
      limited && call.url.includes('graph.instagram.com')
        ? {
            status: 400,
            json: { error: { message: 'Application request limit reached', code: 4 } },
          }
        : undefined,
    );
    limited = true;
    fake.advance(2 * 60 * 60 * 1000);
    const state = await fetchChannel(fake.deps, SITE, 'instagram');
    expect(state.lastError).toMatchObject({ kind: 'rate', code: 4 });
    expect(state.failures).toBe(1);
    expect(Date.parse(state.nextFetchAt!) - fake.now.getTime()).toBe(60 * 60 * 1000);
    expect((await loadCache(fake.deps, SITE, 'instagram'))!.posts).toHaveLength(3);
    expect(fake.images.size).toBe(4);
  });

  it('records a refused token and the next good fetch clears the error', async () => {
    let refuse = false;
    const fake = await instagramSite((call: Call) =>
      refuse && call.url.includes('/me/media')
        ? { status: 400, json: { error: { message: 'Session has expired', code: 190 } } }
        : undefined,
    );
    refuse = true;
    let state = await fetchChannel(fake.deps, SITE, 'instagram');
    expect(state.lastError?.kind).toBe('token');
    refuse = false;
    state = await fetchChannel(fake.deps, SITE, 'instagram');
    expect(state.lastError).toBeNull();
    expect(state.failures).toBe(0);
  });

  it('says so when the token has gone missing', async () => {
    const fake = await instagramSite();
    fake.secrets.delete(SECRET.instagramToken);
    const state = await fetchChannel(fake.deps, SITE, 'instagram');
    expect(state.lastError).toMatchObject({ kind: 'token' });
    expect((await loadCache(fake.deps, SITE, 'instagram'))!.posts).toHaveLength(3);
  });

  it('leaves out a picture that is not an image, without hotlinking it', async () => {
    const fake = await instagramSite((call: Call) =>
      call.url.includes('1801.jpg') ? { bytes: Buffer.from('<html>nope</html>') } : undefined,
    );
    const cache = (await loadCache(fake.deps, SITE, 'instagram'))!;
    expect(cache.posts[0]!.local).toBeNull();
    expect(cache.posts[1]!.local).not.toBeNull();
  });
});

describe('the scheduled task', () => {
  it('refreshes the token 30 days before expiry, then not again for a while', async () => {
    const fake = await instagramSite();
    const refreshes = () => fake.calls.filter((c) => c.url.includes('refresh_access_token')).length;
    fake.advance(10 * DAY);
    await runScheduled(fake.deps, SITE);
    expect(refreshes()).toBe(0);
    fake.advance(21 * DAY); // 29 days left
    await runScheduled(fake.deps, SITE);
    expect(refreshes()).toBe(1);
    const state = await loadState(fake.deps, SITE, 'instagram');
    expect(state.tokenRefreshedAt).toBe(fake.now.toISOString());
    expect(Date.parse(state.tokenExpiresAt!)).toBe(fake.now.getTime() + 5184000 * 1000);
    expect(fake.secrets.get(SECRET.instagramToken)).toBe('IGQ-refreshed-token-0000000000');
    fake.advance(DAY);
    await runScheduled(fake.deps, SITE);
    expect(refreshes()).toBe(1);
  });

  it('retries a failed refresh after six hours', async () => {
    let fail = true;
    const fake = await instagramSite((call: Call) =>
      fail && call.url.includes('refresh_access_token')
        ? { status: 500, json: { error: { message: 'Temporary', code: 2 } } }
        : undefined,
    );
    fake.advance(35 * DAY);
    expect(await refreshTokens(fake.deps, SITE)).toBe(false);
    expect((await loadState(fake.deps, SITE, 'instagram')).refreshFailures).toBe(1);
    fake.advance(60 * 60 * 1000);
    expect(await refreshTokens(fake.deps, SITE)).toBe(false);
    fail = false;
    fake.advance(6 * 60 * 60 * 1000);
    expect(await refreshTokens(fake.deps, SITE)).toBe(true);
    expect((await loadState(fake.deps, SITE, 'instagram')).refreshFailures).toBe(0);
  });

  it('fetches when the interval has passed, and only enabled channels', async () => {
    const fake = await instagramSite();
    const fetches = () => fake.calls.filter((c) => c.url.includes('/me/media')).length;
    await runScheduled(fake.deps, SITE);
    expect(fetches()).toBe(1);
    fake.advance(61 * 60 * 1000);
    await runScheduled(fake.deps, SITE);
    expect(fetches()).toBe(2);
    await saveConfig(fake.deps, SITE, normalizeConfig({ instagram: { enabled: false } }));
    fake.advance(61 * 60 * 1000);
    await runScheduled(fake.deps, SITE);
    expect(fetches()).toBe(2);
  });
});

describe('Facebook', () => {
  const PAGES = {
    data: [
      {
        id: '100200300',
        name: 'Trattoria da Mario',
        access_token: 'EAAPage-token-0000000000000',
        instagram_business_account: { id: '17841400000000001', username: 'trattoria.da.mario' },
      },
      { id: '999', name: 'Other Page', access_token: 'EAAOther-token-000000000000' },
    ],
  };
  const answers = (pages: unknown) =>
    metaAnswers((call) => {
      const url = new URL(call.url);
      if (url.pathname.endsWith('/me/accounts'))
        return url.searchParams.get('access_token')!.startsWith('EAAUser')
          ? { json: pages }
          : { status: 400, json: { error: { message: 'Page tokens cannot list', code: 100 } } };
      if (url.pathname.endsWith('/me'))
        return { json: { id: '100200300', name: 'Trattoria da Mario' } };
      if (
        url.hostname === 'graph.facebook.com' &&
        url.pathname.endsWith('/17841400000000001/media')
      )
        return { json: { data: [] } };
      if (url.hostname === 'graph.facebook.com' && url.pathname.endsWith('/17841400000000001'))
        return { json: { id: '17841400000000001', username: 'trattoria.da.mario' } };
      return undefined;
    });

  it('offers the Pages of a user token, then connects the chosen one', async () => {
    const fake = fakeDeps(answers(PAGES));
    const offered = await offerPages(fake.deps, SITE, 'EAAUser-long-token-000000000');
    expect(offered).toEqual({
      connected: false,
      pages: [
        {
          id: '100200300',
          name: 'Trattoria da Mario',
          instagram: { id: '17841400000000001', username: 'trattoria.da.mario' },
        },
        { id: '999', name: 'Other Page', instagram: null },
      ],
    });
    // The offered Pages are stored without their tokens.
    expect(JSON.stringify([...fake.storage.values()])).not.toContain('EAAPage');
    await choosePage(fake.deps, SITE, '100200300');
    expect(fake.secrets.get(SECRET.facebookPageToken)).toBe('EAAPage-token-0000000000000');
    const cache = (await loadCache(fake.deps, SITE, 'facebook'))!;
    expect(cache.posts).toHaveLength(3);
    expect(cache.profile?.name).toBe('Trattoria da Mario');
    expect(fake.storage.has('pages')).toBe(false);
  });

  it('connects the only Page at once, and its Instagram account when read through Facebook', async () => {
    const fake = fakeDeps(answers({ data: [PAGES.data[0]] }));
    await saveConfig(fake.deps, SITE, normalizeConfig({ instagram: { via: 'facebook' } }));
    const offered = await offerPages(fake.deps, SITE, 'EAAUser-long-token-000000000');
    expect(offered.connected).toBe(true);
    const ig = await loadState(fake.deps, SITE, 'instagram');
    expect(ig).toMatchObject({
      connected: true,
      method: 'page',
      account: { id: '17841400000000001' },
    });
    expect(
      fake.calls.some((c) => c.url.includes('graph.facebook.com/v24.0/17841400000000001/media')),
    ).toBe(true);
    // Disconnecting Facebook takes the Instagram account read through it.
    await disconnect(fake.deps, SITE, 'facebook');
    expect((await loadState(fake.deps, SITE, 'instagram')).connected).toBe(false);
    expect(fake.secrets.size).toBe(0);
    expect(fake.images.size).toBe(0);
  });

  it('takes a pasted Page token', async () => {
    const fake = fakeDeps(answers(PAGES));
    const result = await connectFacebookToken(fake.deps, SITE, 'EAAPage-pasted-000000000000');
    expect(result).toEqual({ pages: [], connected: true });
    expect(await loadState(fake.deps, SITE, 'facebook')).toMatchObject({
      method: 'manual',
      account: { id: '100200300' },
    });
  });

  it('reads the expiry of the Page token when the app is set', async () => {
    const fake = fakeDeps(
      metaAnswers((call) => {
        if (call.url.includes('/debug_token'))
          return {
            json: {
              data: {
                is_valid: true,
                type: 'PAGE',
                expires_at: 0,
                data_access_expires_at: 1798000000,
              },
            },
          };
        if (call.url.includes('/me/accounts')) return { json: { data: [PAGES.data[0]] } };
        return undefined;
      }),
    );
    await saveConfig(fake.deps, SITE, normalizeConfig({ facebook: { appId: '123456' } }));
    fake.secrets.set(SECRET.facebookAppSecret, 'f'.repeat(32));
    await offerPages(fake.deps, SITE, 'EAAUser-long-token-000000000');
    const state = await loadState(fake.deps, SITE, 'facebook');
    expect(state.tokenExpiresAt).toBeNull();
    expect(state.dataAccessExpiresAt).toBe(new Date(1798000000 * 1000).toISOString());
  });
});

describe('pictures', () => {
  it('deletes pictures no post uses after a day, and keeps those in use', async () => {
    const fake = await instagramSite();
    fake.images.set('f'.repeat(32), {
      key: 'f'.repeat(32),
      mime: 'image/jpeg',
      bytes: JPEG,
      size: JPEG.length,
      createdAt: fake.now,
    });
    expect(await cleanupImages(fake.deps, SITE, false)).toBe(0);
    fake.advance(DAY + 1000);
    expect(await cleanupImages(fake.deps, SITE, false)).toBe(1);
    expect(fake.images.size).toBe(4);
  });

  it('copies no more than the limit', async () => {
    const fake = fakeDeps(metaAnswers());
    for (let i = 0; i < MAX_IMAGES - 1; i++) {
      const key = i.toString(16).padStart(32, '0');
      fake.images.set(key, { key, mime: 'image/jpeg', bytes: JPEG, size: 12, createdAt: fake.now });
    }
    await connectInstagram(fake.deps, SITE, 'IGQ-long-token-000000000000', {
      method: 'oauth',
      expiresAt: null,
    });
    const cache = (await loadCache(fake.deps, SITE, 'instagram'))!;
    const copied = [cache.profile?.avatarLocal, ...cache.posts.map((p) => p.local)].filter(Boolean);
    expect(copied).toHaveLength(1);
  });

  it('copies nothing in hotlink mode', async () => {
    const fake = fakeDeps(metaAnswers());
    await saveConfig(fake.deps, SITE, normalizeConfig({ media: 'hotlink' }));
    await connectInstagram(fake.deps, SITE, 'IGQ-long-token-000000000000', {
      method: 'oauth',
      expiresAt: null,
    });
    expect(fake.images.size).toBe(0);
    expect(fake.calls.some((c) => c.url.includes('scontent'))).toBe(false);
  });
});
