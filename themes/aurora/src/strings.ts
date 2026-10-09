/** Interface strings of the theme (English and Italian). */
const en = {
  skip: 'Skip to content',
  mainMenu: 'Main menu',
  footerMenu: 'Footer menu',
  languages: 'Languages',
  search: 'Search',
  searchPlaceholder: 'Search…',
  categories: 'Categories',
  tags: 'Tags',
  nothingYet: 'Nothing has been published yet.',
  noResults: 'No results. Try different words.',
  typeToSearch: 'Type something to search the site.',
  resultsFor: (q: string) => `Results for “${q}”`,
  notFoundTitle: 'Page not found',
  notFoundText: 'The page you are looking for does not exist or has been moved.',
  backHome: 'Back to the home page',
  maintenanceTitle: 'We will be back soon',
  maintenanceText: 'The site is undergoing maintenance. Please come back in a few minutes.',
  pagination: 'Pagination',
  newer: 'Newer',
  older: 'Older',
  pageOf: (page: number, total: number) => `Page ${page} of ${total}`,
  poweredBy: 'powered by',
};

const it: typeof en = {
  skip: 'Vai al contenuto',
  mainMenu: 'Menu principale',
  footerMenu: 'Menu del piè di pagina',
  languages: 'Lingue',
  search: 'Cerca',
  searchPlaceholder: 'Cerca…',
  categories: 'Categorie',
  tags: 'Tag',
  nothingYet: 'Non è stato ancora pubblicato nulla.',
  noResults: 'Nessun risultato. Prova con altre parole.',
  typeToSearch: 'Scrivi qualcosa per cercare nel sito.',
  resultsFor: (q: string) => `Risultati per “${q}”`,
  notFoundTitle: 'Pagina non trovata',
  notFoundText: 'La pagina che cerchi non esiste o è stata spostata.',
  backHome: 'Torna alla home page',
  maintenanceTitle: 'Torniamo presto',
  maintenanceText: 'Il sito è in manutenzione. Riprova tra qualche minuto.',
  pagination: 'Paginazione',
  newer: 'Più recenti',
  older: 'Meno recenti',
  pageOf: (page: number, total: number) => `Pagina ${page} di ${total}`,
  poweredBy: 'realizzato con',
};

export function strings(locale: string): typeof en {
  return locale.split('-')[0] === 'it' ? it : en;
}
