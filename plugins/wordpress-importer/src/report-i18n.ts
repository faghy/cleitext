/**
 * The import report in the admin's language. Its lines are written in
 * English where they are made (this plugin, the core's importer, the
 * converters of `@cleitext/blocks` and other plugins' hooks) and kept so in
 * the job; here each line is read back as a message key, an English
 * template with `{name}` placeholders, and its values, then shown with the
 * admin's `t` (`addMessages('it', REPORT_IT)`). Values that are report
 * text themselves (a note after a page's title, "for every theme",
 * "Posts") are translated too; titles, addresses and names stay as they
 * are. A line without a key is shown as written.
 */

/** Every report line (and part of a line) with its Italian, by its English template. */
export const REPORT_IT: Record<string, string> = {
  // ---- Prefixes: what the rest of the line is about -----------------------------------
  'Template "{title}": {message}': 'Modello "{title}": {message}',
  'Library item "{title}": {message}': 'Elemento della libreria "{title}": {message}',
  'Component "{title}": {message}': 'Componente "{title}": {message}',
  'Custom code "{title}": {message}': 'Codice personalizzato "{title}": {message}',
  'Elementor kit: {message}': 'Kit di Elementor: {message}',
  'Contact Form 7 form "{title}": {message}.': 'Modulo di Contact Form 7 "{title}": {message}.',

  // ---- The core's importer -------------------------------------------------------------
  'Invalid document at {path}: {error}': 'Documento non valido in {path}: {error}',
  'Field group "{id}" not imported: its id is reserved.':
    'Gruppo di campi "{id}" non importato: il suo id è riservato.',
  'Field group "{id}" not imported: {error}': 'Gruppo di campi "{id}" non importato: {error}',
  'Options page "{slug}" not imported: {error}':
    'Pagina di opzioni "{slug}" non importata: {error}',
  'User "{name}" skipped: invalid email "{email}".':
    'Utente "{name}" saltato: l’email "{email}" non è valida.',
  'Unknown role "{role}" for {email}: not added to the site.':
    'Ruolo "{role}" sconosciuto per {email}: non aggiunto al sito.',
  '{n} user(s) were created without a password: they sign in after "Forgot password".':
    '{n} utenti creati senza password: accedono dopo «Hai dimenticato la password?».',
  'Term "{name}": unknown taxonomy "{taxonomy}".':
    'Termine "{name}": la tassonomia "{taxonomy}" non esiste.',
  'Media "{file}" not imported: {error}': 'File multimediale "{file}" non importato: {error}',
  'Additional CSS: image not imported, it still points to {url}.':
    'CSS aggiuntivo: immagine non importata, punta ancora a {url}.',
  'Media addresses changed: {n} file(s), in the same year and month, e.g. {from} → {to}; the old addresses redirect (301) to the new ones.':
    'Indirizzi dei media cambiati: {n} file, nello stesso anno e mese, ad esempio {from} → {to}; i vecchi indirizzi fanno un redirect (301) ai nuovi.',
  'Media addresses changed: {n} file(s), in the same year and month, e.g. {from} → {to}; the old addresses do not redirect (the export does not say which site it comes from).':
    'Indirizzi dei media cambiati: {n} file, nello stesso anno e mese, ad esempio {from} → {to}; i vecchi indirizzi non fanno redirect (l’export non dice da quale sito viene).',
  '{n} media file(s) got another name (lowercase, without accents or spaces, or with a number because the name was taken):':
    '{n} file multimediali hanno un altro nome (minuscolo, senza accenti né spazi, o con un numero perché il nome era già preso):',
  'Media address changed: {from} → {to}': 'Indirizzo del media cambiato: {from} → {to}',
  '…and {n} more media file(s) with another name.':
    '…e altri {n} file multimediali con un altro nome.',
  '{n} entry of the type "{type}" was not imported: the site has no such content type (activate the plugin that adds it, then import again).':
    '{n} contenuto del tipo "{type}" non è stato importato: il sito non ha questo tipo di contenuto (attiva il plugin che lo aggiunge, poi importa di nuovo).',
  '{n} entries of the type "{type}" were not imported: the site has no such content type (activate the plugin that adds it, then import again).':
    '{n} contenuti del tipo "{type}" non sono stati importati: il sito non ha questo tipo di contenuto (attiva il plugin che lo aggiunge, poi importa di nuovo).',
  'Entry "{title}" ({type}, {locale}) not imported: {error}':
    'Contenuto "{title}" ({type}, {locale}) non importato: {error}',
  'Additional CSS {what}: its braces did not match ({fixes}), so it could not break the CSS printed after it.':
    'CSS aggiuntivo {what}: le sue parentesi graffe non corrispondevano ({fixes}), così non può rompere il CSS stampato dopo.',
  "Additional CSS {what} not imported: with the site's own it would be longer than {max} characters.":
    'CSS aggiuntivo {what} non importato: insieme a quello del sito supererebbe i {max} caratteri.',
  "Additional CSS {what} not imported: the site's own has a problem to fix first in Customize ({error})":
    'CSS aggiuntivo {what} non importato: quello del sito ha prima un problema da correggere in Personalizza ({error})',
  'Additional CSS {what} not imported: {error}': 'CSS aggiuntivo {what} non importato: {error}',
  "Additional CSS {what}: the imported CSS was added after the site's own, under the comment “Imported from {from}”.":
    'CSS aggiuntivo {what}: il CSS importato è stato aggiunto dopo quello del sito, sotto il commento “Imported from {from}”.',
  'for every theme': 'per tutti i temi',
  'for the theme “{slug}”': 'per il tema “{slug}”',
  'removed {n} empty block(s) left open at the end':
    'rimossi {n} blocchi vuoti lasciati aperti alla fine',
  'closed {n} block(s) left open at the end': 'chiusi {n} blocchi lasciati aperti alla fine',
  'removed {n} } with no {': 'rimosse {n} } senza {',
  'ended a comment or string left open': 'chiuso un commento o una stringa lasciati aperti',
  'Additional CSS is limited to {max} characters.':
    'Il CSS aggiuntivo è limitato a {max} caratteri.',
  'The CSS cannot contain <style> or </style>.': 'Il CSS non può contenere <style> o </style>.',
  'The CSS cannot contain <script>.': 'Il CSS non può contenere <script>.',
  'The CSS cannot contain NUL characters.': 'Il CSS non può contenere caratteri NUL.',
  'The CSS has a } with no { before it.': 'Il CSS ha una } senza una { prima.',
  'The CSS has a comment that is never closed with */.':
    'Il CSS ha un commento che non viene mai chiuso con */.',
  'The CSS has a string that is never closed.': 'Il CSS ha una stringa che non viene mai chiusa.',
  'The CSS has a { that is never closed.': 'Il CSS ha una { che non viene mai chiusa.',
  'Colour scheme: the theme “{theme}” is set to {scheme}, as the imported site; change it in Appearance → Customize.':
    'Schema di colori: il tema “{theme}” è impostato su {scheme}, come il sito importato; puoi cambiarlo in Aspetto → Personalizza.',
  'Menu "{name}": a link to a missing item was dropped.':
    'Menu "{name}": è stato tolto un collegamento a un elemento mancante.',
  'Settings for the plugin "{slug}": image not imported, it still points to {url}.':
    'Impostazioni del plugin "{slug}": immagine non importata, punta ancora a {url}.',
  'Settings for the plugin "{slug}" were not imported: it is not active on this site.':
    'Le impostazioni del plugin "{slug}" non sono state importate: non è attivo su questo sito.',
  'Settings for the plugin "{slug}" not imported: {error}':
    'Impostazioni del plugin "{slug}" non importate: {error}',
  '"{title}": the address "{wanted}" was taken, "{slug}" used instead.':
    '"{title}": l’indirizzo "{wanted}" era già usato, al suo posto c’è "{slug}".',
  '"{title}": {taxonomy} term {ref} not found.':
    '"{title}": termine {ref} della tassonomia {taxonomy} non trovato.',
  '"{title}": image not imported, it still points to {url}.':
    '"{title}": immagine non importata, punta ancora a {url}.',
  '{what}: its fields were not imported ({error}).':
    '{what}: i suoi campi non sono stati importati ({error}).',
  'Content type "{slug}"': 'Tipo di contenuto "{slug}"',
  'Taxonomy "{slug}"': 'Tassonomia "{slug}"',
  '{n} set(s) of field values were for items that are not imported.':
    '{n} gruppi di valori dei campi erano di elementi non importati.',
  'Block {name} has no equivalent ({n}×): its content was kept. A plugin may add it.':
    'Il blocco {name} non ha un equivalente ({n}×): il suo contenuto è stato conservato. Un plugin può aggiungerlo.',
  'Shortcode [{tag}] became a block of an active plugin ({n}×).':
    'Lo shortcode [{tag}] è diventato un blocco di un plugin attivo ({n}×).',
  'Shortcode [{tag}] has no equivalent ({n}×): kept as text. A plugin may add it.':
    'Lo shortcode [{tag}] non ha un equivalente ({n}×): conservato come testo. Un plugin può aggiungerlo.',
  // The addresses of the export (core 0.84, plugin API 1.55).
  '{structure} had addresses like {permalink}: the site already has some, so their addresses stay {current} and the old ones redirect. To keep them, set the permalink to {permalink} in Settings → Content structure (now {current}), or import again choosing to use the addresses of the export.':
    '{structure} avevano indirizzi come {permalink}: il sito ne ha già, quindi i loro indirizzi restano {current} e i vecchi vengono reindirizzati. Per mantenerli, imposta il permalink {permalink} in Impostazioni → Struttura dei contenuti (ora {current}), oppure importa di nuovo scegliendo di usare gli indirizzi dell’esportazione.',
  '{structure}: the addresses of the export ({permalink}) cannot be used: {error}':
    '{structure}: gli indirizzi dell’esportazione ({permalink}) non si possono usare: {error}',
  '{structure} keep the addresses of the export: their permalink is now {permalink} (it was {old}){redirected}.':
    '{structure} mantengono gli indirizzi dell’esportazione: il loro permalink ora è {permalink} (era {old}){redirected}.',
  '; {n} existing address(es) redirect': '; {n} indirizzi esistenti reindirizzano',
  '{structure} had archives at {base}: the site already has some, so theirs stay at {current}. Change the base in Settings → Content structure (now {current}), or import again choosing to use the addresses of the export.':
    '{structure} avevano gli archivi in {base}: il sito ne ha già, quindi i loro restano in {current}. Cambia la base in Impostazioni → Struttura dei contenuti (ora {current}), oppure importa di nuovo scegliendo di usare gli indirizzi dell’esportazione.',
  "{structure}: the archives' addresses of the export ({base}) cannot be used: {error}":
    '{structure}: gli indirizzi degli archivi dell’esportazione ({base}) non si possono usare: {error}',
  "{structure} keep the archives' addresses of the export: {base} (they were at {old}).":
    '{structure} mantengono gli indirizzi degli archivi dell’esportazione: {base} (erano in {old}).',
  Posts: 'Gli articoli',
  Pages: 'Le pagine',
  Categories: 'Le categorie',
  Tags: 'I tag',

  // ---- This plugin: the export as a whole -----------------------------------------------
  'contains shortcodes, left as text.': 'contiene shortcode, lasciati come testo.',
  '{n} page(s) or post(s) were recognised as WPML translations, with their language guessed from their text: check them in each language.':
    '{n} pagine o articoli sono stati riconosciuti come traduzioni di WPML, con la lingua dedotta dal testo: controllali in ogni lingua.',
  '{n} item(s) of the shop type "{type}" (orders, coupons) were not imported.':
    '{n} elementi del tipo del negozio "{type}" (ordini, buoni sconto) non sono stati importati.',
  '{n} item(s) of the custom type "{type}" were not imported.':
    '{n} elementi del tipo personalizzato "{type}" non sono stati importati.',
  '{n} WooCommerce product(s) were imported for Cleishop, with prices, codes, stock, pictures and variations: activate Cleishop before importing to keep them.':
    '{n} prodotti di WooCommerce sono stati importati per Cleishop, con prezzi, codici, magazzino, immagini e varianti: attiva Cleishop prima di importare per mantenerli.',
  'Posts had addresses like {permalink} in WordPress, which Cleitext cannot keep: the old addresses redirect to the new ones.':
    'Gli articoli avevano indirizzi come {permalink} in WordPress, che Cleitext non può mantenere: i vecchi indirizzi reindirizzano ai nuovi.',
  'Posts had addresses like {permalink}: to keep them, set the permalink of Posts to {cleitext} in Content structure before importing (otherwise the old addresses redirect).':
    'Gli articoli avevano indirizzi come {permalink}: per mantenerli, imposta il permalink degli articoli a {cleitext} in Struttura dei contenuti prima di importare (altrimenti i vecchi indirizzi reindirizzano).',
  'The WordPress addresses end with a slash (/my-page/): to keep them exactly, turn on “End addresses with a slash” in Settings → Content structure (otherwise they redirect once to the form without it).':
    'Gli indirizzi di WordPress finiscono con una barra (/mia-pagina/): per mantenerli identici, attiva «Indirizzi con la barra finale» in Impostazioni → Struttura dei contenuti (altrimenti reindirizzano una volta alla forma senza barra).',
  '{n} page(s) built with Divi were imported as Fresco pages: activate the Fresco plugin to show and edit them.':
    '{n} pagine costruite con Divi sono state importate come pagine di Fresco: attiva il plugin Fresco per mostrarle e modificarle.',
  '{n} page(s) built with Elementor were imported as Fresco pages: activate the Fresco plugin to show and edit them.':
    '{n} pagine costruite con Elementor sono state importate come pagine di Fresco: attiva il plugin Fresco per mostrarle e modificarle.',
  '{n} form(s) protected with the site captcha: activate the Captcha plugin and set its keys in Settings → Captcha.':
    '{n} moduli protetti con il captcha del sito: attiva il plugin Captcha e imposta le sue chiavi in Impostazioni → Captcha.',
  "{n} form(s) protected with Turnstile: add the site and secret keys in Fresco Pro → Forms → Spam protection (without them the Captcha plugin's keys are used).":
    '{n} moduli protetti con Turnstile: aggiungi la chiave del sito e quella segreta in Fresco Pro → Moduli → Protezione antispam (senza, si usano le chiavi del plugin Captcha).',
  '{n} pingback(s) and trackback(s) were not imported.':
    '{n} pingback e trackback non sono stati importati.',
  '{n} trashed comment(s) were not imported.': '{n} commenti nel cestino non sono stati importati.',
  '{n} comment(s) were not imported, as chosen.':
    '{n} commenti non sono stati importati, come scelto.',
  '{n} comment(s) waiting for approval or marked as spam were not imported (only approved ones were chosen).':
    '{n} commenti in attesa di approvazione o segnati come spam non sono stati importati (sono stati scelti solo quelli approvati).',
  '{n} Contact Form 7 shortcode(s) became Forms blocks ({forms} form(s)), with their fields, subject, Reply-To and thank-you message: activate the Forms plugin and set the address that receives the messages in Settings → Forms.':
    '{n} shortcode di Contact Form 7 sono diventati blocchi di Forms ({forms} moduli), con i loro campi, oggetto, Reply-To e messaggio di ringraziamento: attiva il plugin Forms e imposta l’indirizzo che riceve i messaggi in Impostazioni → Moduli.',
  'the form is not in the export, the shortcode was kept as text.':
    'il modulo non è nell’esportazione, lo shortcode è rimasto come testo.',
  "Polylang's language switcher in menus became Multilingual's ({n}×), with the same choices: it shows with Multilingual 1.6.0 or later.":
    'Il selettore di lingua di Polylang nei menu è diventato quello di Multilingual ({n}×), con le stesse scelte: si vede con Multilingual 1.6.0 o successivo.',
  'Menu "{name}" was rebuilt in {target} from the {locale} one, each page replaced by its translation{missing}: check its labels and links.':
    'Il menu "{name}" è stato ricostruito in {target} da quello in {locale}, con ogni pagina sostituita dalla sua traduzione{missing}: controlla le etichette e i collegamenti.',
  ' ({n} item(s) without a translation left out)': ' ({n} voci senza traduzione tralasciate)',
  'Languages from {from}: {counts}; {n} group(s) of translations linked.':
    'Lingue da {from}: {counts}; {n} gruppi di traduzioni collegati.',
  '{n} page(s) or post(s) in "{code}" were not imported: the site has no such language. Add it with the Multilingual plugin and import the same file again (what was imported is kept).':
    '{n} pagine o articoli in "{code}" non sono stati importati: il sito non ha questa lingua. Aggiungila con il plugin Multilingual e importa di nuovo lo stesso file (quello che è stato importato resta).',
  "Elementor's default colors and fonts were off, as chosen: widgets without their own take the theme's. The kit's global colors and fonts are kept in Fresco's site settings, not applied by default (Theme's colors / fonts by default).":
    'I colori e i font predefiniti di Elementor erano disattivati, come scelto: i widget senza i propri usano quelli del tema. I colori e i font globali del kit sono conservati nelle impostazioni del sito di Fresco, non applicati come predefiniti (Colori / font del tema come predefiniti).',
  "Elementor's kit still has Elementor's own colors, so its default colors and fonts were taken to be off (Elementor → Settings → Disable Default Colors and Fonts): widgets without their own take the theme's, and the kit's global colors and fonts are kept in Fresco's site settings, not applied by default. If the widgets used the kit's, import again with “Colors and fonts of Elementor widgets: Elementor’s kit”, or turn off Theme's colors / fonts by default in Fresco's site settings.":
    'Il kit di Elementor ha ancora i colori di Elementor, quindi i suoi colori e font predefiniti sono stati considerati disattivati (Elementor → Impostazioni → Disattiva colori e font predefiniti): i widget senza i propri usano quelli del tema, e i colori e i font globali del kit sono conservati nelle impostazioni del sito di Fresco, non applicati come predefiniti. Se i widget usavano quelli del kit, importa di nuovo con «Colori e font dei widget di Elementor: Kit di Elementor», oppure disattiva Colori / font del tema come predefiniti nelle impostazioni del sito di Fresco.',
  'a "not found" template became a section template: place it on the site\'s 404 page.':
    'un modello «non trovato» è diventato un modello di sezione: mettilo nella pagina 404 del sito.',
  '{n} Elementor template(s) ({list}) were imported as Fresco Pro theme templates: Fresco Pro must be active when importing to keep them.':
    '{n} modelli di Elementor ({list}) sono stati importati come modelli del tema di Fresco Pro: Fresco Pro deve essere attivo durante l’importazione per mantenerli.',
  '{n} Elementor template(s) of the type "{type}" have no Fresco counterpart and were not imported.':
    '{n} modelli di Elementor del tipo "{type}" non hanno un corrispondente in Fresco e non sono stati importati.',
  '{n} custom icon set(s) of Elementor were not imported: upload their SVG icons in Fresco Pro.':
    '{n} set di icone personalizzate di Elementor non sono stati importati: carica le loro icone SVG in Fresco Pro.',
  'its Elementor data could not be read: it was not imported.':
    'i suoi dati di Elementor non si potevano leggere: non è stato importato.',
  'the overridable property "{label}" has no counterpart in Fresco.':
    'la proprietà sovrascrivibile "{label}" non ha un corrispondente in Fresco.',
  '{n} Divi Theme Builder layout(s) and Library item(s) ({list}) were imported as Fresco Pro templates: Fresco Pro must be active when importing to keep them.':
    '{n} layout del Theme Builder di Divi ed elementi della libreria ({list}) sono stati importati come modelli di Fresco Pro: Fresco Pro deve essere attivo durante l’importazione per mantenerli.',
  '{n} Divi Theme Builder layout(s) and Library item(s) ({list}) were imported as Fresco Pro templates: Fresco Pro must be active when importing to keep them. Without it, Fresco shows the header and footer in the theme’s place.':
    '{n} layout del Theme Builder di Divi ed elementi della libreria ({list}) sono stati importati come modelli di Fresco Pro: Fresco Pro deve essere attivo durante l’importazione per mantenerli. Senza, Fresco mostra l’intestazione e il piè di pagina al posto di quelli del tema.',
  '{n} global Divi module(s) are kept in each page that uses them, and in the templates.':
    '{n} moduli globali di Divi sono conservati in ogni pagina che li usa, e nei modelli.',
  'Some Divi templates hid the theme’s header, body or footer: check those pages after the import.':
    'Alcuni modelli di Divi nascondevano l’intestazione, il corpo o il piè di pagina del tema: controlla quelle pagine dopo l’importazione.',
  'Divi Theme Builder: {message}': 'Theme Builder di Divi: {message}',
  'The Divi pages use global colors, but Divi’s theme options were not uploaded with the export: upload et_divi.json too to bring their values (and the site’s fonts and layout).':
    'Le pagine di Divi usano colori globali, ma le opzioni del tema di Divi non sono state caricate con l’esportazione: carica anche et_divi.json per portarne i valori (e i font e il layout del sito).',
  'Divi’s theme options were not uploaded with the export: Divi’s default fonts and colors were used.':
    'Le opzioni del tema di Divi non sono state caricate con l’esportazione: sono stati usati i font e i colori predefiniti di Divi.',
  'The export has the Additional CSS of {n} WordPress themes: the one of “{theme}” ({why}) was imported; the one of {others} was not.':
    'L’esportazione ha il CSS aggiuntivo di {n} temi WordPress: è stato importato quello di “{theme}” ({why}); quello di {others} no.',
  'the theme of the export': 'il tema dell’esportazione',
  'the most recently changed': 'il modificato più di recente',
  'The braces of the Additional CSS of the WordPress theme “{theme}” did not match (already so in WordPress): {fixes}, so it cannot swallow the CSS printed after it. Check it in Appearance → Customize → Additional CSS.':
    'Le parentesi graffe del CSS aggiuntivo del tema WordPress “{theme}” non corrispondevano (già così in WordPress): {fixes}, così non può inghiottire il CSS stampato dopo. Controllalo in Aspetto → Personalizza → CSS aggiuntivo.',
  'removed the empty block left open at the end':
    'rimosso il blocco vuoto lasciato aperto alla fine',
  'removed the empty blocks left open at the end':
    'rimossi i blocchi vuoti lasciati aperti alla fine',
  'closed the block left open at the end': 'chiuso il blocco lasciato aperto alla fine',
  'closed {n} blocks left open at the end': 'chiusi {n} blocchi lasciati aperti alla fine',
  'removed {n} “}” with no “{”': 'rimosse {n} “}” senza “{”',
  'ended the comment or string left open': 'chiuso il commento o la stringa lasciati aperti',
  'The Additional CSS of the WordPress theme “{theme}” was not imported: {error}.':
    'Il CSS aggiuntivo del tema WordPress “{theme}” non è stato importato: {error}.',
  'it is longer than {max} characters': 'supera i {max} caratteri',
  'it contains <style> or <script> markup': 'contiene marcatori <style> o <script>',
  'The Additional CSS of the WordPress theme “{theme}” goes to Appearance → Customize → Additional CSS, for every theme (after the CSS the site already has).':
    'Il CSS aggiuntivo del tema WordPress “{theme}” va in Aspetto → Personalizza → CSS aggiuntivo, per tutti i temi (dopo il CSS che il sito ha già).',
  'Leftovers of the cookie banner ({managers}), replaced by the Privacy plugin: {parts}.':
    'Resti del banner dei cookie ({managers}), sostituito dal plugin Privacy: {parts}.',
  '{n} CSS rule(s) or style block(s) removed': '{n} regole CSS o blocchi di stile rimossi',
  '{n} script(s) removed': '{n} script rimossi',
  '{n} "Cookie settings" link(s) now open the Privacy plugin\'s preferences (#cookie-preferences)':
    '{n} collegamenti «Impostazioni dei cookie» ora aprono le preferenze del plugin Privacy (#cookie-preferences)',
  // NewLetter (1.32.0): forms of email services pasted in pages.
  'Newsletter forms embedded from email services ({list}): with a newsletter plugin active (NewLetter) they become its signup form; otherwise their HTML is kept as it was.':
    'Moduli di newsletter incorporati da servizi email ({list}): con un plugin di newsletter attivo (NewLetter) diventano il suo modulo di iscrizione; altrimenti il loro HTML resta com’era.',

  // ---- Contact Form 7's forms ------------------------------------------------------------
  'the quiz "{name}" was left out (the Captcha plugin protects the form instead)':
    'il quiz "{name}" è stato tralasciato (il modulo lo protegge il plugin Captcha)',
  'the file upload "{name}" was left out (Forms has no uploads)':
    'il caricamento di file "{name}" è stato tralasciato (Forms non ha caricamenti)',
  'the field [{field}] has no equivalent and was left out':
    'il campo [{field}] non ha un equivalente ed è stato tralasciato',
  'the menu "{name}" with several choices became checkboxes':
    'il menu "{name}" a scelta multipla è diventato una serie di caselle',
  'its messages went to {recipient}: Forms sends every form to the address in Settings → Forms':
    'i suoi messaggi andavano a {recipient}: Forms invia ogni modulo all’indirizzo in Impostazioni → Moduli',
  'its autoresponder (Mail (2)) was left out: Forms sends no reply to visitors':
    'la risposta automatica (Mail (2)) è stata tralasciata: Forms non invia risposte ai visitatori',

  // ---- Posts and pages: WordPress blocks and embeds --------------------------------------
  'Pull quotes became quotes.': 'Le citazioni in evidenza sono diventate citazioni.',
  'A {name} block became a group.': 'Un blocco {name} è diventato un gruppo.',
  'A {name} block became a link.': 'Un blocco {name} è diventato un collegamento.',
  'Shortcode left as text: {text}': 'Shortcode lasciato come testo: {text}',
  'Block {name} became {type}: it is shown with the Widgets plugin.':
    'Il blocco {name} è diventato {type}: si vede con il plugin Widgets.',
  'Block {name} has no equivalent: its content was kept.':
    'Il blocco {name} non ha un equivalente: il suo contenuto è stato conservato.',
  'Block {name} has no equivalent: its text was kept.':
    'Il blocco {name} non ha un equivalente: il suo testo è stato conservato.',
  'An embedded frame became a link.': 'Un riquadro incorporato è diventato un collegamento.',
  'A <{tag}> element was left out.': 'Un elemento <{tag}> è stato tralasciato.',
  'An embed without an address was left out.':
    'Un contenuto incorporato senza indirizzo è stato tralasciato.',
  'An embed became a link: {url}': 'Un contenuto incorporato è diventato un collegamento: {url}',
  'Embed of {provider} shown as a link card (no player for it){via}: {url}':
    'Contenuto di {provider} mostrato come scheda con collegamento (non c’è un lettore){via}: {url}',
  'Embed of {provider} shown as a link card{via}: {title}, {url}':
    'Contenuto di {provider} mostrato come scheda con collegamento{via}: {title}, {url}',
  "Embed of {provider} kept with WordPress's HTML, held until consent with the Privacy plugin{via}: {url}":
    'Contenuto di {provider} conservato con l’HTML di WordPress, bloccato fino al consenso con il plugin Privacy{via}: {url}',
  'Embed of {provider} kept{via}: {title}, {url}':
    'Contenuto di {provider} conservato{via}: {title}, {url}',
  ' (from an address alone on its line)': ' (da un indirizzo da solo sulla sua riga)',
  ' (from an [embed] shortcode)': ' (da uno shortcode [embed])',
  ' (from a frame)': ' (da un riquadro)',
  ' (from pasted HTML)': ' (da HTML incollato)',
  'A table with pictures became rows of columns.':
    'Una tabella con immagini è diventata righe di colonne.',

  // ---- Elementor and Divi pages: notes, with "(3×)" when repeated -------------------------
  'the Elementor data could not be read; the page content was imported instead.':
    'i dati di Elementor non si potevano leggere; è stato importato il contenuto della pagina.',
  '{n} Elementor widget(s) "{type}" have no Fresco counterpart yet: their text was kept.':
    '{n} widget di Elementor "{type}" non hanno ancora un corrispondente in Fresco: il loro testo è stato conservato.',
  '{n} Divi module(s) "{type}" have no Fresco counterpart yet: their text was kept.':
    '{n} moduli di Divi "{type}" non hanno ancora un corrispondente in Fresco: il loro testo è stato conservato.',
  'a size written as CSS (clamp, calc) was approximated':
    'una dimensione scritta in CSS (clamp, calc) è stata approssimata',
  'a component instance shows a component that is not in the export: it was left out':
    'un’istanza mostra un componente che non è nell’esportazione: è stata tralasciata',
  'atomic style properties {list} were left out':
    'le proprietà di stile atomiche {list} sono state tralasciate',
  'posts widgets showing the current query show the latest entries':
    'i widget di articoli che mostravano la query corrente mostrano gli ultimi contenuti',
  'nav menus whose menu is not in the export show the "primary" menu':
    'i menu di navigazione il cui menu non è nell’esportazione mostrano il menu "primary"',
  'full-screen search forms were imported as a plain search form':
    'i moduli di ricerca a schermo intero sono stati importati come un semplice modulo di ricerca',
  'Template widgets whose template is not in the export were left out':
    'i widget Template il cui modello non è nell’esportazione sono stati tralasciati',
  'loops whose item template is not in the export show stand-ins':
    'i loop il cui modello di elemento non è nell’esportazione mostrano dei segnaposto',
  'posts without titles show them': 'gli articoli senza titoli li mostrano',
  'galleries with several tabs became one gallery':
    'le gallerie con più schede sono diventate una sola galleria',
  'masonry and justified galleries became grids':
    'le gallerie masonry e giustificate sono diventate griglie',
  'form fields of other kinds (upload, recaptcha…) became text fields':
    'i campi dei moduli di altri tipi (caricamento, recaptcha…) sono diventati campi di testo',
  'form actions "{actions}" need setting up again in the form':
    'le azioni del modulo "{actions}" vanno impostate di nuovo nel modulo',
  'icons above call-to-action titles were left out':
    'le icone sopra i titoli delle call to action sono state tralasciate',
  'videos in media carousels were left out':
    'i video nei caroselli multimediali sono stati tralasciati',
  'media carousels of the slideshow or coverflow kind became carousels':
    'i caroselli multimediali di tipo slideshow o coverflow sono diventati caroselli',
  'floating contact buttons need setting up again (Floating buttons element)':
    'i pulsanti di contatto fluttuanti vanno impostati di nuovo (elemento Pulsanti fluttuanti)',
  'display conditions of elements were not imported':
    'le condizioni di visualizzazione degli elementi non sono state importate',
  'images of the theme\'s size "{name}" are shown at the large size':
    'le immagini della dimensione del tema "{name}" sono mostrate nella dimensione grande',
  'the theme\'s shape dividers ("{shape}") became custom shapes: choose their SVG file in the container\'s settings':
    'i divisori a forma del tema ("{shape}") sono diventati forme personalizzate: scegli il loro file SVG nelle impostazioni del contenitore',
  'background videos of other sites were replaced by their fallback image':
    'i video di sfondo di altri siti sono stati sostituiti dalla loro immagine di riserva',
  'the dynamic tag "{name}" has no counterpart: its static value was kept':
    'il tag dinamico "{name}" non ha un corrispondente: è stato conservato il suo valore statico',
  'inline formatting inside headings was removed':
    'la formattazione all’interno dei titoli è stata rimossa',
  'inline formatting inside box descriptions was removed':
    'la formattazione all’interno delle descrizioni dei box è stata rimossa',
  'videos from videopress became links to the video':
    'i video di VideoPress sono diventati collegamenti al video',
  'carousel captions from image titles or descriptions show the image description':
    'le didascalie dei caroselli prese da titoli o descrizioni delle immagini mostrano la descrizione dell’immagine',
  'global widgets whose template is not in the export were left out':
    'i widget globali il cui modello non è nell’esportazione sono stati tralasciati',
  'shortcodes were kept as text': 'gli shortcode sono rimasti come testo',
  'the template condition "{condition}" has no counterpart and was left out':
    'la condizione del modello "{condition}" non ha un corrispondente ed è stata tralasciata',
  'popups with several triggers keep the first one':
    'i popup con più attivatori mantengono il primo',
  'popups shown up to several times are shown once per period':
    'i popup mostrati più volte sono mostrati una volta per periodo',
  'popup rules on "{rule}" were left out': 'le regole dei popup su "{rule}" sono state tralasciate',
  'custom CSS of a module\'s part ("{part}") was left out':
    'il CSS personalizzato di una parte di un modulo ("{part}") è stato tralasciato',
  'sticky elements were imported as not sticky':
    'gli elementi fissi sono stati importati come non fissi',
  'dynamic content that could not be read was left out':
    'il contenuto dinamico che non si poteva leggere è stato tralasciato',
  'the dynamic content "{content}" was left out':
    'il contenuto dinamico "{content}" è stato tralasciato',
  "some of Divi's icons have no match and became a circle":
    'alcune icone di Divi non hanno una corrispondenza e sono diventate un cerchio',
  'inline formatting inside blurb texts was removed':
    'la formattazione all’interno dei testi dei blurb è stata rimossa',
  'gallery images missing from the export were left out':
    'le immagini delle gallerie mancanti nell’esportazione sono state tralasciate',
  'galleries split into pages show all their images at once':
    'le gallerie divise in pagine mostrano tutte le immagini insieme',
  'the post information under titles (author, date) was left out':
    'le informazioni dell’articolo sotto i titoli (autore, data) sono state tralasciate',
  'menus with the logo in their middle show it before the links':
    'i menu con il logo al centro lo mostrano prima dei collegamenti',
  'the section divider "{style}" has no counterpart and was left out':
    'il divisore di sezione "{style}" non ha un corrispondente ed è stato tralasciato',
  'repeated section dividers are drawn once':
    'i divisori di sezione ripetuti sono disegnati una volta',

  // ---- Other plugins, through their import hooks -----------------------------------------
  '{n} component(s) were added to Fresco.': '{n} componenti sono stati aggiunti a Fresco.',
  'The imported header or footer is shown by Fresco in the theme’s place (Fresco → Tools to remove them; with Fresco Pro they become theme templates).':
    'L’intestazione o il piè di pagina importato è mostrato da Fresco al posto di quello del tema (Fresco → Strumenti per toglierlo; con Fresco Pro diventa un modello del tema).',
  'The imported header and footer are shown by Fresco in the theme’s place (Fresco → Tools to remove them; with Fresco Pro they become theme templates).':
    'L’intestazione e il piè di pagina importati sono mostrati da Fresco al posto di quelli del tema (Fresco → Strumenti per toglierli; con Fresco Pro diventano modelli del tema).',
  'Fresco site settings (global colors and fonts, layout, theme style) were updated from the imported site.':
    'Le impostazioni del sito di Fresco (colori e font globali, layout, stile del tema) sono state aggiornate dal sito importato.',
  'Diorama: {n} slider imported.': 'Diorama: {n} slider importato.',
  'Diorama: {n} sliders imported.': 'Diorama: {n} slider importati.',
  'Cleishop: the data of product {id} were not valid ({error}).':
    'Cleishop: i dati del prodotto {id} non erano validi ({error}).',
  'Cleishop: product {id} not saved: {error}': 'Cleishop: prodotto {id} non salvato: {error}',
  'Cleishop: prices, codes, stock and pictures of {n} product(s) saved.':
    'Cleishop: salvati prezzi, codici, magazzino e immagini di {n} prodotti.',
};

