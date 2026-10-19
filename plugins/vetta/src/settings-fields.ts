/**
 * The forms of Vetta's settings page, tab by tab, as field definitions for
 * the admin's FieldsForm. Names match the keys of the stored config.
 */
import type { FieldsForm } from '@cleitext/admin-sdk';
import {
  DEFAULTS,
  keyOf,
  MODULES,
  TAXONOMY_DEFAULTS,
  TYPE_DEFAULTS,
  type Module,
} from './config.js';

export type Field = Parameters<typeof FieldsForm>[0]['fields'][number];
type L = { en: string; it: string };
const l = (en: string, it: string): L => ({ en, it });

const SEPARATORS = ['–', '-', '—', '|', '·', '•', '»', '~', '*'];

export const VARIABLES_HELP = l(
  'Variables: %title% %sep% %sitename% %excerpt% %category% %categories% %tags% %date% %name% %page% %currentyear% %focuskw% %customfield(group.name)%.',
  'Variabili: %title% %sep% %sitename% %excerpt% %category% %categories% %tags% %date% %name% %page% %currentyear% %focuskw% %customfield(gruppo.nome)%.',
);

export const MODULE_LABELS: Record<Module, [L, L]> = {
  analysis: [
    l('Content analysis', 'Analisi dei contenuti'),
    l(
      'A score out of 100 and a checklist in the editor, for up to five keywords.',
      'Un punteggio su 100 e una lista di controlli nell’editor, per fino a cinque parole chiave.',
    ),
  ],
  schema: [
    l('Structured data', 'Dati strutturati'),
    l(
      'A schema.org graph on every page: site, organization, page, breadcrumbs, articles.',
      'Un grafo schema.org in ogni pagina: sito, organizzazione, pagina, briciole di pane, articoli.',
    ),
  ],
  social: [
    l('Social cards', 'Schede social'),
    l(
      'Images, titles and descriptions for Facebook, X, LinkedIn, WhatsApp and Slack.',
      'Immagini, titoli e descrizioni per Facebook, X, LinkedIn, WhatsApp e Slack.',
    ),
  ],
  sitemap: [
    l('Sitemap', 'Sitemap'),
    l(
      'Which content goes in the XML sitemap; pages hidden from search never do.',
      'Quali contenuti vanno nella sitemap XML; le pagine nascoste ai motori mai.',
    ),
  ],
  breadcrumbs: [
    l('Breadcrumbs', 'Briciole di pane'),
    l(
      'A block with the path of the page, and its structured data.',
      'Un blocco con il percorso della pagina, e i suoi dati strutturati.',
    ),
  ],
  localSeo: [
    l('Local business', 'Attività locale'),
    l(
      'Address, opening hours and map position, for local searches and maps.',
      'Indirizzo, orari e posizione sulla mappa, per le ricerche locali e le mappe.',
    ),
  ],
  imageSeo: [
    l('Image texts', 'Testi delle immagini'),
    l(
      'Images without an alternative text get one from their file name.',
      'Le immagini senza testo alternativo ne ricevono uno dal nome del file.',
    ),
  ],
  links: [
    l('Links to other sites', 'Link ad altri siti'),
    l(
      'Open them in a new tab, mark them nofollow, by domain.',
      'Aprili in una nuova scheda, segnali nofollow, per dominio.',
    ),
  ],
  llms: [
    l('llms.txt', 'llms.txt'),
    l(
      'A summary of the site for AI assistants, at /llms.txt.',
      'Un riassunto del sito per gli assistenti AI, in /llms.txt.',
    ),
  ],
  robotsTxt: [
    l('robots.txt editor', 'Editor di robots.txt'),
    l('Write the rules of /robots.txt yourself.', 'Scrivi tu le regole di /robots.txt.'),
  ],
  monitor404: [
    l('Pages not found', 'Pagine non trovate'),
    l(
      'A log of the addresses visitors asked for that do not exist, to redirect them.',
      'Un registro degli indirizzi richiesti che non esistono, per reindirizzarli.',
    ),
  ],
  indexNow: [
    l('IndexNow', 'IndexNow'),
    l(
      'Tells Bing, Yandex and other engines at once when a page is published.',
      'Avvisa subito Bing, Yandex e altri motori quando una pagina è pubblicata.',
    ),
  ],
};

