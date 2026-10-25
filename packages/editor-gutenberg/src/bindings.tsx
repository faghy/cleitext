import {
  BINDABLE_ATTRIBUTES,
  BINDING_SOURCE,
  boundMedia,
  boundText,
  boundUrl,
  FIELD_BLOCK,
  FIELD_ROWS_BLOCK,
  formatBoundDate,
} from '@cleitext/blocks';
import { labelText, type DynamicSourceView } from '@cleitext/shared';
import {
  InnerBlocks,
  InspectorControls,
  store as blockEditorStore,
  useBlockProps,
} from '@wordpress/block-editor';
import { registerBlockBindingsSource, registerBlockType } from '@wordpress/blocks';
import { PanelBody, Placeholder, SelectControl, TextControl } from '@wordpress/components';
import { createHigherOrderComponent } from '@wordpress/compose';
import { createReduxStore, dispatch, register, select, useSelect } from '@wordpress/data';
import { addFilter } from '@wordpress/hooks';
import type { ComponentType, ReactNode } from 'react';
import { currentServices } from './media-upload';

/**
 * Block bindings in the block editor (plugin API 1.48): a "Bind to field"
 * panel in the sidebar of paragraphs, headings, list items, buttons, images
 * and embeds; the bound values previewed in the canvas (WordPress's own
 * bindings machinery, with the `cleitext/field` source); and the Field and
 * Field rows blocks. Sources and values come from the editor services.
 */

const STORE = 'cleitext/bindings';
/** Context given by Field rows to the blocks inside: the source of its rows. */
const ROWS_CONTEXT = 'cleitext/rowsSource';

let language = 'en';
/** The editor's own words in the admin's language (English or Italian). */
const tr = (en: string, it: string) => (language.startsWith('it') ? it : en);

export function setBindingsLanguage(next: string): void {
  language = next;
}

// ---- Store ---------------------------------------------------------------------------

interface State {
  sources: DynamicSourceView[] | null;
  values: Record<string, unknown>;
}

const NO_VALUE = null;
let queued = new Set<string>();
let flushing: Promise<Record<string, unknown>> | null = null;

/** Values asked in the same moment are fetched together. */
function fetchValues(key: string): Promise<Record<string, unknown>> {
  queued.add(key);
  flushing ??= new Promise((resolve) => {
    setTimeout(() => {
      const keys = [...queued];
      queued = new Set();
      flushing = null;
      const resolveDynamic = currentServices().resolveDynamic;
      if (!resolveDynamic) {
        resolve(Object.fromEntries(keys.map((k) => [k, NO_VALUE])));
        return;
      }
      resolveDynamic(keys)
        .then((found) => resolve(Object.fromEntries(keys.map((k) => [k, found[k] ?? NO_VALUE]))))
        .catch(() => resolve(Object.fromEntries(keys.map((k) => [k, NO_VALUE]))));
    }, 30);
  });
  return flushing;
}

const store = createReduxStore(STORE, {
  reducer(
    state: State = { sources: null, values: {} },
    action: { type: string; sources?: DynamicSourceView[]; values?: Record<string, unknown> },
  ): State {
    if (action.type === 'RECEIVE_SOURCES') return { ...state, sources: action.sources ?? [] };
    if (action.type === 'RECEIVE_VALUES') {
      return { ...state, values: { ...state.values, ...action.values } };
    }
    return state;
  },
  actions: {
    receiveSources(sources: DynamicSourceView[]) {
      return { type: 'RECEIVE_SOURCES', sources };
    },
    receiveValues(values: Record<string, unknown>) {
      return { type: 'RECEIVE_VALUES', values };
    },
  },
  selectors: {
    getSources(state: State): DynamicSourceView[] | null {
      return state.sources;
    },
    getValue(state: State, key: string): unknown {
      return state.values[key];
    },
  },
  resolvers: {
    getSources:
      () =>
      async ({ dispatch: own }: { dispatch: { receiveSources(s: DynamicSourceView[]): void } }) => {
        const list = currentServices().dynamicSources;
        own.receiveSources(list ? await list().catch(() => []) : []);
      },
    getValue:
      (key: string) =>
      async ({
        dispatch: own,
      }: {
        dispatch: { receiveValues(v: Record<string, unknown>): void };
      }) => {
        if (!key || key.startsWith('row.field:')) return;
        own.receiveValues(await fetchValues(key));
      },
  },
} as never);

