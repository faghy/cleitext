/**
 * The settings of the Captcha plugin and the small rules built on them:
 * which forms are protected, trusted addresses, the action names given to
 * the providers and the message shown when a check fails. No I/O here, so
 * it is easy to test.
 */
import { BlockList, isIP } from 'node:net';
import {
  DEFAULT_CONFIG,
  DEFAULT_FORMS,
  DEFAULT_MESSAGES,
  FORM_GROUPS,
  PROVIDERS,
  type CaptchaConfig,
  type FormGroup,
  type Provider,
} from './options';

export * from './options';

const KEY_RE = /^[\w-]{10,100}$/;
const LANGUAGE_RE = /^(auto|[a-z]{2,3}(-[a-zA-Z]{2,4})?)$/;

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** A trusted address or range, as written, or null when it is not one. */
export function trustedEntry(value: string): string | null {
  const text = value.trim();
  const [address = '', bits, extra] = text.split('/');
  if (extra !== undefined) return null;
  const kind = isIP(address);
  if (!kind) return null;
  if (bits === undefined) return address;
  if (!/^\d{1,3}$/.test(bits) || Number(bits) > (kind === 4 ? 32 : 128)) return null;
  return `${address}/${Number(bits)}`;
}

/** Settings as stored or sent by the admin, made safe and complete. */
export function normalizeConfig(input: unknown): CaptchaConfig {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const formsRaw = (raw.forms && typeof raw.forms === 'object' ? raw.forms : {}) as Record<
    string,
    unknown
  >;
  const forms = { ...DEFAULT_FORMS };
  for (const group of FORM_GROUPS) {
    if (typeof formsRaw[group] === 'boolean') forms[group] = formsRaw[group];
  }
  const key = (value: unknown) =>
    typeof value === 'string' && KEY_RE.test(value.trim()) ? value.trim() : '';
  const score = Number(raw.minScore);
  const trustedIps = (
    Array.isArray(raw.trustedIps)
      ? raw.trustedIps
      : typeof raw.trustedIps === 'string'
        ? raw.trustedIps.split(/[\s,;]+/)
        : []
  )
    .map((v) => (typeof v === 'string' ? trustedEntry(v) : null))
    .filter((v): v is string => v !== null);
  const messages: Record<string, string> = {};
  if (raw.messages && typeof raw.messages === 'object') {
    for (const [locale, text] of Object.entries(raw.messages as Record<string, unknown>)) {
      if (!/^[a-z]{2,3}(-[a-zA-Z]{2,4})?$/.test(locale) || typeof text !== 'string') continue;
      const clean = text.replace(/\s+/g, ' ').trim().slice(0, 200);
      if (clean) messages[locale] = clean;
    }
  }
  const language = typeof raw.language === 'string' ? raw.language.trim() : '';
  return {
    provider: pick(raw.provider, PROVIDERS, DEFAULT_CONFIG.provider),
    siteKey: key(raw.siteKey),
    minScore:
      Number.isFinite(score) && score >= 0.1 && score <= 0.9 ? Math.round(score * 10) / 10 : 0.5,
    failsafe: pick(raw.failsafe, ['off', 'recaptcha', 'allow'] as const, 'off'),
    fallbackSiteKey: key(raw.fallbackSiteKey),
    forms,
    skipSignedIn: typeof raw.skipSignedIn === 'boolean' ? raw.skipSignedIn : true,
    trustedIps: [...new Set(trustedIps)].slice(0, 100),
    theme: pick(raw.theme, ['auto', 'light', 'dark'] as const, 'auto'),
    size: pick(raw.size, ['normal', 'flexible', 'compact'] as const, 'normal'),
    appearance: pick(raw.appearance, ['always', 'interaction-only'] as const, 'always'),
    language: LANGUAGE_RE.test(language) ? language : 'auto',
    disableSubmit: raw.disableSubmit === true,
    messages,
  };
}

/** The settings' switch that covers a form id (`core/login`, `shop/checkout`…). */
export function formGroup(form: string): FormGroup {
  switch (form) {
    case 'core/login':
      return 'login';
    case 'core/register':
      return 'register';
    case 'core/lost-password':
    case 'core/reset-password':
      return 'password';
    case 'core/comment':
      return 'comments';
    case 'fresco-pro/form':
    case 'prisma/form':
      return 'builders';
  }
  if (form.startsWith('forms/')) return 'forms';
  if (form.startsWith('shop/')) return form === 'shop/review' ? 'comments' : 'shop';
  return 'other';
}

/** Whether the form is protected for this visitor (before trusted addresses). */
export function protects(
  config: CaptchaConfig,
  input: { form: string; signedIn: boolean },
): boolean {
  if (input.signedIn && config.skipSignedIn) return false;
  return config.forms[formGroup(input.form)];
}

/** The address is in the trusted list. */
export function isTrusted(ip: string, list: string[]): boolean {
  const address = ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
  const kind = isIP(address);
  if (!kind || list.length === 0) return false;
  const block = new BlockList();
  for (const entry of list) {
    const [base = '', bits] = entry.split('/');
    const type = isIP(base) === 6 ? 'ipv6' : 'ipv4';
    try {
      if (bits === undefined) block.addAddress(base, type);
      else block.addSubnet(base, Number(bits), type);
    } catch {
      // A malformed entry is skipped.
    }
  }
  return block.check(address, kind === 6 ? 'ipv6' : 'ipv4');
}

/**
 * An address worth sending to the provider (`remoteip`): a public one. A
 * private or local address is the proxy's, not the visitor's
 * (`TRUST_PROXY` is not set), and sending it would only hurt.
 */
export function publicIp(ip: string): string | null {
  const address = ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
  const kind = isIP(address);
  if (!kind) return null;
  const local = new BlockList();
  for (const [base, bits] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.168.0.0', 16],
  ] as const)
    local.addSubnet(base, bits, 'ipv4');
  for (const [base, bits] of [
    ['::', 127],
    ['fc00::', 7],
    ['fe80::', 10],
  ] as const)
    local.addSubnet(base, bits, 'ipv6');
  return local.check(address, kind === 6 ? 'ipv6' : 'ipv4') ? null : address;
}

/**
 * The action name sent with the widget and checked in the provider's
 * answer: Turnstile takes `[\w-]{1,32}`, reCAPTCHA v3 `[A-Za-z0-9/_]`.
 */
export function actionFor(provider: Provider, form: string): string {
  if (provider === 'turnstile') return form.replace(/[^\w-]/g, '_').slice(0, 32);
  return form.replace(/[^A-Za-z0-9/_]/g, '_').slice(0, 100);
}

/** The message for a failed check, in the page's language. */
export function messageFor(config: CaptchaConfig, locale: string): string {
  const lang = locale.split('-')[0] ?? '';
  return (
    config.messages[locale] ??
    config.messages[lang] ??
    DEFAULT_MESSAGES[lang] ??
    config.messages.en ??
    DEFAULT_MESSAGES.en!
  );
}

/**
 * Cloudflare's and Google's test keys: their answers carry a made-up host
 * name (`example.com`, `testkey.google.com`), so it is not checked.
 */
export function isTestSecret(secret: string): boolean {
  return /^[123]x0{30,}A{2}$/.test(secret) || secret === '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe';
}
