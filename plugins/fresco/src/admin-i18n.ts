/**
 * Fresco's admin pages in Italian (Site settings, Tools, System info);
 * texts shared with the editor are in its catalog.
 */
import { addMessages } from '@cleitext/admin-sdk';

addMessages('it', {
  // Site settings
  'Fresco site settings': 'Impostazioni del sito di Fresco',
  'Opening the site settings in Fresco…': 'Apertura delle impostazioni del sito in Fresco…',

  // Tools
  Tools: 'Strumenti',
  'Regenerate CSS': 'Rigenera il CSS',
  'Imported header and footer': 'Header e footer importati',
  'The header and footer of the imported site, shown by Fresco in the theme’s place. With Fresco Pro, import again to have them as theme templates you can edit.':
    'L’header e il footer del sito importato, mostrati da Fresco al posto di quelli del tema. Con Fresco Pro, importa di nuovo per averli come modelli del tema da modificare.',
  'Remove "{title}"?': 'Rimuovere "{title}"?',
  'The theme shows its own header or footer again.':
    'Il tema torna a mostrare il proprio header o footer.',
  'Pages made with Fresco keep their styles ready to be fast. If a page looks wrong after an update or a change of the site settings, generate them again.':
    'Le pagine fatte con Fresco tengono pronti i loro stili per essere veloci. Se una pagina appare sbagliata dopo un aggiornamento o una modifica delle impostazioni del sito, rigenerali.',
  'The CSS of the Fresco pages is generated again.':
    'Il CSS delle pagine di Fresco viene rigenerato.',
  'Replace URL': 'Sostituisci URL',
  'After moving the site to a new address or to HTTPS: replace the old address in every page and template made with Fresco, in the imported header and footer, the site settings and the components. Count first, then replace.':
    'Dopo aver spostato il sito su un nuovo indirizzo o su HTTPS: sostituisci il vecchio indirizzo in ogni pagina e modello fatto con Fresco, nell’header e nel footer importati, nelle impostazioni del sito e nei componenti. Prima conta, poi sostituisci.',
  'Site settings': 'Impostazioni del sito',
  Components: 'Componenti',
  'Old address': 'Vecchio indirizzo',
  'New address': 'Nuovo indirizzo',
  Count: 'Conta',
  Replace: 'Sostituisci',
  'The old address is in no Fresco document.':
    'Il vecchio indirizzo non compare in nessun documento di Fresco.',
  'Found {count} times in {documents} documents:':
    'Trovato {count} volte in {documents} documenti:',
  'and {count} more': 'e altri {count}',
  'Replace the address?': 'Sostituire l’indirizzo?',
  '{count} occurrences in {documents} documents change. Each page keeps its earlier revisions.':
    'Cambiano {count} occorrenze in {documents} documenti. Ogni pagina conserva le revisioni precedenti.',
  '{count} occurrences replaced in {documents} documents.':
    '{count} occorrenze sostituite in {documents} documenti.',
  Versions: 'Versioni',
  'Plugin API': 'API dei plugin',
  'Check for updates': 'Controlla gli aggiornamenti',

  // System info
  'System info': 'Informazioni di sistema',
  'What support asks about: versions of Cleitext, Fresco and the server.':
    'Quello che chiede l’assistenza: le versioni di Cleitext, di Fresco e del server.',
  'Copy the system info': 'Copia le informazioni di sistema',
  'Copied: paste it in your support request.': 'Copiato: incollalo nella richiesta di assistenza.',
  'The browser did not allow copying.': 'Il browser non ha permesso di copiare.',
  Server: 'Server',
  'Operating system': 'Sistema operativo',
  'Database size': 'Dimensione del database',
  'Memory in use': 'Memoria in uso',
  'Page cache': 'Cache delle pagine',
  On: 'Attiva',
  Off: 'Disattivata',
  'Running for': 'In funzione da',
  Languages: 'Lingue',
  'Active theme': 'Tema attivo',
  inactive: 'non attivo',
  'Pages made with Fresco': 'Pagine fatte con Fresco',
  'Templates of the Theme Builder': 'Modelli del Theme Builder',
  'Active plugins': 'Plugin attivi',
  error: 'errore',
  'Only who manages plugins sees them.': 'Li vede solo chi gestisce i plugin.',
});
