/**
 * Italian texts of the Elementor 4 editor tools: components, the Class
 * manager, the Variables manager and interactions.
 */
import { addMessages } from '@cleitext/admin-sdk';

addMessages('it', {
  // Components
  Component: 'Componente',
  Components: 'Componenti',
  'Create component': 'Crea componente',
  'Create a component': 'Crea un componente',
  'Component “{name}” created.': 'Componente “{name}” creato.',
  'Edit component': 'Modifica componente',
  Detach: 'Scollega',
  'Save component': 'Salva componente',
  'Component saved.': 'Componente salvato.',
  'Editing the component “{name}”: saving it changes every instance.':
    'Stai modificando il componente “{name}”: salvandolo cambiano tutte le sue istanze.',
  'A component holds atomic elements only.': 'Un componente contiene solo elementi atomici.',
  'Component properties': 'Proprietà del componente',
  'Overridable settings: each instance of the component may give them its own value.':
    'Impostazioni sovrascrivibili: ogni istanza del componente può dare loro un valore suo.',
  'Overridable: {control}': 'Sovrascrivibile: {control}',
  'Property name': 'Nome della proprietà',
  'This component has no overridable properties: edit the component and choose them in its elements.':
    'Questo componente non ha proprietà sovrascrivibili: modifica il componente e sceglile nei suoi elementi.',
  'This component is not there any more.': 'Questo componente non esiste più.',
  'Search components…': 'Cerca componenti…',
  'Search components': 'Cerca componenti',
  'No components yet: right-click an atomic element and choose “Create component”.':
    'Ancora nessun componente: fai clic destro su un elemento atomico e scegli “Crea componente”.',
  'Delete the component {name}': 'Elimina il componente {name}',
  'Delete the component “{name}”?': 'Eliminare il componente “{name}”?',
  'Its instances on the pages show nothing any more. This cannot be undone.':
    'Le sue istanze nelle pagine non mostreranno più nulla. Non si può annullare.',
  'Global widgets': 'Widget globali',

  // Variables manager
  'Variables manager': 'Gestione variabili',
  Variables: 'Variabili',
  'Named colors, fonts and sizes for the Style tab of atomic elements. Change one and every element using it changes.':
    'Colori, font e dimensioni con un nome, per la scheda Stile degli elementi atomici. Cambiane uno e cambiano tutti gli elementi che lo usano.',
  'Search variables…': 'Cerca variabili…',
  'Search variables': 'Cerca variabili',
  Uses: 'Usi',
  'Delete {name}': 'Elimina {name}',
  'Delete the variable “{name}”?': 'Eliminare la variabile “{name}”?',
  'It is used {count} times: those elements keep its value, and you can restore it.':
    'È usata {count} volte: quegli elementi mantengono il suo valore e potrai ripristinarla.',
  'No element uses it. You can restore it later.':
    'Nessun elemento la usa. Potrai ripristinarla in seguito.',
  'New color': 'Nuovo colore',
  'New font': 'Nuovo font',
  'New size': 'Nuova dimensione',
  'Import global colors and fonts': 'Importa colori e font globali',
  'One variable for each global color and font not imported yet.':
    'Una variabile per ogni colore e font globale non ancora importato.',
  '{count} variables imported.': '{count} variabili importate.',
  'Deleted variables': 'Variabili eliminate',
  Restore: 'Ripristina',

  // Class manager
  'Class manager': 'Gestione classi',
  'Global classes of atomic elements. Higher in the list means higher priority: its values win over those of the classes below.':
    'Classi globali degli elementi atomici. Più in alto nell’elenco significa priorità più alta: i suoi valori vincono su quelli delle classi sotto.',
  'No classes yet: add one in the Style tab of an atomic element.':
    'Ancora nessuna classe: aggiungine una nella scheda Stile di un elemento atomico.',
  'Search classes…': 'Cerca classi…',
  'Search classes': 'Cerca classi',
  'Drag to change the priority (or use the arrow keys)':
    'Trascina per cambiare la priorità (o usa i tasti freccia)',
  'Duplicate the class {name}': 'Duplica la classe {name}',
  '{name} copy': '{name} copia',
  '{count} elements use it: they keep the name but lose its style.':
    '{count} elementi la usano: mantengono il nome ma perdono il suo stile.',
  'No element uses it.': 'Nessun elemento la usa.',
  'Convert to class': 'Converti in classe',

  // Interactions
  Interactions: 'Interazioni',
  'Animations that bring the element in (or take it out) when the page loads or when it scrolls into view.':
    'Animazioni che fanno entrare (o uscire) l’elemento quando la pagina si carica o quando entra nella vista scorrendo.',
  'Add interaction': 'Aggiungi interazione',
  'Remove the interaction': 'Rimuovi l’interazione',
  Play: 'Riproduci',
  'Play the animation': 'Riproduci l’animazione',
  Trigger: 'Attivazione',
  'On page load': 'Al caricamento della pagina',
  'On scroll into view': 'Quando entra nella vista',
  Effect: 'Effetto',
  Slide: 'Scorrimento',
  In: 'Entrata',
  Out: 'Uscita',
  'From the left': 'Da sinistra',
  'From the right': 'Da destra',
  'From the top': 'Dall’alto',
  'From the bottom': 'Dal basso',
  'Duration (ms)': 'Durata (ms)',
  'Delay (ms)': 'Ritardo (ms)',
  Easing: 'Andamento',
  'Ease in': 'Accelerato',
  'Ease out': 'Decelerato',
  'Ease in and out': 'Accelerato e decelerato',
  Linear: 'Lineare',
});
