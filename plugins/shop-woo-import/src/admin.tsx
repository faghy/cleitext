import {
  addMessages,
  Alert,
  Button,
  defineAdminPlugin,
  errorMessage,
  useT,
  type AdminPageProps,
} from '@cleitext/admin-sdk';
import { useEffect, useState } from 'react';
import { IT } from './admin/it';
import { EXPORTER_PHP } from './exporter';
import { isWooExport, pickCustomers, type CustomerChoice, type WooExport } from './model/convert';

addMessages('it', IT);

const CSS = `
.wi{max-width:860px;display:flex;flex-direction:column;gap:1rem;color:var(--color-slate-900,#0f172a)}
.wi h1{font-size:1.5rem;font-weight:700;margin:0}
.wi-card{border:1px solid var(--color-slate-200,#e2e8f0);border-radius:.375rem;background:var(--color-white,#fff);padding:1rem;display:flex;flex-direction:column;gap:.6rem}
.wi-card h2{font-size:1rem;font-weight:600;margin:0}
.wi-muted{color:var(--color-slate-500,#64748b);font-size:.875rem}
.wi-row{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center}
.wi code,.wi pre{background:var(--color-slate-100,#f1f5f9);border-radius:.25rem;padding:.1rem .35rem;font-size:.8125rem}
.wi pre{padding:.5rem .7rem;overflow-x:auto;margin:0}
.wi-check{display:flex;gap:.45rem;align-items:flex-start;font-size:.875rem}
.wi-select{border:1px solid var(--color-slate-300,#cbd5e1);border-radius:.25rem;padding:.35rem .5rem;background:var(--color-white,#fff);color:inherit;font:inherit;font-size:.875rem}
.wi progress{width:100%}
.wi ul{margin:.2rem 0 0;padding-left:1.2rem;font-size:.8125rem}
`;

interface Result {
  imported: number;
  already: number;
  skipped?: number;
  warnings: string[];
}

