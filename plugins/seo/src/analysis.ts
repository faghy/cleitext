/**
 * Content analysis of an entry, in the spirit of Yoast SEO: SEO checks around
 * a focus keyphrase, and readability checks, each with a traffic light.
 * Pure functions over the block document, run in the editor.
 */

export type Rating = 'good' | 'ok' | 'bad';

export interface Check {
  id: string;
  rating: Rating;
  /** By language: `en` and `it`. */
  text: { en: string; it: string };
}

export interface AnalysisInput {
  title: string;
  seoTitle: string;
  description: string;
  slug: string;
  keyphrase: string;
  /** CXD document (blocks). */
  document: { blocks?: unknown[] } | null;
  locale: string;
  /** The site's host, to tell internal links from outbound ones. */
  host: string;
}

interface Block {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: unknown[];
  children?: Block[];
}

interface Parsed {
  paragraphs: string[];
  headings: string[];
  images: { alt: string }[];
  links: string[];
  text: string;
}

function inlineText(nodes: unknown[] | undefined, links: string[]): string {
  if (!Array.isArray(nodes)) return '';
  return nodes
    .map((node) => {
      const n = node as { text?: string; type?: string; href?: string; children?: unknown[] };
      if (n.type === 'link') {
        if (typeof n.href === 'string') links.push(n.href);
        return inlineText(n.children, links);
      }
      return typeof n.text === 'string' ? n.text : '';
    })
    .join('');
}

/** Paragraphs, headings, images and links of a document, in order. */
export function parseDocument(document: AnalysisInput['document']): Parsed {
  const parsed: Parsed = { paragraphs: [], headings: [], images: [], links: [], text: '' };
  const walk = (blocks: Block[]) => {
    for (const block of blocks) {
      const text = inlineText(block.content, parsed.links).trim();
      if (block.type === 'core/heading' && text) parsed.headings.push(text);
      else if (
        (block.type === 'core/paragraph' ||
          block.type === 'core/list-item' ||
          block.type === 'core/quote') &&
        text
      )
        parsed.paragraphs.push(text);
      if (block.type === 'core/image') parsed.images.push({ alt: String(block.attrs?.alt ?? '') });
      if (block.type === 'core/button' && typeof block.attrs?.url === 'string')
        parsed.links.push(block.attrs.url);
      if (Array.isArray(block.children)) walk(block.children);
    }
  };
  walk((document?.blocks ?? []) as Block[]);
  parsed.text = [...parsed.headings, ...parsed.paragraphs].join('\n');
  return parsed;
}

/** Lowercase, without accents and punctuation: "Perché è" → "perche e". */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export const words = (text: string) => normalize(text).split(' ').filter(Boolean);

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => words(s).length > 0);
}

/** Small words that do not count when matching a keyphrase. */
const FUNCTION_WORDS = new Set(
  (
    'a an the of in on at to for and or with by from is are be as that this it its ' +
    'il lo la i gli le un uno una di da in con su per tra fra e ed o che del dello della dei degli delle al allo alla ai agli alle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle'
  ).split(' '),
);

/** The words of a keyphrase that must appear. */
function keyWords(keyphrase: string): string[] {
  const all = words(keyphrase);
  const content = all.filter((w) => !FUNCTION_WORDS.has(w));
  return content.length > 0 ? content : all;
}

/** True when the text has every content word of the keyphrase (any order, like Yoast). */
export function containsKeyphrase(text: string, keyphrase: string): boolean {
  const needed = keyWords(keyphrase);
  if (needed.length === 0) return false;
  const have = new Set(words(text));
  // Word forms: "caffè" matches "caffe", "pages" matches "page".
  return needed.every(
    (w) => have.has(w) || [...have].some((h) => h.startsWith(w) && h.length - w.length <= 2),
  );
}

/** How many times the keyphrase occurs: sentences that contain all its words. */
function keyphraseCount(text: string, keyphrase: string): number {
  return sentences(text).filter((s) => containsKeyphrase(s, keyphrase)).length;
}

