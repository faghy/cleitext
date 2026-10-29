import { adminUrl, Alert, errorMessage, useT, type AdminPageProps } from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import type { Stats, StockRow } from '../analytics';
import { Chart } from './chart';
import { useFormat } from './analytics';
import { STATUS_BADGE, STATUS_LABEL } from './orders';
import { dateLabeller, Delta } from './report-ui';
import { formatMoney } from './shared';
import { CSS } from './styles';

interface Home {
  today: { current: Stats; previous: Stats };
  week: { current: Stats; previous: Stats };
  month: { current: Stats; previous: Stats };
  chart: {
    current: { date: string; values: Stats }[];
    previous: { date: string; values: Stats }[];
  };
  toFulfil: {
    count: number;
    latest: {
      id: string;
      number: number;
      status: string;
      total: string;
      name: string;
      createdAt: string;
    }[];
  };
  stock: { low: StockRow[]; out: StockRow[]; lowCount: number; outCount: number };
  reviewsPending: number;
  checklist: Record<'product' | 'payments' | 'shipping' | 'taxes' | 'email', boolean>;
  checklistHidden: boolean;
  canTestEmail: boolean;
  currency: string;
  /** Today on the site's calendar. */
  date: string;
}

/**
 * Cleishop's main page. Addresses of the products list from before 1.11
 * (`/ext/shop?product=…`, its filters) go on to Products.
 */