export function moduleFields(): Field[] {
  return MODULES.map((m) => ({
    name: `module_${m}`,
    type: 'boolean',
    label: MODULE_LABELS[m][0],
    help: MODULE_LABELS[m][1],
  }));
}

const robots = (prefix: string, group?: L): Field[] =>
  [
    ['noindex', l('Hide from search engines (noindex)', 'Nascondi ai motori di ricerca (noindex)')],
    ['nofollow', l('Do not follow links (nofollow)', 'Non seguire i link (nofollow)')],
  ].map(
    ([name, label]) =>
      ({
        name: `${prefix}robots_${name}`,
        type: 'boolean',
        label: label as L,
        ...(group ? { group } : {}),
      }) as Field,
  );

export function generalFields(): Field[] {
  return [
    {
      name: 'separator',
      type: 'choice',
      display: 'buttons',
      label: l('Title separator', 'Separatore del titolo'),
      options: SEPARATORS.map((s) => ({ value: s, label: s })),
      default: DEFAULTS.separator as string,
    },
    {
      name: 'capitalize_titles',
      type: 'boolean',
      label: l('Capitalize Every Word Of Titles', 'Maiuscole All’Inizio Di Ogni Parola Dei Titoli'),
    },
    ...robots('', l('Default robots', 'Robots predefiniti')),
    {
      name: 'robots_noarchive',
      type: 'boolean',
      group: l('Default robots', 'Robots predefiniti'),
      label: l('No cached copy (noarchive)', 'Nessuna copia in cache (noarchive)'),
    },
    {
      name: 'robots_noimageindex',
      type: 'boolean',
      group: l('Default robots', 'Robots predefiniti'),
      label: l('Do not index images', 'Non indicizzare le immagini'),
    },
    {
      name: 'robots_nosnippet',
      type: 'boolean',
      group: l('Default robots', 'Robots predefiniti'),
      label: l('No text previews (nosnippet)', 'Nessuna anteprima (nosnippet)'),
    },
    {
      name: 'max_snippet',
      type: 'number',
      min: -1,
      max: 1000,
      group: l('Previews in results', 'Anteprime nei risultati'),
      label: l(
        'Longest text preview (characters, -1: no limit)',
        'Anteprima di testo più lunga (caratteri, -1: senza limiti)',
      ),
    },
    {
      name: 'max_video_preview',
      type: 'number',
      min: -1,
      max: 3600,
      group: l('Previews in results', 'Anteprime nei risultati'),
      label: l(
        'Longest video preview (seconds, -1: no limit)',
        'Anteprima video più lunga (secondi, -1: senza limiti)',
      ),
    },
    {
      name: 'max_image_preview',
      type: 'select',
      group: l('Previews in results', 'Anteprime nei risultati'),
      label: l('Image previews', 'Anteprime delle immagini'),
      options: [
        { value: 'large', label: l('Large', 'Grandi') },
        { value: 'standard', label: l('Standard', 'Normali') },
        { value: 'none', label: l('None', 'Nessuna') },
      ],
    },
    {
      name: 'noindex_search',
      type: 'boolean',
      group: l('Kept out of search', 'Tenuti fuori dalla ricerca'),
      label: l('Search results pages', 'Pagine dei risultati di ricerca'),
    },
    {
      name: 'noindex_paginated',
      type: 'boolean',
      group: l('Kept out of search', 'Tenuti fuori dalla ricerca'),
      label: l('Page 2 and next of archives', 'Pagina 2 e seguenti degli archivi'),
    },
    {
      name: 'author_noindex',
      type: 'boolean',
      group: l('Kept out of search', 'Tenuti fuori dalla ricerca'),
      label: l('Authors’ archives', 'Archivi degli autori'),
    },
  ];
}

