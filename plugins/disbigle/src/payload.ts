/**
 * The body of `POST /api/v1/disbigle/articles`: the article in each of its
 * languages Disbigle knows, the people it mentions and its tags. No I/O here.
 */
import type { CxdBlock, CxdDocument, CxdInline } from '@cleitext/plugin-sdk';

/** The languages Disbigle writes announcements in. */
export const LANGUAGES = ['en', 'it', 'es', 'fr', 'de', 'zh'] as const;
export type Language = (typeof LANGUAGES)[number];

export const SUMMARY_LENGTH = 300;
export const MAX_MENTIONS = 20;
export const MAX_TAGS = 10;

/** One published version of the article. */
export interface ArticleVersion {
  locale: string;
  title: string;
  excerpt?: string | null;
  /** Its plain text, for the summary when it has no excerpt and for the mentions. */
  text: string;
  /** Its full public address. */
  url: string;
}

export interface ArticleTranslation {
  title: string;
  summary?: string;
  url: string;
}

export interface ArticlePayload {
  translations: Partial<Record<Language, ArticleTranslation>>;
  language: Language;
  mentions: string[];
  tags: string[];
}

/** `it`, `it-IT`, `zh-Hans` → the language Disbigle knows, or null. */
export function languageOf(locale: string): Language | null {
  const base = locale.toLowerCase().split(/[-_]/)[0] ?? '';
  return (LANGUAGES as readonly string[]).includes(base) ? (base as Language) : null;
}

const inlineText = (nodes: CxdInline[]): string =>
  nodes
    .map((node) => ('type' in node ? node.children.map((c) => c.text).join('') : node.text))
    .join('');

/** The text of a block document, a paragraph per line (as the core indexes it). */
export function documentText(document: CxdDocument | null | undefined): string {
  const parts: string[] = [];
  const walk = (blocks: CxdBlock[]) => {
    for (const block of blocks) {
      if (Array.isArray(block.content)) parts.push(inlineText(block.content));
      if (Array.isArray(block.children)) walk(block.children);
    }
  };
  if (document && Array.isArray(document.blocks)) walk(document.blocks);
  return parts.filter((p) => p.trim()).join('\n');
}

/** Text without tags and with spaces collapsed (excerpts may hold some HTML). */
export function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The summary: the excerpt, else the beginning of the text; cut at the end
 * of a word near `max` characters, with «…». Undefined when both are empty.
 */
export function summarize(
  excerpt: string | null | undefined,
  text: string,
  max = SUMMARY_LENGTH,
): string | undefined {
  const source = plainText(excerpt ?? '') || plainText(text);
  if (!source) return undefined;
  const chars = [...source];
  if (chars.length <= max) return source;
  const head = chars.slice(0, max).join('');
  const space = head.lastIndexOf(' ');
  const cut = (space > max * 0.6 ? head.slice(0, space) : head).replace(/[\s.,;:!?…-]+$/u, '');
  return `${cut}…`;
}

const USER = '[a-z0-9_](?:[a-z0-9_.-]*[a-z0-9_])?';
const HOST = '(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,63}';
/** Not after a letter, a digit or part of an address (`/@user`, `x.y@host`). */
const BEFORE = '(?<![\\p{L}\\p{N}_@/.+:-])';

/**
 * `@user@server` with its leading `@`, as people write mentions: a plain
 * `name@example.com` in the text is an email address, never a mention.
 */
export const MENTION_RE = new RegExp(`${BEFORE}@(${USER})@(${HOST})(?![\\p{L}\\p{N}_-])`, 'giu');
/** `@user@server` with its `@`: what is linked in the article. */
export const LINKED_MENTION_RE = new RegExp(
  `${BEFORE}@(${USER})@(${HOST})(?![\\p{L}\\p{N}_-])`,
  'giu',
);

/** The people the texts mention, `user@server` in lowercase, each once, at most `limit`. */
export function findMentions(texts: string[], limit = MAX_MENTIONS): string[] {
  const found: string[] = [];
  for (const text of texts) {
    for (const match of text.matchAll(MENTION_RE)) {
      const acct = `${match[1]}@${match[2]}`.toLowerCase();
      if (!found.includes(acct)) found.push(acct);
      if (found.length >= limit) return found;
    }
  }
  return found;
}

/** A category or tag as a hashtag: letters, digits and `_` only; null when nothing is left. */
export function tagOf(name: string): string | null {
  const tag = name.normalize('NFC').replace(/[^\p{L}\p{N}_]/gu, '');
  if (!tag || /^[\p{N}_]+$/u.test(tag)) return null;
  return [...tag].slice(0, 100).join('');
}

export function cleanTags(names: string[], limit = MAX_TAGS): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const tag = tagOf(name);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
    if (tags.length >= limit) break;
  }
  return tags;
}

/**
 * The body for Disbigle, or null when the article has no version in its
 * languages. `versions` start with the version being published; one per
 * language is used (the first). The main language is English when there
 * is one, else the first.
 */
export function buildPayload(
  versions: ArticleVersion[],
  tagNames: string[],
): ArticlePayload | null {
  const translations: Partial<Record<Language, ArticleTranslation>> = {};
  const used: ArticleVersion[] = [];
  for (const version of versions) {
    const language = languageOf(version.locale);
    if (!language || translations[language] || !version.title.trim() || !version.url) continue;
    const summary = summarize(version.excerpt, version.text);
    translations[language] = {
      title: version.title.trim(),
      ...(summary ? { summary } : {}),
      url: version.url,
    };
    used.push(version);
  }
  const languages = Object.keys(translations) as Language[];
  if (languages.length === 0) return null;
  return {
    translations,
    language: translations.en ? 'en' : languages[0]!,
    mentions: findMentions(used.flatMap((v) => [v.title, plainText(v.excerpt ?? ''), v.text])),
    tags: cleanTags(tagNames),
  };
}
