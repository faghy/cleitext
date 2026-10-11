import {
  Alert,
  Button,
  Card,
  defineAdminPlugin,
  errorMessage,
  TextField,
  type AdminPageProps,
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { AnalyticsConfig } from './config';

interface ConfigView {
  config: AnalyticsConfig;
  problems: string[];
}

type Tr = (en: string, it: string) => string;

function AnalyticsPage(props: AdminPageProps) {
  const it = props.user.locale.startsWith('it');
  const tr: Tr = (en, itText) => (it ? itText : en);
  const queryClient = useQueryClient();
  const saved = useQuery({
    queryKey: ['analytics', 'config'],
    queryFn: () => props.api<ConfigView>('GET', '/config'),
  });
  const save = useMutation({
    mutationFn: (config: AnalyticsConfig) => props.api<ConfigView>('PUT', '/config', config),
    onSuccess: (next) => queryClient.setQueryData(['analytics', 'config'], next),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{tr('Analytics', 'Statistiche')}</h1>
      <p className="max-w-3xl text-sm text-slate-600">
        {tr(
          'Turn on the services you use; you can turn on several. Services that need consent are loaded only after visitors accept them in the cookie banner of the Privacy & GDPR plugin, which also lists their cookies and describes them in the privacy policy.',
          'Attiva i servizi che usi; puoi attivarne più di uno. I servizi che richiedono il consenso vengono caricati solo dopo che i visitatori li accettano nel banner dei cookie del plugin Privacy e GDPR, che elenca anche i loro cookie e li descrive nella privacy policy.',
        )}
      </p>
      {saved.error && <Alert>{errorMessage(saved.error)}</Alert>}
      {saved.data && (
        <AnalyticsForm
          key={JSON.stringify(saved.data.config)}
          initial={saved.data}
          save={save.mutate}
          busy={save.isPending}
          saved={save.isSuccess}
          error={save.error}
          tr={tr}
        />
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Rule({ children, consent }: { children: ReactNode; consent: boolean }) {
  return (
    <p
      className={`rounded px-3 py-2 text-xs ${
        consent ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'
      }`}
    >
      {children}
    </p>
  );
}

function AnalyticsForm({
  initial,
  save,
  busy,
  saved,
  error,
  tr,
}: {
  initial: ConfigView;
  save: (config: AnalyticsConfig) => void;
  busy: boolean;
  saved: boolean;
  error: unknown;
  tr: Tr;
}) {
  const [cfg, setCfg] = useState(initial.config);
  const set = <K extends keyof AnalyticsConfig>(key: K, change: Partial<AnalyticsConfig[K]>) =>
    setCfg((c) => ({ ...c, [key]: { ...c[key], ...change } }));
  const wrong = (key: string) =>
    initial.problems.includes(key) ? (
      <Alert>
        {tr(
          'Check the code: this service stays off until it is valid.',
          'Controlla il codice: il servizio resta spento finché non è valido.',
        )}
      </Alert>
    ) : null;
  const sitemap = `${window.location.origin}/sitemap.xml`;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save(cfg);
      }}
    >
      <Card title="Matomo">
        <div className="space-y-3">
          <Toggle
            label={tr('Use Matomo', 'Usa Matomo')}
            checked={cfg.matomo.enabled}
            onChange={(v) => set('matomo', { enabled: v })}
          />
          {cfg.matomo.enabled && (
            <>
              {wrong('matomo')}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <TextField
                    label={tr('Matomo address', 'Indirizzo di Matomo')}
                    placeholder="https://stats.example.com/"
                    value={cfg.matomo.url}
                    onChange={(e) => set('matomo', { url: e.target.value })}
                  />
                </div>
                <TextField
                  label={tr('Site ID', 'ID del sito')}
                  value={cfg.matomo.siteId}
                  onChange={(e) => set('matomo', { siteId: e.target.value })}
                />
              </div>
              <fieldset className="space-y-2 text-sm">
                <legend className="font-medium text-slate-800">{tr('Mode', 'Modalità')}</legend>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    className="mt-1"
                    checked={cfg.matomo.mode === 'anonymous'}
                    onChange={() => set('matomo', { mode: 'anonymous' })}
                  />
                  <span>
                    {tr(
                      'Anonymous, without cookies (recommended)',
                      'Anonima, senza cookie (consigliata)',
                    )}
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    className="mt-1"
                    checked={cfg.matomo.mode === 'consent'}
                    onChange={() => set('matomo', { mode: 'consent' })}
                  />
                  <span>{tr('With cookies, after consent', 'Con cookie, dopo il consenso')}</span>
                </label>
              </fieldset>
              {cfg.matomo.mode === 'anonymous' ? (
                <Rule consent={false}>
                  {tr(
                    'GDPR: no consent needed (Garante, 10 June 2021), as long as in Matomo you anonymize IP addresses (Privacy → Anonymize data: at least 2 bytes) and do not combine the data with other data. Described in the privacy policy as legitimate interest.',
                    'GDPR: nessun consenso necessario (Garante, 10 giugno 2021), a patto che in Matomo anonimizzi gli indirizzi IP (Privacy → Anonimizza i dati: almeno 2 byte) e non incroci i dati con altri. Descritto nella privacy policy come legittimo interesse.',
                  )}
                </Rule>
              ) : (
                <Rule consent>
                  {tr(
                    'GDPR: loaded only after consent to “Statistics”; cookies _pk_id and _pk_ses are added to the cookie table.',
                    'GDPR: caricato solo dopo il consenso a “Statistiche”; i cookie _pk_id e _pk_ses vengono aggiunti alla tabella dei cookie.',
                  )}
                </Rule>
              )}
            </>
          )}
        </div>
      </Card>

      <Card title="Google Analytics 4">
        <div className="space-y-3">
          <Toggle
            label={tr('Use Google Analytics 4', 'Usa Google Analytics 4')}
            checked={cfg.ga4.enabled}
            onChange={(v) => set('ga4', { enabled: v })}
          />
          {cfg.ga4.enabled && (
            <>
              {wrong('ga4')}
              <TextField
                label={tr('Measurement ID', 'ID di misurazione')}
                placeholder="G-XXXXXXXXXX"
                value={cfg.ga4.measurementId}
                onChange={(e) => set('ga4', { measurementId: e.target.value })}
              />
              <Rule consent>
                {tr(
                  'GDPR: loaded only after consent to “Statistics”, with Google Consent Mode v2; cookies _ga and _ga_… in the cookie table; the privacy policy mentions Google and the transfer of data to the USA (Data Privacy Framework).',
                  'GDPR: caricato solo dopo il consenso a “Statistiche”, con Google Consent Mode v2; cookie _ga e _ga_… nella tabella dei cookie; la privacy policy cita Google e il trasferimento dei dati negli USA (Data Privacy Framework).',
                )}
              </Rule>
            </>
          )}
        </div>
      </Card>

      <Card title="Google Tag Manager">
        <div className="space-y-3">
          <Toggle
            label={tr('Use Google Tag Manager', 'Usa Google Tag Manager')}
            checked={cfg.gtm.enabled}
            onChange={(v) => set('gtm', { enabled: v })}
          />
          {cfg.gtm.enabled && (
            <>
              {wrong('gtm')}
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label={tr('Container ID', 'ID del contenitore')}
                  placeholder="GTM-XXXXXXX"
                  value={cfg.gtm.containerId}
                  onChange={(e) => set('gtm', { containerId: e.target.value })}
                />
                <label className="block space-y-1 text-sm">
                  <span className="block font-medium text-slate-800">
                    {tr('Consent category', 'Categoria di consenso')}
                  </span>
                  <select
                    className="w-full rounded border border-slate-300 bg-white px-2 py-2"
                    value={cfg.gtm.category}
                    onChange={(e) =>
                      set('gtm', { category: e.target.value as 'statistics' | 'marketing' })
                    }
                  >
                    <option value="statistics">{tr('Statistics', 'Statistiche')}</option>
                    <option value="marketing">Marketing</option>
                  </select>
                </label>
              </div>
              <Rule consent>
                {tr(
                  'GDPR: the container is loaded only after consent to its category, with Google Consent Mode v2. Add the cookies of the tags it loads in Privacy → Cookies.',
                  'GDPR: il contenitore viene caricato solo dopo il consenso alla sua categoria, con Google Consent Mode v2. Aggiungi i cookie dei tag che carica in Privacy → Cookie.',
                )}
              </Rule>
            </>
          )}
        </div>
      </Card>

      <Card title="Meta Pixel">
        <div className="space-y-3">
          <Toggle
            label={tr(
              'Use the Meta Pixel (Facebook, Instagram)',
              'Usa il Meta Pixel (Facebook, Instagram)',
            )}
            checked={cfg.metaPixel.enabled}
            onChange={(v) => set('metaPixel', { enabled: v })}
          />
          {cfg.metaPixel.enabled && (
            <>
              {wrong('metaPixel')}
              <TextField
                label={tr('Pixel ID', 'ID del pixel')}
                value={cfg.metaPixel.pixelId}
                onChange={(e) => set('metaPixel', { pixelId: e.target.value })}
              />
              <Rule consent>
                {tr(
                  'GDPR: loaded only after consent to “Marketing”; cookies _fbp and fr in the cookie table; the privacy policy mentions Meta and the transfer of data outside the EU.',
                  'GDPR: caricato solo dopo il consenso a “Marketing”; cookie _fbp e fr nella tabella dei cookie; la privacy policy cita Meta e il trasferimento dei dati fuori dall’UE.',
                )}
              </Rule>
            </>
          )}
        </div>
      </Card>

      <Card title={tr('Search engines', 'Motori di ricerca')}>
        <div className="space-y-3">
          <Toggle
            label="Google Search Console"
            checked={cfg.searchConsole.enabled}
            onChange={(v) => set('searchConsole', { enabled: v })}
          />
          {cfg.searchConsole.enabled && (
            <>
              {wrong('searchConsole')}
              <TextField
                label={tr('Verification code (HTML tag)', 'Codice di verifica (tag HTML)')}
                hint={tr(
                  'Paste the content of the google-site-verification tag, or the whole tag.',
                  'Incolla il contenuto del tag google-site-verification, o il tag intero.',
                )}
                value={cfg.searchConsole.token}
                onChange={(e) => set('searchConsole', { token: e.target.value })}
              />
            </>
          )}
          <Toggle
            label="Bing Webmaster Tools"
            checked={cfg.bing.enabled}
            onChange={(v) => set('bing', { enabled: v })}
          />
          {cfg.bing.enabled && (
            <>
              {wrong('bing')}
              <TextField
                label={tr(
                  'Verification code (msvalidate.01)',
                  'Codice di verifica (msvalidate.01)',
                )}
                value={cfg.bing.token}
                onChange={(e) => set('bing', { token: e.target.value })}
              />
            </>
          )}
          <Rule consent={false}>
            {tr(
              `GDPR: verification adds only a meta tag, with no cookies and no data about visitors. Then submit the sitemap: ${sitemap}`,
              `GDPR: la verifica aggiunge solo un meta tag, senza cookie né dati sui visitatori. Poi invia la sitemap: ${sitemap}`,
            )}
          </Rule>
        </div>
      </Card>

      {error ? <Alert>{errorMessage(error)}</Alert> : null}
      {saved && (
        <Alert kind="success">
          {tr(
            'Saved. If the privacy and cookie policies are already published, create them again in Privacy → Policies so they describe these services.',
            'Salvato. Se privacy e cookie policy sono già pubblicate, ricreale in Privacy → Policy perché descrivano questi servizi.',
          )}
        </Alert>
      )}
      <Button type="submit" disabled={busy}>
        {tr('Save', 'Salva')}
      </Button>
    </form>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Analytics', it: 'Statistiche' },
      capability: 'manage_analytics',
      component: AnalyticsPage,
    },
  ],
});