interface BindingsSelectors {
  getSources(): DynamicSourceView[] | null;
  getValue(key: string): unknown;
}
type Select = (store: unknown) => unknown;
const bindings = (choose: Select) => choose(STORE) as BindingsSelectors;

/** Asks every bound value again (the entry's fields changed). */
export function refreshBindings(): void {
  const actions = dispatch(STORE as never) as unknown as {
    invalidateResolutionForStoreSelector?(selector: string): void;
  };
  actions.invalidateResolutionForStoreSelector?.('getValue');
}

// ---- Sources and values --------------------------------------------------------------------

/** Every source, rows included, by id. */
function findSource(list: DynamicSourceView[] | null, id: string): DynamicSourceView | undefined {
  for (const source of list ?? []) {
    if (source.id === id) return source;
    const nested = findSource(source.rows ?? null, id);
    if (nested) return nested;
  }
  return undefined;
}

/** The first row's value of a source inside Field rows (the editor previews the first row). */
function rowValue(choose: Select, key: string, rowsSource: string | undefined): unknown {
  if (!rowsSource) return undefined;
  const rows = bindings(choose).getValue(rowsSource);
  const first = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined;
  if (!first || typeof first !== 'object') return undefined;
  if (key.startsWith('row.field:')) return first[key.slice('row.field:'.length)];
  // A related entry, term or member: what its object already holds.
  const own: Record<string, string> = {
    'entry.title': 'title',
    'entry.url': 'url',
    'term.name': 'name',
    'term.url': 'url',
    'user.name': 'name',
    'user.url': 'url',
  };
  if (own[key]) return first[own[key]];
  if (key === 'user.avatar' && typeof first.avatarUrl === 'string') return { url: first.avatarUrl };
  return undefined;
}

/** A source's value for the preview; undefined while loading, null without one. */
function previewValue(choose: Select, key: string, rowsSource: string | undefined): unknown {
  if (!key) return null;
  const fromRow = rowValue(choose, key, rowsSource);
  if (fromRow !== undefined) return fromRow;
  if (key.startsWith('row.field:')) return null;
  return bindings(choose).getValue(key);
}

const empty = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

let registeredSource = false;

/** The `cleitext/field` source of WordPress's bindings: values shown in the canvas, read-only. */
function registerSource(): void {
  if (registeredSource) return;
  registeredSource = true;
  registerBlockBindingsSource({
    name: BINDING_SOURCE,
    label: 'Field',
    usesContext: [ROWS_CONTEXT],
    getValues({
      select: choose,
      context,
      clientId,
      bindings: bound,
    }: {
      select: Select;
      context: Record<string, unknown>;
      clientId: string;
      bindings: Record<string, { args?: { key?: string } }>;
    }) {
      const editor = choose(blockEditorStore) as {
        getBlockName(id: string): string;
        getBlockAttributes(id: string): Record<string, unknown>;
      };
      const name = editor.getBlockName(clientId);
      const attributes = editor.getBlockAttributes(clientId) ?? {};
      const sources = bindings(choose).getSources();
      const spec = BINDABLE_ATTRIBUTES[name] ?? {};
      const rowsSource =
        typeof context?.[ROWS_CONTEXT] === 'string' ? (context[ROWS_CONTEXT] as string) : undefined;
      const out: Record<string, unknown> = {};
      for (const [attribute, binding] of Object.entries(bound)) {
        const key = binding?.args?.key ?? '';
        const value = previewValue(choose, key, rowsSource);
        const kind = findSource(sources, key)?.type;
        const role = spec[attribute];
        const fallback = attributes[attribute];
        if (empty(value)) {
          out[attribute] = fallback;
        } else if (role === 'media') {
          const media = boundMedia(value);
          out[attribute] = media
            ? attribute === 'id'
              ? (media.id ?? fallback)
              : media.url
            : fallback;
        } else if (role === 'url') {
          out[attribute] = boundUrl(value) ?? fallback;
        } else if (kind === 'richtext' && typeof value === 'string') {
          out[attribute] = value
            .replace(/<\/(p|li|h[1-6]|blockquote)>\s*(?=<)/gi, '</$1><br>')
            .replace(/<\/?(p|ul|ol|li|h[1-6]|blockquote)>/gi, '')
            .replace(/(<br>\s*)+$/i, '');
        } else {
          out[attribute] = boundText({ value, ...(kind ? { kind } : {}) }, language) || fallback;
        }
      }
      return out;
    },
    canUserEditValue: () => false,
  } as never);
}