export function pagesFields(): Field[] {
  const t = (name: string, en: string, it: string, group: L): Field => ({
    name,
    type: 'text',
    maxLength: 300,
    group,
    label: l(en, it),
    help: VARIABLES_HELP,
  });
  return [
    t(
      'home_title',
      'Title',
      'Titolo',
      l('Home page (latest posts)', 'Home page (ultimi articoli)'),
    ),
    {
      name: 'home_description',
      type: 'text',
      multiline: true,
      maxLength: 400,
      group: l('Home page (latest posts)', 'Home page (ultimi articoli)'),
      label: l('Description', 'Descrizione'),
    },
    t(
      'author_title',
      'Authors’ archives',
      'Archivi degli autori',
      l('Other pages', 'Altre pagine'),
    ),
    t('search_title', 'Search results', 'Risultati di ricerca', l('Other pages', 'Altre pagine')),
    t(
      'not_found_title',
      'Page not found (404)',
      'Pagina non trovata (404)',
      l('Other pages', 'Altre pagine'),
    ),
  ];
}

export function typeFields(slug: string, name: L | string): Field[] {
  const k = `pt_${keyOf(slug)}_`;
  const group = typeof name === 'string' ? l(name, name) : name;
  return [
    {
      name: `${k}title`,
      type: 'text',
      maxLength: 300,
      group,
      label: l('Title', 'Titolo'),
      help: VARIABLES_HELP,
      default: TYPE_DEFAULTS.title as string,
    },
    {
      name: `${k}description`,
      type: 'text',
      maxLength: 400,
      group,
      label: l('Description', 'Descrizione'),
      default: TYPE_DEFAULTS.description as string,
    },
    {
      name: `${k}custom_robots`,
      type: 'boolean',
      group,
      label: l('Own robots for this type', 'Robots propri per questo tipo'),
    },
    ...robots(k, group).map(
      (f) => ({ ...f, showIf: { field: `${k}custom_robots`, equals: true } }) as Field,
    ),
    {
      name: `${k}schema`,
      type: 'select',
      group,
      label: l('Structured data', 'Dati strutturati'),
      default: 'auto',
      options: [
        {
          value: 'auto',
          label: l('Automatic (posts: blog posts)', 'Automatici (articoli: articoli di blog)'),
        },
        { value: 'Article', label: l('Article', 'Articolo') },
        { value: 'BlogPosting', label: l('Blog post', 'Articolo di blog') },
        { value: 'NewsArticle', label: l('News article', 'Notizia') },
        { value: 'none', label: l('None', 'Nessuno') },
      ],
    },
    {
      name: `${k}sitemap`,
      type: 'boolean',
      group,
      label: l('In the sitemap', 'Nella sitemap'),
      default: true,
    },
    {
      name: `${k}llms`,
      type: 'boolean',
      group,
      label: l('In llms.txt', 'In llms.txt'),
      default: true,
    },
    {
      name: `${k}indexnow`,
      type: 'boolean',
      group,
      label: l('Sent with IndexNow when published', 'Inviati con IndexNow alla pubblicazione'),
      default: true,
    },
  ];
}

