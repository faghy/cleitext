/**
 * Content analysis with a score out of 100, as Rank Math SEO computes it:
 * each test has a weight, and the score is the share of the weights earned.
 * Pure functions over the entry being edited, run in the editor as it
 * changes (and by the tests).
 */
import { POWER_WORDS } from './powerwords.js';

export type Status = 'pass' | 'good' | 'ok' | 'bad' | 'fail' | 'info';
export type Group = 'basic' | 'additional' | 'title' | 'content';

export interface TestResult {
  id: string;
  group: Group;
  score: number;
  max: number;
  status: Status;
  text: { en: string; it: string };
}

export interface Paper {
  /** The keywords, the main one first (at most five). */
  keywords: string[];
  /** The search title as it will be shown (template applied). */
  title: string;
  description: string;
  /** The address of the page (path or full URL). */
  url: string;
  document: { blocks?: unknown[] } | null;
  featuredImage: { alt: string } | null;
  locale: string;
  /** The site's host, to tell internal links from the others. */
  host: string;
  /** Another entry already using the main keyword, if any (found by the server). */
  usedBy?: { title: string; url: string } | null;
}

export interface Analysis {
  score: number;
  tests: TestResult[];
  /** Score of each keyword (the main one is `score`). */
  keywords: { keyword: string; score: number }[];
  words: number;
}

// ---- The document as text ---------------------------------------------------------------

interface Block {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: unknown[];
  children?: Block[];
}

