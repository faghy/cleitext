/**
 * Vetta's fields on entries (group `vetta`) and on terms (group
 * `vetta-term`). Each list starts with Vetta's box (`vetta/box`, a layout
 * field): one section of its own, tinted, that opens and closes, with the
 * keywords, the search title and description and the analysis together,
 * and Advanced and Social networks inside, closed until opened. The names
 * of the stored values never change.
 */
import type { FieldDefinition } from '@cleitext/plugin-sdk';

const l = (en: string, it: string) => ({ en, it });

/** The layout field that draws Vetta's fields as one section (plugin API 1.49). */
export const BOX_TYPE = 'vetta/box';

const box = (kind: 'entry' | 'term'): FieldDefinition =>
  ({
    name: 'vettaBox',
    type: BOX_TYPE,
    label: l('Vetta SEO', 'Vetta SEO'),
    settings: { kind },
  }) as FieldDefinition;

/** Fields of every entry, in the order the box shows them. */
export const ENTRY_FIELDS: FieldDefinition[] = [
  box('entry'),
  {
    name: 'keywords',
    type: 'text',
    maxLength: 300,
    label: l('Keywords', 'Parole chiave'),
    help: l(
      'What people search to find this page; the first is the main one, then up to four more, separated by commas. The analysis checks the page against them.',
      'Ciò che le persone cercano per trovare questa pagina: la prima è la principale, poi fino a quattro altre, separate da virgole. L’analisi controlla la pagina su queste.',
    ),
  },
  {
    name: 'title',
    type: 'text',
    maxLength: 200,
    label: l('Search title', 'Titolo per i motori di ricerca'),
    help: l(
      'Empty: from the template of the content type. Variables such as %title% %sep% %sitename% work.',
      'Vuoto: dal modello del tipo di contenuto. Funzionano variabili come %title% %sep% %sitename%.',
    ),
  },
  {
    name: 'description',
    type: 'text',
    multiline: true,
    maxLength: 400,
    label: l('Search description', 'Descrizione per i motori di ricerca'),
    help: l(
      'About 150 characters. Empty: from the template (the excerpt by default).',
      'Circa 150 caratteri. Vuota: dal modello (il riassunto, normalmente).',
    ),
  },
  {
    name: 'noindex',
    type: 'boolean',
    group: l('Advanced', 'Avanzate'),
    label: l('Hide from search engines (noindex)', 'Nascondi ai motori di ricerca (noindex)'),
  },
  {
    name: 'nofollow',
    type: 'boolean',
    group: l('Advanced', 'Avanzate'),
    label: l('Do not follow its links (nofollow)', 'Non seguire i suoi link (nofollow)'),
  },
  {
    name: 'noarchive',
    type: 'boolean',
    group: l('Advanced', 'Avanzate'),
    label: l('No cached copy (noarchive)', 'Nessuna copia in cache (noarchive)'),
  },
  {
    name: 'noimageindex',
    type: 'boolean',
    group: l('Advanced', 'Avanzate'),
    label: l('Do not index its images', 'Non indicizzare le sue immagini'),
  },
  {
    name: 'nosnippet',
    type: 'boolean',
    group: l('Advanced', 'Avanzate'),
    label: l(
      'No text preview in results (nosnippet)',
      'Nessuna anteprima nei risultati (nosnippet)',
    ),
  },
  {
    name: 'canonical',
    type: 'url',
    group: l('Advanced', 'Avanzate'),
    label: l('Canonical address', 'Indirizzo canonico'),
    help: l(
      'Only when this content is a copy of a page elsewhere: its full address.',
      'Solo se questo contenuto è una copia di una pagina altrove: il suo indirizzo completo.',
    ),
  },
  {
    name: 'breadcrumbTitle',
    type: 'text',
    maxLength: 100,
    group: l('Advanced', 'Avanzate'),
    label: l('Name in the breadcrumbs', 'Nome nelle briciole di pane'),
  },
  {
    name: 'schema',
    type: 'select',
    group: l('Advanced', 'Avanzate'),
    label: l('Structured data', 'Dati strutturati'),
    default: 'auto',
    options: [
      { value: 'auto', label: l('As the content type', 'Come il tipo di contenuto') },
      { value: 'Article', label: l('Article', 'Articolo') },
      { value: 'BlogPosting', label: l('Blog post', 'Articolo di blog') },
      { value: 'NewsArticle', label: l('News article', 'Notizia') },
      { value: 'none', label: l('None', 'Nessuno') },
    ],
  },
  {
    name: 'pillar',
    type: 'boolean',
    group: l('Advanced', 'Avanzate'),
    label: l(
      'Pillar content (one of the main pages of the site)',
      'Contenuto pilastro (una delle pagine principali del sito)',
    ),
  },
  {
    name: 'ogTitle',
    type: 'text',
    maxLength: 200,
    group: l('Social networks', 'Social network'),
    label: l('Title when shared', 'Titolo quando è condivisa'),
  },
  {
    name: 'ogDescription',
    type: 'text',
    multiline: true,
    maxLength: 400,
    group: l('Social networks', 'Social network'),
    label: l('Description when shared', 'Descrizione quando è condivisa'),
  },
  {
    name: 'ogImage',
    type: 'media',
    group: l('Social networks', 'Social network'),
    label: l('Image when shared', 'Immagine quando è condivisa'),
    help: l(
      '1200×630 pixels is best. Empty: the featured image, then the site’s.',
      '1200×630 pixel è l’ideale. Vuota: l’immagine in evidenza, poi quella del sito.',
    ),
  },
];

