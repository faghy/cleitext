import type { FieldDefinition } from '@cleitext/plugin-sdk';

const VARS_HELP = {
  en: 'Variables: {SITE}, {TITLE} (of the page), {URL}, {HOME}.',
  it: 'Variabili: {SITE}, {TITLE} (della pagina), {URL}, {HOME}.',
};

/** Settings → Click to Chat (Joinchat's General, Visibility and Advanced tabs). */
export const SETTINGS_FIELDS: FieldDefinition[] = [
  // ---- Button
  {
    name: 'telephone',
    type: 'text',
    maxLength: 30,
    label: { en: 'WhatsApp number', it: 'Numero WhatsApp' },
    help: {
      en: 'With the country code, e.g. +39 333 1234567. Without it the button is not shown.',
      it: 'Con il prefisso internazionale, es. +39 333 1234567. Senza numero il pulsante non compare.',
    },
  },
  {
    name: 'message_send',
    type: 'text',
    multiline: true,
    maxLength: 1000,
    label: { en: 'Message written for the visitor', it: 'Messaggio già scritto per il visitatore' },
    help: {
      en: 'The text of the chat when WhatsApp opens. Variables: {SITE}, {TITLE}, {URL}, {HOME}.',
      it: 'Il testo della chat all’apertura di WhatsApp. Variabili: {SITE}, {TITLE}, {URL}, {HOME}.',
    },
  },
  {
    name: 'button_tip',
    type: 'text',
    maxLength: 40,
    label: { en: 'Tooltip', it: 'Fumetto del pulsante' },
    help: {
      en: 'Short text next to the button, e.g. "Need help?".',
      it: 'Testo breve accanto al pulsante, es. "Serve aiuto?".',
    },
  },
  {
    name: 'button_image',
    type: 'media',
    label: { en: 'Image of the button (optional)', it: 'Immagine del pulsante (facoltativa)' },
    help: {
      en: 'e.g. a photo of who answers; it alternates with the WhatsApp icon.',
      it: 'Es. la foto di chi risponde; si alterna all’icona di WhatsApp.',
    },
  },
  {
    name: 'button_delay',
    type: 'number',
    min: -1,
    max: 120,
    default: 3,
    label: { en: 'Show the button after (seconds)', it: 'Mostra il pulsante dopo (secondi)' },
    help: { en: '-1: at once, without animation.', it: '-1: subito, senza animazione.' },
  },
  {
    name: 'position',
    type: 'select',
    label: { en: 'Position', it: 'Posizione' },
    options: [
      { value: 'right', label: { en: 'Bottom right', it: 'In basso a destra' } },
      { value: 'left', label: { en: 'Bottom left', it: 'In basso a sinistra' } },
    ],
    default: 'right',
  },
  {
    name: 'color',
    type: 'text',
    maxLength: 7,
    default: '#25d366',
    label: { en: 'Color', it: 'Colore' },
    help: {
      en: 'Hex code, e.g. #25d366 (WhatsApp green).',
      it: 'Codice esadecimale, es. #25d366 (il verde di WhatsApp).',
    },
  },
  {
    name: 'text_color',
    type: 'select',
    label: { en: 'Text on the color', it: 'Testo sul colore' },
    options: [
      { value: 'white', label: { en: 'White', it: 'Bianco' } },
      { value: 'black', label: { en: 'Black', it: 'Nero' } },
    ],
    default: 'white',
  },
  {
    name: 'dark_mode',
    type: 'select',
    label: { en: 'Dark mode', it: 'Modalità scura' },
    options: [
      { value: 'no', label: { en: 'No', it: 'No' } },
      { value: 'yes', label: { en: 'Yes', it: 'Sì' } },
      { value: 'auto', label: { en: 'Like the device', it: 'Come il dispositivo' } },
    ],
    default: 'no',
  },
  {
    name: 'mobile_only',
    type: 'boolean',
    default: false,
    label: { en: 'Only on phones', it: 'Solo sui telefoni' },
  },
  {
    name: 'whatsapp_web',
    type: 'boolean',
    default: false,
    label: { en: 'On computers open WhatsApp Web', it: 'Sui computer apri WhatsApp Web' },
  },
  {
    name: 'qr',
    type: 'boolean',
    default: false,
    label: { en: 'On computers show a QR code', it: 'Sui computer mostra un codice QR' },
    help: {
      en: 'Over the button, to open the chat on the phone.',
      it: 'Sopra il pulsante, per aprire la chat sul telefono.',
    },
  },
  {
    name: 'qr_text',
    type: 'text',
    maxLength: 60,
    label: { en: 'Text of the QR code', it: 'Testo del codice QR' },
    default: '',
  },
  // ---- Chat window
  {
    name: 'message_text',
    type: 'text',
    multiline: true,
    maxLength: 4000,
    label: { en: 'Chat window: messages', it: 'Finestra di chat: messaggi' },
    help: {
      en: 'Empty: the button opens WhatsApp at once. *bold* _italic_ [text](link) {BTN link text} ![](image) === new bubble.',
      it: 'Vuoto: il pulsante apre subito WhatsApp. *grassetto* _corsivo_ [testo](link) {BTN link testo} ![](immagine) === nuovo fumetto.',
    },
  },
  {
    name: 'header',
    type: 'select',
    label: { en: 'Window header', it: 'Intestazione della finestra' },
    options: [
      { value: 'whatsapp', label: { en: 'WhatsApp logo', it: 'Logo di WhatsApp' } },
      { value: 'custom', label: { en: 'My text', it: 'Il mio testo' } },
      { value: 'none', label: { en: 'Nothing', it: 'Niente' } },
    ],
    default: 'whatsapp',
  },
  {
    name: 'header_text',
    type: 'text',
    maxLength: 40,
    label: { en: 'Header text', it: 'Testo dell’intestazione' },
  },
  {
    name: 'message_start',
    type: 'text',
    maxLength: 40,
    label: { en: 'Text of the "open chat" button', it: 'Testo del pulsante "apri la chat"' },
    default: '',
    help: { en: 'e.g. "Open chat".', it: 'Es. "Apri la chat".' },
  },
  {
    name: 'message_delay',
    type: 'number',
    min: -1,
    max: 600,
    default: 10,
    label: {
      en: 'Open the window by itself after (seconds)',
      it: 'Apri la finestra da sola dopo (secondi)',
    },
    help: {
      en: '-1: never. It opens once per message, from the page set below.',
      it: '-1: mai. Si apre una volta per messaggio, dalla pagina indicata sotto.',
    },
  },
  {
    name: 'message_views',
    type: 'number',
    min: 1,
    max: 50,
    default: 2,
    label: { en: '…from page number', it: '…dalla pagina numero' },
    help: { en: 'Pages the visitor has seen.', it: 'Pagine viste dal visitatore.' },
  },
  {
    name: 'message_badge',
    type: 'boolean',
    default: false,
    label: {
      en: 'Instead of opening it, show a "1" on the button',
      it: 'Invece di aprirla, mostra un "1" sul pulsante',
    },
  },
  {
    name: 'optin_text',
    type: 'text',
    multiline: true,
    maxLength: 1000,
    label: { en: 'Privacy notice in the window', it: 'Informativa privacy nella finestra' },
    help: {
      en: 'e.g. "By chatting you accept the [privacy policy](/privacy-policy)".',
      it: 'Es. "Scrivendoci accetti l’[informativa privacy](/privacy-policy)".',
    },
  },
  {
    name: 'optin_check',
    type: 'boolean',
    default: false,
    label: {
      en: 'The notice must be accepted (checkbox)',
      it: 'L’informativa va accettata (casella)',
    },
  },
  // ---- Visibility
  {
    name: 'show_front',
    type: 'boolean',
    default: true,
    label: { en: 'Show on the home page', it: 'Mostra nella home page' },
  },
  {
    name: 'show_pages',
    type: 'boolean',
    default: true,
    label: { en: 'Show on pages', it: 'Mostra nelle pagine' },
  },
  {
    name: 'show_articles',
    type: 'boolean',
    default: true,
    label: { en: 'Show on posts', it: 'Mostra negli articoli' },
  },
  {
    name: 'show_other',
    type: 'boolean',
    default: true,
    label: { en: 'Show on other content types', it: 'Mostra negli altri tipi di contenuto' },
  },
  {
    name: 'show_archives',
    type: 'boolean',
    default: true,
    label: { en: 'Show on archives and categories', it: 'Mostra in archivi e categorie' },
  },
  {
    name: 'show_search',
    type: 'boolean',
    default: true,
    label: { en: 'Show on search results', it: 'Mostra nei risultati di ricerca' },
  },
  {
    name: 'show_404',
    type: 'boolean',
    default: true,
    label: { en: 'Show on "page not found"', it: 'Mostra in "pagina non trovata"' },
  },
  // ---- Advanced
  {
    name: 'tracking',
    type: 'boolean',
    default: true,
    label: { en: 'Count the clicks (Dashboard)', it: 'Conta i clic (Bacheca)' },
    help: {
      en: 'Counts per day only: nothing about visitors is kept.',
      it: 'Solo conteggi per giorno: nulla dei visitatori viene conservato.',
    },
  },
  {
    name: 'ga_event',
    type: 'text',
    maxLength: 40,
    label: { en: 'Google Analytics 4 event', it: 'Evento di Google Analytics 4' },
    help: {
      en: 'Sent on every click when GA4 or Tag Manager is on the site. Empty: generate_lead; "off": none.',
      it: 'Inviato a ogni clic se sul sito c’è GA4 o Tag Manager. Vuoto: generate_lead; "off": nessuno.',
    },
  },
  {
    name: 'gads',
    type: 'text',
    maxLength: 40,
    label: { en: 'Google Ads conversion', it: 'Conversione di Google Ads' },
    help: { en: 'e.g. AW-123456789/AbCdEfGh.', it: 'Es. AW-123456789/AbCdEfGh.' },
  },
];

/** The box of the editor: another number or message on one page, or no button. */
export const OVERRIDE_FIELDS: FieldDefinition[] = [
  {
    name: 'view',
    type: 'select',
    label: { en: 'Button on this page', it: 'Pulsante in questa pagina' },
    options: [
      { value: 'default', label: { en: 'As in Settings', it: 'Come nelle Impostazioni' } },
      { value: 'show', label: { en: 'Show', it: 'Mostra' } },
      { value: 'hide', label: { en: 'Hide', it: 'Nascondi' } },
    ],
    default: 'default',
    translation: 'copy',
  },
  {
    name: 'telephone',
    type: 'text',
    maxLength: 30,
    label: { en: 'Another number', it: 'Un altro numero' },
    translation: 'copy',
  },
  {
    name: 'message_text',
    type: 'text',
    multiline: true,
    maxLength: 4000,
    label: { en: 'Other messages in the window', it: 'Altri messaggi nella finestra' },
    help: { en: '{} for none.', it: '{} per nessuno.' },
  },
  {
    name: 'message_send',
    type: 'text',
    multiline: true,
    maxLength: 1000,
    label: { en: 'Another message written for the visitor', it: 'Un altro messaggio già scritto' },
    help: VARS_HELP,
  },
];
