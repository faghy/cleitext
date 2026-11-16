import { describe, expect, it } from 'vitest';
import {
  buildPayload,
  cleanTags,
  documentText,
  findMentions,
  languageOf,
  summarize,
  type ArticleVersion,
} from '../src/payload';

const version = (locale: string, extra: Partial<ArticleVersion> = {}): ArticleVersion => ({
  locale,
  title: `Title ${locale}`,
  excerpt: null,
  text: `Text in ${locale}.`,
  url: `https://blog.example/${locale}/post/`,
  ...extra,
});

describe('languages', () => {
  it('knows the six languages of Disbigle, with regions', () => {
    expect(languageOf('it')).toBe('it');
    expect(languageOf('it-IT')).toBe('it');
    expect(languageOf('zh-Hans')).toBe('zh');
    expect(languageOf('EN_gb')).toBe('en');
    expect(languageOf('pt-BR')).toBeNull();
  });

  it('orders the languages English, Italian, Spanish, Chinese, French, German', () => {
    const payload = buildPayload(
      ['de', 'fr', 'zh', 'es', 'it', 'en'].map((l) => version(l)),
      [],
    )!;
    expect(Object.keys(payload.translations)).toEqual(['en', 'it', 'es', 'zh', 'fr', 'de']);
  });

  it('puts every language once, English as the main one when present', () => {
    const payload = buildPayload(
      [version('it'), version('pt'), version('en'), version('it-CH'), version('de')],
      [],
    )!;
    // Always in the same order, whatever the version published first.
    expect(Object.keys(payload.translations)).toEqual(['en', 'it', 'de']);
    expect(payload.language).toBe('en');
    expect(payload.translations.it).toEqual({
      title: 'Title it',
      summary: 'Text in it.',
      url: 'https://blog.example/it/post/',
    });
  });

  it('uses the first language without English, and gives up without any', () => {
    expect(buildPayload([version('fr'), version('es')], [])!.language).toBe('fr');
    expect(buildPayload([version('pt'), version('ja')], [])).toBeNull();
    expect(buildPayload([version('it', { title: '  ' })], [])).toBeNull();
  });
});

describe('summary', () => {
  it('is the excerpt without HTML, else the text', () => {
    expect(summarize('<p>Un <b>riassunto</b> &amp; altro</p>', 'Il testo')).toBe(
      'Un riassunto & altro',
    );
    expect(summarize('', 'Il testo\ndell’articolo')).toBe('Il testo dell’articolo');
    expect(summarize(null, '')).toBeUndefined();
  });

  it('is cut at the end of a word near 300 characters, with an ellipsis', () => {
    const words = Array.from({ length: 80 }, (_, i) => `parola${i}`).join(' ');
    const summary = summarize(null, words)!;
    expect(summary.endsWith('…')).toBe(true);
    expect([...summary].length).toBeLessThanOrEqual(301);
    expect(summary.slice(0, -1)).toMatch(/parola\d+$/);
    expect(words.startsWith(summary.slice(0, -1))).toBe(true);
    expect(summarize(null, words, 1000)).toBe(words);
  });

  it('reads the text of the blocks, nested ones too', () => {
    expect(
      documentText({
        schema: 1,
        blocks: [
          {
            id: 'a',
            type: 'core/paragraph',
            v: 1,
            attrs: {},
            content: [
              { text: 'Uno ' },
              { type: 'link', href: 'https://x.example', children: [{ text: 'due' }] },
            ],
          },
          {
            id: 'b',
            type: 'core/group',
            v: 1,
            attrs: {},
            children: [
              { id: 'c', type: 'core/heading', v: 1, attrs: {}, content: [{ text: 'Tre' }] },
            ],
          },
        ],
      }),
    ).toBe('Uno due\nTre');
  });
});

describe('mentions', () => {
  it('finds @user@server each once, in lowercase; email addresses are not mentions', () => {
    expect(
      findMentions([
        'Thanks @Anna@Disbigle.com and @bob@mastodon.social! Write to info@example.com.',
        'Again @anna@disbigle.com, and @carla_b@sub.example.org.',
      ]),
    ).toEqual(['anna@disbigle.com', 'bob@mastodon.social', 'carla_b@sub.example.org']);
  });

  it('ignores profile addresses, lone handles and things that are not hosts', () => {
    expect(
      findMentions([
        'https://mastodon.social/@anna@other.example and @solo and @x@localhost and a@b.c1 and @@x@y.example',
      ]),
    ).toEqual([]);
  });

  it('stops at 20', () => {
    const text = Array.from({ length: 25 }, (_, i) => `@user${i}@server.example`).join(' ');
    const found = findMentions([text]);
    expect(found).toHaveLength(20);
    expect(found[19]).toBe('user19@server.example');
  });

  it('come from every language, in the payload', () => {
    const payload = buildPayload(
      [
        version('en', { text: 'Hello @anna@disbigle.com' }),
        version('it', { excerpt: 'Ciao @luca@mastodon.uno' }),
      ],
      [],
    )!;
    expect(payload.mentions).toEqual(['anna@disbigle.com', 'luca@mastodon.uno']);
  });
});

describe('tags', () => {
  it('keep letters, digits and underscores, once, at most 10', () => {
    expect(
      cleanTags([
        'Open Source',
        'C++',
        'Viaggi & Cultura',
        'open-source',
        'Città_2026',
        '#!',
        '2026',
      ]),
    ).toEqual(['OpenSource', 'C', 'ViaggiCultura', 'Città_2026']);
    expect(cleanTags(Array.from({ length: 15 }, (_, i) => `tag ${i}`))).toHaveLength(10);
  });
});
