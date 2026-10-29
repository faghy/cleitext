import { adminUrl, Alert, errorMessage, useT, type AdminPageProps } from '@cleitext/admin-sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type {
  CategoryReportRow,
  CouponReportRow,
  CouponStats,
  OrderReportRow,
  ProductReportRow,
  SoldStats,
  Stats,
  StockKind,
  StockRow,
  TaxReportRow,
  TopCustomer,
  VariationReportRow,
} from '../analytics';
import type { Interval } from '../analytics-dates';
import type { Report } from '../reports-routes';
import { Chart } from './chart';
import { STATUS_BADGE, STATUS_LABEL } from './orders';
import {
  DataTable,
  DateControls,
  dateLabeller,
  rangeLabel,
  readParams,
  reportQuery,
  Tiles,
  type Column,
  type Metric,
} from './report-ui';
import { formatMoney, useAddress, useSetup, type ShopApi } from './shared';
import { CSS } from './styles';

/**
 * Cleishop → Analytics: the reports (`?report=`), each with its range, the
 * numbers against the compared period, a chart and a table.
 */

const REPORTS = [
  'overview',
  'revenue',
  'orders',
  'products',
  'variations',
  'categories',
  'coupons',
  'taxes',
  'stock',
] as const;
type ReportId = (typeof REPORTS)[number];
const REPORT_LABEL: Record<ReportId, string> = {
  overview: 'Overview',
  revenue: 'Revenue',
  orders: 'Orders',
  products: 'Products',
  variations: 'Variations',
  categories: 'Categories',
  coupons: 'Coupons',
  taxes: 'Taxes',
  stock: 'Stock',
};

const STOCK_LABEL: Record<StockKind, string> = {
  instock: 'In stock',
  lowstock: 'Low stock',
  outofstock: 'Out of stock',
  onbackorder: 'On backorder',
};
const STOCK_BADGE: Record<StockKind, string> = {
  instock: 'sh-badge-ok',
  lowstock: 'sh-badge-warn',
  outofstock: 'sh-badge-out',
  onbackorder: 'sh-badge-info',
};

/** Amounts and counts in the admin's language; the axis in short form (1.2K €). */
export function useFormat(currency: string, locale: string) {
  const value = (v: number, kind: 'money' | 'number') =>
    kind === 'money'
      ? formatMoney(v, currency, locale)
      : v.toLocaleString(locale, { maximumFractionDigits: 2, useGrouping: 'always' });
  const axis = (kind: 'money' | 'number') => (v: number) => {
    try {
      return new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: 1,
        ...(kind === 'money' ? { style: 'currency', currency } : {}),
      }).format(v);
    } catch {
      return String(v);
    }
  };
  return { value, axis };
}

