/**
 * The local rules and the score: what a submission says (text, author,
 * email, links) and what the site knows (lists, fingerprints, senders of
 * past spam) become points, and the points an outcome. No I/O here: the
 * server gathers the facts, so every rule is easy to test.
 */
import { domainListed, emailListed, ipListed, type ParsedList } from './config';
import {
  POINTS,
  type AntispamConfig,
  type Reason,
  type ScriptName,
  type Thresholds,
} from './options';

/** What the rules read of a submission. */
export interface Submission {
  /** Every free text of the form, joined. */
  text: string;
  /** The sender's name, when the form asks for it. */
  author: string;
  email: string;
  /** The website field (comments), when given. */
  url: string;
}

/** Fields the plugin or the forms use for themselves: never read as content. */
const OWN_FIELD = /^(_|cl_as|cl-captcha|cf-turnstile|g-recaptcha|h-captcha)/i;
const CORE_FIELDS = new Set([
  'entry',
  'parent',
  'back',
  'notify',
  'redirect',
  'challenge',
  'token',
  'terms',
  'remember',
  'ts',
  'homepage',
  'privacy',
  'hold',
]);
const NAME_FIELD =
  /^(name|author|nome|full[-_]?name|first[-_]?name|fname|your[-_]?name|nickname)$/i;
const URL_FIELD = /^(url|website|homepage|site|sito)$/i;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TEXT = 20_000;

const strings = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).filter(
    (v): v is string => typeof v === 'string' && v.trim() !== '',
  );

/** The content of a submission, from the fields a form sent. */
export function extract(fields: Record<string, unknown>): Submission {
  const texts: string[] = [];
  let author = '';
  let email = '';
  let url = '';
  for (const [key, value] of Object.entries(fields)) {
    if (OWN_FIELD.test(key) || CORE_FIELDS.has(key.toLowerCase())) continue;
    for (const raw of strings(value)) {
      const v = raw.trim().slice(0, 10_000);
      if (!email && EMAIL_RE.test(v)) {
        email = v.toLowerCase();
        continue;
      }
      // The website of a comment is not a link in the message.
      if (!url && URL_FIELD.test(key)) {
        url = v.slice(0, 500);
        continue;
      }
      // The name is read apart: the text is the message (its fingerprint too).
      if (!author && NAME_FIELD.test(key)) {
        author = v.slice(0, 200);
        continue;
      }
      texts.push(v);
    }
  }
  return { text: texts.join('\n').slice(0, MAX_TEXT), author, email, url };
}

/** Text without accents of form, case and punctuation: the same message gives the same key. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** The text worth a fingerprint (long enough not to be a common phrase), or ''. */
export function fingerprintText(text: string): string {
  const clean = normalizeText(text);
  return clean.replace(/ /g, '').length >= 20 ? clean : '';
}

const LINK_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'\]]+|<a\s[^>]*href/gi;

/** The links in a text. */
export function links(text: string): string[] {
  return text.match(LINK_RE) ?? [];
}

/** Host names of the links in a text. */
export function linkHosts(text: string): string[] {
  const hosts: string[] = [];
  for (const link of links(text)) {
    try {
      hosts.push(new URL(link.startsWith('www.') ? `http://${link}` : link).hostname);
    } catch {
      // Not an address (an <a> tag): skipped.
    }
  }
  return hosts;
}

/** Points for links beyond the allowed number: 2, then one more for each, at most 4. */
export function linkPoints(count: number, maxLinks: number): number {
  if (count <= maxLinks) return 0;
  return Math.min(4, 2 + (count - maxLinks - 1));
}

/** Forum tags with addresses, as spam bots write them. */
export function hasBbcode(text: string): boolean {
  return /\[(url|link|img)(=|\])/i.test(text);
}

/** An author name that is a web address, or the same as the website field. */
export function authorIsLink(author: string, url: string): boolean {
  const name = author.trim().toLowerCase();
  if (!name) return false;
  if (/https?:\/\/|www\.|<a\s/i.test(name)) return true;
  if (
    /^(?:[a-z0-9-]+\.)+(com|net|org|info|biz|ru|top|xyz|io|co|shop|online|site|store)(\/\S*)?$/.test(
      name,
    )
  )
    return true;
  if (url) {
    const site = url
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');
    if (site && (name === site || name === url.trim().toLowerCase())) return true;
  }
  return false;
}

const SCRIPT_RES: [ScriptName, RegExp][] = [
  ['latin', /\p{Script=Latin}/gu],
  ['cyrillic', /\p{Script=Cyrillic}/gu],
  ['greek', /\p{Script=Greek}/gu],
  ['cjk', /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu],
  ['arabic', /\p{Script=Arabic}/gu],
  ['hebrew', /\p{Script=Hebrew}/gu],
  ['devanagari', /\p{Script=Devanagari}/gu],
  ['thai', /\p{Script=Thai}/gu],
  ['armenian', /\p{Script=Armenian}/gu],
  ['georgian', /\p{Script=Georgian}/gu],
];

/** Letters of each alphabet in a text. */
export function scriptCounts(text: string): Partial<Record<ScriptName, number>> {
  const counts: Partial<Record<ScriptName, number>> = {};
  for (const [name, re] of SCRIPT_RES) {
    const n = text.match(re)?.length ?? 0;
    if (n) counts[name] = n;
  }
  return counts;
}