export function taxonomyFields(slug: string, name: L | string): Field[] {
  const k = `tax_${keyOf(slug)}_`;
  const group = typeof name === 'string' ? l(name, name) : name;
  const tag = slug === 'tag';
  return [
    {
      name: `${k}title`,
      type: 'text',
      maxLength: 300,
      group,
      label: l('Title', 'Titolo'),
      help: l(
        'Variables: %term% %term_description% %sep% %sitename% %page%.',
        'Variabili: %term% %term_description% %sep% %sitename% %page%.',
      ),
      default: TAXONOMY_DEFAULTS.title as string,
    },
    {
      name: `${k}description`,
      type: 'text',
      maxLength: 400,
      group,
      label: l('Description', 'Descrizione'),
      default: TAXONOMY_DEFAULTS.description as string,
    },
    {
      name: `${k}custom_robots`,
      type: 'boolean',
      group,
      label: l('Own robots for this taxonomy', 'Robots propri per questa tassonomia'),
      default: tag,
    },
    ...robots(k, group).map(
      (f) =>
        ({
          ...f,
          showIf: { field: `${k}custom_robots`, equals: true },
          ...(tag && f.name.endsWith('noindex') ? { default: true } : {}),
        }) as Field,
    ),
    {
      name: `${k}sitemap`,
      type: 'boolean',
      group,
      label: l('In the sitemap', 'Nella sitemap'),
      default: !tag,
    },
  ];
}

export function socialFields(): Field[] {
  return [
    {
      name: 'og_image',
      type: 'media',
      label: l('Default image when shared', 'Immagine predefinita quando si condivide'),
      help: l(
        'For pages without their own or a featured image. 1200×630 pixels.',
        'Per le pagine senza una propria o in evidenza. 1200×630 pixel.',
      ),
    },
    {
      name: 'twitter_card',
      type: 'choice',
      display: 'buttons',
      label: l('Cards on X', 'Schede su X'),
      options: [
        { value: 'summary_large_image', label: l('Large image', 'Immagine grande') },
        { value: 'summary', label: l('Small image', 'Immagine piccola') },
      ],
    },
    {
      name: 'twitter_site',
      type: 'text',
      maxLength: 50,
      label: l('X account of the site', 'Account X del sito'),
      help: l('e.g. @example', 'es. @esempio'),
    },
    { name: 'facebook_url', type: 'url', label: l('Facebook page', 'Pagina Facebook') },
    {
      name: 'facebook_app_id',
      type: 'text',
      maxLength: 30,
      label: l('Facebook app id', 'Id dell’app Facebook'),
    },
  ];
}

const BUSINESS_TYPES = [
  'LocalBusiness',
  'Restaurant',
  'CafeOrCoffeeShop',
  'BarOrPub',
  'Bakery',
  'Hotel',
  'BedAndBreakfast',
  'Store',
  'ClothingStore',
  'Florist',
  'HairSalon',
  'BeautySalon',
  'DaySpa',
  'HealthClub',
  'Dentist',
  'Physician',
  'Pharmacy',
  'MedicalClinic',
  'Attorney',
  'AccountingService',
  'RealEstateAgent',
  'AutoRepair',
  'Electrician',
  'Plumber',
  'HomeAndConstructionBusiness',
  'TravelAgency',
  'EducationalOrganization',
  'ProfessionalService',
  'SportsActivityLocation',
  'TouristAttraction',
  'Winery',
  'Brewery',
];

