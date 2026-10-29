import { adminUrl, Alert, errorMessage, useT, type AdminPageProps } from '@cleitext/admin-sdk';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { CustomerListItem } from '../customers';
import { downloadCsv } from './report-ui';
import { formatMoney, useAddress } from './shared';
import { CSS } from './styles';

/** The country's name in the admin's language. */
function countryName(code: string, locale: string): string {
  if (!code) return '';
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

interface CustomerList {
  items: CustomerListItem[];
  total: number;
  countries: string[];
  currency: string;
}

const PER_PAGE = 50;

const COLUMNS: { key: string; label: string; num?: boolean }[] = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'registeredAt', label: 'Sign up' },
  { key: 'lastOrder', label: 'Last order' },
  { key: 'orders', label: 'Orders', num: true },
  { key: 'spent', label: 'Total spend', num: true },
  { key: 'aov', label: 'AOV', num: true },
  { key: 'country', label: 'Country' },
  { key: 'city', label: 'City' },
];

/** Cleishop → Customers: people with an account and guests, by email. */
export function CustomersPage({ api, user }: AdminPageProps) {
  const { t } = useT();
  const address = useAddress();
  const [params, setParams] = useState(() => address.read());
  useEffect(() => {
    const update = () => setParams(address.read());
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  const go = address.go;
  const [search, setSearch] = useState(params.get('q') ?? '');
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get('q') ?? '') !== search.trim())
        go({ q: search.trim() || null, page: null }, true);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filters = new URLSearchParams();
  for (const key of ['q', 'kind', 'country', 'minOrders', 'sort', 'order'])
    if (params.get(key)) filters.set(key, params.get(key)!);
  const page = Number(params.get('page') ?? 1);
  const query = new URLSearchParams(filters);
  query.set('page', String(page));
  query.set('perPage', String(PER_PAGE));
  const list = useQuery({
    queryKey: ['shop', 'customers', query.toString()],
    queryFn: () => api<CustomerList>('GET', `/customers?${query}`),
    placeholderData: keepPreviousData,
  });
  const data = list.data;
  const money = (v: number) => formatMoney(v, data?.currency ?? 'EUR', user.locale);
  const day = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(user.locale, { dateStyle: 'medium' }) : '—';
  const sort = params.get('sort') ?? 'lastOrder';
  const order = params.get('order') ?? 'desc';
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PER_PAGE));
  const ordersOf = (c: CustomerListItem) =>
    adminUrl(`/ext/shop/orders?q=${encodeURIComponent(c.email)}`);

  /** Every customer matching the filters, as CSV. */
  const exportCsv = useMutation({
    mutationFn: async () => {
      const all = new URLSearchParams(filters);
      all.set('perPage', '10000');
      const result = await api<CustomerList>('GET', `/customers?${all}`);
      downloadCsv('customers.csv', [
        [...COLUMNS.map((c) => t(c.label)), t('Account')],
        ...result.items.map((c) => [
          c.name,
          c.email,
          c.registeredAt?.slice(0, 10) ?? '',
          c.lastOrder?.slice(0, 10) ?? '',
          c.orders,
          c.spent,
          c.aov,
          c.country,
          c.city,
          t(c.registered ? 'Registered' : 'Guest'),
        ]),
      ]);
    },
  });

  return (
    <div className="sh sh-stack">
      <style>{CSS}</style>
      <div className="sh-row sh-between">
        <h1>{t('Customers')}</h1>
        <button
          type="button"
          className="sh-btn"
          disabled={exportCsv.isPending || !data?.total}
          onClick={() => exportCsv.mutate()}
        >
          {t('Download CSV')}
        </button>
      </div>
      <p className="sh-muted" style={{ margin: 0 }}>
        {t(
          'Everyone who bought or signed up, merged by email. Orders and spending count paid orders (processing, on hold, completed) less refunds.',
        )}
      </p>
      <div className="sh-filters">
        <label className="sh-field">
          <span>{t('Search')}</span>
          <input
            type="search"
            placeholder={t('Name, email or city')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="sh-field">
          <span>{t('Account')}</span>
          <select
            value={params.get('kind') ?? ''}
            onChange={(e) => go({ kind: e.target.value || null, page: null }, true)}
          >
            <option value="">{t('All')}</option>
            <option value="registered">{t('Registered')}</option>
            <option value="guest">{t('Guest')}</option>
          </select>
        </label>
        <label className="sh-field">
          <span>{t('Country')}</span>
          <select
            value={params.get('country') ?? ''}
            onChange={(e) => go({ country: e.target.value || null, page: null }, true)}
          >
            <option value="">{t('All')}</option>
            {(data?.countries ?? []).map((c) => (
              <option key={c} value={c}>
                {countryName(c, user.locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="sh-check">
          <input
            type="checkbox"
            checked={params.get('minOrders') === '1'}
            onChange={(e) => go({ minOrders: e.target.checked ? '1' : null, page: null }, true)}
          />
          {t('Only those who ordered')}
        </label>
      </div>
      {list.error && <Alert>{errorMessage(list.error)}</Alert>}
      {exportCsv.error && <Alert>{errorMessage(exportCsv.error)}</Alert>}
      <div className="sh-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="sh-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={c.num ? 'num' : undefined}
                  aria-sort={
                    sort === c.key ? (order === 'asc' ? 'ascending' : 'descending') : 'none'
                  }
                >
                  <button
                    type="button"
                    onClick={() =>
                      go(
                        {
                          sort: c.key,
                          order: sort === c.key && order === 'desc' ? 'asc' : 'desc',
                          page: null,
                        },
                        true,
                      )
                    }
                  >
                    {t(c.label)}
                    {sort === c.key ? (order === 'asc' ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.items.map((c) => (
              <tr key={c.email} onClick={() => (window.location.href = ordersOf(c))}>
                <td>
                  <a href={ordersOf(c)} onClick={(e) => e.stopPropagation()}>
                    {c.name || '—'}
                  </a>
                  <div className="sh-small sh-muted">
                    {t(c.registered ? 'Registered' : 'Guest')}
                  </div>
                </td>
                <td>{c.email}</td>
                <td>{day(c.registeredAt)}</td>
                <td>{day(c.lastOrder)}</td>
                <td className="num">{c.orders}</td>
                <td className="num">{money(c.spent)}</td>
                <td className="num">{c.orders ? money(c.aov) : '—'}</td>
                <td>{countryName(c.country, user.locale)}</td>
                <td>{c.city}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && (
          <p className="sh-muted" style={{ padding: '1rem' }}>
            {t('No customers yet.')}
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
          <span className="sh-muted">{t('Page {page} of {pages}', { page, pages })}</span>
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
