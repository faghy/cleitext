/**
 * The import report in Italian (1.32.1): every line has a key with its
 * Italian, whoever wrote it (this plugin, the core's importer, the
 * converters, other plugins' hooks).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { placeholders, REPORT_IT, translateReportLine, translateReportText } from './report-i18n';
import { wxrToDocument } from './wxr';

/** The admin's `t` in Italian. */
const it_ = (key: string, values: Record<string, string>) =>
  (REPORT_IT[key] ?? key).replace(/\{(\w+)\}/g, (m, name: string) => values[name] ?? m);
const italian = (line: string) => translateReportLine(line, it_);

describe('the import report in Italian', () => {
  it('has an Italian string for every key, with the same placeholders', () => {
    for (const [key, text] of Object.entries(REPORT_IT)) {
      expect(text.trim(), key).not.toBe('');
      expect(text, key).not.toBe(key);
      expect(new Set(placeholders(text)), key).toEqual(new Set(placeholders(key)));
    }
  });

  it('translates the lines of every part of the import', () => {
    const lines: [string, string][] = [
      // The core: shortcodes taken by plugins (NewLetter's form, Agenda's booking).
      [
        'Shortcode [newsletter_form] became a block of an active plugin (2×).',
        'Lo shortcode [newsletter_form] è diventato un blocco di un plugin attivo (2×).',
      ],
      [
        'Shortcode [ssa_booking] became a block of an active plugin (1×).',
        'Lo shortcode [ssa_booking] è diventato un blocco di un plugin attivo (1×).',
      ],
      [
        'Shortcode [kross-booking] has no equivalent (3×): kept as text. A plugin may add it.',
        'Lo shortcode [kross-booking] non ha un equivalente (3×): conservato come testo. Un plugin può aggiungerlo.',
      ],
      // NewLetter: forms pasted from email services.
      [
        'Newsletter forms embedded from email services (Brevo 1×, Mailchimp 2×): with a newsletter plugin active (NewLetter) they become its signup form; otherwise their HTML is kept as it was.',
        'Moduli di newsletter incorporati da servizi email (Brevo 1×, Mailchimp 2×): con un plugin di newsletter attivo (NewLetter) diventano il suo modulo di iscrizione; altrimenti il loro HTML resta com’era.',
      ],
      // Embeds, after the page's title (which may hold ": " too).
      [
        'Video: the trip: Embed of YouTube kept (from an [embed] shortcode): A day at sea, https://youtu.be/x',
        'Video: the trip: Contenuto di YouTube conservato (da uno shortcode [embed]): A day at sea, https://youtu.be/x',
      ],
      [
        "Home: Embed of TikTok kept with WordPress's HTML, held until consent with the Privacy plugin: https://www.tiktok.com/@a",
        'Home: Contenuto di TikTok conservato con l’HTML di WordPress, bloccato fino al consenso con il plugin Privacy: https://www.tiktok.com/@a',
      ],
      // Permalinks (core and this plugin).
      [
        'Posts keep the addresses of the export: their permalink is now /{year}/{slug} (it was /blog/{slug}); 3 existing address(es) redirect.',
        'Gli articoli mantengono gli indirizzi dell’esportazione: il loro permalink ora è /{year}/{slug} (era /blog/{slug}); 3 indirizzi esistenti reindirizzano.',
      ],
      [
        'Categories had archives at /topic: the site already has some, so theirs stay at /category. Change the base in Settings → Content structure (now /category), or import again choosing to use the addresses of the export.',
        'Le categorie avevano gli archivi in /topic: il sito ne ha già, quindi i loro restano in /category. Cambia la base in Impostazioni → Struttura dei contenuti (ora /category), oppure importa di nuovo scegliendo di usare gli indirizzi dell’esportazione.',
      ],
      // Media addresses (core 0.85).
      [
        'Media addresses changed: 4 file(s), in the same year and month, e.g. /wp-content/uploads/2015/07/a.gif → /media/s/2015/07/a.gif; the old addresses redirect (301) to the new ones.',
        'Indirizzi dei media cambiati: 4 file, nello stesso anno e mese, ad esempio /wp-content/uploads/2015/07/a.gif → /media/s/2015/07/a.gif; i vecchi indirizzi fanno un redirect (301) ai nuovi.',
      ],
      [
        'Media address changed: /wp-content/uploads/2015/07/A b.gif → /media/s/2015/07/a-b-1.gif',
        'Indirizzo del media cambiato: /wp-content/uploads/2015/07/A b.gif → /media/s/2015/07/a-b-1.gif',
      ],
      // Notes of the page builders, repeated.
      [
        'Home: display conditions of elements were not imported (2×).',
        'Home: le condizioni di visualizzazione degli elementi non sono state importate (2×).',
      ],
      [
        'Template "Header": the template condition "include/archive" has no counterpart and was left out.',
        'Modello "Header": la condizione del modello "include/archive" non ha un corrispondente ed è stata tralasciata.',
      ],
      // Values that are report text too.
      [
        'Additional CSS for every theme not imported: The CSS cannot contain <script>.',
        'CSS aggiuntivo per tutti i temi non importato: Il CSS non può contenere <script>.',
      ],
      [
        'Contact Form 7 form "Contact": the field [file cv] has no equivalent and was left out; its autoresponder (Mail (2)) was left out: Forms sends no reply to visitors.',
        'Modulo di Contact Form 7 "Contact": il campo [file cv] non ha un equivalente ed è stato tralasciato; la risposta automatica (Mail (2)) è stata tralasciata: Forms non invia risposte ai visitatori.',
      ],
      [
        'Leftovers of the cookie banner (CookieYes), replaced by the Privacy plugin: 2 CSS rule(s) or style block(s) removed, 1 script(s) removed.',
        'Resti del banner dei cookie (CookieYes), sostituito dal plugin Privacy: 2 regole CSS o blocchi di stile rimossi, 1 script rimossi.',
      ],
      // Other plugins' hooks.
      ['Diorama: 2 sliders imported.', 'Diorama: 2 slider importati.'],
      [
        'Cleishop: prices, codes, stock and pictures of 4 product(s) saved.',
        'Cleishop: salvati prezzi, codici, magazzino e immagini di 4 prodotti.',
      ],
    ];
    for (const [english, expected] of lines) expect(italian(english)).toBe(expected);
    // A line without a key is shown as written; so are titles and addresses.
    expect(italian('Something new happened.')).toBe('Something new happened.');
    expect(translateReportText('', it_)).toBeNull();
  });

  it('leaves no line of the test exports in English', () => {
    const fixtures = new URL('../../../apps/server/test/fixtures/wxr/', import.meta.url);
    const left: string[] = [];
    let lines = 0;
    for (const name of readdirSync(fixtures).filter((f) => f.endsWith('.xml'))) {
      const xml = readFileSync(new URL(name, fixtures), 'utf8');
      for (const line of wxrToDocument(xml, { locale: 'it', corePermalinks: true }).warnings) {
        lines++;
        if (translateReportText(line, it_) === null) left.push(line);
      }
    }
    expect(lines).toBeGreaterThan(5);
    expect(left).toEqual([]);
  });
});
