/** The plugin's texts, in English and Italian (chosen by the user's language). */
const en = {
  title: 'Layout import',
  intro:
    'Pages of a WordPress site laid out with the old theme’s layout builder keep their layout as [av_…] shortcodes. Here they become native blocks of the block editor: color sections become full-width groups, columns and grid rows become columns, and texts, headings, images, galleries, buttons, tables and the other elements become the blocks closest to them. Every page can then be edited in the block editor, with no page builder.',
  options: 'Options',
  headingColor: 'Heading color',
  headingColorHelp:
    'The old theme’s color for headings (it is not in the export): headings without a color of their own get it.',
  asTheme: 'as the theme',
  uppercase: 'Headings in capitals (the text is written in capitals)',
  origin: 'Address of the old site',
  originHelp:
    'Its links become links of this site (e.g. https://www.example.com). Read from the export when there is one.',
  publish: 'Publish again the converted entries that were published',
  publishHelp:
    'Without it, each conversion is saved as a new revision with unpublished changes: the page keeps showing its old content until you check it and publish it from the editor.',
  fromExport: 'From a WordPress export',
  fromSite: 'Pages of this site with [av_…] text',
  exportHelp:
    'Upload the export of the old site (Tools → Export → All content in WordPress). It is read in your browser. Each page, post or portfolio item laid out with [av_…] shortcodes is matched with the entry of this site that has the same type and slug.',
  siteHelp:
    'Pages already imported (e.g. with the WordPress importer) where the shortcodes stayed as text in the paragraphs. Without the export, images are found in the media library by file name, and links to ids of the old site cannot be resolved.',
  chooseFile: 'Export file (.xml)',
  scan: 'Find the pages',
  scanning: 'Reading… {done} of {total}',
  readingSite: 'Reading the entries and the media library of this site…',
  noLayouts: 'No entry of this export is laid out with [av_…] shortcodes.',
  noSiteLayouts: 'No entry of this site holds [av_…] shortcodes as text.',
  notXml: 'This file is not a WordPress export.',
  found: '{count} entries with a layout',
  colEntry: 'Entry',
  colTarget: 'Entry of this site',
  colNotes: 'What changes',
  notFound: 'Not found (same type and slug)',
  elements: '{elements} elements → {blocks} blocks',
  convert: 'Convert',
  convertAll: 'Convert all ({count})',
  working: 'Converting… {done} of {total}',
  done: 'Converted: open it, check it and publish it.',
  donePublished: 'Converted and published.',
  failed: 'Not saved: {error}',
  open: 'Open',
  nothing: 'Nothing to convert in this layout.',
  noPermission: 'You cannot edit this entry.',
  locked: '{name} is editing it now: try again later.',
  summary: '{ok} converted, {failed} not converted.',
  revisions:
    'Each conversion is a new revision: the earlier content stays in the entry’s Revisions and can be restored.',
  warnings: {
    skipped: 'Left out (no native block): {tags}',
    simplified: 'Shown with simpler blocks: {tags}',
    unknown: 'Unknown, only their text kept: {tags}',
    background: 'Background images not kept: {tags}',
    media: 'Images not found in the media library (old address kept): {tags}',
    shortcode: 'Other shortcodes left as text: {tags}',
  },
  allKept: 'Everything has a native block.',
  types: { page: 'Page', article: 'Post' } as Record<string, string>,
};

export type Strings = typeof en;

