/**
 * Settings of the Antispam plugin made safe, the forms each switch covers,
 * and the lists (blocked and allowed words, addresses and IPs). No I/O.
 */
import { BlockList, isIP } from 'node:net';
import {
  DEFAULT_CONFIG,
  DEFAULT_FORMS,
  DEFAULT_THRESHOLDS,
  FORM_GROUPS,
  SCRIPTS,
  type AntispamConfig,
  type FormGroup,
  type ScriptName,
} from './options';

export * from './options';

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const integer = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback;
};

/** A list as typed in a textarea or sent as an array: trimmed, unique, bounded. */
export function listOf(value: unknown, max = 500): string[] {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split('\n') : [];
  const clean = items
    .map((v) => (typeof v === 'string' ? v.trim().slice(0, 200) : ''))
    .filter((v) => v && !v.startsWith('#'));
  return [...new Set(clean)].slice(0, max);
}

/** Settings as stored or sent by the admin, made safe and complete. */
export function normalizeConfig(input: unknown): AntispamConfig {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const formsRaw = (raw.forms && typeof raw.forms === 'object' ? raw.forms : {}) as Record<
    string,
    unknown
  >;
  const forms = { ...DEFAULT_FORMS };
  for (const group of FORM_GROUPS) {
    if (typeof formsRaw[group] === 'boolean') forms[group] = formsRaw[group];
  }
  const bool = (key: keyof AntispamConfig) =>
    typeof raw[key] === 'boolean' ? (raw[key] as boolean) : (DEFAULT_CONFIG[key] as boolean);
  const t = (raw.thresholds && typeof raw.thresholds === 'object' ? raw.thresholds : {}) as Record<
    string,
    unknown
  >;
  const challenge = integer(t.challenge, 1, 50, DEFAULT_THRESHOLDS.challenge);
  const spam = Math.max(integer(t.spam, 1, 50, DEFAULT_THRESHOLDS.spam), challenge);
  const reject = Math.max(integer(t.reject, 1, 100, DEFAULT_THRESHOLDS.reject), spam);
  const allowedScripts = (Array.isArray(raw.allowedScripts) ? raw.allowedScripts : []).filter(
    (s): s is ScriptName => SCRIPTS.includes(s as ScriptName),
  );
  return {
    forms,
    skipSignedIn: bool('skipSignedIn'),
    minSeconds: integer(raw.minSeconds, 0, 60, DEFAULT_CONFIG.minSeconds),
    maxLinks: integer(raw.maxLinks, 0, 50, DEFAULT_CONFIG.maxLinks),
    blocklist: listOf(raw.blocklist),
    allowlist: listOf(raw.allowlist),
    scripts: pick(raw.scripts, ['auto', 'custom', 'off'] as const, 'auto'),
    allowedScripts: [...new Set<ScriptName>(['latin', ...allowedScripts])],
    bbcode: bool('bbcode'),
    authorLink: bool('authorLink'),
    checkMx: bool('checkMx'),
    fingerprints: bool('fingerprints'),
    senders: bool('senders'),
    thresholds: { challenge, spam, reject },
    retentionDays: integer(raw.retentionDays, 1, 365, DEFAULT_CONFIG.retentionDays),
    purgeComments: bool('purgeComments'),
  };
}

/**
 * The settings' switch that covers a form id, or null for forms the
 * plugin never checks (sign-in and passwords: spam does not go there, and
 * nobody should be locked out).
 */
export function formGroup(form: string): FormGroup | null {
  switch (form) {
    case 'core/comment':
    case 'shop/review':
      return 'comments';
    case 'core/register':
      return 'register';
    case 'prisma/form':
    case 'fresco-pro/form':
      return 'builders';
  }
  if (form.startsWith('core/')) return null;
  if (form.startsWith('forms/')) return 'forms';
  return 'other';
}

/**
 * Forms whose page always carries the plugin's markup: a submission
 * without it was not sent from the page. Other forms add the markup only
 * in some cases (e.g. Fresco Pro, with the site captcha only), so its
 * absence says nothing there.
 */
export function alwaysMarked(form: string): boolean {
  return (
    form === 'core/comment' ||
    form === 'core/register' ||
    form === 'prisma/form' ||
    form.startsWith('forms/')
  );
}

/** An IPv4-mapped IPv6 address as IPv4. */
export function plainIp(ip: string): string {
  return ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}

