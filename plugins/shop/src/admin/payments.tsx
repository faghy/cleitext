import { Alert, errorMessage, useT, type AdminPageProps } from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { BankAccount, PaymentId, Payments } from '../payments';
import { fieldErrors, useSetup } from './shared';
import { CSS } from './styles';

const NAMES: Record<PaymentId, { title: string; about: string }> = {
  bacs: {
    title: 'Direct bank transfer',
    about: 'Customers pay into your bank account; the order waits on hold until the money arrives.',
  },
  cod: {
    title: 'Cash on delivery',
    about: 'Customers pay the courier when the order arrives, with a surcharge if you like.',
  },
};
const DEFAULT_TITLE: Record<PaymentId, string> = { bacs: 'Bank transfer', cod: 'Cash on delivery' };

interface ShippingList {
  zones: { name: string; methods: { id?: string; title: string }[] }[];
  rest: { id?: string; title: string }[];
}

/** Shop → Payments: the ways to pay, switched on, ordered and set up (WooCommerce's). */
export function PaymentsPage({ api }: AdminPageProps) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const setup = useSetup(api);
  const loaded = useQuery({
    queryKey: ['shop', 'payments'],
    queryFn: () => api<Payments>('GET', '/payments'),
  });
  const shipping = useQuery({
    queryKey: ['shop', 'shipping'],
    queryFn: () => api<ShippingList>('GET', '/shipping'),
  });
  const [data, setData] = useState<Payments | null>(null);
  const [open, setOpen] = useState<PaymentId | null>(null);
  useEffect(() => {
    if (loaded.data) setData(loaded.data);
  }, [loaded.data]);
  const save = useMutation({
    mutationFn: () => api<Payments>('PUT', '/payments', data),
    onSuccess: (saved) => queryClient.setQueryData(['shop', 'payments'], saved),
  });
  if (loaded.error) return <Alert>{errorMessage(loaded.error)}</Alert>;
  if (!data) return <p className="sh-muted">{t('Loading…')}</p>;
  const currency = setup.data?.settings.currency ?? 'EUR';
  const errors = fieldErrors(save.error);
  const change = (next: Payments) => {
    save.reset();
    setData(next);
  };
  const set = <K extends PaymentId>(id: K, changes: Partial<Payments[K]>) =>
    change({ ...data, [id]: { ...data[id], ...changes } });
  const move = (index: number, by: number) => {
    const order = [...data.order];
    [order[index], order[index + by]] = [order[index + by]!, order[index]!];
    change({ ...data, order });
  };
  const methods = [
    ...(shipping.data?.zones ?? []).flatMap((z) =>
      z.methods.flatMap((m) => (m.id ? [{ id: m.id, label: `${z.name} – ${m.title}` }] : [])),
    ),
    ...(shipping.data?.rest ?? []).flatMap((m) =>
      m.id ? [{ id: m.id, label: `${t('Everywhere else')} – ${m.title}` }] : [],
    ),
  ];

  const common = (id: PaymentId) => (
    <>
      <label className="sh-field">
        <span>{t('Title')}</span>
        <input
          type="text"
          value={data[id].title}
          placeholder={t(DEFAULT_TITLE[id])}
          maxLength={120}
          onChange={(e) => set(id, { title: e.target.value })}
        />
        <small>{t('What customers see at checkout. Empty: the default, in their language.')}</small>
      </label>
      <label className="sh-field">
        <span>{t('Description')}</span>
        <textarea
          rows={2}
          value={data[id].description}
          maxLength={1000}
          onChange={(e) => set(id, { description: e.target.value })}
        />
        <small>{t('Under the title at checkout.')}</small>
      </label>
      <label className="sh-field">
        <span>{t('Instructions')}</span>
        <textarea
          rows={3}
          value={data[id].instructions}
          maxLength={2000}
          onChange={(e) => set(id, { instructions: e.target.value })}
        />
        <small>{t('On the order page and in the emails.')}</small>
      </label>
    </>
  );

  const accounts = data.bacs.accounts;
  const setAccount = (index: number, changes: Partial<BankAccount>) =>
    set('bacs', { accounts: accounts.map((a, i) => (i === index ? { ...a, ...changes } : a)) });

  return (
    <div className="sh sh-stack">
      <style>{CSS}</style>
      <h1>{t('Payments')}</h1>
      <p className="sh-muted">
        {t(
          'The ways customers can pay, in the order shown at checkout. Card payments (Stripe, PayPal) will be added here.',
        )}
      </p>
      <div className="sh-card" style={{ overflowX: 'auto' }}>
        <table className="sh-table">
          <thead>
            <tr>
              <th>
                <span className="sh-sr">{t('Order')}</span>
              </th>
              <th>{t('Method')}</th>
              <th>{t('Enabled')}</th>
              <th className="sh-hide-sm">{t('Description')}</th>
              <th>
                <span className="sh-sr">{t('Manage')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.order.map((id, index) => (
              <tr key={id} style={{ cursor: 'default' }}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button
                    type="button"
                    className="sh-link"
                    disabled={index === 0}
                    aria-label={t('Move up')}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>{' '}
                  <button
                    type="button"
                    className="sh-link"
                    disabled={index === data.order.length - 1}
                    aria-label={t('Move down')}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                </td>
                <td>
                  <strong>{t(NAMES[id].title)}</strong>
                  {data[id].title && <div className="sh-small sh-muted">“{data[id].title}”</div>}
                </td>
                <td>
                  <label className="sh-check">
                    <input
                      type="checkbox"
                      checked={data[id].enabled}
                      onChange={(e) => set(id, { enabled: e.target.checked })}
                    />
                    <span
                      className={`sh-badge ${data[id].enabled ? 'sh-badge-ok' : 'sh-badge-warn'}`}
                    >
                      {data[id].enabled ? t('Active') : t('Turned off')}
                    </span>
                  </label>
                </td>
                <td className="sh-hide-sm sh-muted">{t(NAMES[id].about)}</td>
                <td>
                  <button
                    type="button"
                    className="sh-btn"
                    aria-expanded={open === id}
                    onClick={() => setOpen(open === id ? null : id)}
                  >
                    {open === id ? t('Close') : t('Manage')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open === 'bacs' && (
        <section className="sh-card sh-stack">
          <h2>{t(NAMES.bacs.title)}</h2>
          {common('bacs')}
          <div className="sh-stack">
            <strong>{t('Account details')}</strong>
            <p className="sh-small sh-muted" style={{ margin: 0 }}>
              {t('Shown to customers after ordering, with the order number as the reference.')}
            </p>
            {accounts.map((account, index) => (
              <div key={index} className="sh-grid" style={{ alignItems: 'end' }}>
                <label className="sh-field">
                  <span>{t('Account holder')}</span>
                  <input
                    type="text"
                    value={account.accountName}
                    onChange={(e) => setAccount(index, { accountName: e.target.value })}
                  />
                </label>
                <label className="sh-field">
                  <span>{t('Bank')}</span>
                  <input
                    type="text"
                    value={account.bankName}
                    onChange={(e) => setAccount(index, { bankName: e.target.value })}
                  />
                </label>
                <label className="sh-field">
                  <span>IBAN</span>
                  <input
                    type="text"
                    value={account.iban}
                    onChange={(e) => setAccount(index, { iban: e.target.value })}
                  />
                </label>
                <label className="sh-field">
                  <span>BIC / SWIFT</span>
                  <input
                    type="text"
                    value={account.bic}
                    onChange={(e) => setAccount(index, { bic: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="sh-link sh-btn-danger"
                  onClick={() => set('bacs', { accounts: accounts.filter((_, i) => i !== index) })}
                >
                  {t('Remove')}
                </button>
              </div>
            ))}
            {errors['bacs.accounts'] && <p className="sh-error">{t(errors['bacs.accounts'])}</p>}
            <div>
              <button
                type="button"
                className="sh-btn"
                disabled={accounts.length >= 10}
                onClick={() =>
                  set('bacs', {
                    accounts: [...accounts, { accountName: '', bankName: '', iban: '', bic: '' }],
                  })
                }
              >
                + {t('Add account')}
              </button>
            </div>
          </div>
        </section>
      )}

      {open === 'cod' && (
        <section className="sh-card sh-stack">
          <h2>{t(NAMES.cod.title)}</h2>
          {common('cod')}
          <div className="sh-grid-2">
            <label className="sh-field">
              <span>{t('Surcharge')}</span>
              <div className="sh-affix">
                <input
                  type="text"
                  inputMode="decimal"
                  value={data.cod.fee}
                  placeholder="0"
                  onChange={(e) => set('cod', { fee: e.target.value })}
                />
                <span>{currency}</span>
              </div>
              <small>
                {t('Added to orders paid this way, like prices (with or without taxes).')}
              </small>
              {errors['cod.fee'] && <small className="sh-error">{errors['cod.fee']}</small>}
            </label>
            <label className="sh-check" style={{ alignSelf: 'center' }}>
              <input
                type="checkbox"
                checked={data.cod.feeTaxable}
                onChange={(e) => set('cod', { feeTaxable: e.target.checked })}
              />
              {t('The surcharge is taxable')}
            </label>
          </div>
          <div className="sh-field">
            <span>{t('Only with these shipping methods')}</span>
            {methods.length === 0 ? (
              <small className="sh-muted">
                {t('No shipping methods yet: it is offered with any.')}
              </small>
            ) : (
              <div className="sh-chips">
                {methods.map((m) => (
                  <label key={m.id} className="sh-chip">
                    <input
                      type="checkbox"
                      checked={data.cod.shippingMethods.includes(m.id)}
                      onChange={(e) =>
                        set('cod', {
                          shippingMethods: e.target.checked
                            ? [...data.cod.shippingMethods, m.id]
                            : data.cod.shippingMethods.filter((x) => x !== m.id),
                        })
                      }
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            )}
            <small>{t('None checked: with every shipping method.')}</small>
          </div>
          <label className="sh-check">
            <input
              type="checkbox"
              checked={data.cod.virtual}
              onChange={(e) => set('cod', { virtual: e.target.checked })}
            />
            {t('Also for orders with nothing to deliver (virtual products)')}
          </label>
        </section>
      )}

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