// ---- Choosing a source -------------------------------------------------------------------

type Role = 'text' | 'url' | 'media' | 'any' | 'rows';

const ROLE_KINDS: Record<Exclude<Role, 'any'>, (source: DynamicSourceView) => boolean> = {
  text: (s) => s.type !== 'media' && s.type !== 'object',
  url: (s) => ['url', 'link', 'entry', 'term', 'user', 'file', 'media'].includes(s.type),
  media: (s) => s.type === 'media' || s.type === 'file',
  rows: (s) => s.type === 'list' && !!s.rowKind,
};

/** The sources offered for a role: the site's, and inside Field rows its row's fields first. */
function useChoices(role: Role, rowsSource: string | undefined) {
  return useSelect(
    (choose: Select) => {
      const sources = bindings(choose).getSources();
      const fits = (s: DynamicSourceView) => (role === 'any' ? true : ROLE_KINDS[role](s));
      const rows = rowsSource ? (findSource(sources, rowsSource)?.rows ?? []) : [];
      return {
        loaded: sources !== null,
        rows: rows.filter(fits),
        sources: (sources ?? []).filter(fits),
      };
    },
    [role, rowsSource],
  );
}

function SourceSelect({
  label,
  value,
  role,
  rowsSource,
  onChange,
  help,
}: {
  label: string;
  value: string;
  role: Role;
  rowsSource: string | undefined;
  onChange: (key: string) => void;
  help?: string;
}) {
  const { loaded, rows, sources } = useChoices(role, rowsSource);
  const groups = new Map<string, DynamicSourceView[]>();
  for (const source of sources) {
    const heading = labelText(source.group, language) || tr('Other', 'Altro');
    groups.set(heading, [...(groups.get(heading) ?? []), source]);
  }
  return (
    <SelectControl
      label={label}
      help={help}
      value={value}
      onChange={onChange}
      disabled={!loaded}
      __next40pxDefaultSize
      __nextHasNoMarginBottom
    >
      <option value="">{loaded ? tr('— Not bound —', '— Non collegato —') : '…'}</option>
      {rows.length > 0 && (
        <optgroup label={tr('This row', 'Questa riga')}>
          {rows.map((source) => (
            <option key={source.id} value={source.id}>
              {labelText(source.label, language)}
            </option>
          ))}
        </optgroup>
      )}
      {[...groups].map(([heading, list]) => (
        <optgroup key={heading} label={heading}>
          {list.map((source) => (
            <option key={source.id} value={source.id}>
              {labelText(source.label, language)}
            </option>
          ))}
        </optgroup>
      ))}
      {/* A source no longer offered stays selectable, so it can be removed. */}
      {value && !sources.some((s) => s.id === value) && !rows.some((s) => s.id === value) && (
        <option value={value}>{value}</option>
      )}
    </SelectControl>
  );
}

/** The nearest Field rows block around a block: the source of its rows. */
function useRowsSource(clientId: string): string | undefined {
  return useSelect(
    (choose: Select) => {
      const editor = choose(blockEditorStore) as {
        getBlockParentsByBlockName(id: string, name: string): string[];
        getBlockAttributes(id: string): Record<string, unknown> | null;
      };
      const parents = editor.getBlockParentsByBlockName(clientId, FIELD_ROWS_BLOCK);
      const nearest = parents[parents.length - 1];
      const source = nearest ? editor.getBlockAttributes(nearest)?.source : undefined;
      return typeof source === 'string' && source ? source : undefined;
    },
    [clientId],
  );
}

// ---- The "Bind to field" panel -------------------------------------------------------------

interface BlockEditProps {
  name: string;
  clientId: string;
  isSelected: boolean;
  attributes: Record<string, unknown>;
  setAttributes(attributes: Record<string, unknown>): void;
  context?: Record<string, unknown>;
}

/** The bindable attributes of a block, as people name them; images bind `id` and `url` together. */
function controlsOf(name: string): { label: string; attributes: string[]; role: Role }[] {
  const spec = BINDABLE_ATTRIBUTES[name] ?? {};
  const out: { label: string; attributes: string[]; role: Role }[] = [];
  const names: Record<string, string> = {
    content: tr('Text', 'Testo'),
    text: tr('Text', 'Testo'),
    url: name === 'core/embed' ? tr('Address', 'Indirizzo') : tr('Link', 'Link'),
    href: tr('Link', 'Link'),
    alt: tr('Alternative text', 'Testo alternativo'),
    caption: tr('Caption', 'Didascalia'),
  };
  if (spec.id === 'media')
    out.push({ label: tr('Image', 'Immagine'), attributes: ['id', 'url'], role: 'media' });
  for (const [attribute, role] of Object.entries(spec)) {
    if (role === 'media') continue;
    out.push({ label: names[attribute] ?? attribute, attributes: [attribute], role });
  }
  return out;
}