/** Syllables, by vowel groups (good enough for readability formulas). */
export function syllables(word: string, it: boolean): number {
  const w = normalize(word);
  if (!w) return 0;
  if (it) return Math.max(1, (w.match(/[aeiouy]+/g) ?? []).length);
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  return Math.max(1, (trimmed.match(/[aeiouy]{1,2}/g) ?? []).length);
}

/** Flesch reading ease (English) or Flesch-Vacca (Italian): higher is easier. */
export function readingEase(text: string, locale: string): number | null {
  const it = locale.toLowerCase().startsWith('it');
  const list = words(text);
  const count = sentences(text).length;
  if (list.length < 50 || count === 0) return null;
  const perSentence = list.length / count;
  const syllablesPerWord = list.reduce((n, w) => n + syllables(w, it), 0) / list.length;
  const score = it
    ? 217 - 1.3 * perSentence - 0.6 * (syllablesPerWord * 100)
    : 206.835 - 1.015 * perSentence - 84.6 * syllablesPerWord;
  return Math.round(Math.max(0, Math.min(100, score)));
}

const TRANSITIONS = {
  en: 'also, although, because, besides, but, consequently, finally, first, firstly, for example, for instance, furthermore, however, in addition, in conclusion, in fact, indeed, instead, likewise, meanwhile, moreover, nevertheless, next, otherwise, second, secondly, similarly, so, still, then, therefore, thus, while, yet, above all, as a result, after that, in short, to sum up, on the other hand',
  it: 'anche, inoltre, infatti, invece, però, pero, quindi, dunque, perciò, percio, poi, infine, prima, dopo, mentre, tuttavia, comunque, ad esempio, per esempio, in particolare, in sintesi, in conclusione, di conseguenza, nonostante, anzitutto, innanzitutto, oltre a, d altra parte, insomma, cioè, cioe, ovvero, allora, perché, perche, siccome, ebbene, pertanto',
};

/** Share of sentences with a transition word, from 0 to 1. */
function transitionShare(list: string[], it: boolean): number {
  const phrases = (it ? TRANSITIONS.it : TRANSITIONS.en).split(',').map((p) => normalize(p));
  if (list.length === 0) return 0;
  const hits = list.filter((s) => {
    const n = ` ${normalize(s)} `;
    return phrases.some((p) => n.includes(` ${p} `));
  });
  return hits.length / list.length;
}

const isInternal = (href: string, host: string) => {
  if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return null;
  if (href.startsWith('/')) return true;
  try {
    return new URL(href).host === host;
  } catch {
    return true;
  }
};

const check = (id: string, rating: Rating, en: string, it: string): Check => ({
  id,
  rating,
  text: { en, it },
});

