import { Alert, errorMessage, useT, type AdminPageProps } from '@cleitext/admin-sdk';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { EmailId } from '../emails';
import type { OrderDetail, OrderListItem } from '../order-admin';
import { formatMoney, useAddress, type ShopApi } from './shared';
import { CSS } from './styles';

/** The country's name in the admin's language. */
function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

const STATUSES = [
  'pending',
  'processing',
  'on-hold',
  'completed',
  'cancelled',
  'refunded',
  'failed',
] as const;
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending payment',
  processing: 'Processing',
  'on-hold': 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  failed: 'Failed',
};
const STATUS_BADGE: Record<string, string> = {
  pending: 'sh-badge-warn',
  processing: 'sh-badge-ok',
  'on-hold': 'sh-badge-warn',
  completed: 'sh-badge-info',
  cancelled: 'sh-badge-out',
  refunded: 'sh-badge-out',
  failed: 'sh-badge-out',
};

/** Shop → Orders: the list, or one order (`?order=`). */
export function OrdersPage(props: AdminPageProps) {
  const address = useAddress();
  const [params, setParams] = useState(() => address.read());
  useEffect(() => {
    const update = () => setParams(address.read());
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  const id = params.get('order');
  return (
    <div className="sh">
      <style>{CSS}</style>
      {id ? (
        <OrderView key={id} {...props} id={id} onClose={() => address.go({ order: null })} />
      ) : (
        <OrderList {...props} params={params} go={address.go} />
      )}
    </div>
  );
}

function OrderList({
  api,
  user,
  params,
  go,
}: AdminPageProps & {
  params: URLSearchParams;
  go: (p: Record<string, string | null>, replace?: boolean) => void;
}) {
  const { t } = useT();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const query = new URLSearchParams();
  for (const key of ['status', 'q', 'page']) if (params.get(key)) query.set(key, params.get(key)!);
  const list = useQuery({
    queryKey: ['shop', 'orders', query.toString()],
    queryFn: () =>
      api<{ items: OrderListItem[]; total: number; statuses: Record<string, number> }>(
        'GET',
        `/orders?${query}`,
      ),
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get('q') ?? '') !== search.trim())
        go({ q: search.trim() || null, page: null }, true);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const data = list.data;
  const status = params.get('status');
  const page = Number(params.get('page') ?? 1);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 50));
  const all = Object.values(data?.statuses ?? {}).reduce((a, b) => a + b, 0);
  return (
    <div className="sh-stack">
      <div className="sh-row sh-between">
        <h1>{t('Orders')}</h1>
        <input
          type="search"
          aria-label={t('Search orders')}
          placeholder={t('Number, email or name')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <nav className="sh-tabs" aria-label={t('Status')}>
        <button
          type="button"
          aria-current={!status}
          onClick={() => go({ status: null, page: null }, true)}
        >
          {t('All')} ({all})
        </button>
        {STATUSES.filter((s) => data?.statuses[s]).map((s) => (
          <button
            key={s}
            type="button"
            aria-current={status === s}
            onClick={() => go({ status: s, page: null }, true)}
          >
            {t(STATUS_LABEL[s]!)} ({data?.statuses[s] ?? 0})
          </button>
        ))}
      </nav>
      {list.error && <Alert>{errorMessage(list.error)}</Alert>}
      <div className="sh-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="sh-table">
          <thead>
            <tr>
              <th>{t('Order')}</th>
              <th>{t('Date')}</th>
              <th>{t('Customer')}</th>
              <th className="sh-hide-sm">{t('Payment')}</th>
              <th>{t('Status')}</th>
              <th className="num">{t('Total')}</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((order) => (
              <tr key={order.id} onClick={() => go({ order: order.id })}>
                <td>
                  <button
                    type="button"
                    className="sh-link"
                    style={{ fontWeight: 600, textDecoration: 'none' }}
                    onClick={() => go({ order: order.id })}
                  >
                    #{order.number}
                  </button>
                </td>
                <td>
                  {new Date(order.createdAt).toLocaleString(user.locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </td>
                <td>
                  {order.name}
                  <div className="sh-small sh-muted">
                    {order.email}
                    {order.city ? ` · ${order.city}` : ''}
                  </div>
                </td>
                <td className="sh-hide-sm">{order.paymentTitle}</td>
                <td>
                  <span className={`sh-badge ${STATUS_BADGE[order.status]}`}>
                    {t(STATUS_LABEL[order.status]!)}
                  </span>
                </td>
                <td className="num">
                  {formatMoney(order.total, order.currency, user.locale)}
                  <div className="sh-small sh-muted">{t('{n} items', { n: order.items })}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && (
          <p className="sh-muted" style={{ padding: '1rem' }}>
            {t('No orders yet.')}
          </p>
        )}
      </div>
      {pages > 1 && (
        <div className="sh-row" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="sh-btn"
            disabled={page <= 1}
            onClick={() => go({ page: String(page - 1) }, true)}
          >
            ←
          </button>
          <span>
            {page} / {pages}
          </span>
          <button
            type="button"
            className="sh-btn"
            disabled={page >= pages}
            onClick={() => go({ page: String(page + 1) }, true)}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}

const EMAIL_LABELS: Record<EmailId, string> = {
  new_order: 'New order (to the shop)',
  cancelled_order: 'Cancelled order (to the shop)',
  failed_order: 'Failed order (to the shop)',
  customer_on_hold: 'Order received',
  customer_processing: 'Processing order',
  customer_completed: 'Completed order',
  customer_refunded: 'Refunded order',
  customer_note: 'Note to the customer',
};

function OrderView({
  api,
  user,
  id,
  onClose,
}: AdminPageProps & { id: string; onClose: () => void }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const key = ['shop', 'order', id];
  const detail = useQuery({
    queryKey: key,
    queryFn: () => api<OrderDetail>('GET', `/orders/${id}`),
  });
  const [status, setStatus] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);
  const done = (text: string) => async (data: unknown) => {
    if (data && typeof data === 'object' && 'order' in data) queryClient.setQueryData(key, data);
    else await queryClient.invalidateQueries({ queryKey: key });
    await queryClient.invalidateQueries({ queryKey: ['shop', 'orders'] });
    setMessage(text);
  };
  const changeStatus = useMutation({
    mutationFn: () => api<OrderDetail>('PATCH', `/orders/${id}/status`, { status }),
    onSuccess: done(t('Status changed.')),
  });
  const [note, setNote] = useState('');
  const [toCustomer, setToCustomer] = useState(false);
  const addNote = useMutation({
    mutationFn: () =>
      api<OrderDetail>('POST', `/orders/${id}/notes`, { note, customer: toCustomer }),
    onSuccess: async (data) => {
      setNote('');
      await done(toCustomer ? t('Note sent to the customer.') : t('Note added.'))(data);
    },
  });
  const [email, setEmail] = useState<EmailId>('customer_on_hold');
  const resend = useMutation({
    mutationFn: () => api('POST', `/orders/${id}/emails/${email}`),
    onSuccess: () => setMessage(t('Email sent.')),
  });
  const print = useMutation({
    mutationFn: () => api<{ html: string }>('POST', '/emails/new_order/preview', { order: id }),
    onSuccess: ({ html }) => {
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(html);
      win.document.close();
      win.focus();
      win.print();
    },
  });
  const data = detail.data;
  useEffect(() => {
    if (data) setStatus(data.order.status);
  }, [data?.order.status]);
  if (detail.error) return <Alert>{errorMessage(detail.error)}</Alert>;
  if (!data) return <p className="sh-muted">{t('Loading…')}</p>;
  const { order, items } = data;
  const money = (value: string | number) => formatMoney(String(value), order.currency, user.locale);
  const includeTax = order.pricesIncludeTax;
  const gross = (i: { total: string; tax: string }) =>
    Number(i.total) + (includeTax ? Number(i.tax) : 0);
  const products = items.filter((i) => i.kind === 'product');
  const errors = changeStatus.error ?? addNote.error ?? resend.error ?? print.error;
  return (
    <div className="sh-stack">
      <div className="sh-row sh-between">
        <div className="sh-row">
          <button type="button" className="sh-btn" onClick={onClose}>
            ← {t('Orders')}
          </button>
          <h1>{t('Order #{number}', { number: order.number })}</h1>
          <span className={`sh-badge ${STATUS_BADGE[order.status]}`}>
            {t(STATUS_LABEL[order.status]!)}
          </span>
        </div>
        <button
          type="button"
          className="sh-btn"
          disabled={print.isPending}
          onClick={() => print.mutate()}
        >
          {t('Print')}
        </button>
      </div>
      <p className="sh-muted">
        {new Date(order.createdAt).toLocaleString(user.locale, {
          dateStyle: 'long',
          timeStyle: 'short',
        })}{' '}
        · {order.paymentTitle}
        {order.paidAt &&
          ` · ${t('Paid on {date}', { date: new Date(order.paidAt).toLocaleDateString(user.locale) })}`}
      </p>
      {errors && <Alert>{errorMessage(errors)}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}

      <div className="sh-order">
        <div className="sh-stack">
          <section className="sh-card">
            <h2>{t('Products')}</h2>
            <table className="sh-table">
              <tbody>
                {products.map((item) => (
                  <tr key={item.id} style={{ cursor: 'default' }}>
                    <td>
                      {item.name}
                      {item.attributes.length > 0 && (
                        <div className="sh-small sh-muted">
                          {item.attributes.map((a) => `${a.name}: ${a.value}`).join(' · ')}
                        </div>
                      )}
                      {item.sku && <div className="sh-small sh-muted">{item.sku}</div>}
                    </td>
                    <td className="num">× {item.quantity}</td>
                    <td className="num">{money(gross(item))}</td>
                  </tr>
                ))}
                {items
                  .filter((i) => i.kind !== 'product')
                  .map((item) => (
                    <tr key={item.id} style={{ cursor: 'default' }}>
                      <td colSpan={2} className="sh-muted">
                        {item.kind === 'shipping' ? t('Shipping') : item.name}
                      </td>
                      <td className="num">{gross(item) === 0 ? t('Free') : money(gross(item))}</td>
                    </tr>
                  ))}
                {!includeTax &&
                  order.taxes.map((tax) => (
                    <tr key={tax.rate} style={{ cursor: 'default' }}>
                      <td colSpan={2} className="sh-muted">
                        {t('Tax ({rate}%)', { rate: tax.rate })}
                      </td>
                      <td className="num">{money(tax.amount)}</td>
                    </tr>
                  ))}
                <tr style={{ cursor: 'default' }}>
                  <th colSpan={2}>{t('Total')}</th>
                  <th className="num">{money(order.total)}</th>
                </tr>
                {Number(data.refunded) > 0 && (
                  <tr style={{ cursor: 'default' }}>
                    <td colSpan={2} className="sh-error">
                      {t('Refunded')}
                    </td>
                    <td className="num sh-error">−{money(data.refunded)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <Refund api={api} detail={data} money={money} onDone={done(t('Refund recorded.'))} />

          <section className="sh-card sh-stack">
            <h2>{t('Notes')}</h2>
            <form
              className="sh-stack"
              onSubmit={(e) => {
                e.preventDefault();
                if (note.trim()) addNote.mutate();
              }}
            >
              <textarea
                aria-label={t('Note')}
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="sh-row sh-between">
                <label className="sh-check">
                  <input
                    type="checkbox"
                    checked={toCustomer}
                    onChange={(e) => setToCustomer(e.target.checked)}
                  />
                  {t('Send it to the customer by email')}
                </label>
                <button
                  type="submit"
                  className="sh-btn"
                  disabled={!note.trim() || addNote.isPending}
                >
                  {t('Add note')}
                </button>
              </div>
            </form>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="sh-stack">
              {data.notes.map((n) => (
                <li
                  key={n.id}
                  className="sh-small"
                  style={{
                    borderLeft: `3px solid ${n.customer ? 'var(--color-sky-600)' : 'var(--color-slate-300)'}`,
                    paddingLeft: '.6rem',
                  }}
                >
                  <div style={{ whiteSpace: 'pre-wrap' }}>{n.note}</div>
                  <div className="sh-muted">
                    {new Date(n.createdAt).toLocaleString(user.locale, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                    {n.author ? ` · ${n.author}` : ''}
                    {n.customer ? ` · ${t('sent to the customer')}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="sh-stack">
          <section className="sh-card sh-stack">
            <h2>{t('Status')}</h2>
            <div className="sh-row">
              <select
                aria-label={t('Status')}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(STATUS_LABEL[s]!)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="sh-btn sh-btn-primary"
                disabled={status === order.status || changeStatus.isPending}
                onClick={() => changeStatus.mutate()}
              >
                {t('Change status')}
              </button>
            </div>
            <p className="sh-small sh-muted">
              {t(
                'Cancelled, failed and pending orders put their products back in stock; the customer gets an email when the order is processed, completed or refunded.',
              )}
            </p>
          </section>

          <section className="sh-card sh-stack">
            <h2>{t('Customer')}</h2>
            <div className="sh-grid-2">
              <div>
                <strong>{t('Billing address')}</strong>
                <p style={{ margin: '.3rem 0' }}>
                  {[
                    `${order.billing.firstName} ${order.billing.lastName}`,
                    order.billing.company,
                    order.billing.address1,
                    order.billing.address2,
                    `${order.billing.postcode} ${order.billing.city} ${order.billing.province ? `(${order.billing.province})` : ''}`,
                    countryName(order.billing.country, user.locale),
                  ]
                    .filter((l) => l.trim())
                    .map((l, i) => (
                      <span key={i}>
                        {l}
                        <br />
                      </span>
                    ))}
                </p>
                <a href={`mailto:${order.email}`}>{order.email}</a>
                {order.billing.phone && (
                  <>
                    <br />
                    <a href={`tel:${order.billing.phone.replace(/\s+/g, '')}`}>
                      {order.billing.phone}
                    </a>
                  </>
                )}
              </div>
              <div>
                <strong>{t('Shipping address')}</strong>
                <p style={{ margin: '.3rem 0' }}>
                  {[
                    `${order.shipping.firstName} ${order.shipping.lastName}`,
                    order.shipping.company,
                    order.shipping.address1,
                    order.shipping.address2,
                    `${order.shipping.postcode} ${order.shipping.city} ${order.shipping.province ? `(${order.shipping.province})` : ''}`,
                    countryName(order.shipping.country, user.locale),
                  ]
                    .filter((l) => l.trim())
                    .map((l, i) => (
                      <span key={i}>
                        {l}
                        <br />
                      </span>
                    ))}
                </p>
              </div>
            </div>
            {order.invoice && (
              <div>
                <strong>{t('Invoice details')}</strong>
                <p className="sh-small" style={{ margin: '.3rem 0' }}>
                  {order.invoice.taxCode && (
                    <>
                      {t('Tax code')}: {order.invoice.taxCode}
                      <br />
                    </>
                  )}
                  {order.invoice.vatNumber && (
                    <>
                      {t('VAT number')}: {order.invoice.vatNumber}
                      <br />
                    </>
                  )}
                  {order.invoice.sdi && (
                    <>
                      SDI: {order.invoice.sdi}
                      <br />
                    </>
                  )}
                  {order.invoice.pec && <>PEC: {order.invoice.pec}</>}
                </p>
              </div>
            )}
            {order.customerNote && (
              <div>
                <strong>{t('Customer note')}</strong>
                <p style={{ margin: '.3rem 0', whiteSpace: 'pre-wrap' }}>{order.customerNote}</p>
              </div>
            )}
          </section>

          <section className="sh-card sh-stack">
            <h2>{t('Emails')}</h2>
            <div className="sh-row">
              <select
                aria-label={t('Email to send')}
                value={email}
                onChange={(e) => setEmail(e.target.value as EmailId)}
              >
                {(Object.keys(EMAIL_LABELS) as EmailId[])
                  .filter((e) => e !== 'customer_note')
                  .map((e) => (
                    <option key={e} value={e}>
                      {t(EMAIL_LABELS[e])}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="sh-btn"
                disabled={resend.isPending}
                onClick={() => resend.mutate()}
              >
                {t('Send again')}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Refund({
  api,
  detail,
  money,
  onDone,
}: {
  api: ShopApi;
  detail: OrderDetail;
  money: (value: string | number) => string;
  onDone: (data: unknown) => Promise<void>;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(detail.refundable);
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState<Record<string, number>>({});
  const save = useMutation({
    mutationFn: () =>
      api<OrderDetail>('POST', `/orders/${detail.order.id}/refunds`, {
        amount,
        reason,
        restock: Object.entries(restock)
          .filter(([, q]) => q > 0)
          .map(([item, quantity]) => ({ item, quantity })),
      }),
    onSuccess: async (data) => {
      setOpen(false);
      setRestock({});
      setReason('');
      setAmount(data.refundable);
      await onDone(data);
    },
  });
  if (Number(detail.refundable) <= 0 && detail.refunds.length === 0) return null;
  return (
    <section className="sh-card sh-stack">
      <div className="sh-row sh-between">
        <h2 style={{ margin: 0 }}>{t('Refunds')}</h2>
        {Number(detail.refundable) > 0 && !open && (
          <button type="button" className="sh-btn" onClick={() => setOpen(true)}>
            {t('Refund')}
          </button>
        )}
      </div>
      {detail.refunds.map((r) => (
        <p key={r.id} className="sh-small" style={{ margin: 0 }}>
          −{money(r.amount)} · {new Date(r.createdAt).toLocaleDateString()}{' '}
          {r.reason ? `· ${r.reason}` : ''}
        </p>
      ))}
      {open && (
        <form
          className="sh-stack"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <p className="sh-small sh-muted">
            {t(
              'Give the money back to the customer (for example with a bank transfer), then record it here: up to {amount}.',
              {
                amount: money(detail.refundable),
              },
            )}
          </p>
          <div className="sh-grid">
            <label className="sh-field">
              <span>{t('Amount')}</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="sh-field">
              <span>{t('Reason')}</span>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          </div>
          {detail.items.some((i) => i.kind === 'product' && i.stockReduced > 0) && (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="sh-stack">
              <legend className="sh-small" style={{ fontWeight: 600 }}>
                {t('Put back in stock')}
              </legend>
              {detail.items
                .filter((i) => i.kind === 'product' && i.stockReduced > 0)
                .map((item) => (
                  <label key={item.id} className="sh-row">
                    <input
                      type="number"
                      min={0}
                      max={item.stockReduced}
                      value={restock[item.id] ?? 0}
                      style={{ width: '5rem' }}
                      onChange={(e) =>
                        setRestock({
                          ...restock,
                          [item.id]: Math.min(
                            item.stockReduced,
                            Math.max(0, Number(e.target.value)),
                          ),
                        })
                      }
                    />
                    <span>
                      {item.name}{' '}
                      <span className="sh-muted sh-small">
                        ({t('up to {n}', { n: item.stockReduced })})
                      </span>
                    </span>
                  </label>
                ))}
            </fieldset>
          )}
          {save.error && <Alert>{errorMessage(save.error)}</Alert>}
          <div className="sh-row">
            <button type="submit" className="sh-btn sh-btn-primary" disabled={save.isPending}>
              {t('Record the refund')}
            </button>
            <button type="button" className="sh-btn" onClick={() => setOpen(false)}>
              {t('Cancel')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