function BindPanel(props: BlockEditProps) {
  const rowsSource = useRowsSource(props.clientId);
  const metadata = (props.attributes.metadata ?? {}) as {
    bindings?: Record<string, { source: string; args?: { key?: string } }>;
  };
  const current = metadata.bindings ?? {};
  const keyOf = (attribute: string) =>
    current[attribute]?.source === BINDING_SOURCE ? (current[attribute]?.args?.key ?? '') : '';
  const bind = (attributes: string[], key: string) => {
    const next = { ...current };
    for (const attribute of attributes) {
      if (key) next[attribute] = { source: BINDING_SOURCE, args: { key } };
      else delete next[attribute];
    }
    const rest = { ...metadata };
    delete rest.bindings;
    props.setAttributes({
      metadata: Object.keys(next).length > 0 ? { ...rest, bindings: next } : rest,
    });
  };
  return (
    <PanelBody
      title={tr('Bind to field', 'Collega a un campo')}
      initialOpen={Object.keys(current).length > 0}
    >
      <p style={{ fontSize: 12, color: '#757575', marginTop: 0 }}>
        {tr(
          'Show a field of this page, an option or the site’s data instead of what you typed, which stays as the text shown when the field is empty.',
          'Mostra un campo della pagina, un’opzione o un dato del sito al posto di ciò che hai scritto, che resta come testo mostrato quando il campo è vuoto.',
        )}
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        {controlsOf(props.name).map((control) => (
          <SourceSelect
            key={control.attributes.join(',')}
            label={control.label}
            role={control.role}
            rowsSource={rowsSource}
            value={keyOf(control.attributes[0]!)}
            onChange={(key) => bind(control.attributes, key)}
          />
        ))}
      </div>
    </PanelBody>
  );
}

const withBindPanel = createHigherOrderComponent(
  (BlockEdit: ComponentType<BlockEditProps>) => (props: BlockEditProps) => {
    if (!BINDABLE_ATTRIBUTES[props.name] || !props.isSelected || !currentServices().dynamicSources)
      return <BlockEdit {...props} />;
    return (
      <>
        <BlockEdit {...props} />
        <InspectorControls>
          <BindPanel {...props} />
        </InspectorControls>
      </>
    );
  },
  'withCleitextBindPanel',
);

// ---- Field and Field rows ------------------------------------------------------------------

/** A value as the Field block shows it in the canvas (the site shows the same, from the server). */
function FieldPreview({ value, kind }: { value: unknown; kind: string | undefined }): ReactNode {
  if (Array.isArray(value)) {
    const linked = value.filter((v) => v && typeof v === 'object' && 'url' in (v as object));
    if (linked.length > 0) {
      return (
        <ul style={{ margin: 0 }}>
          {linked.map((item, i) => (
            <li key={i}>
              <a href="#" onClick={(e) => e.preventDefault()}>
                {boundText({ value: item }, language)}
              </a>
            </li>
          ))}
        </ul>
      );
    }
  }
  const media = kind === 'media' || kind === 'file' ? boundMedia(value) : undefined;
  if (media)
    return <img src={media.url} alt={media.alt} style={{ maxWidth: '100%', height: 'auto' }} />;
  if (kind === 'richtext' && typeof value === 'string') {
    // Rich text comes cleaned from the server (sanitizeRichText).
    return <div dangerouslySetInnerHTML={{ __html: value }} />;
  }
  const url = value && typeof value === 'object' ? boundUrl(value) : undefined;
  const text =
    kind === 'date' && typeof value === 'string'
      ? formatBoundDate(value, language)
      : boundText({ value, ...(kind ? { kind } : {}) }, language);
  return url ? (
    <a href="#" onClick={(e) => e.preventDefault()}>
      {text}
    </a>
  ) : (
    text
  );
}