function WooImportPage({ api }: AdminPageProps) {
  const { t } = useT();
  const [state, setState] = useState<{ shop: boolean; customers: number; orders: number } | null>(
    null,
  );
  const [data, setData] = useState<WooExport | null>(null);
  const [error, setError] = useState('');
  const [which, setWhich] = useState<CustomerChoice>('orders');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [skipFailed, setSkipFailed] = useState(true);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(
    null,
  );
  const [result, setResult] = useState<{ label: string; result: Result } | null>(null);

  const load = () =>
    api<{ shop: boolean; customers: number; orders: number }>('GET', '/state')
      .then(setState)
      .catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    void load();
  }, []);

  const download = () => {
    const url = URL.createObjectURL(new Blob([EXPORTER_PHP], { type: 'text/x-php' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cleitext-woo-export.php';
    a.click();
    URL.revokeObjectURL(url);
  };

  const read = async (file: File | undefined) => {
    setError('');
    setResult(null);
    setData(null);
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isWooExport(parsed)) throw new Error(t('This is not an export of the script.'));
      setData(parsed);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  /** Sends a list in batches, adding up what the server answers. */
  const send = async <T,>(
    label: string,
    path: string,
    list: T[],
    size: number,
    extra: Record<string, unknown>,
    key: string,
  ) => {
    setError('');
    setResult(null);
    const total: Result = { imported: 0, already: 0, skipped: 0, warnings: [] };
    try {
      for (let i = 0; i < list.length; i += size) {
        setProgress({ label, done: i, total: list.length });
        const r = await api<Result>('POST', path, { ...extra, [key]: list.slice(i, i + size) });
        total.imported += r.imported;
        total.already += r.already;
        total.skipped = (total.skipped ?? 0) + (r.skipped ?? 0);
        total.warnings.push(...r.warnings);
      }
      setResult({ label, result: total });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProgress(null);
      void load();
    }
  };

  const customers = data ? pickCustomers(data.customers, { which, verifiedOnly }) : [];
  const failed = data ? data.orders.filter((o) => o.status === 'failed').length : 0;
  const orders = data ? data.orders.filter((o) => !(skipFailed && o.status === 'failed')) : [];

  return (
    <div className="wi">
      <style>{CSS}</style>
      <header>
        <h1>{t('Import from WooCommerce')}</h1>
        <p className="wi-muted">
          {t(
            'Customers and orders of a WooCommerce shop into Cleishop. Products, categories and pages come with the WordPress Importer: import them first. No email is sent and no stock moves; importing again adds only what is new.',
          )}
        </p>
      </header>
      {state && !state.shop && <Alert>{t('Activate Cleishop 1.13 or later first.')}</Alert>}
      {error && <Alert>{error}</Alert>}
      {state && (
        <p className="wi-muted">
          {t('Imported so far: {customers} customers and {orders} orders.', {
            customers: state.customers,
            orders: state.orders,
          })}
        </p>
      )}

      <section className="wi-card">
        <h2>1. {t('Export from WordPress')}</h2>
        <p className="wi-muted">
          {t(
            'Copy the script into the WordPress folder and run it with WP-CLI: it reads customers and orders through WooCommerce (classic tables or HPOS) and changes nothing.',
          )}
        </p>
        <pre>wp eval-file cleitext-woo-export.php &gt; woocommerce-export.json</pre>
        <div>
          <Button variant="secondary" onClick={download}>
            {t('Download the script')}
          </Button>
        </div>
        <p className="wi-muted">
          {t('The file holds personal data: keep it private and delete it after the import.')}
        </p>
      </section>

      <section className="wi-card">
        <h2>2. {t('Choose the export')}</h2>
        <input
          type="file"
          accept="application/json,.json"
          aria-label={t('Choose the export')}
          onChange={(e) => void read(e.target.files?.[0])}
        />
        {data && (
          <p className="wi-muted">
            {t('{customers} customers and {orders} orders ({failed} failed) from {site}.', {
              customers: data.customers.length,
              orders: data.orders.length,
              failed,
              site: data.site ?? '—',
            })}
          </p>
        )}
      </section>

      {data && (
        <section className="wi-card">
          <h2>3. {t('Customers')}</h2>
          <div className="wi-row">
            <select
              className="wi-select"
              value={which}
              aria-label={t('Which customers')}
              onChange={(e) => setWhich(e.target.value as CustomerChoice)}
            >
              <option value="paid">{t('Only those with a paid order')}</option>
              <option value="orders">{t('Those with at least an order')}</option>
              <option value="all">{t('All of them')}</option>
            </select>
            <label className="wi-check">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => setVerifiedOnly(e.target.checked)}
              />
              <span>{t('Only confirmed email addresses')}</span>
            </label>
          </div>
          <p className="wi-muted">
            {t(
              'Accounts without a password: each customer chooses one with «Forgot your password?». Their addresses fill the checkout. {n} customers.',
              { n: customers.length },
            )}
          </p>
          <div>
            <Button
              disabled={Boolean(progress) || !state?.shop || customers.length === 0}
              onClick={() =>
                void send(
                  t('Customers'),
                  '/customers',
                  data.customers,
                  200,
                  { which, verifiedOnly },
                  'customers',
                )
              }
            >
              {t('Import the customers')}
            </Button>
          </div>
        </section>
      )}

      {data && (
        <section className="wi-card">
          <h2>4. {t('Orders')}</h2>
          <label className="wi-check">
            <input
              type="checkbox"
              checked={skipFailed}
              onChange={(e) => setSkipFailed(e.target.checked)}
            />
            <span>
              {t('Leave out failed orders ({n}): often card tests by bots.', { n: failed })}
            </span>
          </label>
          <p className="wi-muted">
            {t(
              'Each order with its number, lines, taxes, coupons, notes and refunds, linked to its customer when imported. {n} orders.',
              { n: orders.length },
            )}
          </p>
          <div>
            <Button
              disabled={Boolean(progress) || !state?.shop || orders.length === 0}
              onClick={() =>
                void send(t('Orders'), '/orders', data.orders, 100, { skipFailed }, 'orders')
              }
            >
              {t('Import the orders')}
            </Button>
          </div>
        </section>
      )}

      {progress && (
        <div>
          <p className="wi-muted">{t('{label}: {done} of {total}…', progress)}</p>
          <progress value={progress.done} max={progress.total} />
        </div>
      )}
      {result && (
        <Alert kind={result.result.warnings.length ? 'error' : 'success'}>
          {t('{label}: {imported} imported, {already} already there, {skipped} left out.', {
            label: result.label,
            imported: result.result.imported,
            already: result.result.already,
            skipped: result.result.skipped ?? 0,
          })}
          {result.result.warnings.length > 0 && (
            <ul>
              {result.result.warnings.slice(0, 50).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Import from WooCommerce', it: 'Import da WooCommerce' },
      parent: '/tools',
      description: {
        en: 'Customers and orders of a WooCommerce shop into Cleishop.',
        it: 'Clienti e ordini di un negozio WooCommerce in Cleishop.',
      },
      capability: 'import_woocommerce',
      component: WooImportPage,
    },
  ],
});
