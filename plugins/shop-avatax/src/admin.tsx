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
import type { Settings } from './settings';

addMessages('it', IT);

const CSS = `
.av{max-width:860px;display:flex;flex-direction:column;gap:1rem;color:var(--color-slate-900,#0f172a)}
.av h1{font-size:1.5rem;font-weight:700;margin:0}
.av-card{border:1px solid var(--color-slate-200,#e2e8f0);border-radius:.375rem;background:var(--color-white,#fff);padding:1rem;display:flex;flex-direction:column;gap:.7rem}
.av-card h2{font-size:1rem;font-weight:600;margin:0}
.av-muted{color:var(--color-slate-500,#64748b);font-size:.875rem}
.av-row{display:flex;flex-wrap:wrap;gap:.8rem;align-items:flex-end}
.av-row>*{flex:1 1 160px}
.av-check{display:flex;gap:.45rem;align-items:center;font-size:.875rem}
.av select{border:1px solid var(--color-slate-300,#cbd5e1);border-radius:.25rem;padding:.4rem .5rem;font:inherit;font-size:.875rem;background:var(--color-white,#fff);color:inherit}
.av-label{font-size:.875rem;font-weight:500;display:flex;flex-direction:column;gap:.25rem}
.av-warn{border-left:4px solid #b45309;padding:.5rem .75rem;background:#fffbeb;font-size:.875rem}
.av table{width:100%;border-collapse:collapse;font-size:.8125rem}
.av th,.av td{text-align:left;padding:.3rem .45rem;border-bottom:1px solid var(--color-slate-200,#e2e8f0)}
`;

type View = Settings & { hasAccount: boolean; hasKey: boolean; shop: boolean };
interface LogEntry {
  at: string;
  operation: string;
  ok: boolean;
  ms: number;
  about: string;
  error?: string;
}

