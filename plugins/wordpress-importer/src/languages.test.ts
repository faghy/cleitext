import { readFileSync } from 'node:fs';
import type { CxdBlock } from '@cleitext/blocks';
import { describe, expect, it } from 'vitest';
import { wxrToDocument } from './wxr';
import {
  addressLanguage,
  detectLanguages,
  languageCode,
  matchLocale,
  scanWxr,
  sharedAddresses,
  type ItemFacts,
} from './languages';

const fixtures = new URL('../../../apps/server/test/fixtures/wxr/', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, fixtures), 'utf8');

const facts = (id: number, link: string, extra: Partial<ItemFacts> = {}): ItemFacts => ({
  id,
  type: 'page',
  link,
  meta: {},
  categories: [],
  ...extra,
});

describe('language codes', () => {
  it('are WordPress’s codes, matched to the site’s languages', () => {
    expect(languageCode('pt_BR')).toBe('pt-br');
    expect(languageCode('zh-hans')).toBe('zh-hans');
    expect(languageCode('English')).toBeNull();
    expect(matchLocale('en', ['it', 'en-US'])).toBe('en-US');
    expect(matchLocale('pt-br', ['pt-BR', 'pt'])).toBe('pt-BR');
    expect(matchLocale('de-ch', ['de'])).toBe('de');
    expect(matchLocale('fr', ['it', 'en'])).toBeNull();
    expect(addressLanguage('https://x.com/en/rooms/', new Set(['en']))).toBe('en');
    expect(addressLanguage('https://x.com/rooms/?lang=de', new Set(['de']))).toBe('de');
    expect(addressLanguage('https://x.com/en/rooms/', new Set(['de']))).toBeNull();
  });
});

describe('the languages of an export', () => {
  it('come from WPML’s meta, grouped by translation group, the originals’ language first', () => {
    const detection = detectLanguages(scanWxr(read('wpml.xml')), ['it', 'en', 'de']);
    expect(detection.source).toBe('wpml');
    expect(detection.main).toBe('it');
    expect(detection.found.map((f) => f.code)).toEqual(['it', 'en', 'de', 'fr']);
    expect([...detection.groups.values()]).toContainEqual([4, 5, 6, 9]);
  });

  it('come from Polylang’s terms', () => {
    const detection = detectLanguages([
      facts(1, '/chi-siamo/', {
        categories: [
          { domain: 'language', nicename: 'it' },
          { domain: 'post_translations', nicename: 'pll_1' },
        ],
      }),
      facts(2, '/en/about/', {
        categories: [
          { domain: 'language', nicename: 'en' },
          { domain: 'post_translations', nicename: 'pll_1' },
        ],
      }),
    ]);
    expect(detection.source).toBe('polylang');
    expect(detection.languages.get(2)).toBe('en');
    expect([...detection.groups.values()]).toEqual([[1, 2]]);
  });

  it('come from addresses with the language first, the same address without it translated', () => {
    const detection = detectLanguages(
      [
        facts(1, 'https://x.com/camere/'),
        facts(2, 'https://x.com/en/camere/'),
        facts(3, 'https://x.com/de/zimmer/'),
      ],
      ['it', 'en', 'de'],
    );
    expect(detection.source).toBe('addresses');
    expect(detection.main).toBeNull();
    expect(detection.languages.get(1)).toBeUndefined();
    expect(detection.languages.get(2)).toBe('en');
    expect([...detection.groups.values()]).toEqual([[1, 2]]);
  });

  it('come from maps of translations and duplicates', () => {
    const detection = detectLanguages([
      facts(1, '/a/', { meta: { wpml_language: 'it', _icl_translations: '{"it":1,"en":2}' } }),
      facts(2, '/b/', { meta: { wpml_language: 'en' } }),
      facts(3, '/c/', {
        meta: { wpml_language: 'de', _icl_lang_duplicate_of: '1' },
      }),
      facts(4, '/d/', {
        meta: { wpml_language: 'fr', icl_translations: 'a:2:{s:2:"it";i:1;s:2:"fr";i:4;}' },
      }),
    ]);
    expect([...detection.groups.values()]).toEqual([[1, 2, 3, 4]]);
  });

  it('are none in a plain export, whose shared addresses are counted', () => {
    const items = scanWxr(read('export.xml'));
    expect(detectLanguages(items, ['en', 'it']).source).toBeNull();
    expect(sharedAddresses([facts(1, '/a/'), facts(2, '/a/'), facts(3, '/b/')])).toBe(1);
  });
});

