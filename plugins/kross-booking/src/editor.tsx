import { getLanguage, pluginApi } from '@cleitext/admin-sdk';
import { InspectorControls, useBlockProps } from '@wordpress/block-editor';
import { registerBlockType } from '@wordpress/blocks';
import { PanelBody, TextControl } from '@wordpress/components';
import { useEffect, useState } from 'react';

/**
 * The Kross Booking block in the block editor: a placeholder naming the room
 * (the widget itself needs its script, which runs only on the page), a note
 * while the hotel and widget IDs are not set, and the settings in the
 * sidebar. The server renders the block on the page.
 */

interface Attributes {
  room: string;
  lang: string;
  url: string;
}

const T = {
  en: {
    title: (room: string) => `Kross Booking widget — room ${room}`,
    langAuto: 'Language: the page’s',
    lang: (lang: string) => `Language: ${lang}`,
    missing:
      'Set the hotel ID and the widget ID in Settings → Kross Booking: until then the widget is not shown.',
    note: 'The widget itself is shown on the page.',
    panel: 'Widget',
    room: 'Room ID',
    roomHelp: 'The room’s ID at Kross Booking; 0 for the search of every room.',
    language: 'Language',
    languageHelp:
      'Two letters, e.g. en or it. Empty: the language of the page, so each translation gets its own.',
    url: 'Booking page address (optional)',
    urlHelp:
      'Where the widget sends visitors, e.g. https://example.com/book or /book. Empty: Kross Booking’s own page.',
  },
  it: {
    title: (room: string) => `Widget Kross Booking — camera ${room}`,
    langAuto: 'Lingua: quella della pagina',
    lang: (lang: string) => `Lingua: ${lang}`,
    missing:
      'Imposta l’ID dell’hotel e l’ID del widget in Impostazioni → Kross Booking: fino ad allora il widget non viene mostrato.',
    note: 'Il widget vero e proprio si vede nella pagina.',
    panel: 'Widget',
    room: 'ID della camera',
    roomHelp: 'L’ID della camera su Kross Booking; 0 per la ricerca su tutte le camere.',
    language: 'Lingua',
    languageHelp:
      'Due lettere, es. it o en. Vuoto: la lingua della pagina, così ogni traduzione ha la sua.',
    url: 'Indirizzo della pagina di prenotazione (facoltativo)',
    urlHelp:
      'Dove il widget porta i visitatori, es. https://example.com/prenota o /prenota. Vuoto: la pagina di Kross Booking.',
  },
};

const api = pluginApi('kross-booking');
/** Asked once per editor session. */
let status: Promise<boolean> | null = null;
function configured(): Promise<boolean> {
  status ??= api<{ configured: boolean }>('GET', '/status')
    .then((s) => s.configured)
    .catch(() => true);
  return status;
}

function Edit({
  attributes,
  setAttributes,
}: {
  attributes: Attributes;
  setAttributes: (attributes: Partial<Attributes>) => void;
}) {
  const t = getLanguage() === 'it' ? T.it : T.en;
  const [ready, setReady] = useState(true);
  useEffect(() => {
    let live = true;
    void configured().then((value) => {
      if (live) setReady(value);
    });
    return () => {
      live = false;
    };
  }, []);
  const room = attributes.room?.trim() || '0';
  const lang = attributes.lang?.trim().toLowerCase();
  const blockProps = useBlockProps({
    style: {
      padding: '1.25rem 1.5rem',
      border: '1px dashed #94a3b8',
      borderRadius: 8,
      background: '#f8fafc',
      color: '#1e293b',
      fontFamily: 'system-ui, sans-serif',
      fontSize: 15,
      lineHeight: 1.5,
    },
  });
  return (
    <>
      <InspectorControls>
        <PanelBody title={t.panel}>
          <TextControl
            label={t.room}
            help={t.roomHelp}
            value={attributes.room ?? ''}
            maxLength={40}
            onChange={(value: string) => setAttributes({ room: value })}
            __next40pxDefaultSize
            __nextHasNoMarginBottom
          />
          <TextControl
            label={t.language}
            help={t.languageHelp}
            value={attributes.lang ?? ''}
            maxLength={2}
            onChange={(value: string) => setAttributes({ lang: value })}
            __next40pxDefaultSize
            __nextHasNoMarginBottom
          />
          <TextControl
            label={t.url}
            help={t.urlHelp}
            value={attributes.url ?? ''}
            maxLength={500}
            onChange={(value: string) => setAttributes({ url: value })}
            __next40pxDefaultSize
            __nextHasNoMarginBottom
          />
        </PanelBody>
      </InspectorControls>
      <div {...blockProps}>
        <strong>{t.title(room)}</strong>
        <div>{lang ? t.lang(lang) : t.langAuto}</div>
        <div style={{ color: ready ? '#64748b' : '#b45309' }}>{ready ? t.note : t.missing}</div>
      </div>
    </>
  );
}

registerBlockType('kross-booking/widget', {
  apiVersion: 3,
  title: 'Kross Booking',
  description:
    getLanguage() === 'it'
      ? 'Il widget di prenotazione di Kross Booking: disponibilità e prezzi delle camere.'
      : 'The booking widget of Kross Booking: availability and prices of your rooms.',
  icon: 'calendar-alt',
  category: 'widgets',
  keywords: ['booking', 'prenotazione', 'hotel', 'kross'],
  attributes: {
    room: { type: 'string', default: '0' },
    lang: { type: 'string', default: '' },
    url: { type: 'string', default: '' },
  },
  supports: { html: false, reusable: false },
  edit: Edit,
  save: () => null,
} as never);