/** Fields of every term: what fits a category's or tag's archive. */
export const TERM_FIELDS: FieldDefinition[] = [
  box('term'),
  {
    name: 'keywords',
    type: 'text',
    maxLength: 300,
    label: l('Keywords', 'Parole chiave'),
    help: l(
      'What people search to find this archive; the first is the main one, separated by commas.',
      'Ciò che le persone cercano per trovare questo archivio: la prima è la principale, separate da virgole.',
    ),
  },
  {
    name: 'title',
    type: 'text',
    maxLength: 200,
    label: l('Search title', 'Titolo per i motori di ricerca'),
    help: l(
      'Empty: from the template of the taxonomy (Vetta SEO → Categories and tags). Variables such as %term% %sep% %sitename% %page% work.',
      'Vuoto: dal modello della tassonomia (Vetta SEO → Categorie e tag). Funzionano variabili come %term% %sep% %sitename% %page%.',
    ),
  },
  {
    name: 'description',
    type: 'text',
    multiline: true,
    maxLength: 400,
    label: l('Search description', 'Descrizione per i motori di ricerca'),
    help: l(
      'About 150 characters. Empty: from the template (the description of the term, normally; %term_description%).',
      'Circa 150 caratteri. Vuota: dal modello (la descrizione del termine, normalmente; %term_description%).',
    ),
  },
  {
    name: 'noindex',
    type: 'boolean',
    group: l('Advanced', 'Avanzate'),
    label: l('Hide from search engines (noindex)', 'Nascondi ai motori di ricerca (noindex)'),
  },
  {
    name: 'nofollow',
    type: 'boolean',
    group: l('Advanced', 'Avanzate'),
    label: l('Do not follow its links (nofollow)', 'Non seguire i suoi link (nofollow)'),
  },
  {
    name: 'canonical',
    type: 'url',
    group: l('Advanced', 'Avanzate'),
    label: l('Canonical address', 'Indirizzo canonico'),
    help: l(
      'Only when this archive is a copy of a page elsewhere: its full address.',
      'Solo se questo archivio è una copia di una pagina altrove: il suo indirizzo completo.',
    ),
  },
  {
    name: 'ogTitle',
    type: 'text',
    maxLength: 200,
    group: l('Social networks', 'Social network'),
    label: l('Title when shared', 'Titolo quando è condiviso'),
  },
  {
    name: 'ogDescription',
    type: 'text',
    multiline: true,
    maxLength: 400,
    group: l('Social networks', 'Social network'),
    label: l('Description when shared', 'Descrizione quando è condiviso'),
  },
  {
    name: 'ogImage',
    type: 'media',
    group: l('Social networks', 'Social network'),
    label: l('Image when shared', 'Immagine quando è condiviso'),
    help: l(
      '1200×630 pixels is best. Empty: the site’s.',
      '1200×630 pixel è l’ideale. Vuota: quella del sito.',
    ),
  },
];