/** An IP or a range (CIDR), or null. */
function ipEntry(text: string): { base: string; bits?: number; v6: boolean } | null {
  const [base = '', bits, extra] = text.split('/');
  if (extra !== undefined) return null;
  const kind = isIP(base);
  if (!kind) return null;
  if (bits === undefined) return { base, v6: kind === 6 };
  if (!/^\d{1,3}$/.test(bits) || Number(bits) > (kind === 4 ? 32 : 128)) return null;
  return { base, bits: Number(bits), v6: kind === 6 };
}

export interface ParsedList {
  ips: BlockList | null;
  /** Full addresses, lower case. */
  emails: Set<string>;
  /** Domains (from `@domain`, URLs and bare domains), lower case, without `www.`. */
  domains: string[];
  /** Words and phrases, lower case. */
  words: string[];
}

const DOMAIN_RE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i;

/** Sorts the entries of a list by kind. */
export function parseList(list: string[]): ParsedList {
  let ips: BlockList | null = null;
  const emails = new Set<string>();
  const domains: string[] = [];
  const words: string[] = [];
  for (const raw of list) {
    const entry = raw.trim().toLowerCase();
    const ip = ipEntry(entry);
    if (ip) {
      ips ??= new BlockList();
      const type = ip.v6 ? 'ipv6' : 'ipv4';
      try {
        if (ip.bits === undefined) ips.addAddress(ip.base, type);
        else ips.addSubnet(ip.base, ip.bits, type);
      } catch {
        // A malformed entry is skipped.
      }
    } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry)) emails.add(entry);
    else if (entry.startsWith('@') && DOMAIN_RE.test(entry.slice(1)))
      domains.push(entry.slice(1).replace(/^www\./, ''));
    else if (/^https?:\/\//.test(entry)) {
      try {
        domains.push(new URL(entry).hostname.replace(/^www\./, ''));
      } catch {
        words.push(entry);
      }
    } else if (DOMAIN_RE.test(entry)) domains.push(entry.replace(/^www\./, ''));
    else words.push(entry);
  }
  return { ips, emails, domains, words };
}

/** The address is in the list's IPs or ranges. */
export function ipListed(list: ParsedList, ip: string): boolean {
  const address = plainIp(ip);
  const kind = isIP(address);
  if (!list.ips || !kind) return false;
  return list.ips.check(address, kind === 6 ? 'ipv6' : 'ipv4');
}

/** A host name is a listed domain or one of its subdomains. */
export function domainListed(list: ParsedList, host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  return list.domains.some((d) => h === d || h.endsWith(`.${d}`));
}

/** The email is listed, by itself or by its domain. */
export function emailListed(list: ParsedList, email: string): boolean {
  const e = email.toLowerCase();
  if (!e) return false;
  if (list.emails.has(e)) return true;
  const domain = e.split('@')[1];
  return Boolean(domain && domainListed(list, domain));
}

/** Language codes → the alphabets their texts use (Latin is always allowed). */
const LANGUAGE_SCRIPTS: Record<string, ScriptName> = {
  ru: 'cyrillic',
  uk: 'cyrillic',
  bg: 'cyrillic',
  sr: 'cyrillic',
  mk: 'cyrillic',
  be: 'cyrillic',
  kk: 'cyrillic',
  ky: 'cyrillic',
  mn: 'cyrillic',
  el: 'greek',
  zh: 'cjk',
  ja: 'cjk',
  ko: 'cjk',
  ar: 'arabic',
  fa: 'arabic',
  ur: 'arabic',
  he: 'hebrew',
  yi: 'hebrew',
  hi: 'devanagari',
  mr: 'devanagari',
  ne: 'devanagari',
  th: 'thai',
  hy: 'armenian',
  ka: 'georgian',
};

/** The alphabets allowed on a site, or null when the filter is off. */
export function allowedScripts(config: AntispamConfig, locales: string[]): Set<ScriptName> | null {
  if (config.scripts === 'off') return null;
  if (config.scripts === 'custom') return new Set(['latin', ...config.allowedScripts]);
  const scripts = new Set<ScriptName>(['latin']);
  for (const locale of locales) {
    const script = LANGUAGE_SCRIPTS[locale.split('-')[0]!.toLowerCase()];
    if (script) scripts.add(script);
  }
  return scripts;
}
