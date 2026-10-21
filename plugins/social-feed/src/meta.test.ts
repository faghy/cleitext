import { describe, expect, it } from 'vitest';
import { cleanSecret, cleanToken, normalizeConfig, validRedirectUri } from './config';
import {
  errorKind,
  facebookAuthorizeUrl,
  facebookDebugToken,
  facebookExchangeCode,
  facebookPages,
  instagramAuthorizeUrl,
  instagramExchangeCode,
  instagramLongLived,
  instagramMedia,
  MetaError,
} from './meta';
import { fakeDeps } from './testing';

const NOW = new Date('2026-10-01T10:00:00Z');
const REDIRECT = 'https://example.com/cl-admin/ext/social-feed';

describe('sign-in addresses', () => {
  it('asks Instagram for instagram_business_basic only, with the state', () => {
    const url = new URL(instagramAuthorizeUrl('990011', REDIRECT, 'st4te'));
    expect(url.origin + url.pathname).toBe('https://www.instagram.com/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: '990011',
      redirect_uri: REDIRECT,
      response_type: 'code',
      scope: 'instagram_business_basic',
      state: 'st4te',
    });
  });

  it('asks Facebook for the Page permissions, and instagram_basic when asked', () => {
    const plain = new URL(facebookAuthorizeUrl('123456', REDIRECT, 's', false));
    expect(plain.pathname).toBe('/v24.0/dialog/oauth');
    expect(plain.searchParams.get('scope')).toBe(
      'pages_show_list,pages_read_engagement,pages_read_user_content',
    );
    const withIg = new URL(facebookAuthorizeUrl('123456', REDIRECT, 's', true));
    expect(withIg.searchParams.get('scope')).toContain('instagram_basic');
  });
});

describe('tokens', () => {
  it('exchanges an Instagram code (both answer shapes) and drops the #_ suffix', async () => {
    for (const json of [
      { data: [{ access_token: 'short-1', user_id: 17841, permissions: 'x' }] },
      { access_token: 'short-1', user_id: 17841 },
    ]) {
      const fake = fakeDeps(() => ({ json }));
      const grant = await instagramExchangeCode(
        fake.deps.http,
        { appId: '990011', secret: 'a'.repeat(32) },
        'CODE123#_',
        REDIRECT,
      );
      expect(grant).toEqual({ token: 'short-1', userId: '17841' });
      expect(fake.calls[0]!.method).toBe('POST');
      expect(fake.calls[0]!.url).toBe('https://api.instagram.com/oauth/access_token');
      const form = new URLSearchParams(fake.calls[0]!.body);
      expect(form.get('code')).toBe('CODE123');
      expect(form.get('grant_type')).toBe('authorization_code');
      expect(form.get('redirect_uri')).toBe(REDIRECT);
    }
  });

  it('turns a short Instagram token into a 60-day one', async () => {
    const fake = fakeDeps(() => ({
      json: { access_token: 'long-1', token_type: 'bearer', expires_in: 5184000 },
    }));
    const grant = await instagramLongLived(fake.deps.http, 's'.repeat(32), 'short-1', NOW);
    expect(grant).toEqual({ token: 'long-1', expiresAt: '2026-11-30T10:00:00.000Z' });
    expect(fake.calls[0]!.url).toContain('grant_type=ig_exchange_token');
    expect(fake.calls[0]!.method).toBe('GET');
  });

  it('exchanges a Facebook code, then for a long-lived user token', async () => {
    const fake = fakeDeps((call) =>
      call.url.includes('fb_exchange_token')
        ? { json: { access_token: 'long-user', expires_in: 5183944 } }
        : { json: { access_token: 'short-user', expires_in: 3600 } },
    );
    const grant = await facebookExchangeCode(
      fake.deps.http,
      { appId: '123456', secret: 'b'.repeat(32) },
      'CODE',
      REDIRECT,
      NOW,
    );
    expect(grant.token).toBe('long-user');
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]!.url).toContain('fb_exchange_token=short-user');
  });

  it('lists Pages with their tokens and linked Instagram accounts', async () => {
    const fake = fakeDeps(() => ({
      json: {
        data: [
          {
            id: '1',
            name: 'Uno',
            access_token: 'page-1',
            instagram_business_account: { id: '178', username: 'uno' },
          },
          { id: '2', name: 'Due', access_token: 'page-2' },
          { id: '3', name: 'No token' },
        ],
      },
    }));
    expect(await facebookPages(fake.deps.http, 'user')).toEqual([
      { id: '1', name: 'Uno', token: 'page-1', instagram: { id: '178', username: 'uno' } },
      { id: '2', name: 'Due', token: 'page-2', instagram: null },
    ]);
  });

  it('reads expiry and data access expiry from debug_token', async () => {
    const fake = fakeDeps(() => ({
      json: {
        data: {
          is_valid: true,
          type: 'PAGE',
          expires_at: 0,
          data_access_expires_at: 1798000000,
          scopes: ['pages_show_list'],
        },
      },
    }));
    const info = await facebookDebugToken(
      fake.deps.http,
      { appId: '123456', secret: 'c'.repeat(32) },
      'page-token',
    );
    expect(info).toMatchObject({ valid: true, type: 'PAGE', expiresAt: null });
    expect(info.dataAccessExpiresAt).toBe(new Date(1798000000 * 1000).toISOString());
    expect(fake.calls[0]!.url).toContain(`access_token=123456%7C${'c'.repeat(32)}`);
  });
});

