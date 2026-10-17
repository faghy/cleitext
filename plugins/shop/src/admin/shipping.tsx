import { Alert, errorMessage, useT, type AdminPageProps } from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { COUNTRIES, countryName } from '../address';
import type { MethodSettings, Rate } from '../shipping';
import type { Texts } from '../texts';
import { Translations, type Site } from './translations';
import { fieldErrors, formatMoney, useSetup } from './shared';
import { CSS } from './styles';

interface Method {
  id?: string;
  title: string;
  enabled: boolean;
  taxable: boolean;
  settings: MethodSettings;
  translations?: Texts;
}
interface Zone {
  id?: string;
  name: string;
  regions: { country: string; province: string }[];
  postcodes: string[];
  methods: Method[];
}
interface Shipping {
  zones: Zone[];
  rest: Method[];
  classes: string[];
}

const KINDS: [MethodSettings['kind'], string][] = [
  ['flat', 'Flat rate'],
  ['free', 'Free shipping'],
  ['pickup', 'Local pickup'],
  ['weight', 'By weight'],
];

const newMethod = (kind: MethodSettings['kind'], title: string): Method => ({
  title,
  enabled: true,
  taxable: kind !== 'free',
  settings:
    kind === 'flat'
      ? { kind, cost: '0', classCosts: {}, calculation: 'class' }
      : kind === 'free'
        ? { kind, requires: 'min_amount', minAmount: '' }
        : kind === 'pickup'
          ? { kind, cost: '0', address: '' }
          : {
              kind,
              bands: [
                { upTo: 2, cost: '' },
                { upTo: null, cost: '' },
              ],
            },
});

