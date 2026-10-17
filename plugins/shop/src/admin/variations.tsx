import { useT } from '@cleitext/admin-sdk';
import { useState } from 'react';
import type { AttributeView } from './shared';
import type { Texts } from '../texts';
import { Translations, type Site } from './translations';

/** A product's attribute: a shared one (with some of its values) or its own. */
export interface AttributeRow {
  attributeId: string | null;
  name: string;
  values: string[];
  visible: boolean;
  variation: boolean;
  /** Own attributes: name and values in other languages (`name`, `value:<value>`). */
  translations?: Texts;
}

/** A variation as the form edits it: amounts as typed. */
export interface VariationRow {
  id?: string;
  attributes: Record<string, string>;
  enabled: boolean;
  sku: string;
  regularPrice: string;
  salePrice: string;
  stock: string;
  imageId: string | null;
  /** Fields the form does not show, kept as they are. */
  rest: Record<string, unknown>;
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Key of an attribute in variations: the shared attribute's slug, or the slug of the name. */
export function attributeKey(row: AttributeRow, shared: AttributeView[]): string {
  return row.attributeId
    ? (shared.find((a) => a.id === row.attributeId)?.slug ?? '')
    : slugify(row.name);
}

/** Values of an attribute, as `{ slug, name }`. */
export function attributeValues(
  row: AttributeRow,
  shared: AttributeView[],
): { slug: string; name: string }[] {
  if (!row.attributeId) return row.values.map((v) => ({ slug: v, name: v }));
  const attribute = shared.find((a) => a.id === row.attributeId);
  return (attribute?.values ?? [])
    .filter((v) => row.values.includes(v.slug))
    .map((v) => ({ slug: v.slug, name: v.name }));
}

const MAX_COMBINATIONS = 100;

/** Every combination of the values of the attributes used for variations. */
export function combinations(
  rows: AttributeRow[],
  shared: AttributeView[],
): Record<string, string>[] {
  let result: Record<string, string>[] = [{}];
  for (const row of rows.filter((r) => r.variation)) {
    const key = attributeKey(row, shared);
    const values = attributeValues(row, shared);
    if (!key || values.length === 0) continue;
    result = result.flatMap((combo) => values.map((v) => ({ ...combo, [key]: v.slug })));
    if (result.length > MAX_COMBINATIONS) return result.slice(0, MAX_COMBINATIONS);
  }
  return result.filter((combo) => Object.keys(combo).length > 0);
}

const same = (a: Record<string, string>, b: Record<string, string>) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([k, v]) => b[k] === v);

