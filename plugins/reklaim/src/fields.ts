import type { FieldDefinition } from '@cleitext/plugin-sdk';

/** Settings → Reklaim. */
export const SETTINGS_FIELDS: FieldDefinition[] = [
  {
    name: 'enabled',
    type: 'boolean',
    default: true,
    label: { en: 'Show the bar', it: 'Mostra la barra' },
  },
  {
    name: 'texts',
    type: 'list',
    itemLabel: 'button',
    max: 20,
    label: { en: 'Texts', it: 'Testi' },
    help: {
      en: 'One per language. A text without a language is used for the languages that have none. With Reklaim Pro: other bars per anchor and page, also on computers or at the top, with start and end dates.',
      it: 'Uno per lingua. Un testo senza lingua vale per le lingue che non ne hanno uno. Con Reklaim Pro: barre diverse per ancora e per pagina, anche su computer o in alto, con date di inizio e fine.',
    },
    fields: [
      {
        name: 'locale',
        type: 'text',
        maxLength: 10,
        label: { en: 'Language (e.g. it, en, fr)', it: 'Lingua (es. it, en, fr)' },
      },
      {
        name: 'text',
        type: 'text',
        maxLength: 120,
        label: { en: 'Text', it: 'Testo' },
        help: { en: 'e.g. "From €29 a month".', it: 'Es. «Da 29 € al mese».' },
      },
      {
        name: 'button',
        type: 'text',
        maxLength: 60,
        label: { en: 'Button', it: 'Pulsante' },
        help: { en: 'e.g. "Ask for a free demo".', it: 'Es. «Richiedi una demo gratuita».' },
      },
      {
        name: 'link',
        type: 'text',
        maxLength: 500,
        label: {
          en: 'Address when the page has no anchor',
          it: 'Indirizzo se la pagina non ha l’ancora',
        },
        help: { en: 'e.g. /contact#form or /en#demo.', it: 'Es. /contatti#modulo o /#demo.' },
      },
    ],
  },
  {
    name: 'anchor',
    type: 'text',
    maxLength: 80,
    label: { en: 'Anchor', it: 'Ancora' },
    help: {
      en: 'The id of the form or section the button leads to, e.g. demo. On pages that have it, the button goes there and the bar hides while it is in view.',
      it: 'L’id del modulo o della sezione a cui porta il pulsante, es. demo. Nelle pagine che lo hanno il pulsante va lì e la barra si nasconde quando è a schermo.',
    },
  },
  {
    name: 'scroll',
    type: 'number',
    min: 0,
    max: 10000,
    default: 500,
    unit: 'px',
    label: { en: 'Show after scrolling', it: 'Mostra dopo uno scorrimento di' },
  },
  {
    name: 'max_width',
    type: 'number',
    min: 0,
    max: 4000,
    default: 768,
    unit: 'px',
    label: { en: 'Only on screens narrower than', it: 'Solo su schermi più stretti di' },
    help: {
      en: '768: phones only. 0: every screen.',
      it: '768: solo i telefoni. 0: tutti gli schermi.',
    },
  },
  {
    name: 'background',
    type: 'color',
    alpha: true,
    default: '#1f2937',
    label: { en: 'Background', it: 'Sfondo' },
  },
  { name: 'color', type: 'color', default: '#ffffff', label: { en: 'Text', it: 'Testo' } },
  {
    name: 'button_background',
    type: 'color',
    default: '#2563eb',
    label: { en: 'Button', it: 'Pulsante' },
  },
  {
    name: 'button_color',
    type: 'color',
    default: '#ffffff',
    label: { en: 'Button text', it: 'Testo del pulsante' },
  },
  {
    name: 'hide_paths',
    type: 'text',
    multiline: true,
    maxLength: 4000,
    label: { en: 'Pages without the bar', it: 'Pagine senza la barra' },
    help: {
      en: 'One address per line, e.g. /contact; /blog/* also hides the pages below it.',
      it: 'Un indirizzo per riga, es. /contatti; /blog/* nasconde anche le pagine sotto.',
    },
  },
  {
    name: 'ga_event',
    type: 'text',
    maxLength: 40,
    default: 'generate_lead',
    label: { en: 'Google Analytics 4 event', it: 'Evento di Google Analytics 4' },
    help: {
      en: 'Sent at every click when the site has Google Analytics or Tag Manager. "off": none.',
      it: 'Inviato a ogni clic se il sito ha Google Analytics o Tag Manager. «off»: nessuno.',
    },
  },
  {
    name: 'tracking',
    type: 'boolean',
    default: true,
    label: { en: 'Count the clicks', it: 'Conta i clic' },
    help: {
      en: 'In the Dashboard. Counts only: nothing about visitors is kept.',
      it: 'Nella Bacheca. Solo i numeri: dei visitatori non si tiene niente.',
    },
  },
];
