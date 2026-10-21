/**
 * Checks a submission with the provider (Cloudflare's or Google's
 * `siteverify`): the token, the host name, the action and, for reCAPTCHA
 * v3, the score. The HTTP client is given, so tests use a fake one.
 */
import { actionFor, isTestSecret, publicIp, type CaptchaConfig, type Provider } from './config';

export const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const RECAPTCHA_VERIFY = 'https://www.google.com/recaptcha/api/siteverify';
export const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

export type HttpSend = (request: {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}) => Promise<{ status: number; text: string }>;

export interface VerifyInput {
  form: string;
  fields: Record<string, unknown>;
  ip: string;
  host?: string;
}

export interface Secrets {
  secret: string;
  /** reCAPTCHA v2 secret of the `recaptcha` failsafe. */
  fallbackSecret: string | null;
}

/** Why a submission was refused, for the log; `ok` when it passes. */
export type Outcome = { ok: true; via?: 'failsafe' } | { ok: false; reason: string };

interface Answer {
  success?: boolean;
  hostname?: string;
  action?: string;
  score?: number;
  'error-codes'?: string[];
}

/** A field's value as text (the first one when the form sent several). */
export function fieldText(fields: Record<string, unknown>, name: string): string {
  const value = fields[name];
  const text = Array.isArray(value) ? value.find((v) => typeof v === 'string') : value;
  return typeof text === 'string' ? text.trim().slice(0, 4096) : '';
}

/** Asks a provider about a token: its answer, or `null` when it could not be reached. */
async function siteverify(
  http: HttpSend,
  url: string,
  secret: string,
  token: string,
  ip: string,
): Promise<Answer | null> {
  const params = new URLSearchParams({ secret, response: token });
  const remote = publicIp(ip);
  if (remote) params.set('remoteip', remote);
  try {
    const res = await http({
      url,
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      timeoutMs: 4000,
    });
    if (res.status >= 500) return null;
    return JSON.parse(res.text) as Answer;
  } catch {
    return null;
  }
}

/** The answer says the token is good for this site and form. */
function judge(
  answer: Answer,
  options: { provider: Provider; form: string; host?: string; secret: string; minScore: number },
): Outcome {
  if (answer.success !== true) {
    return {
      ok: false,
      reason: `rejected (${(answer['error-codes'] ?? []).join(', ') || 'no reason'})`,
    };
  }
  if (
    options.host &&
    answer.hostname &&
    !isTestSecret(options.secret) &&
    answer.hostname.toLowerCase() !== options.host.toLowerCase()
  ) {
    return { ok: false, reason: `solved on ${answer.hostname}` };
  }
  const action = actionFor(options.provider, options.form);
  if (options.provider === 'recaptcha3') {
    if (answer.action !== action) return { ok: false, reason: `action ${String(answer.action)}` };
    if (typeof answer.score !== 'number' || answer.score < options.minScore) {
      return { ok: false, reason: `score ${String(answer.score)}` };
    }
  } else if (options.provider === 'turnstile' && answer.action && answer.action !== action) {
    return { ok: false, reason: `action ${answer.action}` };
  }
  return { ok: true };
}

/**
 * Whether Cloudflare's Turnstile is down, as the browser would see it: its
 * script does not load. Asked only for the `allow` failsafe, remembered for
 * two minutes.
 */
export function cloudflareStatus(http: HttpSend, now = () => Date.now()) {
  let known: { down: boolean; at: number } | null = null;
  return async (): Promise<boolean> => {
    if (known && now() - known.at < 120_000) return known.down;
    let down: boolean;
    try {
      down = (await http({ url: TURNSTILE_SCRIPT, method: 'GET', timeoutMs: 5000 })).status >= 500;
    } catch {
      down = true;
    }
    known = { down, at: now() };
    return down;
  };
}

/** Checks a submission of a protected form. */
export async function verifySubmission(
  config: CaptchaConfig,
  secrets: Secrets,
  input: VerifyInput,
  http: HttpSend,
  cloudflareDown: () => Promise<boolean>,
): Promise<Outcome> {
  const options = {
    form: input.form,
    minScore: config.minScore,
    ...(input.host ? { host: input.host } : {}),
  };
  const recaptchaToken = fieldText(input.fields, 'g-recaptcha-response');

  // The reCAPTCHA checkbox shown instead of Turnstile when its script did not load.
  const fallback = async (): Promise<Outcome> => {
    if (!secrets.fallbackSecret || !recaptchaToken)
      return { ok: false, reason: 'no fallback token' };
    const answer = await siteverify(
      http,
      RECAPTCHA_VERIFY,
      secrets.fallbackSecret,
      recaptchaToken,
      input.ip,
    );
    if (!answer) return { ok: false, reason: 'Google could not be reached' };
    const outcome = judge(answer, {
      ...options,
      provider: 'recaptcha2',
      secret: secrets.fallbackSecret,
    });
    return outcome.ok ? { ok: true, via: 'failsafe' } : outcome;
  };

  if (config.provider === 'turnstile') {
    const token = fieldText(input.fields, 'cf-turnstile-response');
    if (!token) {
      if (config.failsafe === 'recaptcha' && recaptchaToken) return fallback();
      if (
        config.failsafe === 'allow' &&
        fieldText(input.fields, 'cl-captcha-failsafe') === 'allow' &&
        (await cloudflareDown())
      ) {
        return { ok: true, via: 'failsafe' };
      }
      return { ok: false, reason: 'no token' };
    }
    const answer = await siteverify(http, TURNSTILE_VERIFY, secrets.secret, token, input.ip);
    if (!answer) {
      // Cloudflare is down: the failsafe decides.
      if (config.failsafe === 'allow') return { ok: true, via: 'failsafe' };
      if (config.failsafe === 'recaptcha') return fallback();
      return { ok: false, reason: 'Cloudflare could not be reached' };
    }
    return judge(answer, { ...options, provider: 'turnstile', secret: secrets.secret });
  }

  if (!recaptchaToken) return { ok: false, reason: 'no token' };
  const answer = await siteverify(http, RECAPTCHA_VERIFY, secrets.secret, recaptchaToken, input.ip);
  if (!answer) return { ok: false, reason: 'Google could not be reached' };
  return judge(answer, { ...options, provider: config.provider, secret: secrets.secret });
}