export function ShopMainPage(props: AdminPageProps) {
  const legacy = window.location.search.length > 1;
  useEffect(() => {
    if (!legacy) return;
    window.history.replaceState(
      null,
      '',
      `${adminUrl('/ext/shop/products')}${window.location.search}`,
    );
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [legacy]);
  return legacy ? null : <HomePage {...props} />;
}

const link = (path: string) => adminUrl(`/ext/shop${path}`);

/** The store's home: how it is going, what needs doing and the first steps. */
export function HomePage({ api, user }: AdminPageProps) {
  const { t } = useT();
  const client = useQueryClient();
  const home = useQuery({
    queryKey: ['shop', 'home'],
    queryFn: () => api<Home>('GET', '/home'),
  });
  const hide = useMutation({
    mutationFn: (hidden: boolean) => api('PUT', '/home/checklist', { hidden }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['shop', 'home'] }),
  });
  const testEmail = useMutation({
    mutationFn: () => api<{ to: string[] }>('POST', '/emails/test', { locale: user.locale }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['shop', 'home'] }),
  });
  const data = home.data;
  const format = useFormat(data?.currency ?? 'EUR', user.locale);
  const money = (v: number | string) => formatMoney(v, data?.currency ?? 'EUR', user.locale);

  const period = (label: string, numbers: { current: Stats; previous: Stats }) => (
    <div className="sh-tile">
      <span className="sh-tile-label">{t(label)}</span>
      <span className="sh-tile-value">{money(numbers.current.total)}</span>
      <span className="sh-small sh-muted">
        <Delta now={numbers.current.total} before={numbers.previous.total} locale={user.locale} />{' '}
        {t('{n} orders', { n: numbers.current.orders })} ·{' '}
        {t('net {amount}', { amount: money(numbers.current.net) })}
      </span>
    </div>
  );

  const steps: { key: keyof Home['checklist']; label: string; action: ReactNode }[] = [
    {
      key: 'product',
      label: 'Add your first product',
      action: <a href={link('/products?product=new')}>{t('Add product')}</a>,
    },
    {
      key: 'payments',
      label: 'Choose how customers pay',
      action: <a href={link('/payments')}>{t('Set up payments')}</a>,
    },
    {
      key: 'shipping',
      label: 'Set up shipping',
      action: <a href={link('/shipping')}>{t('Set up shipping')}</a>,
    },
    {
      key: 'taxes',
      label: 'Set up taxes',
      action: <a href={link('/taxes')}>{t('Set up taxes')}</a>,
    },
    {
      key: 'email',
      label: 'Send a test email',
      action: data?.canTestEmail ? (
        <button
          type="button"
          className="sh-link"
          disabled={testEmail.isPending}
          onClick={() => testEmail.mutate()}
        >
          {t('Send it')}
        </button>
      ) : (
        <a href={adminUrl('/settings#plugin-shop')}>{t('Set the address for new orders')}</a>
      ),
    },
  ];
  const done = data ? steps.filter((s) => data.checklist[s.key]).length : 0;

  return (
    <div className="sh sh-stack">
      <style>{CSS}</style>
      <div className="sh-row sh-between">
        <h1>{t('Overview')}</h1>
        <a className="sh-btn" href={link('/analytics')}>
          {t('All reports')}
        </a>
      </div>
      {home.error && <Alert>{errorMessage(home.error)}</Alert>}
      {data && (
        <div className="sh-home">
          <div className="sh-stack">
            <div className="sh-tiles">
              {period('Today', data.today)}
              {period('This week', data.week)}
              {period('This month', data.month)}
            </div>
            <div className="sh-card">
              <Chart
                title={t('Revenue, last 30 days')}
                current={{
                  label: t('Last 30 days'),
                  points: data.chart.current.map((i) => ({ date: i.date, value: i.values.total })),
                }}
                previous={{
                  label: t('The 30 days before'),
                  points: data.chart.previous.map((i) => ({ date: i.date, value: i.values.total })),
                }}
                format={format.axis('money')}
                dateLabel={dateLabeller(user.locale, 'day')}
              />
            </div>
            <div className="sh-card">
              <div className="sh-row sh-between">
                <h2>
                  {t('Orders to fulfil')} ({data.toFulfil.count})
                </h2>
                {data.toFulfil.count > 0 && (
                  <a href={link('/orders?status=processing')}>{t('See all')}</a>
                )}
              </div>
              {data.toFulfil.latest.length === 0 ? (
                <p className="sh-muted" style={{ margin: 0 }}>
                  {t('Nothing to fulfil. Well done!')}
                </p>
              ) : (
                <ul className="sh-list">
                  {data.toFulfil.latest.map((o) => (
                    <li key={o.id}>
                      <span>
                        <a href={link(`/orders?order=${o.id}`)}>#{o.number}</a> {o.name}{' '}
                        <span className={`sh-badge ${STATUS_BADGE[o.status] ?? ''}`}>
                          {t(STATUS_LABEL[o.status] ?? o.status)}
                        </span>
                      </span>
                      <span className="num">{money(o.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="sh-stack">
            {!data.checklistHidden && (
              <div className="sh-card">
                <div className="sh-row sh-between">
                  <h2>{t('Get started')}</h2>
                  <span className="sh-small sh-muted">
                    {t('{done} of {total}', { done, total: steps.length })}
                  </span>
                </div>
                <ul className="sh-checklist">
                  {steps.map((step) => (
                    <li key={step.key} className={data.checklist[step.key] ? 'is-done' : ''}>
                      <span className="sh-check-mark" aria-hidden="true">
                        {data.checklist[step.key] ? '✓' : ''}
                      </span>
                      <span className="sh-check-text" style={{ flex: 1 }}>
                        {t(step.label)}
                        {data.checklist[step.key] && <span className="sh-sr"> ({t('done')})</span>}
                      </span>
                      {!data.checklist[step.key] && step.action}
                    </li>
                  ))}
                </ul>
                {testEmail.error && <Alert>{errorMessage(testEmail.error)}</Alert>}
                {testEmail.data && (
                  <p className="sh-small sh-muted">
                    {t('Sent to {to}.', { to: testEmail.data.to.join(', ') })}
                  </p>
                )}
                <button
                  type="button"
                  className="sh-link sh-small"
                  onClick={() => hide.mutate(true)}
                >
                  {t('Hide this list')}
                </button>
              </div>
            )}
            <div className="sh-card">
              <h2>{t('Stock')}</h2>
              <ul className="sh-list">
                <li>
                  <a href={link('/analytics?report=stock&filter=outofstock')}>
                    {t('Out of stock')}
                  </a>
                  <span
                    className={`sh-badge ${data.stock.outCount ? 'sh-badge-out' : 'sh-badge-ok'}`}
                  >
                    {data.stock.outCount}
                  </span>
                </li>
                <li>
                  <a href={link('/analytics?report=stock&filter=lowstock')}>{t('Low stock')}</a>
                  <span
                    className={`sh-badge ${data.stock.lowCount ? 'sh-badge-warn' : 'sh-badge-ok'}`}
                  >
                    {data.stock.lowCount}
                  </span>
                </li>
                {[...data.stock.out, ...data.stock.low].slice(0, 5).map((s) => (
                  <li key={s.id} className="sh-small">
                    <a href={link(`/products?product=${s.productId}`)}>{s.name}</a>
                    <span className="sh-muted">
                      {s.stock === null ? '—' : t('{n} left', { n: s.stock })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="sh-card">
              <h2>{t('Reviews')}</h2>
              <p style={{ margin: 0 }}>
                {data.reviewsPending === 0 ? (
                  <span className="sh-muted">{t('No reviews to approve.')}</span>
                ) : (
                  <a href={link('/reviews?status=pending')}>
                    {data.reviewsPending >= 100
                      ? t('100+ reviews to approve')
                      : data.reviewsPending === 1
                        ? t('1 review to approve')
                        : t('{n} reviews to approve', { n: data.reviewsPending })}
                  </a>
                )}
              </p>
            </div>
            {data.checklistHidden && (
              <button type="button" className="sh-link sh-small" onClick={() => hide.mutate(false)}>
                {t('Show the “Get started” list')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