export function knowledgeFields(): Field[] {
  const group = l('Site', 'Sito');
  const local = l('Local business', 'Attività locale');
  const onlyLocal = { field: 'knowledge_kind', equals: 'organization' };
  return [
    {
      name: 'knowledge_kind',
      type: 'choice',
      display: 'buttons',
      group,
      label: l('The site belongs to', 'Il sito è di'),
      options: [
        {
          value: 'organization',
          label: l('An organization or business', 'Un’organizzazione o un’attività'),
        },
        { value: 'person', label: l('A person', 'Una persona') },
      ],
    },
    {
      name: 'knowledge_name',
      type: 'text',
      maxLength: 200,
      group,
      label: l('Name', 'Nome'),
      help: l('Empty: the site’s name.', 'Vuoto: il nome del sito.'),
    },
    {
      name: 'knowledge_alternate',
      type: 'text',
      maxLength: 200,
      group,
      label: l('Other name (abbreviation)', 'Altro nome (sigla)'),
    },
    {
      name: 'knowledge_logo',
      type: 'media',
      group,
      label: l('Logo or photo', 'Logo o foto'),
      help: l('Square, at least 112×112 pixels.', 'Quadrato, almeno 112×112 pixel.'),
    },
    {
      name: 'knowledge_description',
      type: 'text',
      multiline: true,
      maxLength: 500,
      group,
      label: l('Description', 'Descrizione'),
    },
    { name: 'knowledge_email', type: 'text', maxLength: 200, group, label: l('Email', 'Email') },
    { name: 'knowledge_phone', type: 'text', maxLength: 50, group, label: l('Phone', 'Telefono') },
    {
      name: 'knowledge_same_as',
      type: 'list',
      group,
      label: l('Profiles on other sites', 'Profili su altri siti'),
      help: l(
        'Social networks, Wikipedia, directories: they tell search engines these are you.',
        'Social, Wikipedia, elenchi: dicono ai motori che sono tuoi.',
      ),
      itemLabel: 'url',
      max: 30,
      fields: [{ name: 'url', type: 'url', label: l('Address', 'Indirizzo') }],
    },
    {
      name: 'local_type',
      type: 'select',
      group: local,
      label: l('Kind of business', 'Tipo di attività'),
      options: BUSINESS_TYPES.map((t) => ({
        value: t,
        label: t.replace(/([a-z])([A-Z])/g, '$1 $2'),
      })),
      showIf: onlyLocal,
    },
    {
      name: 'local_street',
      type: 'text',
      maxLength: 200,
      group: local,
      label: l('Street and number', 'Via e numero'),
      showIf: onlyLocal,
    },
    {
      name: 'local_postal_code',
      type: 'text',
      maxLength: 20,
      group: local,
      label: l('Postal code', 'CAP'),
      showIf: onlyLocal,
    },
    {
      name: 'local_locality',
      type: 'text',
      maxLength: 100,
      group: local,
      label: l('Town', 'Comune'),
      showIf: onlyLocal,
    },
    {
      name: 'local_region',
      type: 'text',
      maxLength: 100,
      group: local,
      label: l('Region or province', 'Regione o provincia'),
      showIf: onlyLocal,
    },
    {
      name: 'local_country',
      type: 'text',
      maxLength: 2,
      group: local,
      label: l('Country (two letters, e.g. IT)', 'Paese (due lettere, es. IT)'),
      showIf: onlyLocal,
    },
    {
      name: 'local_hours',
      type: 'list',
      group: local,
      label: l('Opening hours', 'Orari di apertura'),
      itemLabel: 'days',
      max: 14,
      showIf: onlyLocal,
      fields: [
        {
          name: 'days',
          type: 'text',
          maxLength: 40,
          label: l('Days (Mo,Tu,We,Th,Fr,Sa,Su)', 'Giorni (Mo,Tu,We,Th,Fr,Sa,Su)'),
        },
        { name: 'opens', type: 'text', maxLength: 5, label: l('Opens (09:00)', 'Apre (09:00)') },
        {
          name: 'closes',
          type: 'text',
          maxLength: 5,
          label: l('Closes (18:00)', 'Chiude (18:00)'),
        },
      ],
    },
    {
      name: 'local_price_range',
      type: 'text',
      maxLength: 20,
      group: local,
      label: l('Price range (€, €€, €€€)', 'Fascia di prezzo (€, €€, €€€)'),
      showIf: onlyLocal,
    },
    {
      name: 'local_latitude',
      type: 'text',
      maxLength: 20,
      group: local,
      label: l('Latitude', 'Latitudine'),
      showIf: onlyLocal,
    },
    {
      name: 'local_longitude',
      type: 'text',
      maxLength: 20,
      group: local,
      label: l('Longitude', 'Longitudine'),
      showIf: onlyLocal,
    },
    {
      name: 'local_legal_name',
      type: 'text',
      maxLength: 200,
      group: local,
      label: l('Legal name', 'Ragione sociale'),
      showIf: onlyLocal,
    },
    {
      name: 'local_vat_id',
      type: 'text',
      maxLength: 40,
      group: local,
      label: l('VAT number', 'Partita IVA'),
      showIf: onlyLocal,
    },
  ];
}