describe('errors', () => {
  it('classifies Meta error codes', () => {
    expect(errorKind(190, 400)).toBe('token');
    expect(errorKind(4, 400)).toBe('rate');
    expect(errorKind(17, 400)).toBe('rate');
    expect(errorKind(32, 400)).toBe('rate');
    expect(errorKind(613, 400)).toBe('rate');
    expect(errorKind(80002, 400)).toBe('rate');
    expect(errorKind(undefined, 429)).toBe('rate');
    expect(errorKind(10, 400)).toBe('permission');
    expect(errorKind(200, 403)).toBe('permission');
    expect(errorKind(100, 400)).toBe('api');
  });

  it('turns an error answer into a MetaError without the token in its message', async () => {
    const fake = fakeDeps(() => ({
      status: 400,
      json: {
        error: {
          message: 'Error validating access token: access_token=SECRET123 has expired',
          type: 'OAuthException',
          code: 190,
          error_subcode: 463,
        },
      },
    }));
    const error = await instagramMedia(
      fake.deps.http,
      { via: 'instagram', userId: 'me', token: 'SECRET123' },
      10,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MetaError);
    expect(error).toMatchObject({ kind: 'token', code: 190 });
    expect((error as Error).message).not.toContain('SECRET123');
  });

  it('reports the Instagram token endpoint’s flat errors', async () => {
    const fake = fakeDeps(() => ({
      status: 400,
      json: { error_type: 'OAuthException', code: 400, error_message: 'Invalid redirect_uri' },
    }));
    await expect(
      instagramExchangeCode(fake.deps.http, { appId: '1', secret: 'x' }, 'c', REDIRECT),
    ).rejects.toMatchObject({ message: 'Invalid redirect_uri', kind: 'api' });
  });

  it('reports a network failure as such', async () => {
    const error = await instagramMedia(
      async () => {
        throw new Error('connect ETIMEDOUT');
      },
      { via: 'instagram', userId: 'me', token: 't' },
      5,
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'network' });
  });
});

describe('settings', () => {
  it('completes and clamps the configuration', () => {
    expect(
      normalizeConfig({ count: 500, refreshMinutes: 1, media: 'x', instagram: { appId: 'abc' } }),
    ).toEqual({
      instagram: { enabled: true, appId: '', via: 'instagram' },
      facebook: { enabled: false, appId: '' },
      count: 50,
      refreshMinutes: 30,
      media: 'local',
      consentCategory: 'marketing',
    });
  });

  it('accepts only this admin page over https as redirect address', () => {
    expect(validRedirectUri(REDIRECT)).toBe(REDIRECT);
    expect(validRedirectUri(`${REDIRECT}/`)).toBe(`${REDIRECT}/`);
    expect(validRedirectUri('http://localhost:3000/cl-admin/ext/social-feed')).not.toBeNull();
    expect(validRedirectUri('http://example.com/cl-admin/ext/social-feed')).toBeNull();
    expect(validRedirectUri('https://example.com/cl-admin/ext/other')).toBeNull();
    expect(validRedirectUri(`${REDIRECT}?x=1`)).toBeNull();
    expect(validRedirectUri('javascript:alert(1)')).toBeNull();
  });

  it('checks pasted tokens and secrets', () => {
    expect(cleanToken('  IGAAx0123456789abcdefghijk  ')).toBe('IGAAx0123456789abcdefghijk');
    expect(cleanToken('short')).toBeNull();
    expect(cleanToken('has spaces in the middle of it ok')).toBeNull();
    expect(cleanSecret('0123456789abcdef0123456789ABCDEF')).toBe(
      '0123456789abcdef0123456789ABCDEF',
    );
    expect(cleanSecret('nope')).toBeNull();
  });
});