export interface Parsed {
  /** All the words of the content, in order. */
  text: string;
  paragraphs: string[];
  headings: { level: number; text: string }[];
  images: { alt: string }[];
  videos: number;
  links: { href: string; nofollow: boolean }[];
  toc: boolean;
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");

/** Text, links and images of HTML held in a block's settings (rich text of design blocks). */
function fromHtml(html: string, out: Parsed) {
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    out.links.push({ href: decode(m[1]!), nofollow: /rel=["'][^"']*nofollow/i.test(m[0]) });
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    out.images.push({ alt: decode(/alt=["']([^"']*)["']/i.exec(m[0])?.[1] ?? '') });
  }
  for (const m of html.matchAll(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    out.headings.push({ level: Number(m[1]), text: decode(m[2]!.replace(/<[^>]*>/g, ' ')).trim() });
  }
  if (/<(iframe|video)\b/i.test(html))
    out.videos += (html.match(/<(iframe|video)\b/gi) ?? []).length;
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) =>
    decode(m[1]!.replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim(),
  );
  const all = decode(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  out.paragraphs.push(...(paragraphs.length ? paragraphs.filter(Boolean) : all ? [all] : []));
}

function inline(nodes: unknown[] | undefined, out: Parsed): string {
  if (!Array.isArray(nodes)) return '';
  return nodes
    .map((node) => {
      const n = node as {
        text?: string;
        type?: string;
        href?: string;
        rel?: string;
        children?: unknown[];
      };
      if (n.type === 'link') {
        if (typeof n.href === 'string')
          out.links.push({ href: n.href, nofollow: /nofollow/i.test(n.rel ?? '') });
        return inline(n.children, out);
      }
      return typeof n.text === 'string' ? n.text : '';
    })
    .join('');
}

const VIDEO_URL = /youtube\.com|youtu\.be|vimeo\.com|\.mp4(\?|$)|\.webm(\?|$)/i;
const TEXT_ATTRS = [
  'title',
  'text',
  'content',
  'description',
  'heading',
  'subheading',
  'caption',
  'question',
  'answer',
  'label',
  'inner',
];

/** What the analysis needs from a block document: core blocks, and the texts of design blocks. */
export function parseDocument(document: Paper['document']): Parsed {
  const out: Parsed = {
    text: '',
    paragraphs: [],
    headings: [],
    images: [],
    videos: 0,
    links: [],
    toc: false,
  };
  const walk = (blocks: Block[]) => {
    for (const block of blocks) {
      const type = block.type ?? '';
      const attrs = block.attrs ?? {};
      const text = inline(block.content, out).replace(/\s+/g, ' ').trim();
      if (/table-of-contents|\/toc$/.test(type)) out.toc = true;
      if (type === 'core/heading') {
        if (text) out.headings.push({ level: Number(attrs.level ?? 2), text });
      } else if (text) {
        out.paragraphs.push(text);
      }
      if (type === 'core/image') out.images.push({ alt: String(attrs.alt ?? '') });
      if (type === 'core/gallery') {
        const images = Array.isArray(attrs.images)
          ? attrs.images.length
          : (block.children?.length ?? 0);
        for (let i = 0; i < Math.max(images, 1); i++) out.images.push({ alt: 'gallery' });
      }
      if (
        type === 'core/video' ||
        ((type === 'core/embed' || type.endsWith('/video')) &&
          VIDEO_URL.test(String(attrs.url ?? attrs.src ?? '')))
      )
        out.videos++;
      if (type === 'core/button' && typeof attrs.url === 'string')
        out.links.push({ href: attrs.url, nofollow: /nofollow/i.test(String(attrs.rel ?? '')) });
      // Design blocks (Prisma, Fresco, Mosaico): texts and HTML in their settings.
      if (!type.startsWith('core/')) {
        for (const key of TEXT_ATTRS) {
          const value = attrs[key];
          if (typeof value !== 'string' || !value.trim()) continue;
          if (/<[a-z][\s\S]*>/i.test(value)) fromHtml(value, out);
          else if (key === 'title' && /heading/.test(type))
            out.headings.push({
              level: Number(String(attrs.tag ?? attrs.level ?? 'h2').replace(/\D/g, '')) || 2,
              text: value.trim(),
            });
          else out.paragraphs.push(value.replace(/\s+/g, ' ').trim());
        }
        const image = attrs.image as { url?: unknown; alt?: unknown } | undefined;
        if (image && typeof image.url === 'string')
          out.images.push({ alt: String(image.alt ?? '') });
        const link = attrs.link as { url?: unknown; nofollow?: unknown } | string | undefined;
        const href = typeof link === 'string' ? link : link?.url;
        if (typeof href === 'string' && href)
          out.links.push({ href, nofollow: Boolean(typeof link === 'object' && link?.nofollow) });
        if (typeof attrs.url === 'string' && VIDEO_URL.test(attrs.url)) out.videos++;
      }
      if (Array.isArray(block.children)) walk(block.children);
    }
  };
  walk((document?.blocks ?? []) as Block[]);
  out.text = [...out.headings.map((h) => h.text), ...out.paragraphs].join('\n');
  return out;
}

// ---- Words and keywords ---------------------------------------------------------------

/** Lowercase words without accents and punctuation: "Perché è" → "perche e". */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export const wordsOf = (text: string) => normalize(text).split(' ').filter(Boolean);

/** The keyword and its plural or singular (English) and other endings (Italian). */
export function variants(keyword: string, locale: string): string[] {
  const k = normalize(keyword);
  if (!k) return [];
  const out = new Set([k]);
  const parts = k.split(' ');
  const last = parts.pop()!;
  const add = (w: string) => w && out.add([...parts, w].join(' '));
  if (locale.startsWith('it')) {
    if (/[aeio]$/.test(last)) for (const v of ['a', 'e', 'i', 'o']) add(last.slice(0, -1) + v);
    if (last.endsWith('co')) add(`${last.slice(0, -2)}chi`);
    if (last.endsWith('ca')) add(`${last.slice(0, -2)}che`);
  } else {
    if (last.endsWith('ies')) add(`${last.slice(0, -3)}y`);
    else if (last.endsWith('es')) add(last.slice(0, -2));
    if (last.endsWith('s') && !last.endsWith('ss')) add(last.slice(0, -1));
    else {
      add(`${last}s`);
      if (/(s|x|z|ch|sh)$/.test(last)) add(`${last}es`);
      if (/[^aeiou]y$/.test(last)) add(`${last.slice(0, -1)}ies`);
    }
  }
  return [...out];
}

/** How many times the keyword (or a variant) appears in the text, as whole words. */
export function occurrences(text: string, keyword: string, locale: string): number {
  const hay = ` ${normalize(text)} `;
  let count = 0;
  for (const v of variants(keyword, locale)) {
    let from = 0;
    for (;;) {
      const at = hay.indexOf(` ${v} `, from);
      if (at < 0) break;
      count++;
      from = at + v.length + 1;
    }
  }
  return count;
}

export const contains = (text: string, keyword: string, locale: string) =>
  occurrences(text, keyword, locale) > 0;

/** The address as words: `/blog/red-shoes-2024` → "blog red shoes 2024". */
const slugWords = (url: string) =>
  normalize(url.replace(/^https?:\/\/[^/]+/i, '').replace(/[-_/]+/g, ' '));

const pathOf = (url: string) => url.replace(/^https?:\/\/[^/]+/i, '') || '/';

function isExternal(href: string, host: string): boolean | null {
  if (/^(#|mailto:|tel:|javascript:)/i.test(href)) return null;
  const m = /^(?:https?:)?\/\/([^/:?#]+)/i.exec(href);
  if (!m) return false;
  const h = m[1]!.toLowerCase().replace(/^www\./, '');
  return (
    h !==
    host
      .toLowerCase()
      .replace(/^www\./, '')
      .split(':')[0]
  );
}

// ---- The tests ------------------------------------------------------------------------

type Tier = { score: number; status: Status; en: string; it: string };

function result(id: string, group: Group, max: number, tier: Tier): TestResult {
  return {
    id,
    group,
    max,
    score: tier.score,
    status: tier.status,
    text: { en: tier.en, it: tier.it },
  };
}

const yes = (max: number, en: string, it: string): Tier => ({ score: max, status: 'pass', en, it });
const no = (en: string, it: string): Tier => ({ score: 0, status: 'fail', en, it });

function tierStatus(score: number, max: number): Status {
  if (score >= max) return 'pass';
  if (score === 0) return 'fail';
  const pct = score / max;
  return pct > 0.49 ? 'good' : pct > 0.3 ? 'ok' : 'bad';
}

/** Weights of the tests (out of 100 with the main keyword, in English). */
export const WEIGHTS: Record<string, number> = {
  keywordInTitle: 36,
  keywordInMetaDescription: 2,
  keywordInPermalink: 5,
  keywordIn10Percent: 3,
  keywordInContent: 3,
  lengthContent: 8,
  keywordInSubheadings: 3,
  keywordInImageAlt: 2,
  keywordDensity: 6,
  lengthPermalink: 4,
  linksHasExternals: 4,
  linksNotAllExternals: 2,
  linksHasInternal: 5,
  keywordNotUsed: 0,
  titleStartWithKeyword: 3,
  titleHasPowerWords: 1,
  titleHasNumber: 1,
  contentHasTOC: 2,
  contentHasShortParagraphs: 3,
  contentHasAssets: 6,
};

/** The tests also run for the other keywords (not those about the main one only). */
const SECONDARY = new Set([
  'keywordInContent',
  'lengthContent',
  'keywordInSubheadings',
  'keywordDensity',
  'lengthPermalink',
  'linksHasExternals',
  'linksNotAllExternals',
  'linksHasInternal',
  'titleHasPowerWords',
  'titleHasNumber',
  'contentHasTOC',
  'contentHasShortParagraphs',
  'contentHasAssets',
]);

function runTests(
  paper: Paper,
  keyword: string,
  parsed: Parsed,
  all: string[],
  primary: boolean,
): TestResult[] {
  const { locale } = paper;
  const words = wordsOf(parsed.text);
  const count = words.length;
  const tests: TestResult[] = [];
  const add = (id: string, group: Group, tier: Tier | null) => {
    if (!tier) return;
    if (!primary && !SECONDARY.has(id)) return;
    // Other languages: the title test weighs 38 (Rank Math, where the English-only sentiment test does not run).
    const max = id === 'keywordInTitle' && !locale.startsWith('en') ? 38 : WEIGHTS[id]!;
    const score = tier.status === 'info' ? 0 : Math.min(tier.score, max);
    tests.push(
      result(id, group, max, {
        ...tier,
        score,
        status: tier.status === 'info' ? 'info' : tierStatus(score, max),
      }),
    );
  };

  // Basic SEO
  add(
    'keywordInTitle',
    'basic',
    contains(paper.title, keyword, locale)
      ? yes(
          36,
          'The main keyword is in the SEO title.',
          'La parola chiave principale è nel titolo SEO.',
        )
      : no(
          'Put the main keyword in the SEO title.',
          'Metti la parola chiave principale nel titolo SEO.',
        ),
  );
  add(
    'keywordInMetaDescription',
    'basic',
    contains(paper.description, keyword, locale)
      ? yes(
          2,
          'The main keyword is in the description.',
          'La parola chiave principale è nella descrizione.',
        )
      : no(
          'Use the main keyword in the description.',
          'Usa la parola chiave principale nella descrizione.',
        ),
  );
  add(
    'keywordInPermalink',
    'basic',
    ` ${slugWords(paper.url)} `.includes(` ${normalize(keyword)} `) ||
      variants(keyword, locale).some((v) => ` ${slugWords(paper.url)} `.includes(` ${v} `))
      ? yes(
          5,
          'The main keyword is in the address.',
          'La parola chiave principale è nell’indirizzo.',
        )
      : no(
          'Use the main keyword in the address of the page.',
          'Usa la parola chiave principale nell’indirizzo della pagina.',
        ),
  );
  const start = count > 400 ? words.slice(0, Math.ceil(count * 0.1)).join(' ') : words.join(' ');
  add(
    'keywordIn10Percent',
    'basic',
    contains(start, keyword, locale)
      ? yes(
          3,
          'The main keyword is at the beginning of the content.',
          'La parola chiave principale è all’inizio del contenuto.',
        )
      : no(
          'Use the main keyword at the beginning of the content.',
          'Usa la parola chiave principale all’inizio del contenuto.',
        ),
  );
  add(
    'keywordInContent',
    'basic',
    contains(parsed.text, keyword, locale)
      ? yes(3, 'The keyword is in the content.', 'La parola chiave è nel contenuto.')
      : no('Use the keyword in the content.', 'Usa la parola chiave nel contenuto.'),
  );
  const length =
    count > 100_000
      ? 0
      : count >= 2500
        ? 8
        : count >= 2000
          ? 5
          : count >= 1500
            ? 4
            : count >= 1000
              ? 3
              : count >= 600
                ? 2
                : 0;
  add('lengthContent', 'basic', {
    score: length,
    status: 'pass',
    en: `The content is ${count} words long${length < 8 ? ': aim for at least 600, better 2,500.' : '. Good.'}`,
    it: `Il contenuto è lungo ${count} parole${length < 8 ? ': punta ad almeno 600, meglio 2.500.' : '. Bene.'}`,
  });

  // Additional
  add(
    'keywordInSubheadings',
    'additional',
    parsed.headings.some((h) => h.level >= 2 && contains(h.text, keyword, locale))
      ? yes(3, 'The keyword is in a subheading.', 'La parola chiave è in un sottotitolo.')
      : no(
          'Use the keyword in a subheading (H2, H3…).',
          'Usa la parola chiave in un sottotitolo (H2, H3…).',
        ),
  );
  const alts = [paper.featuredImage?.alt ?? '', ...parsed.images.map((i) => i.alt)];
  add(
    'keywordInImageAlt',
    'additional',
    alts.some((alt) => alt === 'gallery' || contains(alt, keyword, locale))
      ? yes(
          2,
          'An image has the keyword in its alternative text.',
          'Un’immagine ha la parola chiave nel testo alternativo.',
        )
      : no(
          'Add an image with the keyword in its alternative text.',
          'Aggiungi un’immagine con la parola chiave nel testo alternativo.',
        ),
  );
  const matches = all.reduce((sum, k) => sum + occurrences(parsed.text, k, locale), 0);
  const density = count ? (matches / count) * 100 : 0;
  const densityScore =
    density < 0.5 || density > 2.5 ? 0 : density <= 0.75 ? 2 : density <= 1 ? 3 : 6;
  const d = density.toFixed(2);
  add('keywordDensity', 'additional', {
    score: densityScore,
    status: 'pass',
    en:
      density > 2.5
        ? `Keyword density is ${d}%: too high, the text may read as stuffed. Aim for about 1%.`
        : density < 0.5
          ? `Keyword density is ${d}%: too low. Aim for about 1%.`
          : `Keyword density is ${d}% (${matches} times). Aim for about 1%.`,
    it:
      density > 2.5
        ? `La densità delle parole chiave è ${d}%: troppo alta, il testo sembra forzato. Punta a circa l’1%.`
        : density < 0.5
          ? `La densità delle parole chiave è ${d}%: troppo bassa. Punta a circa l’1%.`
          : `La densità delle parole chiave è ${d}% (${matches} volte). Punta a circa l’1%.`,
  });
  const path = pathOf(paper.url);
  add(
    'lengthPermalink',
    'additional',
    path.length <= 75
      ? yes(
          4,
          `The address is ${path.length} characters long.`,
          `L’indirizzo è lungo ${path.length} caratteri.`,
        )
      : no(
          `The address is ${path.length} characters long: keep it under 75.`,
          `L’indirizzo è lungo ${path.length} caratteri: tienilo sotto i 75.`,
        ),
  );
  const kinds = parsed.links.map((l) => ({ ...l, external: isExternal(l.href, paper.host) }));
  const externals = kinds.filter((l) => l.external === true);
  add(
    'linksHasExternals',
    'additional',
    externals.length > 0
      ? yes(4, 'The content links to other sites.', 'Il contenuto ha link ad altri siti.')
      : no('Link to useful pages of other sites.', 'Metti link a pagine utili di altri siti.'),
  );
  add(
    'linksNotAllExternals',
    'additional',
    externals.some((l) => !l.nofollow)
      ? yes(
          2,
          'At least one link to other sites is followed.',
          'Almeno un link ad altri siti è seguito.',
        )
      : no(
          'Leave at least one link to another site followed (not nofollow).',
          'Lascia almeno un link a un altro sito seguito (non nofollow).',
        ),
  );
  add(
    'linksHasInternal',
    'additional',
    kinds.some((l) => l.external === false)
      ? yes(
          5,
          'The content links to other pages of the site.',
          'Il contenuto ha link ad altre pagine del sito.',
        )
      : no('Link to other pages of the site.', 'Metti link ad altre pagine del sito.'),
  );
  add(
    'keywordNotUsed',
    'additional',
    paper.usedBy
      ? {
          score: 0,
          status: 'info',
          en: `“${paper.usedBy.title}” already uses this keyword.`,
          it: `“${paper.usedBy.title}” usa già questa parola chiave.`,
        }
      : {
          score: 0,
          status: 'info',
          en: 'No other page uses this keyword.',
          it: 'Nessun’altra pagina usa questa parola chiave.',
        },
  );

  // Title readability
  const titleNorm = normalize(paper.title);
  const at = variants(keyword, locale)
    .map((v) => ` ${titleNorm} `.indexOf(` ${v} `))
    .filter((i) => i >= 0);
  add(
    'titleStartWithKeyword',
    'title',
    at.length && Math.min(...at) <= titleNorm.length / 2
      ? yes(
          3,
          'The keyword is in the first half of the title.',
          'La parola chiave è nella prima metà del titolo.',
        )
      : no(
          'Move the keyword to the beginning of the title.',
          'Sposta la parola chiave all’inizio del titolo.',
        ),
  );
  const list = POWER_WORDS[locale.slice(0, 2)];
  if (list) {
    const titleWords = wordsOf(paper.title);
    const hit = titleWords.find((w) =>
      list.some(
        (p) => w === normalize(p) || (w.startsWith(normalize(p)) && w.length - p.length <= 4),
      ),
    );
    add(
      'titleHasPowerWords',
      'title',
      hit
        ? yes(
            1,
            `The title has a striking word (“${hit}”).`,
            `Il titolo ha una parola d’effetto (“${hit}”).`,
          )
        : no(
            'Add a striking word to the title (amazing, essential, proven…).',
            'Aggiungi al titolo una parola d’effetto (incredibile, essenziale, efficace…).',
          ),
    );
  }
  add(
    'titleHasNumber',
    'title',
    /\d/.test(paper.title)
      ? yes(1, 'The title has a number.', 'Il titolo ha un numero.')
      : no(
          'A number in the title draws clicks (e.g. “7 ways…”).',
          'Un numero nel titolo attira i clic (es. “7 modi…”).',
        ),
  );

  // Content readability
  add(
    'contentHasTOC',
    'content',
    parsed.toc
      ? yes(2, 'The content has a table of contents.', 'Il contenuto ha un indice.')
      : no('Add a table of contents to long content.', 'Aggiungi un indice ai contenuti lunghi.'),
  );
  const long = parsed.paragraphs.filter((p) => wordsOf(p).length > 120).length;
  add(
    'contentHasShortParagraphs',
    'content',
    long === 0
      ? yes(3, 'The paragraphs are short.', 'I paragrafi sono brevi.')
      : no(
          `${long} paragraph${long === 1 ? ' is' : 's are'} longer than 120 words: split ${long === 1 ? 'it' : 'them'}.`,
          `${long === 1 ? 'Un paragrafo è più lungo' : `${long} paragrafi sono più lunghi`} di 120 parole: ${long === 1 ? 'dividilo' : 'dividili'}.`,
        ),
  );
  const images = parsed.images.length + (paper.featuredImage ? 1 : 0);
  const imageScore = images >= 4 ? 6 : images === 3 ? 4 : images;
  const videoScore = parsed.videos >= 2 ? 2 : parsed.videos;
  add('contentHasAssets', 'content', {
    score: Math.min(6, imageScore + videoScore),
    status: 'pass',
    en: `The content has ${images} image${images === 1 ? '' : 's'} and ${parsed.videos} video${parsed.videos === 1 ? '' : 's'}${imageScore + videoScore >= 6 ? '.' : ': images and videos make it richer.'}`,
    it: `Il contenuto ha ${images} immagin${images === 1 ? 'e' : 'i'} e ${parsed.videos} video${imageScore + videoScore >= 6 ? '.' : ': immagini e video lo rendono più ricco.'}`,
  });
  return tests;
}

const scoreOf = (tests: TestResult[]) => {
  const max = tests.reduce((s, t) => s + t.max, 0);
  return max ? Math.round((tests.reduce((s, t) => s + t.score, 0) / max) * 100) : 0;
};

export function analyze(paper: Paper): Analysis {
  const parsed = parseDocument(paper.document);
  const [main, ...others] = paper.keywords.map((k) => k.trim()).filter(Boolean);
  const words = wordsOf(parsed.text).length;
  if (!main) return { score: 0, tests: [], keywords: [], words };
  const tests = runTests(paper, main, parsed, paper.keywords, true);
  const score = scoreOf(tests);
  return {
    score,
    tests,
    words,
    keywords: [
      { keyword: main, score },
      ...others.map((k) => ({
        keyword: k,
        score: scoreOf(runTests(paper, k, parsed, paper.keywords, false)),
      })),
    ],
  };
}

/** Colour of a score: green above 80, orange above 50, red otherwise. */
export const scoreLevel = (score: number): 'great' | 'good' | 'bad' =>
  score > 80 ? 'great' : score > 50 ? 'good' : 'bad';