export function webmasterFields(): Field[] {
  const help = l(
    'The code of the meta tag, or the whole tag: only its content is kept.',
    'Il codice del meta tag, o il tag intero: si tiene solo il contenuto.',
  );
  return [
    ['verify_google', 'Google Search Console'],
    ['verify_bing', 'Bing Webmaster Tools'],
    ['verify_yandex', 'Yandex'],
    ['verify_baidu', 'Baidu'],
    ['verify_pinterest', 'Pinterest'],
    ['verify_norton', 'Norton Safe Web'],
  ].map(
    ([name, label]) =>
      ({ name: name!, type: 'text', maxLength: 300, label: label!, help }) as Field,
  );
}

export function breadcrumbFields(): Field[] {
  return [
    {
      name: 'breadcrumbs_separator',
      type: 'text',
      maxLength: 5,
      label: l('Separator', 'Separatore'),
    },
    {
      name: 'breadcrumbs_home',
      type: 'boolean',
      label: l('Start with the home page', 'Inizia con la home page'),
    },
    {
      name: 'breadcrumbs_home_label',
      type: 'text',
      maxLength: 50,
      label: l('Name of the home page', 'Nome della home page'),
      help: l('Empty: Home.', 'Vuoto: Home.'),
    },
    {
      name: 'breadcrumbs_prefix',
      type: 'text',
      maxLength: 50,
      label: l('Text before the path', 'Testo prima del percorso'),
      help: l('e.g. “You are here:”', 'es. “Sei qui:”'),
    },
    {
      name: 'breadcrumbs_hide_title',
      type: 'boolean',
      label: l('Leave out the page itself', 'Escludi la pagina stessa'),
    },
  ];
}

export function sitemapFields(): Field[] {
  return [
    {
      name: 'sitemap_images',
      type: 'boolean',
      label: l('Images in the sitemap', 'Immagini nella sitemap'),
    },
    {
      name: 'sitemap_exclude',
      type: 'text',
      multiline: true,
      maxLength: 5000,
      label: l('Content kept out (ids)', 'Contenuti esclusi (id)'),
      help: l('One id per line, of entries or terms.', 'Un id per riga, di voci o termini.'),
    },
  ];
}

export function linkFields(): Field[] {
  const links = l('Links to other sites', 'Link ad altri siti');
  const images = l('Image texts', 'Testi delle immagini');
  return [
    {
      name: 'links_new_window_external',
      type: 'boolean',
      group: links,
      label: l('Open in a new tab', 'Apri in una nuova scheda'),
    },
    {
      name: 'links_nofollow_external',
      type: 'boolean',
      group: links,
      label: l('Mark them nofollow', 'Segnali nofollow'),
    },
    {
      name: 'links_nofollow_images',
      type: 'boolean',
      group: links,
      label: l('Mark links to images nofollow', 'Segna nofollow i link alle immagini'),
    },
    {
      name: 'links_nofollow_domains',
      type: 'text',
      multiline: true,
      maxLength: 5000,
      group: links,
      label: l('Always nofollow these domains', 'Sempre nofollow per questi domini'),
      help: l('One per line, e.g. example.com.', 'Uno per riga, es. example.com.'),
    },
    {
      name: 'links_follow_domains',
      type: 'text',
      multiline: true,
      maxLength: 5000,
      group: links,
      label: l('Never nofollow these domains', 'Mai nofollow per questi domini'),
    },
    {
      name: 'image_add_alt',
      type: 'boolean',
      group: images,
      label: l('Fill missing alternative texts', 'Completa i testi alternativi mancanti'),
    },
    {
      name: 'image_alt_format',
      type: 'text',
      maxLength: 200,
      group: images,
      label: l('Alternative text', 'Testo alternativo'),
      help: l(
        '%filename%, %title%, %sitename%, %count(name)%.',
        '%filename%, %title%, %sitename%, %count(nome)%.',
      ),
      showIf: { field: 'image_add_alt', equals: true },
    },
    {
      name: 'image_add_title',
      type: 'boolean',
      group: images,
      label: l('Fill missing titles', 'Completa i titoli mancanti'),
    },
    {
      name: 'image_title_format',
      type: 'text',
      maxLength: 200,
      group: images,
      label: l('Title', 'Titolo'),
      showIf: { field: 'image_add_title', equals: true },
    },
  ];
}