describe('a WPML site (it, en, de)', () => {
  const xml = read('wpml.xml');

  it('imports each page in its language, linked to its translations', () => {
    const { document, warnings } = wxrToDocument(xml, {
      locale: 'it',
      locales: ['it', 'en', 'de'],
    });
    const byRef = Object.fromEntries(document.entries!.map((e) => [e.ref, e]));
    expect(byRef['post:1']!.locale).toBe('it');
    expect(byRef['post:2']!.locale).toBe('en');
    expect(byRef['post:3']!.locale).toBe('de');
    // The same slug in two languages: two pages.
    expect([byRef['post:4']!.slug, byRef['post:5']!.slug]).toEqual(['camere', 'camere']);
    expect(byRef['post:5']!.translationRef).toBe(byRef['post:4']!.translationRef);
    expect(byRef['post:5']!.oldPaths).toContain('https://rooms.example.com/en/camere/');
    // French is not on the site: left out and reported.
    expect(byRef['post:9']).toBeUndefined();
    expect(warnings.join('\n')).toContain('1 page(s) or post(s) in "fr" were not imported');
    expect(warnings.join('\n')).toContain('Languages from WPML: 3 in it, 3 in en, 2 in de');
  });

  it('rebuilds the menus of the other languages', () => {
    const { document, warnings } = wxrToDocument(xml, {
      locale: 'it',
      locales: ['it', 'en', 'de'],
    });
    const menus = document.menus!.map((m) => ({
      name: m.name,
      locale: m.locale,
      items: (m.items as { entryRef?: string; label?: string | null }[]).map((i) => [
        i.entryRef,
        i.label,
      ]),
    }));
    expect(menus).toEqual([
      {
        name: 'Menu principale',
        locale: 'it',
        items: [
          ['post:1', null],
          ['post:4', 'Le camere'],
          ['post:7', null],
        ],
      },
      // Its nav_menu term is not in the export; the item linking the Italian page links its translation.
      {
        name: 'Main menu',
        locale: 'en',
        items: [
          ['post:2', null],
          ['post:5', 'Our rooms'],
          ['post:8', null],
        ],
      },
      // No German menu: the Italian one, page by page.
      {
        name: 'Menu principale',
        locale: 'de',
        items: [
          ['post:3', null],
          ['post:6', null],
        ],
      },
    ]);
    expect(warnings.join('\n')).toContain(
      'Menu "Menu principale" was rebuilt in de from the it one, each page replaced by its translation (1 item(s) without a translation left out)',
    );
  });

  it('shows the Contact Form 7 form of the page’s language', () => {
    const { document } = wxrToDocument(xml, { locale: 'it', locales: ['it', 'en', 'de'] });
    const form = (ref: string) =>
      document
        .entries!.find((e) => e.ref === ref)!
        .document.blocks.map((b) => b as CxdBlock)
        .find((b) => b.type === 'forms/contact')!.attrs;
    expect(form('post:7')).toMatchObject({ formName: 'Contatti', buttonLabel: 'Invia' });
    expect(form('post:8')).toMatchObject({
      formName: 'Contact',
      buttonLabel: 'Send',
      successMessage: 'Thank you, we will reply soon.',
    });
  });

  it('keeps only the site’s language on a site with one', () => {
    const { document, warnings } = wxrToDocument(xml, { locale: 'it' });
    expect(document.entries!.every((e) => e.locale === 'it' && !e.translationRef)).toBe(true);
    expect(document.entries!.map((e) => e.ref)).toEqual(['post:1', 'post:4', 'post:7']);
    expect(document.menus!.map((m) => m.locale)).toEqual(['it', 'it']);
    expect(warnings.join('\n')).toContain('in "en" were not imported');
  });

  it('imports Polylang’s translations in their languages', () => {
    const polylang = xml
      .replace(/<wp:postmeta><wp:meta_key><!\[CDATA\[_wpml_import_[^]*?<\/wp:postmeta>/g, '')
      .replace(
        /<wp:post_id>(\d)<\/wp:post_id>/g,
        (whole, id: string) =>
          `${whole}<category domain="language" nicename="${['it', 'en', 'de'][(Number(id) - 1) % 3]}"><![CDATA[x]]></category><category domain="post_translations" nicename="pll_${Math.ceil(Number(id) / 3)}"><![CDATA[x]]></category>`,
      );
    const { document, warnings } = wxrToDocument(polylang, {
      locale: 'it',
      locales: ['it', 'en', 'de'],
    });
    const byRef = Object.fromEntries(document.entries!.map((e) => [e.ref, e]));
    expect([1, 2, 3, 4, 5, 6].map((id) => byRef[`post:${id}`]!.locale)).toEqual([
      'it',
      'en',
      'de',
      'it',
      'en',
      'de',
    ]);
    expect(byRef['post:2']!.translationRef).toMatch(/^pll:/);
    expect(byRef['post:2']!.translationRef).toBe(byRef['post:3']!.translationRef);
    expect(warnings.join('\n')).toContain('Languages from Polylang');
  });
});
