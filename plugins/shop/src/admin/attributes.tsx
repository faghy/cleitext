import { Alert, errorMessage, useT, type AdminPageProps } from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { formatMoney, useSetup, type AttributeView, type PricingRules } from './shared';
import { pricesFromCost } from '../pricing';
import { CSS } from './styles';

/** Shop → Attributes: colour, size… shared by products, with their values. */
export function AttributesPage({ api }: AdminPageProps) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['shop', 'attributes'],
    queryFn: () => api<AttributeView[]>('GET', '/attributes'),
  });
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['shop', 'attributes'] });
    await queryClient.invalidateQueries({ queryKey: ['shop', 'setup'] });
  };
  const remove = useMutation({
    mutationFn: (id: string) => api('DELETE', `/attributes/${id}`),
    onSuccess: refresh,
  });
  return (
    <div className="sh sh-stack">
      <style>{CSS}</style>
      <div className="sh-row sh-between">
        <h1>{t('Attributes')}</h1>
        <button type="button" className="sh-btn sh-btn-primary" onClick={() => setEditing('new')}>
          {t('Add attribute')}
        </button>
      </div>
      <p className="sh-muted">
        {t(
          'Attributes describe products (colour, size, material) and make their variations. Products can also have attributes of their own.',
        )}
      </p>
      {editing === 'new' && (
        <AttributeEditor
          api={api}
          onDone={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
      {remove.error && <Alert>{errorMessage(remove.error)}</Alert>}
      {list.data?.map((attribute) =>
        editing === attribute.id ? (
          <AttributeEditor
            key={attribute.id}
            api={api}
            attribute={attribute}
            onDone={async () => {
              setEditing(null);
              await refresh();
            }}
          />
        ) : (
          <div key={attribute.id} className="sh-card sh-row sh-between">
            <div>
              <strong>{attribute.name}</strong>{' '}
              <span className="sh-muted sh-small">({attribute.slug})</span>
              <div className="sh-chips" style={{ marginTop: '.35rem' }}>
                {attribute.values.map((v) => (
                  <span key={v.id} className="sh-chip">
                    {v.color && <span className="sh-swatch" style={{ background: v.color }} />}
                    {v.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="sh-row">
              <button type="button" className="sh-btn" onClick={() => setEditing(attribute.id)}>
                {t('Edit')}
              </button>
              <button
                type="button"
                className="sh-btn sh-btn-danger"
                onClick={() => {
                  if (
                    window.confirm(
                      t('Delete "{name}"? Products lose it and its variations stop matching.', {
                        name: attribute.name,
                      }),
                    )
                  )
                    remove.mutate(attribute.id);
                }}
              >
                {t('Delete')}
              </button>
            </div>
          </div>
        ),
      )}
      {list.data?.length === 0 && editing !== 'new' && (
        <p className="sh-muted">{t('Nothing here yet.')}</p>
      )}
    </div>
  );
}

function AttributeEditor({
  api,
  attribute,
  onDone,
}: {
  api: AdminPageProps['api'];
  attribute?: AttributeView;
  onDone: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(attribute?.name ?? '');
  const [kind, setKind] = useState<'select' | 'color'>(attribute?.kind ?? 'select');
  const [sort, setSort] = useState<'position' | 'name'>(attribute?.sort ?? 'position');
  const [values, setValues] = useState<{ id?: string; name: string; color: string | null }[]>(
    attribute?.values.map((v) => ({ id: v.id, name: v.name, color: v.color })) ?? [
      { name: '', color: null },
    ],
  );
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        kind,
        sort,
        values: values
          .filter((v) => v.name.trim())
          .map((v) => ({ ...v, color: kind === 'color' ? (v.color ?? '#000000') : null })),
      };
      return attribute
        ? api('PUT', `/attributes/${attribute.id}`, body)
        : api('POST', '/attributes', body);
    },
    onSuccess: onDone,
  });
  const setValue = (index: number, changes: Partial<(typeof values)[number]>) =>
    setValues(values.map((v, i) => (i === index ? { ...v, ...changes } : v)));
  return (
    <form
      className="sh-card sh-stack"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="sh-grid">
        <label className="sh-field">
          <span>{t('Name')}</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="sh-field">
          <span>{t('Shown as')}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as 'select' | 'color')}>
            <option value="select">{t('A list')}</option>
            <option value="color">{t('Colour swatches')}</option>
          </select>
        </label>
        <label className="sh-field">
          <span>{t('Order of the values')}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as 'position' | 'name')}>
            <option value="position">{t('As listed here')}</option>
            <option value="name">{t('By name')}</option>
          </select>
        </label>
      </div>
      <fieldset className="sh-stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="sh-field">
          <span>{t('Values')}</span>
        </legend>
        {values.map((value, index) => (
          <div key={value.id ?? `n${index}`} className="sh-row">
            {kind === 'color' && (
              <input
                type="color"
                aria-label={t('Colour of {name}', { name: value.name || String(index + 1) })}
                value={value.color ?? '#000000'}
                onChange={(e) => setValue(index, { color: e.target.value })}
              />
            )}
            <input
              type="text"
              aria-label={t('Value {n}', { n: index + 1 })}
              value={value.name}
              onChange={(e) => setValue(index, { name: e.target.value })}
            />
            <button
              type="button"
              className="sh-btn"
              aria-label={t('Move up')}
              disabled={index === 0}
              onClick={() => {
                const next = [...values];
                [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                setValues(next);
              }}
            >
              ↑
            </button>
            <button
              type="button"
              className="sh-link sh-btn-danger"
              aria-label={t('Remove')}
              onClick={() => setValues(values.filter((_, i) => i !== index))}
            >
              ✕
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            className="sh-btn"
            onClick={() => setValues([...values, { name: '', color: null }])}
          >
            {t('Add value')}
          </button>
        </div>
      </fieldset>
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      <div className="sh-row">
        <button
          type="submit"
          className="sh-btn sh-btn-primary"
          disabled={!name.trim() || save.isPending}
        >
          {t('Save')}
        </button>
        <button type="button" className="sh-btn" onClick={onDone}>
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
}

/** Shop → Pricing: the three prices from the cost, by bands of cost (Cleito's rules, yours to set). */
export function PricingPage({ api, user }: AdminPageProps) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const setup = useSetup(api);
  const [rules, setRules] = useState<PricingRules | null>(null);
  const [sample, setSample] = useState('20');
  const current = rules ?? setup.data?.pricing ?? null;
  const save = useMutation({
    mutationFn: () => api('PUT', '/pricing', current),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop', 'setup'] }),
  });
  if (!current) return <p className="sh-muted">{t('Loading…')}</p>;
  const set = (changes: Partial<PricingRules>) => {
    save.reset();
    setRules({ ...current, ...changes });
  };
  const currency = setup.data?.settings.currency ?? 'EUR';
  const preview =
    Number(sample.replace(',', '.')) > 0 && current.tiers.length > 0
      ? pricesFromCost(Number(sample.replace(',', '.')), current)
      : null;
  const number = (value: string) => (value.trim() === '' ? 0 : Number(value.replace(',', '.')));
  return (
    <div className="sh sh-stack">
      <style>{CSS}</style>
      <h1>{t('Pricing rules')}</h1>
      <p className="sh-muted">
        {t(
          'In the product form, type what the supplier asks: the cost, the list price and the selling price are computed with these rules.',
        )}
      </p>
      <div className="sh-card sh-stack">
        <div className="sh-grid">
          <div className="sh-field">
            <label className="sh-field">
              <span>{t('Added to the supplier’s price (%)')}</span>
              <input
                type="number"
                step="0.1"
                min={0}
                value={current.surcharge}
                onChange={(e) => set({ surcharge: number(e.target.value) })}
              />
            </label>
            <small>{t('Transport and fees, e.g. 3.2')}</small>
          </div>
          <label className="sh-field">
            <span>{t('Selling price below the list price (%)')}</span>
            <input
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={current.discount}
              onChange={(e) => set({ discount: number(e.target.value) })}
            />
          </label>
          <label className="sh-field">
            <span>{t('Rounding')}</span>
            <select
              value={current.rounding}
              onChange={(e) => set({ rounding: e.target.value as PricingRules['rounding'] })}
            >
              <option value="cent">{t('To the cent')}</option>
              <option value="ten">{t('To ten cents')}</option>
              <option value="unit">{t('To the unit')}</option>
              <option value="ninety">{t('Ending in .90')}</option>
            </select>
          </label>
        </div>
        <table className="sh-table" style={{ maxWidth: '32rem' }}>
          <thead>
            <tr>
              <th>{t('Cost up to')}</th>
              <th>{t('Markup (%)')}</th>
              <th>
                <span className="sh-sr">{t('Remove')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {current.tiers.map((tier, index) => (
              <tr key={index} style={{ cursor: 'default' }}>
                <td>
                  <input
                    type="number"
                    min={0}
                    aria-label={t('Cost up to')}
                    placeholder={t('and above')}
                    value={tier.upTo ?? ''}
                    onChange={(e) =>
                      set({
                        tiers: current.tiers.map((x, i) =>
                          i === index
                            ? { ...x, upTo: e.target.value === '' ? null : number(e.target.value) }
                            : x,
                        ),
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    aria-label={t('Markup (%)')}
                    value={tier.markup}
                    onChange={(e) =>
                      set({
                        tiers: current.tiers.map((x, i) =>
                          i === index ? { ...x, markup: number(e.target.value) } : x,
                        ),
                      })
                    }
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="sh-link sh-btn-danger"
                    aria-label={t('Remove')}
                    onClick={() => set({ tiers: current.tiers.filter((_, i) => i !== index) })}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          <button
            type="button"
            className="sh-btn"
            onClick={() => set({ tiers: [...current.tiers, { upTo: null, markup: 30 }] })}
          >
            {t('Add band')}
          </button>
        </div>
        <p className="sh-small sh-muted">
          {t('Leave “cost up to” empty for the last band: every cost above.')}
        </p>
        <div className="sh-row">
          <label className="sh-row">
            <span>{t('Try with a supplier’s price of')}</span>
            <input
              type="text"
              inputMode="decimal"
              style={{ width: '6rem' }}
              value={sample}
              onChange={(e) => setSample(e.target.value)}
            />
          </label>
          {preview && (
            <span>
              {t('Cost')} {formatMoney(preview.cost, currency, user.locale)} · {t('List price')}{' '}
              {formatMoney(preview.listPrice, currency, user.locale)} ·{' '}
              <strong>
                {t('Selling price')} {formatMoney(preview.regularPrice, currency, user.locale)}
              </strong>
            </span>
          )}
        </div>
      </div>
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      {save.isSuccess && <Alert kind="success">{t('Saved.')}</Alert>}
      <div>
        <button
          type="button"
          className="sh-btn sh-btn-primary"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {t('Save')}
        </button>
      </div>
    </div>
  );
}