export function filesFields(): Field[] {
  const llms = l('llms.txt', 'llms.txt');
  const robotsGroup = l('robots.txt', 'robots.txt');
  return [
    {
      name: 'llms_summary',
      type: 'text',
      multiline: true,
      maxLength: 1000,
      group: llms,
      label: l('Summary of the site', 'Riassunto del sito'),
    },
    {
      name: 'llms_types',
      type: 'text',
      maxLength: 300,
      group: llms,
      label: l('Content types listed', 'Tipi di contenuto elencati'),
      help: l(
        'Slugs separated by commas. Empty: pages and posts.',
        'Slug separati da virgole. Vuoto: pagine e articoli.',
      ),
    },
    {
      name: 'llms_limit',
      type: 'number',
      min: 1,
      max: 200,
      group: llms,
      label: l('At most, per type', 'Al massimo, per tipo'),
    },
    {
      name: 'llms_extra',
      type: 'text',
      multiline: true,
      maxLength: 5000,
      group: llms,
      label: l('Text added at the end (Markdown)', 'Testo aggiunto in fondo (Markdown)'),
    },
    {
      name: 'robots_txt',
      type: 'code',
      language: 'css',
      group: robotsGroup,
      label: l('Rules of robots.txt', 'Regole di robots.txt'),
      help: l(
        'Empty: Cleitext’s own rules. The Sitemap line is added when missing. A site hidden from search engines (Settings) always says Disallow: /.',
        'Vuoto: le regole di Cleitext. La riga Sitemap si aggiunge se manca. Un sito nascosto ai motori (Impostazioni) dice sempre Disallow: /.',
      ),
    },
  ];
}

export function monitorFields(): Field[] {
  return [
    {
      name: 'monitor_limit',
      type: 'number',
      min: 10,
      max: 5000,
      label: l('Addresses kept', 'Indirizzi tenuti'),
      help: l(
        'Over this number, those not seen for longest go.',
        'Oltre questo numero, se ne vanno quelli non visti da più tempo.',
      ),
    },
    {
      name: 'monitor_ignore_query',
      type: 'boolean',
      label: l('Ignore what follows “?” in addresses', 'Ignora ciò che segue “?” negli indirizzi'),
    },
    {
      name: 'monitor_exclude',
      type: 'text',
      multiline: true,
      maxLength: 5000,
      label: l('Addresses not logged', 'Indirizzi non registrati'),
      help: l(
        'One rule per line: exact:/old, start:/tmp, end:.php, contains:feed, regex:^/x.',
        'Una regola per riga: exact:/vecchio, start:/tmp, end:.php, contains:feed, regex:^/x.',
      ),
    },
  ];
}

export function indexnowFields(): Field[] {
  return [
    {
      name: 'indexnow_auto',
      type: 'boolean',
      label: l(
        'Send pages when they are published or updated',
        'Invia le pagine quando sono pubblicate o aggiornate',
      ),
    },
    {
      name: 'indexnow_key',
      type: 'text',
      maxLength: 64,
      label: l('Key', 'Chiave'),
      help: l(
        'Made for you when empty. Changing it is rarely needed.',
        'Creata per te se vuota. Cambiarla serve di rado.',
      ),
    },
  ];
}