/** The placeholders of a template, in order. */
export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
}

interface Pattern {
  key: string;
  regex: RegExp;
}

/** Placeholders that are always numbers. */
const NUMBERS = new Set(['n', 'max', 'forms']);

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Templates as patterns, the most specific (most fixed text) first. */
const PATTERNS: Pattern[] = Object.keys(REPORT_IT)
  .map((key) => {
    const seen = new Set<string>();
    let source = '';
    let last = 0;
    for (const m of key.matchAll(/\{(\w+)\}/g)) {
      source += escape(key.slice(last, m.index));
      const name = m[1]!;
      source += seen.has(name)
        ? `\\k<${name}>`
        : `(?<${name}>${NUMBERS.has(name) ? '\\d[\\d,.]*' : '[\\s\\S]*?'})`;
      seen.add(name);
      last = m.index + m[0].length;
    }
    source += escape(key.slice(last));
    return { key, regex: new RegExp(`^${source}$`), fixed: key.replace(/\{\w+\}/g, '').length };
  })
  .sort((a, b) => b.fixed - a.fixed)
  .map(({ key, regex }) => ({ key, regex }));

/** Looks a key up and fills in its values: the admin's `t`. */
export type Translate = (key: string, values: Record<string, string>) => string;

/** Values that are report text themselves; the others (names, titles, numbers) stay. */
const NESTED = new Set([
  'message',
  'error',
  'what',
  'fixes',
  'parts',
  'via',
  'redirected',
  'missing',
  'why',
  'structure',
]);

