import { describe, expect, it } from 'vitest';
import { wxrToDocument } from './wxr';
import { assignLanguages, languageScores } from './wpml';

const item = (id: number, slug: string, link: string, title: string, body: string) => `
<item><title>${title}</title><link>${link}</link><dc:creator><![CDATA[admin]]></dc:creator>
<content:encoded><![CDATA[<!-- wp:paragraph --><p>${body}</p><!-- /wp:paragraph -->]]></content:encoded>
<wp:post_id>${id}</wp:post_id><wp:post_date>2025-04-15 10:00:00</wp:post_date><wp:post_date_gmt>2025-04-15 10:00:00</wp:post_date_gmt>
<wp:post_name>${slug}</wp:post_name><wp:status>publish</wp:status><wp:post_type>page</wp:post_type></item>`;

const wxr = (items: string) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wfw="http://wellformedweb.org/CommentAPI/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Old</title><link>https://old.example.com</link><wp:wxr_version>1.2</wp:wxr_version><wp:base_site_url>https://old.example.com</wp:base_site_url>${items}</channel></rss>`;

describe('post blocks of other plugins', () => {
  it('turn the WordPress term ids of their filter into slugs', () => {
    const xml = wxr(
      `<wp:category><wp:term_id>5</wp:term_id><wp:category_nicename>news</wp:category_nicename><wp:category_parent></wp:category_parent><wp:cat_name><![CDATA[News]]></wp:cat_name></wp:category>
<wp:category><wp:term_id>7</wp:term_id><wp:category_nicename>events</wp:category_nicename><wp:category_parent></wp:category_parent><wp:cat_name><![CDATA[Events]]></wp:cat_name></wp:category>` +
        item(1, 'home', 'https://old.example.com/', 'Home', 'x').replace(
          '<!-- wp:paragraph --><p>x</p><!-- /wp:paragraph -->',
          '<!-- wp:uagb/post-grid {"block_id":"a1","categories":"5,7"} /-->',
        ),
    );
    const { document } = wxrToDocument(xml, { locale: 'en' });
    const placeholder = document.entries![0]!.document.blocks[0] as unknown as {
      attrs: { attrs: { categories: string } };
    };
    expect(placeholder.attrs.attrs.categories).toBe('news,events');
  });
});

describe('WPML translations', () => {
  it('recognises languages from frequent words', () => {
    const scores = languageScores('Le nostre camere sono per tutti gli ospiti della casa', [
      'it',
      'en',
    ]);
    expect(scores.it).toBeGreaterThan(scores.en!);
    expect(
      assignLanguages(
        [
          'Our rooms are for all the guests of the house',
          'Unsere Zimmer sind für die Gäste und das Haus',
          'Le camere sono per gli ospiti della casa',
        ],
        ['it', 'en', 'de'],
      ),
    ).toEqual(['en', 'de', 'it']);
  });

  it('imports pages sharing their address as translations, in their languages', () => {
    const xml = wxr(
      item(
        1,
        'contatti',
        'https://old.example.com/contatti/',
        'Contatti',
        'Scrivici per prenotare la tua camera e per tutte le informazioni che ti servono.',
      ) +
        item(
          2,
          'contacts',
          'https://old.example.com/contatti/',
          'Contacts',
          'Write to us to book your room and for all the information you need.',
        ) +
        item(
          3,
          'kontakt',
          'https://old.example.com/contatti/',
          'Kontakt',
          'Schreiben Sie uns, um Ihr Zimmer zu buchen, und für die Informationen, die Sie brauchen.',
        ) +
        item(
          4,
          'privacy',
          'https://old.example.com/privacy/',
          'Privacy',
          'La privacy dei nostri ospiti.',
        ),
    );
    const { document, warnings } = wxrToDocument(xml, {
      locale: 'it',
      locales: ['it', 'en', 'de'],
    });
    const bySlug = Object.fromEntries(document.entries!.map((e) => [e.slug, e]));
    expect(bySlug.contatti!.locale).toBe('it');
    expect(bySlug.contacts!.locale).toBe('en');
    expect(bySlug.kontakt!.locale).toBe('de');
    expect(bySlug.contacts!.translationRef).toBe(bySlug.contatti!.translationRef);
    expect(bySlug.contatti!.oldPaths).toContain('https://old.example.com/contatti/');
    expect(bySlug.contacts!.oldPaths).toBeUndefined();
    expect(bySlug.privacy!.locale).toBe('it');
    expect(bySlug.privacy!.translationRef).toBeUndefined();
    expect(warnings.join('\n')).toContain(
      '2 page(s) or post(s) were recognised as WPML translations',
    );

    // A site with one language: nothing changes.
    const single = wxrToDocument(xml, { locale: 'it' });
    expect(single.document.entries!.every((e) => e.locale === 'it' && !e.translationRef)).toBe(
      true,
    );
  });
});
