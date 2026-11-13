import {
  addMessages,
  Alert,
  Button,
  defineAdminPlugin,
  errorMessage,
  TextField,
  useT,
  type AdminPageProps,
} from '@cleitext/admin-sdk';
import { useEffect, useState } from 'react';
import { IT } from './admin/it';
import { formatNumber } from './numbering';
import { EMAILS, MAX_LOGO, ORDER_STATUSES, type Settings } from './settings';

addMessages('it', IT);

const CSS = `
.si{max-width:860px;display:flex;flex-direction:column;gap:1rem;color:var(--color-slate-900,#0f172a)}
.si h1{font-size:1.5rem;font-weight:700;margin:0}
.si-card{border:1px solid var(--color-slate-200,#e2e8f0);border-radius:.375rem;background:var(--color-white,#fff);padding:1rem;display:flex;flex-direction:column;gap:.7rem}
.si-card h2{font-size:1rem;font-weight:600;margin:0}
.si-muted{color:var(--color-slate-500,#64748b);font-size:.875rem}
.si-row{display:flex;flex-wrap:wrap;gap:.8rem;align-items:flex-end}
.si-row>*{flex:1 1 160px}
.si-check{display:flex;gap:.45rem;align-items:center;font-size:.875rem}
.si-checks{display:flex;flex-wrap:wrap;gap:.4rem 1.2rem}
.si textarea{width:100%;border:1px solid var(--color-slate-300,#cbd5e1);border-radius:.25rem;padding:.5rem .7rem;font:inherit;font-size:.875rem;background:var(--color-white,#fff);color:inherit}
.si label.si-label{font-size:.875rem;font-weight:500}
.si table{width:100%;border-collapse:collapse;font-size:.875rem}
.si th,.si td{text-align:left;padding:.4rem .5rem;border-bottom:1px solid var(--color-slate-200,#e2e8f0)}
.si-logo{max-height:60px;max-width:200px;border:1px solid var(--color-slate-200,#e2e8f0);padding:4px;background:#fff}
`;

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending payment',
  'on-hold': 'On hold',
  processing: 'Processing',
  completed: 'Completed',
};
const EMAIL_LABELS: Record<string, string> = {
  customer_processing: 'Order received (to the customer)',
  customer_completed: 'Order completed (to the customer)',
  customer_on_hold: 'Order on hold (to the customer)',
  customer_refunded: 'Order refunded (to the customer)',
  new_order: 'New order (to the shop)',
};

interface InvoiceItem {
  orderId: string;
  formatted: string;
  date: string;
  imported: boolean;
  order: number | null;
  total: string | null;
  currency: string | null;
  customer: string;
  url: string | null;
}