const it: Strings = {
  title: 'Importa layout',
  intro:
    'Le pagine di un sito WordPress impaginate con il costruttore di layout del vecchio tema conservano l’impaginazione come shortcode [av_…]. Qui diventano blocchi nativi dell’editor a blocchi: le sezioni colorate diventano gruppi a tutta larghezza, colonne e righe a griglia diventano colonne, e testi, titoli, immagini, gallerie, pulsanti, tabelle e gli altri elementi diventano i blocchi più vicini. Ogni pagina si può poi modificare con l’editor a blocchi, senza page builder.',
  options: 'Opzioni',
  headingColor: 'Colore dei titoli',
  headingColorHelp:
    'Il colore dei titoli del vecchio tema (non è nell’esportazione): i titoli senza un colore loro prendono questo.',
  asTheme: 'come il tema',
  uppercase: 'Titoli in maiuscolo (il testo viene scritto in maiuscolo)',
  origin: 'Indirizzo del vecchio sito',
  originHelp:
    'I suoi link diventano link di questo sito (es. https://www.esempio.it). Letto dall’esportazione, quando c’è.',
  publish: 'Pubblica di nuovo le voci convertite che erano pubblicate',
  publishHelp:
    'Senza questa opzione, ogni conversione è salvata come nuova revisione con modifiche non pubblicate: la pagina continua a mostrare il vecchio contenuto finché non la controlli e la pubblichi dall’editor.',
  fromExport: 'Da un’esportazione di WordPress',
  fromSite: 'Pagine di questo sito con testo [av_…]',
  exportHelp:
    'Carica l’esportazione del vecchio sito (Strumenti → Esporta → Tutti i contenuti in WordPress). Viene letta nel tuo browser. Ogni pagina, articolo o elemento del portfolio impaginato con gli shortcode [av_…] viene abbinato alla voce di questo sito con lo stesso tipo e lo stesso slug.',
  siteHelp:
    'Pagine già importate (per esempio con l’importatore di WordPress) in cui gli shortcode sono rimasti come testo nei paragrafi. Senza l’esportazione, le immagini si trovano nella libreria media per nome del file, e i link agli id del vecchio sito non si possono risolvere.',
  chooseFile: 'File di esportazione (.xml)',
  scan: 'Trova le pagine',
  scanning: 'Lettura… {done} di {total}',
  readingSite: 'Lettura delle voci e della libreria media di questo sito…',
  noLayouts: 'Nessuna voce di questa esportazione è impaginata con gli shortcode [av_…].',
  noSiteLayouts: 'Nessuna voce di questo sito contiene shortcode [av_…] come testo.',
  notXml: 'Questo file non è un’esportazione di WordPress.',
  found: '{count} voci con un layout',
  colEntry: 'Voce',
  colTarget: 'Voce di questo sito',
  colNotes: 'Cosa cambia',
  notFound: 'Non trovata (stesso tipo e slug)',
  elements: '{elements} elementi → {blocks} blocchi',
  convert: 'Converti',
  convertAll: 'Converti tutte ({count})',
  working: 'Conversione… {done} di {total}',
  done: 'Convertita: aprila, controllala e pubblicala.',
  donePublished: 'Convertita e pubblicata.',
  failed: 'Non salvata: {error}',
  open: 'Apri',
  nothing: 'Niente da convertire in questo layout.',
  noPermission: 'Non puoi modificare questa voce.',
  locked: '{name} la sta modificando adesso: riprova più tardi.',
  summary: '{ok} convertite, {failed} non convertite.',
  revisions:
    'Ogni conversione è una nuova revisione: il contenuto precedente resta nelle Revisioni della voce e si può ripristinare.',
  warnings: {
    skipped: 'Tralasciati (nessun blocco nativo): {tags}',
    simplified: 'Mostrati con blocchi più semplici: {tags}',
    unknown: 'Sconosciuti, tenuto solo il testo: {tags}',
    background: 'Immagini di sfondo non mantenute: {tags}',
    media: 'Immagini non trovate nella libreria media (tenuto il vecchio indirizzo): {tags}',
    shortcode: 'Altri shortcode lasciati come testo: {tags}',
  },
  allKept: 'Tutto ha un blocco nativo.',
  types: { page: 'Pagina', article: 'Articolo' },
};

export function strings(locale: string): Strings {
  return locale.startsWith('it') ? it : en;
}

/** `{name}` placeholders filled in. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