function FieldEdit({ attributes, setAttributes, clientId }: BlockEditProps) {
  const blockProps = useBlockProps({ className: 'wp-block-cleitext-field' });
  const rowsSource = useRowsSource(clientId);
  const source = typeof attributes.source === 'string' ? attributes.source : '';
  const { value, kind } = useSelect(
    (choose: Select) => ({
      value: previewValue(choose, source, rowsSource),
      kind: findSource(bindings(choose).getSources(), source)?.type,
    }),
    [source, rowsSource],
  );
  const label = typeof attributes.label === 'string' ? attributes.label : '';
  const fallback = typeof attributes.fallback === 'string' ? attributes.fallback : '';
  const available = Boolean(currentServices().dynamicSources);
  const settings = (
    <InspectorControls>
      <PanelBody title={tr('Field', 'Campo')}>
        <div style={{ display: 'grid', gap: 12 }}>
          <SourceSelect
            label={tr('Show', 'Mostra')}
            role="any"
            rowsSource={rowsSource}
            value={source}
            onChange={(key) => setAttributes({ source: key || undefined })}
          />
          <TextControl
            label={tr('Label before the value', 'Etichetta prima del valore')}
            value={label}
            onChange={(v: string) => setAttributes({ label: v || undefined })}
            __next40pxDefaultSize
            __nextHasNoMarginBottom
          />
          <TextControl
            label={tr('Text when it is empty', 'Testo quando è vuoto')}
            value={fallback}
            onChange={(v: string) => setAttributes({ fallback: v || undefined })}
            __next40pxDefaultSize
            __nextHasNoMarginBottom
          />
          <SelectControl
            label={tr('Element', 'Elemento')}
            value={typeof attributes.tagName === 'string' ? attributes.tagName : 'p'}
            options={['p', 'div', 'span', 'h2', 'h3', 'h4', 'h5', 'h6'].map((tag) => ({
              value: tag,
              label: tag === 'p' ? tr('Paragraph', 'Paragrafo') : tag,
            }))}
            onChange={(v: string) => setAttributes({ tagName: v === 'p' ? undefined : v })}
            __next40pxDefaultSize
            __nextHasNoMarginBottom
          />
        </div>
      </PanelBody>
    </InspectorControls>
  );
  if (!source || !available) {
    return (
      <div {...blockProps}>
        {available && settings}
        <Placeholder
          icon="database"
          label={tr('Field', 'Campo')}
          instructions={
            available
              ? tr(
                  'Choose the field to show in the block settings.',
                  'Scegli il campo da mostrare nelle impostazioni del blocco.',
                )
              : tr(
                  'Fields are shown on the site: they cannot be chosen here.',
                  'I campi si vedono sul sito: qui non si possono scegliere.',
                )
          }
        />
      </div>
    );
  }
  return (
    <div {...blockProps}>
      {settings}
      {label && <span className="wp-block-cleitext-field__label">{label} </span>}
      {value === undefined ? (
        <span style={{ opacity: 0.6 }}>…</span>
      ) : empty(value) ? (
        <span style={{ opacity: 0.6 }}>{fallback || tr('(empty)', '(vuoto)')}</span>
      ) : (
        <FieldPreview value={value} kind={kind} />
      )}
    </div>
  );
}