/** SEO checks: keyphrase, lengths, links and images. */
export function seoChecks(input: AnalysisInput): Check[] {
  const doc = parseDocument(input.document);
  const text = doc.text;
  const total = words(text).length;
  const title = input.seoTitle.trim() || input.title;
  const kp = input.keyphrase.trim();
  const checks: Check[] = [];

  if (!kp) {
    checks.push(
      check(
        'keyphrase',
        'bad',
        'Set a focus keyphrase: the words people search to find this page.',
        'Imposta una frase chiave: le parole che le persone cercano per trovare questa pagina.',
      ),
    );
  } else {
    const n = words(kp).length;
    checks.push(
      n <= 4
        ? check(
            'keyphraseLength',
            'good',
            'Keyphrase length: good.',
            'Lunghezza della frase chiave: ottima.',
          )
        : n <= 8
          ? check(
              'keyphraseLength',
              'ok',
              'The keyphrase is long: try 1–4 words.',
              'La frase chiave è lunga: prova con 1–4 parole.',
            )
          : check(
              'keyphraseLength',
              'bad',
              'The keyphrase is too long: use 1–4 words.',
              'La frase chiave è troppo lunga: usa 1–4 parole.',
            ),
    );
    checks.push(
      containsKeyphrase(title, kp)
        ? check(
            'titleKeyphrase',
            'good',
            'The keyphrase is in the SEO title.',
            'La frase chiave è nel titolo SEO.',
          )
        : check(
            'titleKeyphrase',
            'bad',
            'Put the keyphrase in the SEO title, best near the beginning.',
            'Metti la frase chiave nel titolo SEO, meglio all’inizio.',
          ),
    );
    checks.push(
      doc.paragraphs[0] && containsKeyphrase(doc.paragraphs[0], kp)
        ? check(
            'introKeyphrase',
            'good',
            'The keyphrase is in the first paragraph.',
            'La frase chiave è nel primo paragrafo.',
          )
        : check(
            'introKeyphrase',
            'bad',
            'Use the keyphrase in the first paragraph, so the topic is clear at once.',
            'Usa la frase chiave nel primo paragrafo, così l’argomento è subito chiaro.',
          ),
    );
    checks.push(
      containsKeyphrase(input.slug.replace(/-/g, ' '), kp)
        ? check(
            'slugKeyphrase',
            'good',
            'The keyphrase is in the address.',
            'La frase chiave è nell’indirizzo.',
          )
        : check(
            'slugKeyphrase',
            'ok',
            'The address does not contain the keyphrase.',
            'L’indirizzo non contiene la frase chiave.',
          ),
    );
    if (input.description.trim()) {
      checks.push(
        containsKeyphrase(input.description, kp)
          ? check(
              'descriptionKeyphrase',
              'good',
              'The keyphrase is in the search description.',
              'La frase chiave è nella descrizione.',
            )
          : check(
              'descriptionKeyphrase',
              'bad',
              'Use the keyphrase in the search description.',
              'Usa la frase chiave nella descrizione.',
            ),
      );
    }
    const count = keyphraseCount(text, kp);
    const density = total > 0 ? (count * keyWords(kp).length * 100) / total : 0;
    checks.push(
      count === 0
        ? check(
            'density',
            'bad',
            'The keyphrase is not in the text.',
            'La frase chiave non compare nel testo.',
          )
        : density < 0.5
          ? check(
              'density',
              'ok',
              `The keyphrase appears ${count} times: a bit more would help.`,
              `La frase chiave compare ${count} volte: qualche volta in più aiuterebbe.`,
            )
          : density <= 3
            ? check(
                'density',
                'good',
                `The keyphrase appears ${count} times: good.`,
                `La frase chiave compare ${count} volte: ottimo.`,
              )
            : check(
                'density',
                'bad',
                `The keyphrase appears ${count} times: too often, it reads as forced.`,
                `La frase chiave compare ${count} volte: troppe, sembra forzata.`,
              ),
    );
    if (doc.headings.length > 0) {
      const share =
        doc.headings.filter((h) => containsKeyphrase(h, kp)).length / doc.headings.length;
      checks.push(
        share >= 0.3 && share <= 0.75
          ? check(
              'subheadingKeyphrase',
              'good',
              'Subheadings reflect the topic.',
              'I sottotitoli riprendono l’argomento.',
            )
          : check(
              'subheadingKeyphrase',
              'ok',
              'Use the keyphrase in some subheadings (about a third to three quarters).',
              'Usa la frase chiave in alcuni sottotitoli (da un terzo a tre quarti).',
            ),
      );
    }
    if (doc.images.length > 0) {
      checks.push(
        doc.images.some((i) => containsKeyphrase(i.alt, kp))
          ? check(
              'imageKeyphrase',
              'good',
              'An image has the keyphrase in its alternative text.',
              'Un’immagine ha la frase chiave nel testo alternativo.',
            )
          : check(
              'imageKeyphrase',
              'ok',
              'Describe an image with the keyphrase in its alternative text.',
              'Descrivi un’immagine con la frase chiave nel testo alternativo.',
            ),
      );
    }
  }

  const descLength = input.description.trim().length;
  checks.push(
    descLength === 0
      ? check(
          'descriptionLength',
          'bad',
          'Write a search description: otherwise search engines pick a piece of text.',
          'Scrivi una descrizione: altrimenti i motori di ricerca prendono un pezzo di testo a caso.',
        )
      : descLength < 120
        ? check(
            'descriptionLength',
            'ok',
            `The search description is short (${descLength} characters): up to 156 are shown.`,
            `La descrizione è corta (${descLength} caratteri): ne vengono mostrati fino a 156.`,
          )
        : descLength <= 156
          ? check(
              'descriptionLength',
              'good',
              'Search description length: good.',
              'Lunghezza della descrizione: ottima.',
            )
          : check(
              'descriptionLength',
              'ok',
              `The search description is long (${descLength} characters): it will be cut after about 156.`,
              `La descrizione è lunga (${descLength} caratteri): verrà tagliata dopo circa 156.`,
            ),
  );
  checks.push(
    title.length >= 30 && title.length <= 60
      ? check('titleLength', 'good', 'SEO title length: good.', 'Lunghezza del titolo SEO: ottima.')
      : title.length < 30
        ? check(
            'titleLength',
            'ok',
            'The SEO title is short: there is room for more words.',
            'Il titolo SEO è corto: c’è spazio per altre parole.',
          )
        : check(
            'titleLength',
            'ok',
            'The SEO title is long: it may be cut in results (about 60 characters).',
            'Il titolo SEO è lungo: potrebbe essere tagliato nei risultati (circa 60 caratteri).',
          ),
  );
  checks.push(
    total >= 300
      ? check(
          'textLength',
          'good',
          `The text has ${total} words: good.`,
          `Il testo ha ${total} parole: ottimo.`,
        )
      : total >= 200
        ? check(
            'textLength',
            'ok',
            `The text has ${total} words: a little short (300 recommended).`,
            `Il testo ha ${total} parole: un po’ corto (consigliate 300).`,
          )
        : check(
            'textLength',
            'bad',
            `The text has ${total} words: add more (300 recommended).`,
            `Il testo ha ${total} parole: aggiungine (consigliate 300).`,
          ),
  );
  const internal = doc.links.filter((l) => isInternal(l, input.host) === true).length;
  const outbound = doc.links.filter((l) => isInternal(l, input.host) === false).length;
  checks.push(
    internal > 0
      ? check(
          'internalLinks',
          'good',
          'There are links to other pages of the site.',
          'Ci sono link ad altre pagine del sito.',
        )
      : check(
          'internalLinks',
          'ok',
          'Add links to other pages of the site.',
          'Aggiungi link ad altre pagine del sito.',
        ),
  );
  checks.push(
    outbound > 0
      ? check(
          'outboundLinks',
          'good',
          'There are links to other sites.',
          'Ci sono link ad altri siti.',
        )
      : check(
          'outboundLinks',
          'ok',
          'Link to useful sources on other sites.',
          'Collega fonti utili su altri siti.',
        ),
  );
  checks.push(
    doc.images.length === 0
      ? check('images', 'ok', 'Add an image to the text.', 'Aggiungi un’immagine al testo.')
      : doc.images.every((i) => i.alt.trim())
        ? check(
            'images',
            'good',
            'Every image has an alternative text.',
            'Ogni immagine ha un testo alternativo.',
          )
        : check(
            'images',
            'bad',
            'Some images have no alternative text.',
            'Alcune immagini non hanno il testo alternativo.',
          ),
  );
  return checks;
}