/** A note of a converter (no title before it, no period after it), or null. */
function translateNote(text: string, translate: Translate): string | null {
  for (const { key, regex } of PATTERNS) {
    const m = regex.exec(text);
    if (m) return translate(key, { ...m.groups });
  }
  return null;
}

/**
 * A report line in the admin's language, or null when it has no key: a
 * whole template; a note (`… (3×).`); what follows a title (`Page: …`); a
 * list of parts that all have keys.
 */
export function translateReportText(text: string, translate: Translate, depth = 0): string | null {
  if (!text || depth > 4) return null;
  for (const { key, regex } of PATTERNS) {
    const m = regex.exec(text);
    if (!m) continue;
    const values: Record<string, string> = {};
    for (const [name, value] of Object.entries(m.groups ?? {})) {
      values[name] = NESTED.has(name)
        ? (translateReportText(value, translate, depth + 1) ?? value)
        : value;
    }
    return translate(key, values);
  }
  // A note: "posts without titles show them (3×)."
  const note = /^([\s\S]+?)( \(\d+×\))?\.$/.exec(text);
  const noted = note ? translateNote(note[1]!, translate) : null;
  if (noted !== null) return `${noted}${note![2] ?? ''}.`;
  // What follows a title: "About us: contains shortcodes, left as text."
  for (let at = text.indexOf(': '); at > 0; at = text.indexOf(': ', at + 1)) {
    const rest = translateReportText(text.slice(at + 2), translate, depth + 1);
    if (rest !== null) return `${text.slice(0, at + 2)}${rest}`;
  }
  // Parts: "removed 2 } with no {, ended a comment or string left open".
  for (const separator of ['; ', ', ']) {
    const parts = text.split(separator);
    if (parts.length < 2) continue;
    const translated = parts.map((part) => translateReportText(part, translate, depth + 1));
    if (translated.every((part) => part !== null)) return translated.join(separator);
  }
  return null;
}

/** A report line in the admin's language; as written when it has no key. */
export function translateReportLine(line: string, translate: Translate): string {
  return translateReportText(line, translate) ?? line;
}
