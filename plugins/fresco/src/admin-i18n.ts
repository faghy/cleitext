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
  'Pages made with Fresco keep their styles ready to be fast. If a page looks wrong after an update or a change of the site settings, generate them again.':
    'Le pagine fatte con Fresco tengono pronti i loro stili per essere veloci. Se una pagina appare sbagliata dopo un aggiornamento o una modifica delle impostazioni del sito, rigenerali.',
  'The CSS of the Fresco pages is generated again.':
    'Il CSS delle pagine di Fresco viene rigenerato.',
  'Replace URL': 'Sostituisci URL',
  'After moving the site to a new address or to HTTPS: replace the old address in every page and template made with Fresco. Count first, then replace.':
    'Dopo aver spostato il sito su un nuovo indirizzo o su HTTPS: sostituisci il vecchio indirizzo in ogni pagina e modello fatto con Fresco. Prima conta, poi sostituisci.',
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