function AvataxPage({ api }: AdminPageProps) {
  const { t, language } = useT();
  const [settings, setSettings] = useState<View | null>(null);
  const [account, setAccount] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<{
    company: { id: number; name: string; code: string } | null;
    nexus: string[];
    environment: string;
  } | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  const load = () => {
    api<View>('GET', '/settings')
      .then(setSettings)
      .catch((e) => setError(errorMessage(e)));
    api<LogEntry[]>('GET', '/log')
      .then(setLog)
      .catch(() => {});
  };
  useEffect(load, []);

  if (!settings) return <div className="av">{error && <Alert>{error}</Alert>}</div>;
  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch });
  const origin = (patch: Partial<Settings['origin']>) =>
    set({ origin: { ...settings.origin, ...patch } });

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
      const next = await api<View>('PUT', '/settings', {
        ...settings,
        ...(account ? { accountId: account } : {}),
        ...(key ? { licenseKey: key } : {}),
      });
      setSettings(next);
      setAccount('');
      setKey('');
      setNotice(t('Settings saved.'));
      load();
    });

  const testConnection = () =>
    run(async () => {
      setTest(await api('POST', '/test'));
      load();
    });

  return (
    <div className="av">
      <style>{CSS}</style>
      <header>
        <h1>AvaTax</h1>
        <p className="av-muted">
          {t(
            'US sales taxes worked out by Avalara AvaTax in the cart and at checkout, by jurisdiction on the order. If Avalara does not answer, the checkout stops: no order is placed with taxes missing.',
          )}
        </p>
      </header>
      {!settings.shop && <Alert>{t('Activate Cleishop 1.16 or later first.')}</Alert>}
      {error && <Alert>{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <section className="av-card">
        <h2>{t('Account')}</h2>
        <label className="av-check">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
          <span>{t('AvaTax works out the taxes')}</span>
        </label>
        <div className="av-row">
          <label className="av-label">
            {t('Environment')}
            <select
              value={settings.environment}
              onChange={(e) => set({ environment: e.target.value as Settings['environment'] })}
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">{t('Production')}</option>
            </select>
          </label>
          <TextField
            label={t('Company code')}
            value={settings.companyCode}
            onChange={(e) => set({ companyCode: e.target.value })}
          />
        </div>
        <div className="av-row">
          <TextField
            label={t('Account number')}
            autoComplete="off"
            value={account}
            placeholder={settings.hasAccount ? t('Saved: write it again to change it') : ''}
            onChange={(e) => setAccount(e.target.value)}
          />
          <TextField
            label={t('License key')}
            type="password"
            autoComplete="new-password"
            value={key}
            placeholder={settings.hasKey ? t('Saved: write it again to change it') : ''}
            onChange={(e) => setKey(e.target.value)}
          />
        </div>
        <div>
          <Button
            variant="secondary"
            disabled={busy || !settings.hasKey}
            onClick={() => void testConnection()}
          >
            {t('Test the connection')}
          </Button>
        </div>
        {test && (
          <Alert kind="success">
            {t('Connected to Avalara ({environment}).', { environment: test.environment })}{' '}
            {test.company
              ? t('Company: {name} ({code}). Nexus: {nexus}.', {
                  name: test.company.name,
                  code: test.company.code,
                  nexus: test.nexus.join(', ') || '—',
                })
              : t('The company code was not found in this account.')}
          </Alert>
        )}
      </section>

      <section className="av-card">
        <h2>{t('Where the goods leave from')}</h2>
        <div className="av-row">
          <TextField
            label={t('Street')}
            value={settings.origin.line1}
            onChange={(e) => origin({ line1: e.target.value })}
          />
          <TextField
            label={t('Street (line 2)')}
            value={settings.origin.line2 ?? ''}
            onChange={(e) => origin({ line2: e.target.value })}
          />
        </div>
        <div className="av-row">
          <TextField
            label={t('City')}
            value={settings.origin.city}
            onChange={(e) => origin({ city: e.target.value })}
          />
          <TextField
            label={t('State')}
            value={settings.origin.region}
            onChange={(e) => origin({ region: e.target.value })}
          />
          <TextField
            label={t('ZIP code')}
            value={settings.origin.postalCode}
            onChange={(e) => origin({ postalCode: e.target.value })}
          />
          <TextField
            label={t('Country')}
            value={settings.origin.country}
            onChange={(e) => origin({ country: e.target.value })}
          />
        </div>
      </section>

      <section className="av-card">
        <h2>{t('Calculation')}</h2>
        <div className="av-row">
          <TextField
            label={t('Countries (comma separated)')}
            value={settings.countries.join(', ')}
            onChange={(e) => set({ countries: e.target.value.split(/[\s,]+/).filter(Boolean) })}
          />
          <TextField
            label={t('Product tax code')}
            value={settings.defaultTaxCode}
            onChange={(e) => set({ defaultTaxCode: e.target.value })}
          />
          <TextField
            label={t('Shipping tax code')}
            value={settings.shippingTaxCode}
            onChange={(e) => set({ shippingTaxCode: e.target.value })}
          />
        </div>
        <label className="av-check">
          <input
            type="checkbox"
            checked={settings.calculateOnCart}
            onChange={(e) => set({ calculateOnCart: e.target.checked })}
          />
          <span>{t('Also in the cart (an estimate from the ZIP code)')}</span>
        </label>
        <label className="av-check">
          <input
            type="checkbox"
            checked={settings.addressValidation === 'required'}
            onChange={(e) => set({ addressValidation: e.target.checked ? 'required' : 'off' })}
          />
          <span>{t('Check US addresses at checkout and refuse those not found')}</span>
        </label>
      </section>

      <section className="av-card">
        <h2>{t('Record orders in Avalara')}</h2>
        <p className="av-warn">
          {t(
            'With this on, every paid order becomes a committed document in Avalara (your tax returns use it), cancelled orders are voided and refunds are recorded. Turn it on only when the site is live.',
          )}
        </p>
        <label className="av-check">
          <input
            type="checkbox"
            checked={settings.commit}
            onChange={(e) => set({ commit: e.target.checked })}
          />
          <span>{t('Record paid orders (commit)')}</span>
        </label>
        <label className="av-check">
          <input
            type="checkbox"
            checked={settings.debug}
            onChange={(e) => set({ debug: e.target.checked })}
          />
          <span>{t('Keep a log of the calls (without names or payment data)')}</span>
        </label>
        <div>
          <Button disabled={busy} onClick={() => void save()}>
            {t('Save')}
          </Button>
        </div>
      </section>

      {log.length > 0 && (
        <section className="av-card">
          <h2>{t('Last calls')}</h2>
          <table>
            <thead>
              <tr>
                <th>{t('When')}</th>
                <th>{t('Call')}</th>
                <th>{t('About')}</th>
                <th>ms</th>
                <th>{t('Result')}</th>
              </tr>
            </thead>
            <tbody>
              {log.slice(0, 50).map((entry, i) => (
                <tr key={i}>
                  <td>{new Date(entry.at).toLocaleString(language)}</td>
                  <td>{entry.operation}</td>
                  <td>{entry.about}</td>
                  <td>{entry.ms}</td>
                  <td>{entry.ok ? 'OK' : entry.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api('DELETE', '/log');
                  setLog([]);
                })
              }
            >
              {t('Clear the log')}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'AvaTax', it: 'AvaTax' },
      parent: '/plugins',
      capability: 'manage_avatax',
      component: AvataxPage,
    },
  ],
});