function download(base64: string, name: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

function InvoicesPage({ api }: AdminPageProps) {
  const { t, language: locale } = useT();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [list, setList] = useState<{
    shop: boolean;
    count: number;
    invoices: InvoiceItem[];
  } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return monthOf(d);
  });

  const load = () => {
    api<Settings>('GET', '/settings')
      .then(setSettings)
      .catch((e) => setError(errorMessage(e)));
    api<{ shop: boolean; count: number; invoices: InvoiceItem[] }>('GET', '/invoices')
      .then(setList)
      .catch((e) => setError(errorMessage(e)));
  };
  useEffect(load, []);

  if (!settings) return <div className="si">{error && <Alert>{error}</Alert>}</div>;
  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch });
  const toggle = (key: 'createOn' | 'attachTo', value: string, on: boolean) =>
    set({ [key]: on ? [...settings[key], value] : settings[key].filter((x) => x !== value) });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      setSettings(await api<Settings>('PUT', '/settings', settings));
      setNotice(t('Settings saved.'));
    });

  const pickLogo = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type))
      return setError(t('The logo must be a PNG or JPEG.'));
    if (file.size > MAX_LOGO) return setError(t('The logo must be smaller than 400 KB.'));
    const reader = new FileReader();
    reader.onload = () => set({ logo: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const bulk = () =>
    run(async () => {
      const [y, m] = month.split('-').map(Number) as [number, number];
      const from = new Date(Date.UTC(y, m - 1, 1));
      const to = new Date(Date.UTC(y, m, 1));
      const r = await api<{ count: number; data?: string }>('POST', '/bulk', {
        from: from.toISOString(),
        to: to.toISOString(),
      });
      if (!r.count || !r.data) return setNotice(t('No invoices in {month}.', { month }));
      download(r.data, `${t('Invoices')} ${month}.pdf`);
      setNotice(t('{n} invoices downloaded.', { n: r.count }));
    });

  const importWoo = () =>
    run(async () => {
      const r = await api<{ imported: number; already: number; warnings: string[] }>(
        'POST',
        '/import-woocommerce',
      );
      setNotice(
        t('{imported} invoice numbers imported, {already} already there.', {
          imported: r.imported,
          already: r.already,
        }) + (r.warnings.length ? ` ${r.warnings.slice(0, 20).join(' ')}` : ''),
      );
      load();
    });

  const money = (value: string | null, currency: string | null) =>
    value === null
      ? '—'
      : new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'EUR' }).format(
          Number(value),
        );

  return (
    <div className="si">
      <style>{CSS}</style>
      <header>
        <h1>{t('PDF invoices')}</h1>
        <p className="si-muted">
          {t(
            'An invoice for each Cleishop order, numbered without gaps, attached to the emails and downloaded from the customer’s account and from the order. Also a packing slip.',
          )}
        </p>
      </header>
      {list && !list.shop && <Alert>{t('Activate Cleishop 1.14 or later first.')}</Alert>}
      {error && <Alert>{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <section className="si-card">
        <h2>{t('Shop details')}</h2>
        <TextField
          label={t('Shop name')}
          value={settings.shopName}
          onChange={(e) => set({ shopName: e.target.value })}
        />
        <label className="si-label">
          {t('Address')}
          <textarea
            rows={4}
            value={settings.address}
            placeholder={t('Street, postcode and city, phone, email: one per line')}
            onChange={(e) => set({ address: e.target.value })}
          />
        </label>
        <TextField
          label={t('VAT number or tax code')}
          value={settings.taxId}
          onChange={(e) => set({ taxId: e.target.value })}
        />
        <TextField
          label={t('Footer')}
          hint={t('At the bottom of every page, e.g. the bank details or the registered office.')}
          value={settings.footer}
          onChange={(e) => set({ footer: e.target.value })}
        />
        <div className="si-row">
          <label className="si-label">
            {t('Logo (PNG or JPEG)')}
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => pickLogo(e.target.files?.[0])}
            />
          </label>
          {settings.logo && (
            <div>
              <img className="si-logo" src={settings.logo} alt="" />{' '}
              <Button variant="secondary" onClick={() => set({ logo: '' })}>
                {t('Remove')}
              </Button>
            </div>
          )}
        </div>
      </section>

      <section className="si-card">
        <h2>{t('Numbering')}</h2>
        <div className="si-row">
          <TextField
            label={t('Prefix')}
            value={settings.numbering.prefix}
            onChange={(e) => set({ numbering: { ...settings.numbering, prefix: e.target.value } })}
          />
          <TextField
            label={t('Suffix')}
            value={settings.numbering.suffix}
            onChange={(e) => set({ numbering: { ...settings.numbering, suffix: e.target.value } })}
          />
          <TextField
            label={t('Digits')}
            type="number"
            min={0}
            max={10}
            value={settings.numbering.padding}
            onChange={(e) =>
              set({ numbering: { ...settings.numbering, padding: Number(e.target.value) || 0 } })
            }
          />
        </div>
        <label className="si-check">
          <input
            type="checkbox"
            checked={settings.numbering.yearlyReset}
            onChange={(e) =>
              set({ numbering: { ...settings.numbering, yearlyReset: e.target.checked } })
            }
          />
          <span>{t('Start again from 1 every year')}</span>
        </label>
        <p className="si-muted">
          {t('{year} in the prefix or suffix is the year. Example: {example}', {
            example: formatNumber(7, settings.numbering, new Date()),
          })}
        </p>
      </section>

      <section className="si-card">
        <h2>{t('When')}</h2>
        <p className="si-muted">{t('Create the invoice when the order becomes:')}</p>
        <div className="si-checks">
          {ORDER_STATUSES.map((s) => (
            <label key={s} className="si-check">
              <input
                type="checkbox"
                checked={settings.createOn.includes(s)}
                onChange={(e) => toggle('createOn', s, e.target.checked)}
              />
              <span>{t(STATUS_LABELS[s] ?? s)}</span>
            </label>
          ))}
        </div>
        <p className="si-muted">
          {t('Attach it to these emails (it is created then, if needed):')}
        </p>
        <div className="si-checks">
          {EMAILS.map((m) => (
            <label key={m} className="si-check">
              <input
                type="checkbox"
                checked={settings.attachTo.includes(m)}
                onChange={(e) => toggle('attachTo', m, e.target.checked)}
              />
              <span>{t(EMAIL_LABELS[m] ?? m)}</span>
            </label>
          ))}
        </div>
        <label className="si-check">
          <input
            type="checkbox"
            checked={settings.customerDownload}
            onChange={(e) => set({ customerDownload: e.target.checked })}
          />
          <span>{t('Customers download it from their account')}</span>
        </label>
        <label className="si-label">
          {t('Paper size')}{' '}
          <select
            value={settings.paper}
            onChange={(e) => set({ paper: e.target.value as Settings['paper'] })}
          >
            <option value="A4">A4</option>
            <option value="Letter">Letter</option>
            <option value="Legal">Legal</option>
          </select>
        </label>
        <label className="si-check">
          <input
            type="checkbox"
            checked={settings.packingSlip}
            onChange={(e) => set({ packingSlip: e.target.checked })}
          />
          <span>{t('Packing slip in the order’s admin page')}</span>
        </label>
        <div>
          <Button disabled={busy} onClick={() => void save()}>
            {t('Save')}
          </Button>
        </div>
      </section>

      <section className="si-card">
        <h2>{t('Invoices of a month')}</h2>
        <p className="si-muted">{t('All of them in one PDF, e.g. for the accountant.')}</p>
        <div className="si-row">
          <TextField
            label={t('Month')}
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <div>
            <Button disabled={busy || !list?.shop} onClick={() => void bulk()}>
              {t('Download')}
            </Button>
          </div>
        </div>
      </section>

      <section className="si-card">
        <h2>{t('From WooCommerce')}</h2>
        <p className="si-muted">
          {t(
            'Orders imported with «Import from WooCommerce» keep the invoice numbers and dates of «PDF Invoices & Packing Slips»: import them, and the next invoice continues from the highest number.',
          )}
        </p>
        <div>
          <Button
            variant="secondary"
            disabled={busy || !list?.shop}
            onClick={() => void importWoo()}
          >
            {t('Import the invoice numbers')}
          </Button>
        </div>
      </section>

      {list && (
        <section className="si-card">
          <h2>{t('Latest invoices ({n} in all)', { n: list.count })}</h2>
          {list.invoices.length === 0 ? (
            <p className="si-muted">{t('No invoices yet.')}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t('Invoice')}</th>
                  <th>{t('Date')}</th>
                  <th>{t('Order')}</th>
                  <th>{t('Customer')}</th>
                  <th>{t('Total')}</th>
                </tr>
              </thead>
              <tbody>
                {list.invoices.map((i) => (
                  <tr key={i.orderId}>
                    <td>
                      {i.url ? (
                        <a href={i.url} target="_blank" rel="noreferrer">
                          {i.formatted}
                        </a>
                      ) : (
                        i.formatted
                      )}
                    </td>
                    <td>{new Date(i.date).toLocaleDateString(locale)}</td>
                    <td>{i.order ?? '—'}</td>
                    <td>{i.customer}</td>
                    <td>{money(i.total, i.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'PDF invoices', it: 'Fatture PDF' },
      parent: '/plugins',
      capability: 'manage_invoices',
      component: InvoicesPage,
    },
  ],
});