/** Shop → Shipping: zones by place, each with its methods, and a tester. */
export function ShippingPage({ api, user, site }: AdminPageProps) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const setup = useSetup(api);
  const loaded = useQuery({
    queryKey: ['shop', 'shipping'],
    queryFn: () => api<Shipping>('GET', '/shipping'),
  });
  const [data, setData] = useState<Shipping | null>(null);
  useEffect(() => {
    if (loaded.data) setData(loaded.data);
  }, [loaded.data]);
  const save = useMutation({
    mutationFn: () => api<Shipping>('PUT', '/shipping', { zones: data!.zones, rest: data!.rest }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['shop', 'shipping'], saved);
    },
  });
  if (loaded.error) return <Alert>{errorMessage(loaded.error)}</Alert>;
  if (!data) return <p className="sh-muted">{t('Loading…')}</p>;
  const currency = setup.data?.settings.currency ?? 'EUR';
  const weightUnit = setup.data?.settings.weightUnit ?? 'kg';
  const errors = fieldErrors(save.error);
  const change = (next: Shipping) => {
    save.reset();
    setData(next);
  };
  const setZone = (index: number, zone: Zone) =>
    change({ ...data, zones: data.zones.map((z, i) => (i === index ? zone : z)) });
  const move = (index: number, by: number) => {
    const zones = [...data.zones];
    const [zone] = zones.splice(index, 1);
    zones.splice(index + by, 0, zone!);
    change({ ...data, zones });
  };

  return (
    <div className="sh sh-stack">
      <style>{CSS}</style>
      <h1>{t('Shipping')}</h1>
      <p className="sh-muted">
        {t(
          'A zone is a group of places with its shipping methods. Customers get the first zone that matches their address, from the top; addresses in no zone get “Everywhere else”. Without any method, orders ship for free and nobody chooses.',
        )}
      </p>
      {data.zones.map((zone, index) => (
        <section key={zone.id ?? `new-${index}`} className="sh-card sh-stack">
          <div className="sh-row sh-between">
            <label className="sh-field" style={{ flex: 1, minWidth: '14rem' }}>
              <span>{t('Zone name')}</span>
              <input
                type="text"
                value={zone.name}
                onChange={(e) => setZone(index, { ...zone, name: e.target.value })}
              />
              {errors[`zones.${index}.name`] && (
                <small className="sh-error">{errors[`zones.${index}.name`]}</small>
              )}
            </label>
            <div className="sh-row">
              <button
                type="button"
                className="sh-btn"
                disabled={index === 0}
                aria-label={t('Move up')}
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="sh-btn"
                disabled={index === data.zones.length - 1}
                aria-label={t('Move down')}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="sh-btn sh-btn-danger"
                onClick={() => change({ ...data, zones: data.zones.filter((_, i) => i !== index) })}
              >
                {t('Delete zone')}
              </button>
            </div>
          </div>
          <Regions
            locale={user.locale}
            regions={zone.regions}
            onChange={(regions) => setZone(index, { ...zone, regions })}
          />
          <label className="sh-field">
            <span>{t('Postcodes (optional)')}</span>
            <textarea
              rows={2}
              value={zone.postcodes.join('\n')}
              placeholder={'20100\n20*\n00118...00199'}
              onChange={(e) =>
                setZone(index, {
                  ...zone,
                  postcodes: e.target.value.split('\n').map((p) => p.trimStart()),
                })
              }
              onBlur={() =>
                setZone(index, { ...zone, postcodes: zone.postcodes.filter((p) => p.trim()) })
              }
            />
            <small>
              {t(
                'One per line: exact, with * at the end, or a range such as 00118...00199. Empty: every postcode of the places above.',
              )}
            </small>
          </label>
          <Methods
            site={site}
            methods={zone.methods}
            classes={data.classes}
            currency={currency}
            weightUnit={weightUnit}
            errors={errors}
            path={`zones.${index}.methods`}
            onChange={(methods) => setZone(index, { ...zone, methods })}
          />
        </section>
      ))}
      <div>
        <button
          type="button"
          className="sh-btn"
          onClick={() =>
            change({
              ...data,
              zones: [
                ...data.zones,
                {
                  name: t('New zone'),
                  regions: [{ country: 'IT', province: '' }],
                  postcodes: [],
                  methods: [newMethod('flat', t('Courier'))],
                },
              ],
            })
          }
        >
          + {t('Add zone')}
        </button>
      </div>
      <section className="sh-card sh-stack">
        <h2>{t('Everywhere else')}</h2>
        <p className="sh-muted sh-small">
          {t('For addresses in no zone. Without methods here, the shop does not ship there.')}
        </p>
        <Methods
          site={site}
          methods={data.rest}
          classes={data.classes}
          currency={currency}
          weightUnit={weightUnit}
          errors={errors}
          path="rest"
          onChange={(rest) => change({ ...data, rest })}
        />
      </section>
      <Tester api={api} locale={user.locale} currency={currency} weightUnit={weightUnit} />
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      {save.isSuccess && <Alert kind="success">{t('Saved.')}</Alert>}
      <div className="sh-actions">
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

/** Countries in the admin's language, Italy first. */
export function CountrySelect({
  value,
  locale,
  onChange,
  any,
  label,
}: {
  value: string;
  locale: string;
  onChange: (value: string) => void;
  any?: string;
  label: string;
}) {
  const options = [...COUNTRIES]
    .map((code) => ({ code, name: countryName(code, locale) }))
    .sort((a, b) =>
      a.code === 'IT' ? -1 : b.code === 'IT' ? 1 : a.name.localeCompare(b.name, locale),
    );
  return (
    <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      {any !== undefined && <option value="">{any}</option>}
      {options.map((c) => (
        <option key={c.code} value={c.code}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

function Regions({
  regions,
  locale,
  onChange,
}: {
  regions: Zone['regions'];
  locale: string;
  onChange: (regions: Zone['regions']) => void;
}) {
  const { t } = useT();
  const [country, setCountry] = useState('IT');
  const [province, setProvince] = useState('');
  const add = () => {
    const region = { country, province: province.trim().toUpperCase() };
    if (!regions.some((r) => r.country === region.country && r.province === region.province))
      onChange([...regions, region]);
    setProvince('');
  };
  return (
    <div className="sh-field">
      <span>{t('Places')}</span>
      <div className="sh-chips">
        {regions.map((r) => (
          <span key={`${r.country}-${r.province}`} className="sh-chip">
            {countryName(r.country, locale)}
            {r.province ? ` · ${r.province}` : ''}
            <button
              type="button"
              aria-label={t('Remove')}
              onClick={() => onChange(regions.filter((x) => x !== r))}
            >
              ✕
            </button>
          </span>
        ))}
        {regions.length === 0 && <span className="sh-error sh-small">{t('Add a place.')}</span>}
      </div>
      <div className="sh-row">
        <CountrySelect value={country} locale={locale} label={t('Country')} onChange={setCountry} />
        <input
          type="text"
          value={province}
          maxLength={10}
          style={{ width: '9rem' }}
          placeholder={t('Province (optional)')}
          aria-label={t('Province (optional)')}
          onChange={(e) => setProvince(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="sh-btn" onClick={add}>
          {t('Add')}
        </button>
      </div>
      <small>{t('A whole country, or one of its provinces by code (e.g. MI).')}</small>
    </div>
  );
}

function Methods({
  site,
  methods,
  classes,
  currency,
  weightUnit,
  errors,
  path,
  onChange,
}: {
  site: Site;
  methods: Method[];
  classes: string[];
  currency: string;
  weightUnit: string;
  errors: Record<string, string>;
  path: string;
  onChange: (methods: Method[]) => void;
}) {
  const { t } = useT();
  const set = (index: number, method: Method) =>
    onChange(methods.map((m, i) => (i === index ? method : m)));
  return (
    <div className="sh-stack">
      <strong>{t('Shipping methods')}</strong>
      {methods.length === 0 && <p className="sh-muted sh-small">{t('No methods yet.')}</p>}
      {methods.map((method, index) => {
        const s = method.settings;
        const error = (field: string) => errors[`${path}.${index}.settings.${field}`];
        const setSettings = (changes: Partial<MethodSettings>) =>
          set(index, { ...method, settings: { ...s, ...changes } as MethodSettings });
        return (
          <div
            key={method.id ?? `new-${index}`}
            className="sh-stack"
            style={{ borderTop: '1px solid var(--sh-line)', paddingTop: '.75rem' }}
          >
            <div className="sh-row sh-between">
              <div className="sh-row">
                <input
                  type="text"
                  value={method.title}
                  aria-label={t('Name shown to customers')}
                  onChange={(e) => set(index, { ...method, title: e.target.value })}
                />
                <span className="sh-badge sh-badge-info">
                  {t(KINDS.find(([k]) => k === s.kind)![1])}
                </span>
              </div>
              <div className="sh-row">
                <label className="sh-check">
                  <input
                    type="checkbox"
                    checked={method.enabled}
                    onChange={(e) => set(index, { ...method, enabled: e.target.checked })}
                  />
                  {t('Enabled')}
                </label>
                {s.kind !== 'free' && (
                  <label className="sh-check">
                    <input
                      type="checkbox"
                      checked={method.taxable}
                      onChange={(e) => set(index, { ...method, taxable: e.target.checked })}
                    />
                    {t('Taxable')}
                  </label>
                )}
                <button
                  type="button"
                  className="sh-link"
                  disabled={index === 0}
                  aria-label={t('Move up')}
                  onClick={() => {
                    const next = [...methods];
                    [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                    onChange(next);
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="sh-link sh-btn-danger"
                  onClick={() => onChange(methods.filter((_, i) => i !== index))}
                >
                  {t('Remove')}
                </button>
              </div>
            </div>
            <Translations
              site={site}
              value={method.translations}
              onChange={(translations) => set(index, { ...method, translations })}
              fields={[
                {
                  key: 'title',
                  label: t('Name shown to customers'),
                  original: method.title,
                  maxLength: 120,
                },
              ]}
            />
            {s.kind === 'flat' && (
              <div className="sh-stack">
                <label className="sh-field">
                  <span>{t('Cost')}</span>
                  <input
                    type="text"
                    value={s.cost}
                    onChange={(e) => setSettings({ cost: e.target.value })}
                  />
                  <small>
                    {t(
                      'An amount, or a formula with [qty] (items), [cost] (the products’ total) and [weight]: e.g. 5, or 3 + 1.5 * [qty].',
                    )}
                  </small>
                  {error('cost') && <small className="sh-error">{error('cost')}</small>}
                </label>
                {classes.length > 0 && (
                  <div className="sh-stack">
                    <span className="sh-small sh-muted">
                      {t('Added for products of a shipping class:')}
                    </span>
                    <div className="sh-grid">
                      {['', ...classes].map((name) => (
                        <label key={name} className="sh-field">
                          <span>{name || t('No shipping class')}</span>
                          <input
                            type="text"
                            value={s.classCosts[name] ?? ''}
                            onChange={(e) =>
                              setSettings({
                                classCosts: { ...s.classCosts, [name]: e.target.value },
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <label className="sh-field" style={{ maxWidth: '24rem' }}>
                      <span>{t('With several classes in the cart')}</span>
                      <select
                        value={s.calculation}
                        onChange={(e) =>
                          setSettings({ calculation: e.target.value as 'class' | 'order' })
                        }
                      >
                        <option value="class">{t('Add the cost of each class')}</option>
                        <option value="order">{t('Only the most expensive class')}</option>
                      </select>
                    </label>
                  </div>
                )}
              </div>
            )}
            {s.kind === 'free' && (
              <div className="sh-grid-2">
                <label className="sh-field">
                  <span>{t('Free shipping needs')}</span>
                  <select
                    value={s.requires}
                    onChange={(e) => setSettings({ requires: e.target.value as typeof s.requires })}
                  >
                    <option value="none">{t('Nothing')}</option>
                    <option value="min_amount">{t('A minimum order amount')}</option>
                    <option value="coupon">{t('A free-shipping coupon')}</option>
                    <option value="either">{t('A minimum amount or a coupon')}</option>
                    <option value="both">{t('A minimum amount and a coupon')}</option>
                  </select>
                </label>
                {['min_amount', 'either', 'both'].includes(s.requires) && (
                  <label className="sh-field">
                    <span>{t('Minimum order amount')}</span>
                    <div className="sh-affix">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={s.minAmount}
                        onChange={(e) => setSettings({ minAmount: e.target.value })}
                      />
                      <span>{currency}</span>
                    </div>
                    <small>{t('After discounts.')}</small>
                    {error('minAmount') && <small className="sh-error">{error('minAmount')}</small>}
                  </label>
                )}
              </div>
            )}
            {s.kind === 'pickup' && (
              <div className="sh-grid-2">
                <label className="sh-field">
                  <span>{t('Cost')}</span>
                  <div className="sh-affix">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={s.cost}
                      onChange={(e) => setSettings({ cost: e.target.value })}
                    />
                    <span>{currency}</span>
                  </div>
                </label>
                <label className="sh-field">
                  <span>{t('Where and when')}</span>
                  <textarea
                    rows={2}
                    value={s.address}
                    placeholder={t('e.g. Via Roma 1, Milan, Monday to Friday 9–18')}
                    onChange={(e) => setSettings({ address: e.target.value })}
                  />
                </label>
              </div>
            )}
            {s.kind === 'weight' && (
              <Bands
                bands={s.bands}
                currency={currency}
                weightUnit={weightUnit}
                onChange={(bands) => setSettings({ bands })}
              />
            )}
          </div>
        );
      })}
      <div className="sh-row">
        <label className="sh-sr" htmlFor={`add-${path}`}>
          {t('Add a method')}
        </label>
        <select
          id={`add-${path}`}
          value=""
          onChange={(e) => {
            const kind = e.target.value as MethodSettings['kind'];
            if (!kind) return;
            onChange([...methods, newMethod(kind, t(KINDS.find(([k]) => k === kind)![1]))]);
          }}
        >
          <option value="">+ {t('Add a method…')}</option>
          {KINDS.map(([kind, label]) => (
            <option key={kind} value={kind}>
              {t(label)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

type Band = Extract<MethodSettings, { kind: 'weight' }>['bands'][number];

/** Weight bands (Cleito's couriers): one after the other, the last one open or not. */
function Bands({
  bands,
  currency,
  weightUnit,
  onChange,
}: {
  bands: Band[];
  currency: string;
  weightUnit: string;
  onChange: (bands: Band[]) => void;
}) {
  const { t } = useT();
  const set = (index: number, band: Band) =>
    onChange(bands.map((b, i) => (i === index ? band : b)));
  const last = bands[bands.length - 1];
  return (
    <div className="sh-stack">
      <table className="sh-table" style={{ maxWidth: '30rem' }}>
        <thead>
          <tr>
            <th>{t('From')}</th>
            <th>{t('Up to ({unit})', { unit: weightUnit })}</th>
            <th>
              {t('Cost')} ({currency})
            </th>
            <th>
              <span className="sh-sr">{t('Remove')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {bands.map((band, index) => (
            <tr key={index} style={{ cursor: 'default' }}>
              <td className="sh-muted">
                {index === 0 ? '0' : `> ${bands[index - 1]!.upTo ?? '…'}`}
              </td>
              <td>
                {band.upTo === null ? (
                  <span className="sh-muted">{t('and above')}</span>
                ) : (
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    style={{ width: '7rem' }}
                    value={band.upTo}
                    aria-label={t('Up to ({unit})', { unit: weightUnit })}
                    onChange={(e) => set(index, { ...band, upTo: Number(e.target.value) || 0 })}
                  />
                )}
              </td>
              <td>
                <input
                  type="text"
                  inputMode="decimal"
                  style={{ width: '7rem' }}
                  value={band.cost}
                  aria-label={t('Cost')}
                  onChange={(e) => set(index, { ...band, cost: e.target.value })}
                />
              </td>
              <td>
                {bands.length > 1 && (
                  <button
                    type="button"
                    className="sh-link"
                    onClick={() => onChange(bands.filter((_, i) => i !== index))}
                  >
                    {t('Remove')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sh-row">
        <button
          type="button"
          className="sh-btn"
          onClick={() => {
            const closed = bands.filter((b) => b.upTo !== null);
            const top = closed.length ? closed[closed.length - 1]!.upTo! : 0;
            const added = { upTo: top + 5, cost: '' };
            onChange(
              last?.upTo === null ? [...bands.slice(0, -1), added, last] : [...bands, added],
            );
          }}
        >
          + {t('Add band')}
        </button>
        <label className="sh-check">
          <input
            type="checkbox"
            checked={last?.upTo === null}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...bands, { upTo: null, cost: last?.cost ?? '' }]
                  : bands.filter((b) => b.upTo !== null),
              )
            }
          />
          {t('A last band with no limit')}
        </label>
      </div>
      <small className="sh-muted">
        {t('Without a last open band, heavier carts do not get this method.')}
      </small>
    </div>
  );
}

/** Which zone and rates an address gets, with what is saved. */
function Tester({
  api,
  locale,
  currency,
  weightUnit,
}: {
  api: AdminPageProps['api'];
  locale: string;
  currency: string;
  weightUnit: string;
}) {
  const { t } = useT();
  const [form, setForm] = useState({
    country: 'IT',
    province: '',
    postcode: '',
    contents: '50',
    weight: '1',
  });
  const check = useMutation({
    mutationFn: () =>
      api<{ zone: { name: string } | null; rates: Rate[] }>('POST', '/shipping/preview', {
        ...form,
        contents: form.contents.replace(',', '.') || '0',
        weight: form.weight.replace(',', '.') || '0',
      }),
  });
  return (
    <section className="sh-card sh-stack">
      <h2>{t('Try an address')}</h2>
      <div className="sh-filters">
        <label className="sh-field">
          <span>{t('Country')}</span>
          <CountrySelect
            value={form.country}
            locale={locale}
            label={t('Country')}
            onChange={(country) => setForm({ ...form, country })}
          />
        </label>
        <label className="sh-field">
          <span>{t('Province')}</span>
          <input
            type="text"
            style={{ width: '6rem' }}
            value={form.province}
            onChange={(e) => setForm({ ...form, province: e.target.value })}
          />
        </label>
        <label className="sh-field">
          <span>{t('Postcode')}</span>
          <input
            type="text"
            style={{ width: '7rem' }}
            value={form.postcode}
            onChange={(e) => setForm({ ...form, postcode: e.target.value })}
          />
        </label>
        <label className="sh-field">
          <span>
            {t('Products')} ({currency})
          </span>
          <input
            type="text"
            inputMode="decimal"
            style={{ width: '7rem' }}
            value={form.contents}
            onChange={(e) => setForm({ ...form, contents: e.target.value })}
          />
        </label>
        <label className="sh-field">
          <span>
            {t('Weight')} ({weightUnit})
          </span>
          <input
            type="text"
            inputMode="decimal"
            style={{ width: '6rem' }}
            value={form.weight}
            onChange={(e) => setForm({ ...form, weight: e.target.value })}
          />
        </label>
        <button type="button" className="sh-btn" onClick={() => check.mutate()}>
          {t('Check')}
        </button>
      </div>
      {check.error && <Alert>{errorMessage(check.error)}</Alert>}
      {check.data && (
        <div className="sh-small">
          <p>
            {t('Zone')}: <strong>{check.data.zone?.name ?? t('Everywhere else')}</strong>
          </p>
          {check.data.rates.length ? (
            <ul>
              {check.data.rates.map((r) => (
                <li key={r.id}>
                  {r.title}:{' '}
                  {r.cost === 0 ? t('Free') : formatMoney(r.cost / 100, currency, locale)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="sh-error">{t('No shipping to this address.')}</p>
          )}
          <p className="sh-muted">{t('With what is saved.')}</p>
        </div>
      )}
    </section>
  );
}
