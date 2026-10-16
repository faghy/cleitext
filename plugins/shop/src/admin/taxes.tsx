import { Alert, errorMessage, useT, type AdminPageProps } from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ITALY_PRESET, type TaxRateInput } from '../tax-rates';
import { fieldErrors, TAX_CLASS_OPTIONS, useSetup } from './shared';
import { CountrySelect } from './shipping';
import { CSS } from './styles';

interface Taxes {
  enabled: boolean;
  rates: TaxRateInput[];
}

/** Shop → Taxes: rates by class and place, chosen by the shipping address. */
export function TaxesPage({ api, user }: AdminPageProps) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const setup = useSetup(api);
  const loaded = useQuery({
    queryKey: ['shop', 'taxes'],
    queryFn: () => api<Taxes>('GET', '/taxes'),
  });
  const [data, setData] = useState<Taxes | null>(null);
  useEffect(() => {
    if (loaded.data) setData(loaded.data);
  }, [loaded.data]);
  const save = useMutation({
    mutationFn: () => api<Taxes>('PUT', '/taxes', data),
    onSuccess: (saved) => queryClient.setQueryData(['shop', 'taxes'], saved),
  });
  if (loaded.error) return <Alert>{errorMessage(loaded.error)}</Alert>;
  if (!data) return <p className="sh-muted">{t('Loading…')}</p>;
  const errors = fieldErrors(save.error);
  const change = (next: Taxes) => {
    save.reset();
    setData(next);
  };
  const setRate = (index: number, changes: Partial<TaxRateInput>) =>
    change({
      ...data,
      rates: data.rates.map((r, i) => (i === index ? { ...r, ...changes } : r)),
    });
  const inclusive = setup.data?.settings.pricesIncludeTax ?? true;

  return (
    <div className="sh sh-stack">
      <style>{CSS}</style>
      <h1>{t('Taxes')}</h1>
      <p className="sh-muted">
        {inclusive
          ? t(
              'Prices are entered with taxes: customers pay them as they are, and the receipt shows the tax they include, at the rate of the country they ship to.',
            )
          : t(
              'Prices are entered without taxes: the tax of the country customers ship to is added at checkout.',
            )}{' '}
        {t('Change this in Settings → Shop.')}
      </p>
      <section className="sh-card sh-stack">
        <label className="sh-check">
          <input
            type="checkbox"
            checked={data.enabled}
            onChange={(e) => change({ ...data, enabled: e.target.checked })}
          />
          <strong>{t('Charge taxes')}</strong>
        </label>
        <p className="sh-small sh-muted">
          {t(
            'The most specific rate wins: a province over its country, a country over “Any country”. Products of a class with no rate for the address pay no tax.',
          )}
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="sh-table">
            <thead>
              <tr>
                <th>{t('Country')}</th>
                <th>{t('Province')}</th>
                <th>{t('Tax class')}</th>
                <th>{t('Rate (%)')}</th>
                <th>{t('Name on receipts')}</th>
                <th>
                  <span className="sh-sr">{t('Remove')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rates.map((rate, index) => (
                <tr key={index} style={{ cursor: 'default' }}>
                  <td>
                    <CountrySelect
                      value={rate.country}
                      locale={user.locale}
                      label={t('Country')}
                      any={t('Any country')}
                      onChange={(country) => setRate(index, { country })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      maxLength={10}
                      style={{ width: '6rem' }}
                      value={rate.province}
                      placeholder={t('All')}
                      aria-label={t('Province')}
                      onChange={(e) => setRate(index, { province: e.target.value.toUpperCase() })}
                    />
                  </td>
                  <td>
                    <select
                      value={rate.taxClass}
                      aria-label={t('Tax class')}
                      onChange={(e) =>
                        setRate(index, { taxClass: e.target.value as TaxRateInput['taxClass'] })
                      }
                    >
                      {TAX_CLASS_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {t(label)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.001"
                      style={{ width: '6rem' }}
                      value={rate.rate}
                      aria-label={t('Rate (%)')}
                      onChange={(e) => setRate(index, { rate: Number(e.target.value) })}
                    />
                    {errors[`rates.${index}.rate`] && (
                      <div className="sh-error">{errors[`rates.${index}.rate`]}</div>
                    )}
                  </td>
                  <td>
                    <input
                      type="text"
                      maxLength={60}
                      value={rate.name}
                      placeholder={t('e.g. VAT 22%')}
                      aria-label={t('Name on receipts')}
                      onChange={(e) => setRate(index, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="sh-link"
                      onClick={() =>
                        change({ ...data, rates: data.rates.filter((_, i) => i !== index) })
                      }
                    >
                      {t('Remove')}
                    </button>
                  </td>
                </tr>
              ))}
              {data.rates.length === 0 && (
                <tr style={{ cursor: 'default' }}>
                  <td colSpan={6} className="sh-muted">
                    {t('No rates yet.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="sh-row">
          <button
            type="button"
            className="sh-btn"
            onClick={() =>
              change({
                ...data,
                rates: [
                  ...data.rates,
                  { country: 'IT', province: '', taxClass: '', rate: 0, name: '' },
                ],
              })
            }
          >
            + {t('Add rate')}
          </button>
          <button
            type="button"
            className="sh-btn"
            onClick={() =>
              change({
                ...data,
                rates: [
                  ...data.rates.filter((r) => r.country !== 'IT' || r.province !== ''),
                  ...ITALY_PRESET,
                ],
              })
            }
          >
            {t('Italian VAT rates (22, 10, 5, 4%)')}
          </button>
        </div>
      </section>
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
