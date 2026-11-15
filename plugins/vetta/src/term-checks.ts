/**
 * Quick checks of a term's search title and description (categories,
 * tags…), with a score out of 100. The full analysis needs a page's
 * content; a term has only what is written in its Vetta fields, so these
 * look at those: the main keyword in the title (near the start) and in the
 * description, and their lengths.
 */
import { contains, normalize, type TestResult } from './analysis.js';

export interface TermChecks {
  score: number;
  tests: TestResult[];
}

const test = (
  id: string,
  max: number,
  ok: boolean | 'info',
  en: string,
  it: string,
): TestResult => ({
  id,
  group: 'basic',
  score: ok === true ? max : 0,
  max: ok === 'info' ? 0 : max,
  status: ok === 'info' ? 'info' : ok ? 'pass' : 'fail',
  text: { en, it },
});

/** The checks, or null without a main keyword. */
export function termChecks(input: {
  keywords: string;
  title: string;
  description: string;
  locale: string;
}): TermChecks | null {
  const keyword =
    input.keywords
      .split(',')
      .map((k) => k.trim())
      .find(Boolean) ?? '';
  if (!keyword) return null;
  const title = input.title.trim();
  const description = input.description.trim();
  const { locale } = input;
  // Variables are filled in on the page: their length is not known here.
  const plainTitle = title.replace(/%+[a-z_]+(\([^)]*\))?%+/gi, ' ').trim();
  const tests: TestResult[] = [];
  if (!title) {
    tests.push(
      test(
        'termTitle',
        0,
        'info',
        'No search title: the taxonomy’s template applies (usually the name of the term).',
        'Nessun titolo: vale il modello della tassonomia (di solito il nome del termine).',
      ),
    );
  } else {
    const inTitle = contains(plainTitle, keyword, locale);
    tests.push(
      test(
        'termKeywordTitle',
        30,
        inTitle,
        inTitle
          ? 'The main keyword is in the search title.'
          : 'Put the main keyword in the search title.',
        inTitle
          ? 'La parola chiave principale è nel titolo.'
          : 'Metti la parola chiave principale nel titolo.',
      ),
    );
    const words = normalize(plainTitle);
    const at = words.indexOf(normalize(keyword));
    const early = at >= 0 && at <= words.length / 2;
    tests.push(
      test(
        'termKeywordStart',
        10,
        early,
        early
          ? 'The main keyword is near the start of the title.'
          : 'Move the main keyword near the start of the title.',
        early
          ? 'La parola chiave principale è all’inizio del titolo.'
          : 'Sposta la parola chiave principale verso l’inizio del titolo.',
      ),
    );
    if (!/%/.test(title)) {
      const short = title.length <= 60;
      tests.push(
        test(
          'termTitleLength',
          10,
          short,
          short
            ? `The title is ${title.length} characters: it fits in the results.`
            : `The title is ${title.length} characters: past 60 it gets cut in the results.`,
          short
            ? `Il titolo è di ${title.length} caratteri: entra nei risultati.`
            : `Il titolo è di ${title.length} caratteri: oltre 60 viene tagliato nei risultati.`,
        ),
      );
    }
  }
  if (!description) {
    tests.push(
      test(
        'termDescription',
        30,
        false,
        'Write a search description (about 150 characters) with the main keyword.',
        'Scrivi una descrizione (circa 150 caratteri) con la parola chiave principale.',
      ),
    );
  } else {
    const inDescription = contains(description, keyword, locale);
    tests.push(
      test(
        'termKeywordDescription',
        30,
        inDescription,
        inDescription
          ? 'The main keyword is in the search description.'
          : 'Put the main keyword in the search description.',
        inDescription
          ? 'La parola chiave principale è nella descrizione.'
          : 'Metti la parola chiave principale nella descrizione.',
      ),
    );
    const n = description.length;
    const fits = n >= 80 && n <= 160;
    tests.push(
      test(
        'termDescriptionLength',
        20,
        fits,
        fits
          ? `The description is ${n} characters: good.`
          : n < 80
            ? `The description is ${n} characters: write a little more (about 150).`
            : `The description is ${n} characters: past 160 it gets cut in the results.`,
        fits
          ? `La descrizione è di ${n} caratteri: bene.`
          : n < 80
            ? `La descrizione è di ${n} caratteri: scrivi qualcosa in più (circa 150).`
            : `La descrizione è di ${n} caratteri: oltre 160 viene tagliata nei risultati.`,
      ),
    );
  }
  const max = tests.reduce((sum, t) => sum + t.max, 0);
  const earned = tests.reduce((sum, t) => sum + t.score, 0);
  return { score: max ? Math.round((earned / max) * 100) : 0, tests };
}
