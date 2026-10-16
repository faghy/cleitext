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
  stripe: {
    title: 'Stripe',
    about: 'Cards, Apple Pay, Google Pay and more, on Stripe’s secure page.',
  },
  paypal: {
    title: 'PayPal',
    about: 'A PayPal account, or a card through PayPal.',
  },
};
const DEFAULT_TITLE: Record<PaymentId, string> = {
  bacs: 'Bank transfer',
  cod: 'Cash on delivery',
  stripe: 'Credit or debit card',
  paypal: 'PayPal',
};

type SecretName = 'stripeSecretKey' | 'stripeWebhookSecret' | 'paypalSecret';
type View = Payments & {
  secrets: Record<SecretName, boolean>;
  webhooks: { stripe: string; paypal: string };
};

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
    queryFn: () => api<View>('GET', '/payments'),
  });
  const shipping = useQuery({
    queryKey: ['shop', 'shipping'],
    queryFn: () => api<ShippingList>('GET', '/shipping'),
  });
  const [data, setData] = useState<View | null>(null);
  const [secrets, setSecrets] = useState<Partial<Record<SecretName, string>>>({});
  const check = useMutation({
    mutationFn: (method: 'stripe' | 'paypal') =>
      api<{ ok: boolean; message: string | null }>('POST', `/payments/check/${method}`),
  });
  const [open, setOpen] = useState<PaymentId | null>(null);
  useEffect(() => {
    if (loaded.data) setData(loaded.data);
  }, [loaded.data]);
  const save = useMutation({
    mutationFn: () => {
      // The view's extras (which secrets are set, webhook addresses) are not settings.
      const payments = Object.fromEntries(
        Object.entries(data!).filter(([key]) => key !== 'secrets' && key !== 'webhooks'),
      );
      return api<View>('PUT', '/payments', { ...payments, secrets });
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(['shop', 'payments'], saved);
      setSecrets({});
    },
  });
  if (loaded.error) return <Alert>{errorMessage(loaded.error)}</Alert>;
  if (!data) return <p className="sh-muted">{t('Loading…')}</p>;
  const currency = setup.data?.settings.currency ?? 'EUR';
  const errors = fieldErrors(save.error);
  const change = (next: View) => {
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

  const secretField = (name: SecretName, label: string, placeholder: string) => (
    <label className="sh-field">
      <span>
        {label}{' '}
        {data.secrets[name] && <span className="sh-badge sh-badge-ok">{t('Key saved')}</span>}
      </span>
      <input
        type="password"
        autoComplete="new-password"
        value={secrets[name] ?? ''}
        placeholder={data.secrets[name] ? t('Saved: type a new one to replace it') : placeholder}
        onChange={(e) => {
          save.reset();
          setSecrets({ ...secrets, [name]: e.target.value });
        }}
      />
      {errors[`secrets.${name}`] && (
        <small className="sh-error">{t(errors[`secrets.${name}`]!)}</small>
      )}
    </label>
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
          'The ways customers can pay, in the order shown at checkout. Cards and PayPal are paid on Stripe’s and PayPal’s secure pages: card data never reaches this site.',
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

      {(open === 'stripe' || open === 'paypal') && (
        <section className="sh-card sh-stack">
          <h2>{t(NAMES[open].title)}</h2>
          {common(open)}
          {open === 'stripe' ? (
            <>
              <p className="sh-small sh-muted" style={{ margin: 0 }}>
                {t(
                  'In Stripe’s dashboard: Developers → API keys. A test key (sk_test_…) takes no real money.',
                )}
              </p>
              {secretField('stripeSecretKey', t('Secret key'), 'sk_live_…')}
              {secretField('stripeWebhookSecret', t('Webhook signing secret'), 'whsec_…')}
            </>
          ) : (
            <>
              <p className="sh-small sh-muted" style={{ margin: 0 }}>
                {t('In PayPal’s developer dashboard: Apps & Credentials, an app for this site.')}
              </p>
              <label className="sh-check">
                <input
                  type="checkbox"
                  checked={data.paypal.sandbox}
                  onChange={(e) => set('paypal', { sandbox: e.target.checked })}
                />
                {t('Sandbox (test payments, no real money)')}
              </label>
              <label className="sh-field">
                <span>{t('Client id')}</span>
                <input
                  type="text"
                  value={data.paypal.clientId}
                  autoComplete="off"
                  onChange={(e) => set('paypal', { clientId: e.target.value })}
                />
                {errors['paypal.clientId'] && (
                  <small className="sh-error">{t(errors['paypal.clientId'])}</small>
                )}
              </label>
              {secretField('paypalSecret', t('Secret'), '')}
              <label className="sh-field">
                <span>{t('Webhook id')}</span>
                <input
                  type="text"
                  value={data.paypal.webhookId}
                  autoComplete="off"
                  onChange={(e) => set('paypal', { webhookId: e.target.value })}
                />
              </label>
            </>
          )}
          <div className="sh-field">
            <span>{t('Webhook address')}</span>
            <input
              type="text"
              readOnly
              value={data.webhooks[open]}
              onFocus={(e) => e.target.select()}
            />
            <small>
              {open === 'stripe'
                ? t(
                    'Add it in Stripe (Developers → Webhooks) with the events checkout.session.completed, checkout.session.async_payment_succeeded and checkout.session.async_payment_failed. Payments are also confirmed when customers come back to the site.',
                  )
                : t(
                    'Add it to your PayPal app (Webhooks) with the events Checkout order approved and Payment capture completed. Payments are also confirmed when customers come back to the site.',
                  )}
            </small>
          </div>
          <div className="sh-row">
            <button
              type="button"
              className="sh-btn"
              disabled={check.isPending}
              onClick={() => check.mutate(open)}
            >
              {t('Check the keys')}
            </button>
            <small className="sh-muted">{t('Save first: the check uses the saved keys.')}</small>
          </div>
          {check.data && check.variables === open && (
            <Alert kind={check.data.ok ? 'success' : 'error'}>
              {check.data.ok
                ? t('The keys work.')
                : t(check.data.message ?? 'The keys do not work.')}
            </Alert>
          )}
        </section>
      )}

      <section className="sh-card sh-stack">
        <label className="sh-field" style={{ maxWidth: '22rem' }}>
          <span>{t('Cancel unpaid online orders after (minutes)')}</span>
          <input
            type="number"
            min={10}
            max={10080}
            value={data.holdMinutes}
            onChange={(e) =>
              change({ ...data, holdMinutes: Math.max(10, Number(e.target.value) || 60) })
            }
          />
          <small>
            {t(
              'Orders paid by card or PayPal keep their products for this long, then their stock goes back.',
            )}
          </small>
        </label>
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
