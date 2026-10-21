import { describe, expect, it, vi } from 'vitest';
import { normalizeConfig } from './config';
import {
  cloudflareStatus,
  fieldText,
  RECAPTCHA_VERIFY,
  TURNSTILE_VERIFY,
  verifySubmission,
  type HttpSend,
} from './verify';

/** Cloudflare's test keys (developers.cloudflare.com/turnstile/troubleshooting/testing). */
const PASS_SECRET = '1x0000000000000000000000000000000AA';
const REAL_SECRET = '0x4AAAAAAAreal-secret-key';
const FALLBACK = '6Lc-fallback-secret-key';

const turnstile = normalizeConfig({ siteKey: '1x00000000000000000000AA' });
const input = (fields: Record<string, unknown>, extra = {}) => ({
  form: 'core/login',
  fields,
  ip: '203.0.113.9',
  host: 'example.org',
  ...extra,
});
const up = async () => false;

/** A fake provider answering with this JSON (or failing). */
function provider(answer: Record<string, unknown> | 'down' | 'error') {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const http: HttpSend = vi.fn(async (request) => {
    calls.push({ url: request.url, body: new URLSearchParams(request.body ?? '') });
    if (answer === 'error') throw new Error('network');
    if (answer === 'down') return { status: 503, text: '' };
    return { status: 200, text: JSON.stringify(answer) };
  });
  return { http, calls };
}

describe('Turnstile', () => {
  it('posts the token, the secret and the public address', async () => {
    const { http, calls } = provider({ success: true, hostname: 'example.com', action: '' });
    const outcome = await verifySubmission(
      turnstile,
      { secret: PASS_SECRET, fallbackSecret: null },
      input({ 'cf-turnstile-response': 'XXXX.DUMMY.TOKEN.XXXX' }),
      http,
      up,
    );
    expect(outcome).toEqual({ ok: true });
    expect(calls[0]!.url).toBe(TURNSTILE_VERIFY);
    expect(Object.fromEntries(calls[0]!.body)).toEqual({
      secret: PASS_SECRET,
      response: 'XXXX.DUMMY.TOKEN.XXXX',
      remoteip: '203.0.113.9',
    });
  });

  it('leaves out the address of a proxy', async () => {
    const { http, calls } = provider({ success: true });
    await verifySubmission(
      turnstile,
      { secret: PASS_SECRET, fallbackSecret: null },
      input({ 'cf-turnstile-response': 't' }, { ip: '10.0.0.200' }),
      http,
      up,
    );
    expect(calls[0]!.body.has('remoteip')).toBe(false);
  });

  it('refuses missing, rejected, foreign and misplaced tokens', async () => {
    const secrets = { secret: REAL_SECRET, fallbackSecret: null };
    expect(await verifySubmission(turnstile, secrets, input({}), provider({}).http, up)).toEqual({
      ok: false,
      reason: 'no token',
    });
    const token = { 'cf-turnstile-response': 't' };
    const rejected = provider({ success: false, 'error-codes': ['invalid-input-response'] });
    expect(await verifySubmission(turnstile, secrets, input(token), rejected.http, up)).toEqual({
      ok: false,
      reason: 'rejected (invalid-input-response)',
    });
    const elsewhere = provider({ success: true, hostname: 'evil.test', action: 'core_login' });
    expect(
      await verifySubmission(turnstile, secrets, input(token), elsewhere.http, up),
    ).toMatchObject({
      ok: false,
      reason: 'solved on evil.test',
    });
    const otherForm = provider({ success: true, hostname: 'example.org', action: 'core_comment' });
    expect(
      await verifySubmission(turnstile, secrets, input(token), otherForm.http, up),
    ).toMatchObject({
      ok: false,
      reason: 'action core_comment',
    });
    const good = provider({ success: true, hostname: 'EXAMPLE.org', action: 'core_login' });
    expect(await verifySubmission(turnstile, secrets, input(token), good.http, up)).toEqual({
      ok: true,
    });
  });

  it('applies the failsafe when Cloudflare is down', async () => {
    const token = { 'cf-turnstile-response': 't' };
    const secrets = { secret: REAL_SECRET, fallbackSecret: FALLBACK };
    for (const answer of ['down', 'error'] as const) {
      expect(
        await verifySubmission(turnstile, secrets, input(token), provider(answer).http, up),
      ).toEqual({ ok: false, reason: 'Cloudflare could not be reached' });
      const allow = normalizeConfig({ ...turnstile, failsafe: 'allow' });
      expect(
        await verifySubmission(allow, secrets, input(token), provider(answer).http, up),
      ).toEqual({
        ok: true,
        via: 'failsafe',
      });
    }
    // `allow` without a token: only while Cloudflare is really down.
    const allow = normalizeConfig({ ...turnstile, failsafe: 'allow' });
    const marked = input({ 'cl-captcha-failsafe': 'allow' });
    expect(await verifySubmission(allow, secrets, marked, provider({}).http, up)).toMatchObject({
      ok: false,
    });
    expect(
      await verifySubmission(allow, secrets, marked, provider({}).http, async () => true),
    ).toEqual({ ok: true, via: 'failsafe' });
  });

  it('checks the reCAPTCHA checkbox shown when Turnstile did not load', async () => {
    const config = normalizeConfig({
      ...turnstile,
      failsafe: 'recaptcha',
      fallbackSiteKey: '6Lc-fallback-site-key',
    });
    const fields = { 'cl-captcha-failsafe': 'recaptcha', 'g-recaptcha-response': 'g' };
    const google = provider({ success: true, hostname: 'example.org' });
    expect(
      await verifySubmission(
        config,
        { secret: REAL_SECRET, fallbackSecret: FALLBACK },
        input(fields),
        google.http,
        up,
      ),
    ).toEqual({ ok: true, via: 'failsafe' });
    expect(google.calls[0]!.url).toBe(RECAPTCHA_VERIFY);
    expect(google.calls[0]!.body.get('secret')).toBe(FALLBACK);
    // Without the fallback secret the checkbox cannot be checked.
    expect(
      await verifySubmission(
        config,
        { secret: REAL_SECRET, fallbackSecret: null },
        input(fields),
        google.http,
        up,
      ),
    ).toMatchObject({ ok: false });
  });
});