function FieldRowsEdit({ attributes, setAttributes }: BlockEditProps) {
  const blockProps = useBlockProps({ className: 'wp-block-cleitext-field-rows' });
  const source = typeof attributes.source === 'string' ? attributes.source : '';
  const { rows, label } = useSelect(
    (choose: Select) => {
      const value = source ? bindings(choose).getValue(source) : undefined;
      const found = findSource(bindings(choose).getSources(), source);
      return {
        rows: Array.isArray(value) ? value.length : value === undefined ? null : 0,
        label: found ? labelText(found.label, language) : source,
      };
    },
    [source],
  );
  const limit = typeof attributes.limit === 'number' ? attributes.limit : undefined;
  return (
    <div {...blockProps}>
      {currentServices().dynamicSources && (
        <InspectorControls>
          <PanelBody title={tr('Field rows', 'Righe di un campo')}>
            <div style={{ display: 'grid', gap: 12 }}>
              <SourceSelect
                label={tr('Repeat for each row of', 'Ripeti per ogni riga di')}
                help={tr(
                  'A list of the page or of an options page, or several related entries, terms or people.',
                  'Una lista della pagina o di una pagina di opzioni, oppure più voci, termini o persone collegati.',
                )}
                role="rows"
                rowsSource={undefined}
                value={source}
                onChange={(key) => setAttributes({ source: key || undefined })}
              />
              <TextControl
                type="number"
                label={tr('At most', 'Al massimo')}
                value={limit === undefined ? '' : String(limit)}
                min={1}
                max={200}
                onChange={(v: string) =>
                  setAttributes({
                    limit: v === '' ? undefined : Math.min(200, Math.max(1, Number(v))),
                  })
                }
                __next40pxDefaultSize
                __nextHasNoMarginBottom
              />
              <TextControl
                label={tr('Text when there are no rows', 'Testo quando non ci sono righe')}
                value={typeof attributes.emptyText === 'string' ? attributes.emptyText : ''}
                onChange={(v: string) => setAttributes({ emptyText: v || undefined })}
                __next40pxDefaultSize
                __nextHasNoMarginBottom
              />
              <SelectControl
                label={tr('Layout', 'Disposizione')}
                value={attributes.layout === 'grid' ? 'grid' : 'stack'}
                options={[
                  { value: 'stack', label: tr('One below the other', 'Una sotto l’altra') },
                  { value: 'grid', label: tr('Grid', 'Griglia') },
                ]}
                onChange={(v: string) =>
                  setAttributes({ layout: v === 'grid' ? 'grid' : undefined })
                }
                __next40pxDefaultSize
                __nextHasNoMarginBottom
              />
              {attributes.layout === 'grid' && (
                <TextControl
                  type="number"
                  label={tr('Columns', 'Colonne')}
                  value={typeof attributes.columns === 'number' ? String(attributes.columns) : '3'}
                  min={1}
                  max={6}
                  onChange={(v: string) =>
                    setAttributes({ columns: Math.min(6, Math.max(1, Number(v) || 3)) })
                  }
                  __next40pxDefaultSize
                  __nextHasNoMarginBottom
                />
              )}
            </div>
          </PanelBody>
        </InspectorControls>
      )}
      <p style={{ fontSize: 12, color: '#6d28d9', margin: '0 0 6px' }}>
        {source
          ? rows === null
            ? '…'
            : tr(
                `Repeated for each row of “${label}” (${rows} now): the blocks below show the first.`,
                `Ripetuto per ogni riga di “${label}” (${rows} ora): i blocchi qui sotto mostrano la prima.`,
              )
          : tr(
              'Choose in the block settings what to repeat these blocks for.',
              'Scegli nelle impostazioni del blocco per cosa ripetere questi blocchi.',
            )}
      </p>
      <div style={{ outline: '1px dashed #c4b5fd', outlineOffset: 4 }}>
        <InnerBlocks />
      </div>
    </div>
  );
}

let registered = false;

/** The bindings source, the panel and the two blocks (once). */
export function registerBindings(): void {
  if (registered) return;
  registered = true;
  if (!(select as unknown as (name: string) => unknown)(STORE)) register(store);
  registerSource();
  addFilter('editor.BlockEdit', 'cleitext/bind-to-field', withBindPanel);
  registerBlockType(FIELD_BLOCK, {
    apiVersion: 3,
    title: 'Field',
    description: 'A field of the page, an option or the site’s data, shown with its format.',
    icon: 'database',
    category: 'text',
    keywords: ['field', 'campo', 'acf', 'custom field', 'option'],
    attributes: {
      source: { type: 'string' },
      label: { type: 'string' },
      fallback: { type: 'string' },
      tagName: { type: 'string' },
      textAlign: { type: 'string' },
    },
    usesContext: [ROWS_CONTEXT],
    supports: { html: false, reusable: false, anchor: true, className: true },
    edit: FieldEdit,
    save: () => null,
  } as never);
  registerBlockType(FIELD_ROWS_BLOCK, {
    apiVersion: 3,
    title: 'Field rows',
    description: 'Its blocks repeated for each row of a list, or each related entry.',
    icon: 'list-view',
    category: 'design',
    keywords: ['repeater', 'rows', 'righe', 'ripetitore', 'loop'],
    attributes: {
      source: { type: 'string' },
      limit: { type: 'number' },
      emptyText: { type: 'string' },
      layout: { type: 'string' },
      columns: { type: 'number' },
    },
    providesContext: { [ROWS_CONTEXT]: 'source' },
    supports: { html: false, reusable: false, anchor: true, className: true },
    edit: FieldRowsEdit,
    save: () => <InnerBlocks.Content />,
  } as never);
}

/** For the editor's settings: the attributes WordPress previews from bindings. */
export const BINDINGS_SUPPORTED_ATTRIBUTES: Record<string, string[]> = Object.fromEntries(
  Object.entries(BINDABLE_ATTRIBUTES).map(([name, spec]) => [name, Object.keys(spec)]),
);