export function AttributesEditor({
  site,
  rows,
  shared,
  variable,
  onChange,
}: {
  site: Site;
  rows: AttributeRow[];
  shared: AttributeView[];
  variable: boolean;
  onChange: (rows: AttributeRow[]) => void;
}) {
  const { t } = useT();
  const set = (index: number, changes: Partial<AttributeRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));
  const used = new Set(rows.flatMap((r) => (r.attributeId ? [r.attributeId] : [])));
  return (
    <div className="sh-stack">
      {rows.map((row, index) => {
        const attribute = row.attributeId
          ? shared.find((a) => a.id === row.attributeId)
          : undefined;
        return (
          <div key={index} className="sh-card sh-stack">
            <div className="sh-row sh-between">
              {attribute ? (
                <strong>{attribute.name}</strong>
              ) : (
                <label className="sh-field">
                  <span>{t('Name')}</span>
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => set(index, { name: e.target.value })}
                  />
                </label>
              )}
              <button
                type="button"
                className="sh-link sh-btn-danger"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                {t('Remove')}
              </button>
            </div>
            {attribute ? (
              <fieldset className="sh-chips" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="sh-sr">{t('Values')}</legend>
                {attribute.values.map((value) => (
                  <label key={value.id} className="sh-chip">
                    <input
                      type="checkbox"
                      checked={row.values.includes(value.slug)}
                      onChange={(e) =>
                        set(index, {
                          values: e.target.checked
                            ? [...row.values, value.slug]
                            : row.values.filter((v) => v !== value.slug),
                        })
                      }
                    />
                    {value.color && (
                      <span className="sh-swatch" style={{ background: value.color }} />
                    )}
                    {value.name}
                  </label>
                ))}
                <button
                  type="button"
                  className="sh-link sh-small"
                  onClick={() => set(index, { values: attribute.values.map((v) => v.slug) })}
                >
                  {t('Select all')}
                </button>
              </fieldset>
            ) : (
              <>
                <ValuesInput values={row.values} onChange={(values) => set(index, { values })} />
                <Translations
                  site={site}
                  value={row.translations}
                  onChange={(translations) => set(index, { translations })}
                  fields={[
                    { key: 'name', label: t('Name'), original: row.name, maxLength: 120 },
                    ...row.values.map((v) => ({
                      key: `value:${v}`,
                      label: t('Value: {value}', { value: v }),
                      original: v,
                      maxLength: 120,
                    })),
                  ]}
                />
              </>
            )}
            <div className="sh-row">
              <label className="sh-check">
                <input
                  type="checkbox"
                  checked={row.visible}
                  onChange={(e) => set(index, { visible: e.target.checked })}
                />
                {t('Shown in the product details')}
              </label>
              {variable && (
                <label className="sh-check">
                  <input
                    type="checkbox"
                    checked={row.variation}
                    onChange={(e) => set(index, { variation: e.target.checked })}
                  />
                  {t('Used for variations')}
                </label>
              )}
            </div>
          </div>
        );
      })}
      <div className="sh-row">
        <select
          aria-label={t('Add an attribute')}
          value=""
          onChange={(e) => {
            const value = e.target.value;
            if (!value) return;
            onChange([
              ...rows,
              value === 'custom'
                ? { attributeId: null, name: '', values: [], visible: true, variation: variable }
                : { attributeId: value, name: '', values: [], visible: true, variation: variable },
            ]);
          }}
        >
          <option value="">{t('Add an attribute…')}</option>
          {shared
            .filter((a) => !used.has(a.id))
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          <option value="custom">{t('Attribute of this product only')}</option>
        </select>
      </div>
    </div>
  );
}

