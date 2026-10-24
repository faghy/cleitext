import { adminUrl, api, getLanguage, pluginApi } from '@cleitext/admin-sdk';
import { InspectorControls, useBlockProps } from '@wordpress/block-editor';
import { registerBlockType } from '@wordpress/blocks';
import { PanelBody, SelectControl } from '@wordpress/components';
import { useEffect, useState } from 'react';

/**
 * The Slider (Diorama) block in the block editor: the slider chosen in the
 * sidebar, drawn by the server as the page shows its first slide (slides
 * move only on the page), and links to edit it in Diorama.
 */

interface Attributes {
  slider: string;
  alias: string;
}

interface Option {
  value: string;
  label: string;
  alias: string;
}

const T = {
  en: {
    panel: 'Slider',
    choose: 'Slider',
    first: 'The first slider of the site',
    none: 'No slider yet: make one in Diorama (in the admin’s menu).',
    create: 'Open Diorama',
    edit: 'Edit this slider in Diorama',
    loading: 'Loading the slider…',
    help: 'Sliders are made in Diorama. The slides move on the page.',
  },
  it: {
    panel: 'Slider',
    choose: 'Slider',
    first: 'Il primo slider del sito',
    none: 'Nessuno slider ancora: creane uno in Diorama (nel menu dell’amministrazione).',
    create: 'Apri Diorama',
    edit: 'Modifica questo slider in Diorama',
    loading: 'Caricamento dello slider…',
    help: 'Gli slider si creano in Diorama. Le slide si muovono nella pagina.',
  },
};

const dioramaApi = pluginApi('diorama');
let options: Promise<Option[]> | null = null;
const loadOptions = () => (options ??= dioramaApi<Option[]>('GET', '/options').catch(() => []));
const previews = new Map<string, string>();

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
  const key = `${attributes.slider}|${attributes.alias}`;
  useEffect(() => {
    let live = true;
    const hit = previews.get(key);
    if (hit !== undefined) {
      setHtml(hit);
      return;
    }
    setHtml(null);
    api<{ html: string; css: string }>('POST', '/blocks/preview', {
      block: {
        id: `b_${clientId.replace(/[^\w]/g, '').slice(0, 20)}`,
        type: 'diorama/slider',
        v: 1,
        attrs: attributes,
      },
      locale: document.documentElement.lang || 'en',
    })
      .then((result) => {
        const markup = `${result.css ? `<style>${result.css.replace(/<\/style/gi, '<\\/style')}</style>` : ''}${result.html}`;
        previews.set(key, markup);
        if (live) setHtml(markup);
      })
      .catch(() => live && setHtml(''));
    return () => {
      live = false;
    };
  }, [key]);
  const chosen =
    list?.find((o) => o.value === attributes.slider) ?? (attributes.slider ? undefined : list?.[0]);
  const blockProps = useBlockProps();
  return (
    <>
      <InspectorControls>
        <PanelBody title={t.panel}>
          {list && list.length > 0 ? (
            <SelectControl
              label={t.choose}
              value={attributes.slider}
              options={[
                { value: '', label: t.first },
                ...list.map((o) => ({ value: o.value, label: o.label })),
              ]}
              onChange={(value: string) =>
                setAttributes({
                  slider: value,
                  alias: list.find((o) => o.value === value)?.alias ?? '',
                })
              }
              help={t.help}
              __next40pxDefaultSize
              __nextHasNoMarginBottom
            />
          ) : (
            <p>{list ? t.none : t.loading}</p>
          )}
          <p style={{ marginTop: 12 }}>
            <a
              href={adminUrl(chosen ? `/ext/diorama?slider=${chosen.value}` : '/ext/diorama')}
              target="_blank"
              rel="noopener noreferrer"
            >
              {chosen ? t.edit : t.create}
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
              background: '#f8fafc',
              color: '#1e293b',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 15,
            }}
          >
            {html === null ? t.loading : list && list.length === 0 ? t.none : t.loading}
          </div>
        )}
      </div>
    </>
  );
}

registerBlockType('diorama/slider', {
  apiVersion: 3,
  title: 'Slider (Diorama)',
  description:
    getLanguage() === 'it'
      ? 'Uno slider o una sezione hero fatta con Diorama.'
      : 'A slider or a hero section made with Diorama.',
  icon: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path
        d="M3 5h18v12H3z M7 21h.01 M12 21h.01 M17 21h.01 M8 9l-2 2 2 2 M16 9l2 2-2 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  category: 'media',
  keywords: ['slider', 'carousel', 'hero', 'slideshow', 'diorama', 'carosello'],
  attributes: {
    slider: { type: 'string', default: '' },
    alias: { type: 'string', default: '' },
  },
  supports: { html: false, reusable: false },
  edit: Edit,
  save: () => null,
} as never);
