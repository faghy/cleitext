import { describe, expect, it } from 'vitest';
import {
  containsKeyphrase,
  overall,
  parseDocument,
  readabilityChecks,
  readingEase,
  seoChecks,
  type AnalysisInput,
} from './analysis';
import { applyTemplate } from './config';

const t = (text: string, href?: string) =>
  href ? { type: 'link', href, children: [{ text }] } : { text };
const p = (...content: unknown[]) => ({ type: 'core/paragraph', content });
const h = (text: string) => ({ type: 'core/heading', attrs: { level: 2 }, content: [{ text }] });

const FILLER =
  'Una buona miscela, l’acqua giusta e un po’ di pazienza fanno la differenza ogni mattina. Inoltre conviene pulire spesso la macchina. ';
const SENTENCE =
  'Il caffè espresso nasce in Italia e oggi si beve ogni giorno in tutto il mondo. Inoltre è semplice da preparare a casa. ';

function input(over: Partial<AnalysisInput> = {}): AnalysisInput {
  return {
    title: 'Caffè espresso: la guida',
    seoTitle: '',
    description:
      'Come preparare un caffè espresso perfetto a casa: macinatura, dosi, temperatura e gli errori da evitare, spiegati passo per passo.',
    slug: 'caffe-espresso',
    keyphrase: 'caffè espresso',
    locale: 'it',
    host: 'example.com',
    document: {
      blocks: [
        p(t(SENTENCE)),
        h('Il caffè espresso perfetto'),
        p(
          t(SENTENCE + FILLER.repeat(10)),
          t('altre ricette', '/ricette'),
          t(' e '),
          t('la storia', 'https://it.wikipedia.org/wiki/Espresso'),
        ),
        { type: 'core/image', attrs: { alt: 'Una tazza di caffè espresso' } },
        h('Gli strumenti'),
        p(t(FILLER.repeat(3) + SENTENCE)),
      ],
    },
    ...over,
  };
}

describe('content analysis', () => {
  it('reads the text, headings, images and links of the blocks', () => {
    const doc = parseDocument(input().document);
    expect(doc.headings).toEqual(['Il caffè espresso perfetto', 'Gli strumenti']);
    expect(doc.images).toEqual([{ alt: 'Una tazza di caffè espresso' }]);
    expect(doc.links).toEqual(['/ricette', 'https://it.wikipedia.org/wiki/Espresso']);
  });

  it('matches a keyphrase without accents, case and small words', () => {
    expect(containsKeyphrase('Il CAFFE espresso di Napoli', 'caffè espresso')).toBe(true);
    expect(containsKeyphrase('Espresso, il caffè', 'caffè espresso')).toBe(true);
    expect(containsKeyphrase('Il tè verde', 'caffè espresso')).toBe(false);
  });

  it('rates a well written page green', () => {
    const checks = seoChecks(input());
    const bad = checks.filter((c) => c.rating === 'bad').map((c) => c.id);
    expect(bad).toEqual([]);
    expect(overall(checks)).toBe('good');
    expect(checks.find((c) => c.id === 'internalLinks')?.rating).toBe('good');
    expect(checks.find((c) => c.id === 'outboundLinks')?.rating).toBe('good');
  });

  it('points out what is missing', () => {
    const checks = seoChecks(
      input({ keyphrase: '', description: '', document: { blocks: [p(t('Poche parole.'))] } }),
    );
    const ids = Object.fromEntries(checks.map((c) => [c.id, c.rating]));
    expect(ids).toMatchObject({
      keyphrase: 'bad',
      descriptionLength: 'bad',
      textLength: 'bad',
      images: 'ok',
    });
    expect(overall(checks)).toBe('bad');
    expect(checks[0]!.text.it).toContain('frase chiave');
  });

  it('flags long sentences and computes reading ease per language', () => {
    const long = Array.from({ length: 30 }, (_, i) => `parola${i}`).join(' ') + '.';
    const checks = readabilityChecks(
      input({ document: { blocks: [p(t(`${long} ${long} Breve frase.`))] } }),
    );
    expect(checks.find((c) => c.id === 'sentenceLength')?.rating).toBe('bad');
    const english = 'The cat sat on the mat. It was a sunny day and the cat was happy. ';
    expect(readingEase(english.repeat(6), 'en')).toBeGreaterThan(80);
    expect(readingEase(SENTENCE.repeat(4), 'it')).toBeGreaterThan(40);
  });
});

describe('title templates', () => {
  it('fills the variables and drops dangling separators', () => {
    expect(
      applyTemplate('%%title%% %%sep%% %%sitename%%', { title: 'Hi', sep: '|', sitename: 'Site' }),
    ).toBe('Hi | Site');
    expect(
      applyTemplate('%%title%% %%sep%% %%category%%', { title: 'Hi', sep: '–', category: '' }),
    ).toBe('Hi');
  });
});