/** Values of a product's own attribute, typed as "S | M | L". */
function ValuesInput({
  values,
  onChange,
}: {
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const { t } = useT();
  const [text, setText] = useState(values.join(' | '));
  const parse = (value: string) => [
    ...new Set(
      value
        .split('|')
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
  return (
    <div className="sh-field">
      <label className="sh-field">
        <span>{t('Values')}</span>
        <input
          type="text"
          value={text}
          placeholder="S | M | L"
          onChange={(e) => {
            setText(e.target.value);
            onChange(parse(e.target.value));
          }}
          onBlur={() => setText(parse(text).join(' | '))}
        />
      </label>
      <small>{t('Separate the values with |')}</small>
    </div>
  );
}

export function VariationsEditor({
  rows,
  attributes,
  shared,
  images,
  onChange,
}: {
  rows: VariationRow[];
  attributes: AttributeRow[];
  shared: AttributeView[];
  images: { id: string; url: string }[];
  onChange: (rows: VariationRow[]) => void;
}) {
  const { t } = useT();
  const [all, setAll] = useState({ regularPrice: '', stock: '' });
  const keys = attributes
    .filter((a) => a.variation)
    .map((a) => ({ key: attributeKey(a, shared), row: a }));
  const label = (combo: Record<string, string>) =>
    keys
      .map(({ key, row }) => {
        const value = combo[key];
        if (!value)
          return `${t('Any')} ${row.attributeId ? shared.find((s) => s.id === row.attributeId)?.name : row.name}`;
        return attributeValues(row, shared).find((v) => v.slug === value)?.name ?? value;
      })
      .join(' · ');
  const set = (index: number, changes: Partial<VariationRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));

  const generate = () => {
    const combos = combinations(attributes, shared);
    const kept = combos.map(
      (combo) =>
        rows.find((r) => same(r.attributes, combo)) ?? {
          attributes: combo,
          enabled: true,
          sku: '',
          regularPrice: '',
          salePrice: '',
          stock: '',
          imageId: null,
          rest: {},
        },
    );
    const lost = rows.filter((r) => !combos.some((c) => same(r.attributes, c))).length;
    if (
      lost > 0 &&
      !window.confirm(
        t(
          '{count} variations do not match the attributes any more and will be removed. Continue?',
          { count: lost },
        ),
      )
    )
      return;
    onChange(kept);
  };

  return (
    <div className="sh-stack">
      <div className="sh-row">
        <button type="button" className="sh-btn" onClick={generate} disabled={keys.length === 0}>
          {t('Generate variations')}
        </button>
        {keys.length === 0 && (
          <span className="sh-muted">
            {t('Mark at least one attribute as used for variations.')}
          </span>
        )}
      </div>
      {rows.length > 0 && (
        <>
          <div className="sh-row">
            <span className="sh-muted">{t('For all:')}</span>
            <input
              type="text"
              inputMode="decimal"
              aria-label={t('Price for all variations')}
              placeholder={t('Price')}
              value={all.regularPrice}
              style={{ width: '7rem' }}
              onChange={(e) => setAll({ ...all, regularPrice: e.target.value })}
            />
            <input
              type="number"
              aria-label={t('Stock for all variations')}
              placeholder={t('Stock')}
              value={all.stock}
              style={{ width: '6rem' }}
              onChange={(e) => setAll({ ...all, stock: e.target.value })}
            />
            <button
              type="button"
              className="sh-btn"
              onClick={() =>
                onChange(
                  rows.map((r) => ({
                    ...r,
                    ...(all.regularPrice ? { regularPrice: all.regularPrice } : {}),
                    ...(all.stock ? { stock: all.stock } : {}),
                  })),
                )
              }
            >
              {t('Apply')}
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="sh-table">
              <thead>
                <tr>
                  <th>{t('Variation')}</th>
                  <th>{t('Active')}</th>
                  <th>{t('Code')}</th>
                  <th>{t('Price')}</th>
                  <th>{t('Sale price')}</th>
                  <th>{t('Stock')}</th>
                  <th>{t('Image')}</th>
                  <th>
                    <span className="sh-sr">{t('Remove')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id ?? `new-${index}`} style={{ cursor: 'default' }}>
                    <td>{label(row.attributes)}</td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={t('Active')}
                        checked={row.enabled}
                        onChange={(e) => set(index, { enabled: e.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        aria-label={t('Code')}
                        value={row.sku}
                        style={{ width: '8rem' }}
                        onChange={(e) => set(index, { sku: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={t('Price')}
                        value={row.regularPrice}
                        style={{ width: '6.5rem' }}
                        onChange={(e) => set(index, { regularPrice: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={t('Sale price')}
                        value={row.salePrice}
                        style={{ width: '6.5rem' }}
                        onChange={(e) => set(index, { salePrice: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        aria-label={t('Stock')}
                        placeholder="—"
                        value={row.stock}
                        style={{ width: '5rem' }}
                        onChange={(e) => set(index, { stock: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        aria-label={t('Image')}
                        value={row.imageId ?? ''}
                        onChange={(e) => set(index, { imageId: e.target.value || null })}
                      >
                        <option value="">{t('The product’s')}</option>
                        {images.map((image, i) => (
                          <option key={image.id} value={image.id}>
                            {t('Image {n}', { n: i + 1 })}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="sh-link sh-btn-danger"
                        aria-label={t('Remove')}
                        onClick={() => onChange(rows.filter((_, i) => i !== index))}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sh-small sh-muted">
            {t(
              'An empty stock means it is not counted; an empty price, that the variation cannot be bought.',
            )}
          </p>
        </>
      )}
    </div>
  );
}
