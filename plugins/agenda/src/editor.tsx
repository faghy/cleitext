import { adminUrl, api, getLanguage, pluginApi } from '@cleitext/admin-sdk';
import { InspectorControls, useBlockProps } from '@wordpress/block-editor';
import { registerBlockType } from '@wordpress/blocks';
import { PanelBody, SelectControl, TextControl } from '@wordpress/components';
import { useEffect, useState } from 'react';
import { BLOCK_TYPE, SLUG } from './config';

/**
 * The Booking (Agenda) block in the block editor: the service and the kind
 * of calendar in the sidebar, the server's drawing in the canvas (the free
 * times appear on the page), and a link to Agenda. It works the same inside
 * Prisma's containers, which hold any block.
 */

interface Attributes {
  service: string;
  view: 'month' | 'week';
  category: string;
  heading: string;
  ref: string;
}

interface Option {
  value: string;
  label: string;
  status: string;
}

const T = {
  en: {
    panel: 'Booking',
    service: 'Service',
    all: 'The visitor chooses',
    view: 'Calendar',
    month: 'Month',
    week: 'Week',
    heading: 'Heading (optional)',
    none: 'No service yet: set one up in Agenda (in the admin’s menu).',
    open: 'Open Agenda',
    loading: 'Loading…',
    help: 'Free times are shown on the page.',
    imported: 'A service imported from WordPress.',
  },
  it: {
    panel: 'Prenotazione',
    service: 'Servizio',
    all: 'Lo sceglie il visitatore',
    view: 'Calendario',
    month: 'Mese',
    week: 'Settimana',
    heading: 'Titolo (facoltativo)',
    none: 'Nessun servizio ancora: crealo in Agenda (nel menu dell’amministrazione).',
    open: 'Apri Agenda',
    loading: 'Caricamento…',
    help: 'Gli orari liberi compaiono nella pagina.',
    imported: 'Un servizio importato da WordPress.',
  },
};

const agendaApi = pluginApi(SLUG);
let options: Promise<Option[]> | null = null;
const loadOptions = () => (options ??= agendaApi<Option[]>('GET', '/options').catch(() => []));

function Edit({
  attributes,
  setAttributes,
  clientId,
}: {
  attributes: Attributes;
  setAttributes: (attributes: Partial<Attributes>) => void;
  clientId: string;
}) {
  const t = getLanguage() === 'it' ? T.it : T.en;
  const [list, setList] = useState<Option[] | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadOptions().then((value) => live && setList(value));
    return () => {
      live = false;
    };
  }, []);
  const key = JSON.stringify(attributes);
  useEffect(() => {
    let live = true;
    setHtml(null);
    api<{ html: string; css: string }>('POST', '/blocks/preview', {
      block: {
        id: `b_${clientId.replace(/[^\w]/g, '').slice(0, 20)}`,
        type: BLOCK_TYPE,
        v: 1,
        attrs: attributes,
      },
      locale: document.documentElement.lang || 'en',
    })
      .then((result) => live && setHtml(result.html))
      .catch(() => live && setHtml(''));
    return () => {
      live = false;
    };
  }, [key]);
  const blockProps = useBlockProps();
  return (
    <>
      <InspectorControls>
        <PanelBody title={t.panel}>
          {list === null ? (
            <p>{t.loading}</p>
          ) : list.length === 0 ? (
            <p>{t.none}</p>
          ) : (
            <SelectControl
              label={t.service}
              value={attributes.service}
              options={[
                { value: '', label: t.all },
                ...list
                  .filter((o) => o.status !== 'archived')
                  .map((o) => ({ value: o.value, label: o.label })),
              ]}
              onChange={(value: string) => setAttributes({ service: value, ref: '' })}
              help={attributes.ref && !attributes.service ? t.imported : t.help}
              __next40pxDefaultSize
              __nextHasNoMarginBottom
            />
          )}
          <SelectControl
            label={t.view}
            value={attributes.view === 'week' ? 'week' : 'month'}
            options={[
              { value: 'month', label: t.month },
              { value: 'week', label: t.week },
            ]}
            onChange={(value: string) =>
              setAttributes({ view: value === 'week' ? 'week' : 'month' })
            }
            __next40pxDefaultSize
            __nextHasNoMarginBottom
          />
          <TextControl
            label={t.heading}
            value={attributes.heading}
            onChange={(value: string) => setAttributes({ heading: value })}
            __next40pxDefaultSize
            __nextHasNoMarginBottom
          />
          <p style={{ marginTop: 12 }}>
            <a href={adminUrl(`/ext/${SLUG}`)} target="_blank" rel="noopener noreferrer">
              {t.open}
            </a>
          </p>
        </PanelBody>
      </InspectorControls>
      <div {...blockProps}>
        {html ? (
          <div style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div
            style={{
              padding: '1.25rem 1.5rem',
              border: '1px dashed #94a3b8',
              borderRadius: 8,
              fontFamily: 'system-ui, sans-serif',
              fontSize: 15,
            }}
          >
            {list && list.length === 0 ? t.none : t.loading}
          </div>
        )}
      </div>
    </>
  );
}

registerBlockType(BLOCK_TYPE, {
  apiVersion: 3,
  title: getLanguage() === 'it' ? 'Prenotazione (Agenda)' : 'Booking (Agenda)',
  description:
    getLanguage() === 'it'
      ? 'Un calendario per prenotare un appuntamento: gli orari liberi dei tuoi servizi.'
      : 'A calendar to book an appointment: the free times of your services.',
  icon: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path
        d="M8 3v3 M16 3v3 M4 8h16 M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M9 14l2 2 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  category: 'widgets',
  keywords: [
    'booking',
    'appointment',
    'calendar',
    'agenda',
    'prenotazione',
    'appuntamento',
    'calendario',
  ],
  attributes: {
    service: { type: 'string', default: '' },
    view: { type: 'string', default: 'month' },
    category: { type: 'string', default: '' },
    heading: { type: 'string', default: '' },
    ref: { type: 'string', default: '' },
  },
  supports: { html: false, reusable: false },
  edit: Edit,
  save: () => null,
} as never);