/** Readability checks: sentences, paragraphs, subheadings, transitions, ease. */
export function readabilityChecks(input: AnalysisInput): Check[] {
  const doc = parseDocument(input.document);
  const it = input.locale.toLowerCase().startsWith('it');
  const body = doc.paragraphs.join('\n');
  const list = sentences(body);
  const checks: Check[] = [];
  if (list.length === 0) {
    return [
      check(
        'text',
        'bad',
        'There is no text to analyse yet.',
        'Non c’è ancora testo da analizzare.',
      ),
    ];
  }

  const long = list.filter((s) => words(s).length > 20).length / list.length;
  checks.push(
    long <= 0.25
      ? check('sentenceLength', 'good', 'Sentence length: good.', 'Lunghezza delle frasi: ottima.')
      : long <= 0.3
        ? check(
            'sentenceLength',
            'ok',
            `${Math.round(long * 100)}% of the sentences have more than 20 words: shorten some.`,
            `Il ${Math.round(long * 100)}% delle frasi ha più di 20 parole: accorciane qualcuna.`,
          )
        : check(
            'sentenceLength',
            'bad',
            `${Math.round(long * 100)}% of the sentences have more than 20 words: shorten them.`,
            `Il ${Math.round(long * 100)}% delle frasi ha più di 20 parole: accorciale.`,
          ),
  );
  const longest = Math.max(...doc.paragraphs.map((p) => words(p).length));
  checks.push(
    longest <= 150
      ? check(
          'paragraphLength',
          'good',
          'Paragraph length: good.',
          'Lunghezza dei paragrafi: ottima.',
        )
      : longest <= 200
        ? check(
            'paragraphLength',
            'ok',
            'A paragraph is over 150 words: split it.',
            'Un paragrafo supera le 150 parole: dividilo.',
          )
        : check(
            'paragraphLength',
            'bad',
            'A paragraph is over 200 words: split it.',
            'Un paragrafo supera le 200 parole: dividilo.',
          ),
  );
  const total = words(body).length;
  if (total > 300) {
    const perSection = total / (doc.headings.length + 1);
    checks.push(
      perSection <= 300
        ? check(
            'subheadings',
            'good',
            'Subheadings break the text well.',
            'I sottotitoli dividono bene il testo.',
          )
        : check(
            'subheadings',
            'ok',
            'Add subheadings: a section has more than 300 words.',
            'Aggiungi sottotitoli: una sezione supera le 300 parole.',
          ),
    );
  }
  const share = transitionShare(list, it);
  checks.push(
    share >= 0.3
      ? check('transitions', 'good', 'Transition words: good.', 'Parole di collegamento: ottimo.')
      : share >= 0.2
        ? check(
            'transitions',
            'ok',
            'Use more transition words (however, therefore…).',
            'Usa più parole di collegamento (inoltre, quindi…).',
          )
        : check(
            'transitions',
            'bad',
            'Few sentences have transition words (however, therefore…): they guide the reader.',
            'Poche frasi hanno parole di collegamento (inoltre, quindi…): guidano chi legge.',
          ),
  );
  const ease = readingEase(body, input.locale);
  if (ease !== null) {
    checks.push(
      ease >= 60
        ? check(
            'readingEase',
            'good',
            `Reading ease ${ease}/100: easy to read.`,
            `Facilità di lettura ${ease}/100: facile da leggere.`,
          )
        : ease >= 50
          ? check(
              'readingEase',
              'ok',
              `Reading ease ${ease}/100: fairly hard. Use shorter sentences and words.`,
              `Facilità di lettura ${ease}/100: piuttosto difficile. Usa frasi e parole più brevi.`,
            )
          : check(
              'readingEase',
              'bad',
              `Reading ease ${ease}/100: hard to read. Use shorter sentences and words.`,
              `Facilità di lettura ${ease}/100: difficile. Usa frasi e parole più brevi.`,
            ),
    );
  }
  return checks;
}

/** One light for a group of checks, as Yoast: mostly good is green. */
export function overall(checks: Check[]): Rating {
  if (checks.length === 0) return 'bad';
  const points =
    checks.reduce((n, c) => n + (c.rating === 'good' ? 9 : c.rating === 'ok' ? 6 : 3), 0) /
    checks.length;
  return points >= 7 ? 'good' : points >= 5 ? 'ok' : 'bad';
}