export function AnalyticsPage(props: AdminPageProps) {
  const { t } = useT();
  const address = useAddress();
  const [params, setParams] = useState(() => address.read());
  useEffect(() => {
    const update = () => setParams(address.read());
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  const report = (REPORTS as readonly string[]).includes(params.get('report') ?? '')
    ? (params.get('report') as ReportId)
    : 'overview';
  return (
    <div className="sh sh-stack">
      <style>{CSS}</style>
      <h1>{t('Analytics')}</h1>
      <nav className="sh-tabs" aria-label={t('Reports')}>
        {REPORTS.map((r) => (
          <button
            key={r}
            type="button"
            aria-current={report === r}
            onClick={() => address.go({ report: r === 'overview' ? null : r, filter: null })}
          >
            {t(REPORT_LABEL[r])}
          </button>
        ))}
      </nav>
      {report === 'stock' ? (
        <StockReport {...props} params={params} go={address.go} />
      ) : (
        <DatedReport key={report} {...props} report={report} params={params} go={address.go} />
      )}
    </div>
  );
}

type Go = (p: Record<string, string | null>, replace?: boolean) => void;

function DatedReport({
  api,
  user,
  report,
  params,
  go,
}: AdminPageProps & { report: Exclude<ReportId, 'stock'>; params: URLSearchParams; go: Go }) {
  const { t } = useT();
  const range = readParams(params);
  const query = reportQuery(range);
  const data = useQuery({
    queryKey: ['shop', 'analytics', report, query],
    queryFn: () => api<Report<unknown, unknown>>('GET', `/analytics/${report}?${query}`),
    placeholderData: keepPreviousData,
  });
  const shown = data.data;
  return (
    <div className="sh-stack">
      <DateControls
        key={`${range.period}-${shown?.range.after ?? ''}`}
        params={range}
        shown={shown}
        go={go}
      />
      {shown && (
        <p className="sh-small sh-muted" style={{ margin: '.5rem 0 0' }}>
          {rangeLabel(user.locale, shown.range)}
          {shown.previousRange &&
            ` · ${t('compared with {range}', { range: rangeLabel(user.locale, shown.previousRange) })}`}
        </p>
      )}
      {data.error && <Alert>{errorMessage(data.error)}</Alert>}
      {shown && (
        <ReportBody
          api={api}
          locale={user.locale}
          report={report}
          data={shown}
          metric={params.get('chart')}
          setMetric={(key) => go({ chart: key }, true)}
        />
      )}
    </div>
  );
}

/** Tiles, and the chart of the chosen one. */
function Numbers<T>({
  data,
  metrics,
  kind = 'line',
  metric,
  setMetric,
  locale,
}: {
  data: Report<unknown, unknown>;
  metrics: Metric<T>[];
  kind?: 'line' | 'bar';
  metric: string | null;
  setMetric: (key: string) => void;
  locale: string;
}) {
  const { t } = useT();
  const format = useFormat(data.currency, locale);
  const current = data.current as { totals: T; intervals: { date: string; values: T }[] };
  const previous = data.previous as typeof current | null;
  const chosen = metrics.find((m) => m.key === metric) ?? metrics[0]!;
  const points = (series: typeof current) =>
    series.intervals.map((i) => ({ date: i.date, value: Number(i.values[chosen.key] ?? 0) }));
  return (
    <>
      <Tiles
        metrics={metrics}
        current={current.totals}
        previous={previous?.totals}
        selected={chosen.key}
        onSelect={setMetric}
        format={format.value}
        locale={locale}
      />
      <div className="sh-card">
        <Chart
          title={t(chosen.label)}
          kind={kind}
          current={{ label: rangeLabel(locale, data.range), points: points(current) }}
          previous={
            previous && data.previousRange
              ? { label: rangeLabel(locale, data.previousRange), points: points(previous) }
              : null
          }
          format={format.axis(chosen.kind)}
          dateLabel={dateLabeller(locale, data.interval)}
        />
      </div>
    </>
  );
}

function ReportBody({
  api,
  locale,
  report,
  data,
  metric,
  setMetric,
}: {
  api: ShopApi;
  locale: string;
  report: Exclude<ReportId, 'stock'>;
  data: Report<unknown, unknown>;
  metric: string | null;
  setMetric: (key: string) => void;
}) {
  const { t } = useT();
  const format = useFormat(data.currency, locale);
  const setup = useSetup(api);
  const common = { data, metric, setMetric, locale };

  const money = (v: number) => format.value(v, 'money');
  const count = (v: number) => format.value(v, 'number');
  const csvName = (name: string) => `${name}-${data.range.after}-${data.range.before}.csv`;
  const intervalLabel = (date: string, interval: Interval) =>
    interval === 'week'
      ? t('Week of {date}', { date: dateLabeller(locale, 'day')(date) })
      : dateLabeller(locale, interval)(date);

  switch (report) {
    case 'overview': {
      const [boards] = data.rows as {
        products: ProductReportRow[];
        categories: (CategoryReportRow & { name: string })[];
        coupons: CouponReportRow[];
        customers: TopCustomer[];
      }[];
      return (
        <>
          <Numbers<Stats>
            {...common}
            metrics={[
              { key: 'total', label: 'Total sales', kind: 'money' },
              { key: 'net', label: 'Net sales', kind: 'money' },
              { key: 'orders', label: 'Orders', kind: 'number' },
              { key: 'aov', label: 'Average order value', kind: 'money' },
              { key: 'items', label: 'Items sold', kind: 'number' },
              { key: 'returns', label: 'Returns', kind: 'money', lowerIsBetter: true },
              { key: 'discounted', label: 'Discounted orders', kind: 'number' },
              { key: 'gross', label: 'Gross sales', kind: 'money' },
              { key: 'taxes', label: 'Taxes', kind: 'money' },
              { key: 'shipping', label: 'Shipping', kind: 'money' },
            ]}
          />
          {boards && (
            <div className="sh-grid-2">
              <DataTable
                title={t('Top products')}
                filename={csvName('top-products')}
                rows={boards.products}
                rowKey={(r) => r.id}
                initialSort={{ key: 'items', dir: 'desc' }}
                columns={[
                  { key: 'name', label: 'Product', value: (r) => r.name },
                  { key: 'items', label: 'Items sold', value: (r) => r.items, num: true },
                  {
                    key: 'net',
                    label: 'Net sales',
                    value: (r) => r.net,
                    render: (r) => money(r.net),
                    num: true,
                  },
                ]}
              />
              <DataTable
                title={t('Top categories')}
                filename={csvName('top-categories')}
                rows={boards.categories}
                rowKey={(r) => r.id}
                initialSort={{ key: 'net', dir: 'desc' }}
                columns={[
                  { key: 'name', label: 'Category', value: (r) => r.name },
                  { key: 'items', label: 'Items sold', value: (r) => r.items, num: true },
                  {
                    key: 'net',
                    label: 'Net sales',
                    value: (r) => r.net,
                    render: (r) => money(r.net),
                    num: true,
                  },
                ]}
              />
              <DataTable
                title={t('Top coupons')}
                filename={csvName('top-coupons')}
                rows={boards.coupons}
                rowKey={(r) => r.code}
                initialSort={{ key: 'orders', dir: 'desc' }}
                columns={[
                  { key: 'code', label: 'Coupon', value: (r) => r.code },
                  { key: 'orders', label: 'Orders', value: (r) => r.orders, num: true },
                  {
                    key: 'amount',
                    label: 'Amount discounted',
                    value: (r) => r.amount,
                    render: (r) => money(r.amount),
                    num: true,
                  },
                ]}
              />
              <DataTable
                title={t('Top customers')}
                filename={csvName('top-customers')}
                rows={boards.customers}
                rowKey={(r) => r.email}
                initialSort={{ key: 'spent', dir: 'desc' }}
                columns={[
                  {
                    key: 'name',
                    label: 'Customer',
                    value: (r) => r.name || r.email,
                    render: (r) => (
                      <a href={adminUrl(`/ext/shop/orders?q=${encodeURIComponent(r.email)}`)}>
                        {r.name || r.email}
                      </a>
                    ),
                  },
                  { key: 'orders', label: 'Orders', value: (r) => r.orders, num: true },
                  {
                    key: 'spent',
                    label: 'Total spend',
                    value: (r) => r.spent,
                    render: (r) => money(r.spent),
                    num: true,
                  },
                ]}
              />
            </div>
          )}
        </>
      );
    }
    case 'revenue': {
      const rows = (data.current as { intervals: { date: string; values: Stats }[] }).intervals;
      const amount = (
        key: keyof Stats,
        label: string,
      ): Column<{ date: string; values: Stats }> => ({
        key,
        label,
        value: (r) => r.values[key],
        render: (r) => money(r.values[key]),
        num: true,
      });
      return (
        <>
          <Numbers<Stats>
            {...common}
            metrics={[
              { key: 'gross', label: 'Gross sales', kind: 'money' },
              { key: 'returns', label: 'Returns', kind: 'money', lowerIsBetter: true },
              { key: 'coupons', label: 'Coupons', kind: 'money', lowerIsBetter: true },
              { key: 'net', label: 'Net sales', kind: 'money' },
              { key: 'taxes', label: 'Taxes', kind: 'money' },
              { key: 'shipping', label: 'Shipping', kind: 'money' },
              { key: 'total', label: 'Total sales', kind: 'money' },
            ]}
          />
          <DataTable
            title={t('Revenue by {interval}', {
              interval: t(
                data.interval === 'day' ? 'day' : data.interval === 'week' ? 'week' : 'month',
              ),
            })}
            filename={csvName('revenue')}
            rows={rows}
            rowKey={(r) => r.date}
            initialSort={{ key: 'date', dir: 'desc' }}
            columns={[
              {
                key: 'date',
                label: 'Date',
                value: (r) => r.date,
                render: (r) => intervalLabel(r.date, data.interval),
              },
              { key: 'orders', label: 'Orders', value: (r) => r.values.orders, num: true },
              amount('gross', 'Gross sales'),
              amount('returns', 'Returns'),
              amount('coupons', 'Coupons'),
              amount('net', 'Net sales'),
              amount('taxes', 'Taxes'),
              amount('shipping', 'Shipping'),
              amount('total', 'Total sales'),
            ]}
          />
        </>
      );
    }
    case 'orders': {
      const rows = data.rows as OrderReportRow[];
      return (
        <>
          <Numbers<Stats>
            {...common}
            metrics={[
              { key: 'orders', label: 'Orders', kind: 'number' },
              { key: 'net', label: 'Net sales', kind: 'money' },
              { key: 'aov', label: 'Average order value', kind: 'money' },
              { key: 'avgItems', label: 'Average items per order', kind: 'number' },
            ]}
          />
          <DataTable
            title={t('Orders')}
            filename={csvName('orders')}
            rows={rows}
            rowKey={(r) => r.id}
            initialSort={{ key: 'date', dir: 'desc' }}
            columns={[
              {
                key: 'date',
                label: 'Date',
                value: (r) => r.date,
                render: (r) => new Date(r.date).toLocaleDateString(locale, { dateStyle: 'medium' }),
              },
              {
                key: 'number',
                label: 'Order',
                value: (r) => r.number,
                render: (r) => <a href={adminUrl(`/ext/shop/orders?order=${r.id}`)}>#{r.number}</a>,
              },
              {
                key: 'status',
                label: 'Status',
                value: (r) => t(STATUS_LABEL[r.status] ?? r.status),
                render: (r) => (
                  <span className={`sh-badge ${STATUS_BADGE[r.status] ?? ''}`}>
                    {t(STATUS_LABEL[r.status] ?? r.status)}
                  </span>
                ),
              },
              { key: 'customer', label: 'Customer', value: (r) => r.customer || r.email },
              {
                key: 'type',
                label: 'Customer type',
                value: (r) => t(r.newCustomer ? 'New' : 'Returning'),
              },
              { key: 'products', label: 'Products', value: (r) => r.products },
              { key: 'items', label: 'Items sold', value: (r) => r.items, num: true },
              { key: 'coupons', label: 'Coupons', value: (r) => r.coupons },
              {
                key: 'net',
                label: 'Net sales',
                value: (r) => r.net,
                render: (r) => money(r.net),
                num: true,
              },
            ]}
          />
        </>
      );
    }
    case 'products':
    case 'variations': {
      const categories = new Map((setup.data?.categories ?? []).map((c) => [c.id, c.name]));
      const stock: Column<ProductReportRow | VariationReportRow>[] = [
        {
          key: 'status',
          label: 'Status',
          value: (r) => (r.stockStatus ? t(STOCK_LABEL[r.stockStatus as StockKind] ?? '') : ''),
        },
        {
          key: 'stock',
          label: 'Stock',
          value: (r) => r.stock,
          render: (r) => (r.stock === null ? '—' : count(r.stock)),
          num: true,
        },
      ];
      const sold: Column<ProductReportRow | VariationReportRow>[] = [
        { key: 'items', label: 'Items sold', value: (r) => r.items, num: true },
        {
          key: 'net',
          label: 'Net sales',
          value: (r) => r.net,
          render: (r) => money(r.net),
          num: true,
        },
        { key: 'orders', label: 'Orders', value: (r) => r.orders, num: true },
      ];
      const link = (id: string, label: string) => (
        <a href={adminUrl(`/ext/shop/products?product=${id}`)}>{label}</a>
      );
      return (
        <>
          <Numbers<SoldStats>
            {...common}
            metrics={[
              { key: 'items', label: 'Items sold', kind: 'number' },
              { key: 'net', label: 'Net sales', kind: 'money' },
              { key: 'orders', label: 'Orders', kind: 'number' },
            ]}
          />
          {report === 'products' ? (
            <DataTable<ProductReportRow>
              title={t('Products')}
              filename={csvName('products')}
              rows={data.rows as ProductReportRow[]}
              rowKey={(r) => r.id}
              initialSort={{ key: 'items', dir: 'desc' }}
              columns={[
                {
                  key: 'name',
                  label: 'Product',
                  value: (r) => r.name,
                  render: (r) => link(r.id, r.name),
                },
                { key: 'sku', label: 'SKU', value: (r) => r.sku },
                ...(sold as Column<ProductReportRow>[]),
                {
                  key: 'category',
                  label: 'Category',
                  value: (r) =>
                    r.categoryIds
                      .map((id) => categories.get(id))
                      .filter(Boolean)
                      .join(', '),
                },
                { key: 'variations', label: 'Variations', value: (r) => r.variations, num: true },
                ...(stock as Column<ProductReportRow>[]),
              ]}
            />
          ) : (
            <DataTable<VariationReportRow>
              title={t('Variations')}
              filename={csvName('variations')}
              rows={data.rows as VariationReportRow[]}
              rowKey={(r) => r.id}
              initialSort={{ key: 'items', dir: 'desc' }}
              columns={[
                {
                  key: 'name',
                  label: 'Product / Variation',
                  value: (r) => `${r.name}${r.attributes ? ` – ${r.attributes}` : ''}`,
                  render: (r) =>
                    link(r.productId, `${r.name}${r.attributes ? ` – ${r.attributes}` : ''}`),
                },
                { key: 'sku', label: 'SKU', value: (r) => r.sku },
                ...(sold as Column<VariationReportRow>[]),
                ...(stock as Column<VariationReportRow>[]),
              ]}
            />
          )}
        </>
      );
    }
    case 'categories': {
      const rows = data.rows as (CategoryReportRow & { name: string })[];
      return (
        <>
          <Numbers<SoldStats>
            {...common}
            metrics={[
              { key: 'items', label: 'Items sold', kind: 'number' },
              { key: 'net', label: 'Net sales', kind: 'money' },
              { key: 'orders', label: 'Orders', kind: 'number' },
            ]}
          />
          <DataTable
            title={t('Categories')}
            filename={csvName('categories')}
            rows={rows}
            rowKey={(r) => r.id}
            initialSort={{ key: 'net', dir: 'desc' }}
            columns={[
              { key: 'name', label: 'Category', value: (r) => r.name || '—' },
              { key: 'items', label: 'Items sold', value: (r) => r.items, num: true },
              {
                key: 'net',
                label: 'Net sales',
                value: (r) => r.net,
                render: (r) => money(r.net),
                num: true,
              },
              { key: 'products', label: 'Products', value: (r) => r.products, num: true },
              { key: 'orders', label: 'Orders', value: (r) => r.orders, num: true },
            ]}
          />
        </>
      );
    }
    case 'coupons': {
      const rows = data.rows as CouponReportRow[];
      const day = (iso: string | null) =>
        iso ? new Date(iso).toLocaleDateString(locale, { dateStyle: 'medium' }) : '—';
      const KIND: Record<string, string> = {
        percent: 'Percentage discount',
        fixed_cart: 'Fixed cart discount',
        fixed_product: 'Fixed product discount',
      };
      return (
        <>
          <Numbers<CouponStats>
            {...common}
            kind="bar"
            metrics={[
              { key: 'orders', label: 'Discounted orders', kind: 'number' },
              { key: 'amount', label: 'Amount discounted', kind: 'money' },
            ]}
          />
          <DataTable
            title={t('Coupons')}
            filename={csvName('coupons')}
            rows={rows}
            rowKey={(r) => r.code}
            initialSort={{ key: 'orders', dir: 'desc' }}
            columns={[
              {
                key: 'code',
                label: 'Coupon code',
                value: (r) => r.code,
              },
              { key: 'orders', label: 'Orders', value: (r) => r.orders, num: true },
              {
                key: 'amount',
                label: 'Amount discounted',
                value: (r) => r.amount,
                render: (r) => money(r.amount),
                num: true,
              },
              {
                key: 'created',
                label: 'Created',
                value: (r) => r.createdAt,
                render: (r) => day(r.createdAt),
              },
              {
                key: 'expires',
                label: 'Expires',
                value: (r) => r.expiresAt,
                render: (r) => day(r.expiresAt),
              },
              {
                key: 'kind',
                label: 'Type',
                value: (r) => (KIND[r.kind] ? t(KIND[r.kind]!) : r.kind || '—'),
              },
            ]}
          />
        </>
      );
    }
    case 'taxes': {
      const rows = data.rows as TaxReportRow[];
      return (
        <>
          <Numbers<Stats>
            {...common}
            metrics={[
              { key: 'taxes', label: 'Total tax', kind: 'money' },
              { key: 'orderTax', label: 'Order tax', kind: 'money' },
              { key: 'shippingTax', label: 'Shipping tax', kind: 'money' },
              { key: 'taxed', label: 'Orders', kind: 'number' },
            ]}
          />
          <DataTable
            title={t('Taxes')}
            filename={csvName('taxes')}
            rows={rows}
            rowKey={(r) => String(r.rate)}
            initialSort={{ key: 'tax', dir: 'desc' }}
            columns={[
              {
                key: 'rate',
                label: 'Rate',
                value: (r) => r.rate,
                render: (r) => `${r.rate.toLocaleString(locale, { maximumFractionDigits: 3 })}%`,
                num: true,
              },
              { key: 'name', label: 'Name', value: (r) => r.name },
              {
                key: 'tax',
                label: 'Total tax',
                value: (r) => r.tax,
                render: (r) => money(r.tax),
                num: true,
              },
              { key: 'orders', label: 'Orders', value: (r) => r.orders, num: true },
            ]}
          />
        </>
      );
    }
  }
}

function StockReport({
  api,
  user,
  params,
  go,
}: AdminPageProps & { params: URLSearchParams; go: Go }) {
  const { t } = useT();
  const data = useQuery({
    queryKey: ['shop', 'analytics', 'stock'],
    queryFn: () =>
      api<{ counts: Record<StockKind, number>; rows: StockRow[] }>('GET', '/analytics/stock'),
  });
  const filter = params.get('filter') as StockKind | null;
  const rows = (data.data?.rows ?? []).filter((r) => !filter || r.status === filter);
  const total = Object.values(data.data?.counts ?? {}).reduce((a, b) => a + b, 0);
  return (
    <div className="sh-stack">
      <nav className="sh-tabs" aria-label={t('Stock')}>
        <button type="button" aria-current={!filter} onClick={() => go({ filter: null }, true)}>
          {t('All products')} ({total})
        </button>
        {(['outofstock', 'lowstock', 'instock', 'onbackorder'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-current={filter === s}
            onClick={() => go({ filter: s }, true)}
          >
            {t(STOCK_LABEL[s])} ({data.data?.counts[s] ?? 0})
          </button>
        ))}
      </nav>
      {data.error && <Alert>{errorMessage(data.error)}</Alert>}
      {data.data && (
        <DataTable
          title={t('Stock')}
          filename={`stock${filter ? `-${filter}` : ''}.csv`}
          rows={rows}
          rowKey={(r) => r.id}
          initialSort={{ key: 'stock', dir: 'asc' }}
          empty={t('No products here.')}
          columns={[
            {
              key: 'name',
              label: 'Product / Variation',
              value: (r) => r.name,
              render: (r) => (
                <a href={adminUrl(`/ext/shop/products?product=${r.productId}`)}>{r.name}</a>
              ),
            },
            { key: 'sku', label: 'SKU', value: (r) => r.sku },
            {
              key: 'status',
              label: 'Status',
              value: (r) => t(STOCK_LABEL[r.status]),
              render: (r) => (
                <span className={`sh-badge ${STOCK_BADGE[r.status]}`}>
                  {t(STOCK_LABEL[r.status])}
                </span>
              ),
            },
            {
              key: 'stock',
              label: 'Stock',
              value: (r) => r.stock,
              render: (r) =>
                r.stock === null ? (
                  <span className="sh-muted">{t('Not counted')}</span>
                ) : (
                  r.stock.toLocaleString(user.locale)
                ),
              num: true,
            },
          ]}
        />
      )}
    </div>
  );
}