describe('reCAPTCHA', () => {
  const secrets = { secret: 'google-secret-key', fallbackSecret: null };

  it('checks v2 tokens and their host', async () => {
    const config = normalizeConfig({ provider: 'recaptcha2', siteKey: 'google-site-key' });
    const token = { 'g-recaptcha-response': 'g' };
    const ok = provider({ success: true, hostname: 'example.org' });
    expect(await verifySubmission(config, secrets, input(token), ok.http, up)).toEqual({
      ok: true,
    });
    expect(ok.calls[0]!.url).toBe(RECAPTCHA_VERIFY);
    const elsewhere = provider({ success: true, hostname: 'evil.test' });
    expect(await verifySubmission(config, secrets, input(token), elsewhere.http, up)).toMatchObject(
      {
        ok: false,
      },
    );
    expect(await verifySubmission(config, secrets, input({}), ok.http, up)).toEqual({
      ok: false,
      reason: 'no token',
    });
    expect(
      await verifySubmission(config, secrets, input(token), provider('error').http, up),
    ).toEqual({
      ok: false,
      reason: 'Google could not be reached',
    });
  });

  it('checks the v3 action and score', async () => {
    const config = normalizeConfig({
      provider: 'recaptcha3',
      siteKey: 'google-site-key',
      minScore: 0.6,
    });
    const token = { 'g-recaptcha-response': 'g' };
    const answer = (score: number, action = 'core/login') =>
      provider({ success: true, hostname: 'example.org', action, score }).http;
    expect(await verifySubmission(config, secrets, input(token), answer(0.9), up)).toEqual({
      ok: true,
    });
    expect(await verifySubmission(config, secrets, input(token), answer(0.6), up)).toEqual({
      ok: true,
    });
    expect(await verifySubmission(config, secrets, input(token), answer(0.3), up)).toEqual({
      ok: false,
      reason: 'score 0.3',
    });
    expect(
      await verifySubmission(config, secrets, input(token), answer(0.9, 'core/comment'), up),
    ).toEqual({
      ok: false,
      reason: 'action core/comment',
    });
  });
});

describe('helpers', () => {
  it('reads text fields', () => {
    expect(fieldText({ a: ' x ' }, 'a')).toBe('x');
    expect(fieldText({ a: ['y', 'z'] }, 'a')).toBe('y');
    expect(fieldText({ a: 3 }, 'a')).toBe('');
  });

  it('remembers whether Cloudflare is down for two minutes', async () => {
    let now = 0;
    const { http } = provider('down');
    const down = cloudflareStatus(http, () => now);
    expect(await down()).toBe(true);
    expect(await down()).toBe(true);
    expect(http).toHaveBeenCalledTimes(1);
    now = 121_000;
    await down();
    expect(http).toHaveBeenCalledTimes(2);
  });
});