/**
 * Points for letters of alphabets the site does not use: 4 when they are at
 * least 30% of the letters, 2 when there are many of them anyway.
 */
export function scriptPoints(text: string, allowed: Set<ScriptName> | null): number {
  if (!allowed) return 0;
  const counts = scriptCounts(text);
  let total = 0;
  let foreign = 0;
  for (const [name, n] of Object.entries(counts) as [ScriptName, number][]) {
    total += n;
    if (!allowed.has(name)) foreign += n;
  }
  if (foreign < 3) return 0;
  if (foreign / total >= 0.3) return 4;
  return foreign >= 10 ? 2 : 0;
}

/** The submission names something on the block list. */
export function blocklistHit(list: ParsedList, sub: Submission, ip: string): boolean {
  if (ipListed(list, ip)) return true;
  if (sub.email && emailListed(list, sub.email)) return true;
  const hosts = [...linkHosts(`${sub.text}\n${sub.url}`)];
  if (sub.url) {
    try {
      hosts.push(new URL(/^https?:\/\//i.test(sub.url) ? sub.url : `http://${sub.url}`).hostname);
    } catch {
      // not an address
    }
  }
  if (hosts.some((h) => domainListed(list, h))) return true;
  if (list.domains.length) {
    const lower = sub.text.toLowerCase();
    if (list.domains.some((d) => lower.includes(d))) return true;
  }
  if (list.words.length) {
    const haystack = `${sub.text}\n${sub.author}\n${sub.email}\n${sub.url}`.toLowerCase();
    if (list.words.some((w) => haystack.includes(w))) return true;
  }
  return false;
}

/** The submission is on the allow list (email, its domain or the address). */
export function allowlisted(list: ParsedList, sub: Submission, ip: string): boolean {
  return ipListed(list, ip) || (Boolean(sub.email) && emailListed(list, sub.email));
}

/**
 * The time check: `ok`, `missing` (no token: no JavaScript, or the markup
 * was not on the page), `invalid` (forged), `too-fast`, `stale` (older
 * than a day), or `unmarked` (the form had no markup of the plugin).
 */
export type TokenState = 'ok' | 'missing' | 'invalid' | 'too-fast' | 'stale' | 'unmarked';

/** What the server found out about a submission. */
export interface Facts {
  honeypot: boolean;
  token: TokenState;
  /** Points of the alphabets (scriptPoints). */
  scripts: number;
  /** The text: how often it came in the last day (this time included) and decisions about it. */
  fingerprint: { seen: number; spam: number; ham: number } | null;
  /** Spam sent before from the same address. */
  senderSpam: number;
  /** The email domain has a mail server; null when not checked. */
  mx: boolean | null;
  blocklisted: boolean;
}

export interface Scored {
  score: number;
  reasons: Reason[];
  /** Nothing against it but no proof of a person (no JavaScript): a captcha may decide. */
  doubtful: boolean;
}

/** The points of a submission and why. */
export function score(sub: Submission, facts: Facts, config: AntispamConfig): Scored {
  let total = 0;
  const reasons: Reason[] = [];
  const add = (reason: Reason, points: number) => {
    if (!points) return;
    total += points;
    reasons.push(reason);
  };
  if (facts.honeypot) add('honeypot', POINTS.honeypot);
  if (facts.token === 'invalid') add('token', POINTS.token);
  if (facts.token === 'too-fast') add('too-fast', POINTS['too-fast']);
  add('links', linkPoints(links(sub.text).length, config.maxLinks));
  if (config.bbcode && hasBbcode(sub.text)) add('bbcode', POINTS.bbcode);
  if (facts.blocklisted) add('blocklist', POINTS.blocklist);
  add('script', facts.scripts);
  if (config.authorLink && authorIsLink(sub.author, sub.url))
    add('author-link', POINTS['author-link']);
  if (facts.mx === false) add('no-mx', POINTS['no-mx']);
  const fp = facts.fingerprint;
  if (fp) {
    if (fp.spam > fp.ham) add('known-spam', POINTS['known-spam']);
    else if (fp.ham > 0 && fp.spam === 0) add('known-good', POINTS['known-good']);
    if (fp.seen >= 3) add('repeated', POINTS.repeated);
  }
  if (facts.senderSpam >= 3) add('sender', 4);
  else if (facts.senderSpam >= 1) add('sender', 2);
  const doubtful = facts.token === 'missing' || facts.token === 'stale';
  if (doubtful) reasons.push('no-js');
  return { score: total, reasons, doubtful };
}

/** What becomes of a submission with this score. */
export type Decision = 'accept' | 'challenge' | 'doubtful' | 'spam' | 'reject';

/**
 * `reject`: dropped, the sender is told it went through (the hidden field
 * always); `spam`: kept in the queue; `doubtful`: a captcha decides, or the
 * queue; `challenge`: a captcha decides when there is one, otherwise it
 * passes (no JavaScript, nothing else against it); `accept`.
 */
export function decide(scored: Scored, thresholds: Thresholds): Decision {
  if (scored.reasons.includes('honeypot') || scored.score >= thresholds.reject) return 'reject';
  if (scored.score >= thresholds.spam) return 'spam';
  if (scored.score >= thresholds.challenge) return 'doubtful';
  if (scored.doubtful) return 'challenge';
  return 'accept';
}
