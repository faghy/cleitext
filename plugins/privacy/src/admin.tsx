import {
  Alert,
  api as coreApi,
  Button,
  Card,
  defineAdminPlugin,
  errorMessage,
  labelText,
  TextField,
  type AdminPageProps,
} from '@cleitext/admin-sdk';
import type { TrackerDeclaration } from '@cleitext/plugin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import {
  CATEGORIES,
  categoryLabel,
  textsFor,
  type Category,
  type CookieRow,
  type PrivacyConfig,
} from './config';

type Tab = 'banner' | 'cookies' | 'policies' | 'requests' | 'consents';

interface TrackersView {
  trackers: TrackerDeclaration[];
  categories: Category[];
  consentMode: boolean;
  bannerShown: boolean;
}

interface ConsentStats {
  total: number;
  rejected: number;
  byCategory: Record<string, number>;
  version: number;
  recent: { id: string; categories: string[]; version: number; ip: string | null; date: string }[];
}

interface RequestRow {
  id: string;
  kind: 'export' | 'erase';
  email: string;
  handledBy: string;
  result: Record<string, number>;
  date: string;
}

const field = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

function PrivacyPage(props: AdminPageProps) {
  const it = props.user.locale.startsWith('it');
  const tr = (en: string, itText: string) => (it ? itText : en);
  const [tab, setTab] = useState<Tab>('banner');
  // Outside the tab, which is drawn again when the settings are saved.
  const [created, setCreated] = useState<{ id: string; title: string } | null>(null);
  const queryClient = useQueryClient();
  const saved = useQuery({
    queryKey: ['privacy', 'config'],
    queryFn: () => props.api<PrivacyConfig>('GET', '/config'),
  });
  const save = useMutation({
    mutationFn: (next: PrivacyConfig & { askAgain?: boolean }) =>
      props.api<PrivacyConfig>('PUT', '/config', next),
    onSuccess: (next) => queryClient.setQueryData(['privacy', 'config'], next),
  });
  const tabs: [Tab, string][] = [
    ['banner', tr('Cookie banner', 'Banner cookie')],
    ['cookies', tr('Cookies', 'Cookie')],
    ['policies', tr('Policies', 'Policy')],
    ['requests', tr('Data requests', 'Richieste sui dati')],
    ['consents', tr('Consent log', 'Registro consensi')],
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{tr('Privacy & GDPR', 'Privacy e GDPR')}</h1>
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`-mb-px rounded-t border px-3 py-2 text-sm font-medium ${
              tab === key
                ? 'border-slate-200 border-b-white bg-white text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {saved.error && <Alert>{errorMessage(saved.error)}</Alert>}
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      {save.isSuccess && <Alert kind="success">{tr('Saved.', 'Salvato.')}</Alert>}
      {saved.data && tab === 'banner' && (
        <BannerTab
          key={JSON.stringify(saved.data)}
          {...props}
          config={saved.data}
          save={save.mutate}
          busy={save.isPending}
          tr={tr}
        />
      )}
      {saved.data && tab === 'cookies' && (
        <CookiesTab
          key={JSON.stringify(saved.data.cookies)}
          config={saved.data}
          save={save.mutate}
          busy={save.isPending}
          tr={tr}
          it={it}
        />
      )}
      {saved.data && tab === 'policies' && (
        <PoliciesTab
          key={JSON.stringify(saved.data)}
          created={created}
          onCreated={setCreated}
          {...props}
          config={saved.data}
          save={save.mutateAsync}
          busy={save.isPending}
          tr={tr}
        />
      )}
      {tab === 'requests' && <RequestsTab {...props} tr={tr} />}
      {tab === 'consents' && <ConsentsTab {...props} tr={tr} it={it} />}
    </div>
  );
}

type Tr = (en: string, it: string) => string;

function Check({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block font-medium text-slate-800">{label}</span>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="block font-medium text-slate-800">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function BannerTab({
  config,
  save,
  busy,
  tr,
  site,
  api,
  user,
}: AdminPageProps & {
  config: PrivacyConfig;
  save: (next: PrivacyConfig & { askAgain?: boolean }) => void;
  busy: boolean;
  tr: Tr;
}) {
  const [banner, setBanner] = useState(config.banner);
  const trackers = useQuery({
    queryKey: ['privacy', 'trackers', config],
    queryFn: () => api<TrackersView>('GET', '/trackers'),
  });
  const [retention, setRetention] = useState(config.consentRetentionMonths);
  const set = <K extends keyof PrivacyConfig['banner']>(
    key: K,
    value: PrivacyConfig['banner'][K],
  ) => setBanner((b) => ({ ...b, [key]: value }));
  const toggleCategory = (c: Category, on: boolean) =>
    set('categories', on ? [...banner.categories, c] : banner.categories.filter((x) => x !== c));
  const languages =
    site.locales.length > 0
      ? site.locales
      : [{ code: site.defaultLocale, name: site.defaultLocale }];
  const help: Record<Category, [string, string]> = {
    preferences: [
      tr('Preferences', 'Preferenze'),
      tr('e.g. remembering the language', 'es. ricordare la lingua'),
    ],
    statistics: [
      tr('Statistics', 'Statistiche'),
      tr('e.g. Google Analytics, Matomo with cookies', 'es. Google Analytics, Matomo con cookie'),
    ],
    marketing: [
      tr('Marketing', 'Marketing'),
      tr(
        'ads, social pixels, YouTube videos and maps',
        'pubblicità, pixel social, video YouTube e mappe',
      ),
    ],
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save({ ...config, banner, consentRetentionMonths: retention });
      }}
    >
      <Card title={tr('Tracking services', 'Servizi di tracciamento')}>
        {trackers.data && trackers.data.trackers.length > 0 ? (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">
              {tr(
                'Added by other plugins, such as Analytics. Their rules are applied automatically: the banner asks for their category, their cookies are in the cookie table, and the privacy policy describes them when you create it again.',
                'Aggiunti da altri plugin, come Analytics. Le loro regole sono applicate automaticamente: il banner chiede la loro categoria, i loro cookie sono nella tabella dei cookie e la privacy policy li descrive quando la crei di nuovo.',
              )}
            </p>
            <ul className="space-y-2">
              {trackers.data.trackers.map((t) => (
                <li key={t.id} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-slate-500"> · {t.provider}</span>
                  <span className="block text-xs text-slate-600">
                    {t.requiresConsent
                      ? tr(
                          `Only after consent to “${categoryLabel(textsFor('en'), t.category)}”`,
                          `Solo dopo il consenso a “${categoryLabel(textsFor('it'), t.category)}”`,
                        )
                      : tr(
                          'No consent needed (anonymous, no cookies)',
                          'Nessun consenso necessario (anonimo, senza cookie)',
                        )}
                    {t.cookies.length > 0 &&
                      ` · ${tr('cookies', 'cookie')}: ${t.cookies.map((c) => c.name).join(', ')}`}
                    {t.transfersOutsideEu &&
                      ` · ${tr('data outside the EU', 'dati fuori dall’UE')}`}
                    {t.googleConsentMode && ' · Google Consent Mode v2'}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {labelText(t.purpose, user.locale)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            {tr(
              'None. To connect Matomo, Google Analytics, Search Console and other services, install the Analytics plugin: their privacy rules are then applied here automatically.',
              'Nessuno. Per collegare Matomo, Google Analytics, Search Console e altri servizi installa il plugin Analytics: le loro regole privacy vengono poi applicate qui automaticamente.',
            )}
          </p>
        )}
      </Card>

      <Card title={tr('Banner', 'Banner')}>
        <div className="space-y-3">
          <Check
            label={tr('Show the cookie banner', 'Mostra il banner dei cookie')}
            hint={tr(
              'Needed when the site uses cookies or scripts that are not technical. With no category below, no banner is shown.',
              'Serve se il sito usa cookie o script non tecnici. Senza nessuna categoria qui sotto, il banner non compare.',
            )}
            checked={banner.enabled}
            onChange={(v) => set('enabled', v)}
          />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-800">
              {tr('Categories visitors can accept', 'Categorie che i visitatori possono accettare')}
            </legend>
            {CATEGORIES.map((c) => (
              <Check
                key={c}
                label={help[c][0]}
                hint={help[c][1]}
                checked={banner.categories.includes(c)}
                onChange={(v) => toggleCategory(c, v)}
              />
            ))}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-3">
            <Labeled label={tr('Layout', 'Aspetto')}>
              <select
                className={field}
                value={banner.layout}
                onChange={(e) => set('layout', e.target.value as 'bar' | 'box')}
              >
                <option value="bar">{tr('Bar at the bottom', 'Barra in basso')}</option>
                <option value="box">{tr('Box in a corner', 'Riquadro in un angolo')}</option>
              </select>
            </Labeled>
            <Labeled label={tr('Color', 'Colore')}>
              <input
                type="color"
                className="h-9 w-20 rounded border border-slate-300"
                value={banner.color}
                onChange={(e) => set('color', e.target.value)}
              />
            </Labeled>
            <Labeled
              label={tr('Ask again after (months)', 'Richiedi di nuovo dopo (mesi)')}
              hint={tr('The Garante suggests at most 6.', 'Il Garante indica al massimo 6.')}
            >
              <input
                type="number"
                min={1}
                max={12}
                className={field}
                value={banner.months}
                onChange={(e) => set('months', Number(e.target.value))}
              />
            </Labeled>
          </div>
          <Check
            label={tr(
              'Button to change the choice in a corner of every page',
              'Pulsante per cambiare la scelta in un angolo di ogni pagina',
            )}
            hint={tr(
              'Or add a menu item with the address #cookie-preferences, or the “Cookie preferences button” block.',
              'Oppure aggiungi una voce di menu con indirizzo #cookie-preferences, o il blocco “Pulsante preferenze cookie”.',
            )}
            checked={banner.floatingButton}
            onChange={(v) => set('floatingButton', v)}
          />
        </div>
      </Card>

      <Card title={tr('Texts', 'Testi')}>
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            {tr(
              'Leave empty to use the standard text.',
              'Lascia vuoto per usare il testo standard.',
            )}
          </p>
          {languages.map((l) => {
            const t = textsFor(l.code);
            return (
              <div key={l.code} className="space-y-2">
                <p className="text-sm font-semibold">{l.name}</p>
                <TextField
                  label={tr('Title', 'Titolo')}
                  placeholder={t.title}
                  value={banner.title[l.code] ?? ''}
                  onChange={(e) => set('title', { ...banner.title, [l.code]: e.target.value })}
                />
                <Labeled label={tr('Message', 'Messaggio')}>
                  <textarea
                    rows={3}
                    className={field}
                    placeholder={t.message}
                    value={banner.message[l.code] ?? ''}
                    onChange={(e) =>
                      set('message', { ...banner.message, [l.code]: e.target.value })
                    }
                  />
                </Labeled>
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        title={tr('Scripts loaded only after consent', 'Script caricati solo dopo il consenso')}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {tr(
              'Paste here the code of analytics, ads or pixels, in the category it belongs to: it runs only for visitors who accepted it. In pages and themes, scripts with type="text/plain" data-cx-category="statistics" and iframes with data-cx-src work the same way.',
              'Incolla qui il codice di statistiche, pubblicità o pixel, nella sua categoria: parte solo per chi l’ha accettata. Nelle pagine e nei temi funzionano allo stesso modo gli script con type="text/plain" data-cx-category="statistics" e gli iframe con data-cx-src.',
            )}
          </p>
          {banner.categories.map((c) => (
            <Labeled key={c} label={help[c][0]}>
              <textarea
                rows={4}
                className={`${field} font-mono text-xs`}
                spellCheck={false}
                placeholder='<script async src="https://…"></script>'
                value={banner.scripts[c] ?? ''}
                onChange={(e) => set('scripts', { ...banner.scripts, [c]: e.target.value })}
              />
            </Labeled>
          ))}
          <Check
            label={tr('Google Consent Mode v2', 'Google Consent Mode v2')}
            hint={tr(
              'For Google Analytics and Ads: their tags start in “denied” mode and follow the visitor’s choice.',
              'Per Google Analytics e Ads: i loro tag partono in modalità “negato” e seguono la scelta del visitatore.',
            )}
            checked={banner.consentMode}
            onChange={(v) => set('consentMode', v)}
          />
        </div>
      </Card>

      <Card title={tr('Consent log', 'Registro consensi')}>
        <Labeled
          label={tr('Keep consent records for (months)', 'Conserva i consensi per (mesi)')}
          hint={tr(
            'Proof of consent (GDPR art. 7.1); older records are deleted.',
            'Prova del consenso (art. 7.1 GDPR); i più vecchi vengono cancellati.',
          )}
        >
          <input
            type="number"
            min={6}
            max={120}
            className={`${field} max-w-32`}
            value={retention}
            onChange={(e) => setRetention(Number(e.target.value))}
          />
        </Labeled>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {tr('Save', 'Salva')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                tr(
                  'Ask every visitor to choose again?',
                  'Chiedere di nuovo la scelta a tutti i visitatori?',
                ),
              )
            )
              save({ ...config, banner, consentRetentionMonths: retention, askAgain: true });
          }}
        >
          {tr('Save and ask everyone again', 'Salva e chiedi di nuovo a tutti')}
        </Button>
      </div>
    </form>
  );
}

function CookiesTab({
  config,
  save,
  busy,
  tr,
  it,
}: {
  config: PrivacyConfig;
  save: (next: PrivacyConfig) => void;
  busy: boolean;
  tr: Tr;
  it: boolean;
}) {
  const [rows, setRows] = useState<CookieRow[]>(config.cookies);
  const t = textsFor(it ? 'it' : 'en');
  const update = (index: number, change: Partial<CookieRow>) =>
    setRows((list) => list.map((row, i) => (i === index ? { ...row, ...change } : row)));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save({ ...config, cookies: rows.filter((r) => r.name.trim()) });
      }}
    >
      <Card title={tr('Cookies of the site', 'Cookie del sito')}>
        <p className="mb-3 text-sm text-slate-600">
          {tr(
            'They are listed in the cookie policy (the “Cookie table” block). Changing them asks visitors to choose again.',
            'Compaiono nella cookie policy (il blocco “Tabella dei cookie”). Cambiarli chiede ai visitatori di scegliere di nuovo.',
          )}
        </p>
        <div className="space-y-3">
          {rows.map((row, index) => (
            <fieldset
              key={index}
              className="grid gap-2 rounded border border-slate-200 p-3 sm:grid-cols-6"
            >
              <legend className="sr-only">{row.name || tr('New cookie', 'Nuovo cookie')}</legend>
              <input
                aria-label={t.table.name}
                placeholder={t.table.name}
                className={`${field} sm:col-span-2`}
                value={row.name}
                onChange={(e) => update(index, { name: e.target.value })}
              />
              <input
                aria-label={t.table.provider}
                placeholder={t.table.provider}
                className={`${field} sm:col-span-2`}
                value={row.provider}
                onChange={(e) => update(index, { provider: e.target.value })}
              />
              <select
                aria-label={t.table.category}
                className={`${field} sm:col-span-2`}
                value={row.category}
                onChange={(e) =>
                  update(index, { category: e.target.value as CookieRow['category'] })
                }
              >
                {(['necessary', ...CATEGORIES] as const).map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(t, c)}
                  </option>
                ))}
              </select>
              <input
                aria-label={t.table.purpose}
                placeholder={t.table.purpose}
                className={`${field} sm:col-span-4`}
                value={row.purpose}
                onChange={(e) => update(index, { purpose: e.target.value })}
              />
              <input
                aria-label={t.table.duration}
                placeholder={t.table.duration}
                className={`${field} sm:col-span-1`}
                value={row.duration}
                onChange={(e) => update(index, { duration: e.target.value })}
              />
              <Button
                type="button"
                variant="danger"
                onClick={() => setRows((list) => list.filter((_, i) => i !== index))}
              >
                {tr('Remove', 'Rimuovi')}
              </Button>
            </fieldset>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setRows((list) => [
                ...list,
                { name: '', provider: '', category: 'statistics', purpose: '', duration: '' },
              ])
            }
          >
            {tr('Add a cookie', 'Aggiungi un cookie')}
          </Button>
          <Button type="submit" disabled={busy}>
            {tr('Save', 'Salva')}
          </Button>
        </div>
      </Card>
    </form>
  );
}

interface EntryCreated {
  id: string;
}

function PoliciesTab({
  config,
  save,
  busy,
  tr,
  site,
  api,
  created,
  onCreated,
}: AdminPageProps & {
  config: PrivacyConfig;
  save: (next: PrivacyConfig) => Promise<PrivacyConfig>;
  busy: boolean;
  tr: Tr;
  created: { id: string; title: string } | null;
  onCreated: (created: { id: string; title: string }) => void;
}) {
  const [controller, setController] = useState(config.controller);
  const [processing, setProcessing] = useState(config.processing);
  const languages =
    site.locales.length > 0
      ? site.locales
      : [{ code: site.defaultLocale, name: site.defaultLocale }];
  const create = useMutation({
    mutationFn: async ({ kind, locale }: { kind: 'privacy' | 'cookies'; locale: string }) => {
      // The texts follow the saved settings: save the form first.
      const current = await save({ ...config, controller, processing });
      const query = new URLSearchParams({
        locale,
        site: site.name,
        origin: window.location.origin,
      });
      const draft = await api<{ title: string; slug: string; document: unknown }>(
        'GET',
        `/policy/${kind}?${query.toString()}`,
      );
      const entry = await coreApi<EntryCreated>('POST', '/entries', {
        type: 'page',
        locale,
        title: draft.title,
        slug: draft.slug,
        document: draft.document,
      });
      await save({
        ...current,
        pages: { ...current.pages, [locale]: { ...current.pages[locale], [kind]: entry.id } },
      });
      return { id: entry.id, title: draft.title };
    },
    onSuccess: onCreated,
  });
  const text = (key: keyof PrivacyConfig['controller'], label: string, hint?: string) => (
    <TextField
      label={label}
      hint={hint}
      value={controller[key]}
      onChange={(e) => setController((c) => ({ ...c, [key]: e.target.value }))}
    />
  );

  return (
    <div className="space-y-4">
      <Alert>
        {tr(
          'The policies are a starting point written from these answers: read them, complete them and, if in doubt, have them checked by a professional. The site owner is responsible for them.',
          'Le policy sono un punto di partenza scritto da queste risposte: leggile, completale e, nel dubbio, falle controllare da un professionista. Il titolare del sito ne è responsabile.',
        )}
      </Alert>
      <Card title={tr('Data controller', 'Titolare del trattamento')}>
        <div className="grid gap-3 sm:grid-cols-2">
          {text('name', tr('Name or company', 'Nome o ragione sociale'))}
          {text('vat', tr('VAT or tax number', 'P. IVA o codice fiscale'))}
          {text('address', tr('Address', 'Indirizzo'))}
          {text('email', tr('Email for privacy requests', 'Email per le richieste privacy'))}
          {text('phone', tr('Phone (optional)', 'Telefono (facoltativo)'))}
          {text('dpoEmail', tr('DPO email (if appointed)', 'Email del DPO (se nominato)'))}
        </div>
      </Card>
      <Card title={tr('What the site does', 'Cosa fa il sito')}>
        <div className="space-y-2">
          <Check
            label={tr('Contact forms', 'Moduli di contatto')}
            checked={processing.contactForms}
            onChange={(v) => setProcessing((p) => ({ ...p, contactForms: v }))}
          />
          <Check
            label={tr('User accounts', 'Account degli utenti')}
            checked={processing.accounts}
            onChange={(v) => setProcessing((p) => ({ ...p, accounts: v }))}
          />
          <Check
            label={tr('Newsletter', 'Newsletter')}
            checked={processing.newsletter}
            onChange={(v) => setProcessing((p) => ({ ...p, newsletter: v }))}
          />
          <Check
            label={tr('Videos, maps or posts of other sites', 'Video, mappe o post di altri siti')}
            checked={processing.embeds}
            onChange={(v) => setProcessing((p) => ({ ...p, embeds: v }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={tr('Analytics service', 'Servizio di statistiche')}
              hint={tr(
                'e.g. Google Analytics; empty if none',
                'es. Google Analytics; vuoto se nessuno',
              )}
              value={processing.analytics}
              onChange={(e) => setProcessing((p) => ({ ...p, analytics: e.target.value }))}
            />
            <TextField
              label={tr('Hosting provider', 'Fornitore di hosting')}
              value={processing.hosting}
              onChange={(e) => setProcessing((p) => ({ ...p, hosting: e.target.value }))}
            />
          </div>
        </div>
        <div className="mt-3">
          <Button
            type="button"
            disabled={busy}
            onClick={() => void save({ ...config, controller, processing })}
          >
            {tr('Save', 'Salva')}
          </Button>
        </div>
      </Card>
      <Card title={tr('Create the pages', 'Crea le pagine')}>
        <p className="mb-3 text-sm text-slate-600">
          {tr(
            'Each button saves the answers above and creates a draft page made of ordinary blocks, to review in the editor and publish. Once published, the banner links to it.',
            'Ogni pulsante salva le risposte qui sopra e crea una pagina in bozza fatta di blocchi normali, da rivedere nell’editor e pubblicare. Una volta pubblicata, il banner la collega.',
          )}
        </p>
        {create.error && <Alert>{errorMessage(create.error)}</Alert>}
        {created && (
          <Alert kind="success">
            {tr('Draft created: ', 'Bozza creata: ')}
            <a className="font-medium underline" href={`/admin/entries/${created.id}`}>
              {created.title} — {tr('open in the editor', 'apri nell’editor')}
            </a>
          </Alert>
        )}
        <div className="space-y-2">
          {languages.map((l) => (
            <div key={l.code} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-28 font-medium">{l.name}</span>
              {(['privacy', 'cookies'] as const).map((kind) => {
                const existing = config.pages[l.code]?.[kind];
                return (
                  <span key={kind} className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={create.isPending}
                      onClick={() => {
                        if (
                          !existing ||
                          window.confirm(
                            tr(
                              'A page was already created: create a new draft?',
                              'Una pagina è già stata creata: creare una nuova bozza?',
                            ),
                          )
                        )
                          create.mutate({ kind, locale: l.code });
                      }}
                    >
                      {kind === 'privacy'
                        ? tr('Create privacy policy', 'Crea privacy policy')
                        : tr('Create cookie policy', 'Crea cookie policy')}
                    </Button>
                    {existing && (
                      <a className="text-sky-700 underline" href={`/admin/entries/${existing}`}>
                        {tr('open', 'apri')}
                      </a>
                    )}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function RequestsTab({ api, tr, user }: AdminPageProps & { tr: Tr }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const log = useQuery({
    queryKey: ['privacy', 'requests'],
    queryFn: () => api<RequestRow[]>('GET', '/requests'),
  });
  const run = useMutation({
    mutationFn: (kind: 'export' | 'erase') =>
      api<
        Record<string, unknown> & {
          items?: number;
          removed?: number;
          retained?: number;
          results?: { label: string; removed: number; retained: number; messages: string[] }[];
        }
      >('POST', '/requests', { kind, email, locale: user.locale }),
    onSuccess: async (result) => {
      if (result.kind === 'export') {
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `personal-data-${email.replace(/[^\w.-]+/g, '_')}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
      }
      await queryClient.invalidateQueries({ queryKey: ['privacy', 'requests'] });
    },
  });
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <div className="space-y-4">
      <Card title={tr('Export or erase personal data', 'Esporta o cancella i dati personali')}>
        <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
          <p className="text-sm text-slate-600">
            {tr(
              'When someone asks for their data (GDPR art. 15 and 20) or to have it erased (art. 17), check who they are, then enter their email. The data comes from the account, its sessions and activity, and from the plugins that keep personal data, such as form messages. Accounts are not deleted here: do it from Users if needed.',
              'Quando qualcuno chiede i propri dati (artt. 15 e 20 GDPR) o di cancellarli (art. 17), verifica chi è, poi inserisci la sua email. I dati vengono dall’account, dalle sue sessioni e attività, e dai plugin che tengono dati personali, come i messaggi dei moduli. Gli account non si cancellano qui: fallo da Utenti se serve.',
            )}
          </p>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!valid || run.isPending}
              onClick={() => run.mutate('export')}
            >
              {tr('Export (download JSON)', 'Esporta (scarica JSON)')}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={!valid || run.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    tr(
                      `Erase the personal data of ${email}? This cannot be undone.`,
                      `Cancellare i dati personali di ${email}? Non si può annullare.`,
                    ),
                  )
                )
                  run.mutate('erase');
              }}
            >
              {tr('Erase', 'Cancella')}
            </Button>
          </div>
          {run.error && <Alert>{errorMessage(run.error)}</Alert>}
          {run.data?.kind === 'export' && (
            <Alert kind="success">
              {tr(
                `Exported ${run.data.items ?? 0} items: the file was downloaded.`,
                `Esportati ${run.data.items ?? 0} elementi: il file è stato scaricato.`,
              )}
            </Alert>
          )}
          {run.data?.kind === 'erase' && (
            <Alert kind="success">
              {tr(
                `Erased ${run.data.removed ?? 0} items, kept ${run.data.retained ?? 0}.`,
                `Cancellati ${run.data.removed ?? 0} elementi, conservati ${run.data.retained ?? 0}.`,
              )}
              {run.data.results
                ?.flatMap((r) => r.messages)
                .map((m) => (
                  <span key={m} className="block">
                    {m}
                  </span>
                ))}
            </Alert>
          )}
        </form>
      </Card>
      <Card title={tr('Requests handled', 'Richieste gestite')}>
        {log.data && log.data.length > 0 ? (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2 font-medium">{tr('Date', 'Data')}</th>
                <th className="py-2 font-medium">{tr('Request', 'Richiesta')}</th>
                <th className="py-2 font-medium">Email</th>
                <th className="py-2 font-medium">{tr('Handled by', 'Gestita da')}</th>
              </tr>
            </thead>
            <tbody>
              {log.data.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-2">{new Date(r.date).toLocaleString(user.locale)}</td>
                  <td className="py-2">
                    {r.kind === 'export'
                      ? tr('Export', 'Esportazione')
                      : tr('Erasure', 'Cancellazione')}
                  </td>
                  <td className="py-2">{r.email}</td>
                  <td className="py-2">{r.handledBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-600">
            {tr('No requests yet.', 'Nessuna richiesta finora.')}
          </p>
        )}
      </Card>
    </div>
  );
}

function ConsentsTab({ api, tr, it, user }: AdminPageProps & { tr: Tr; it: boolean }) {
  const stats = useQuery({
    queryKey: ['privacy', 'consents'],
    queryFn: () => api<ConsentStats>('GET', '/consents'),
  });
  const t = textsFor(it ? 'it' : 'en');
  const s = stats.data;
  return (
    <div className="space-y-4">
      {stats.error && <Alert>{errorMessage(stats.error)}</Alert>}
      {s && (
        <Card title={tr('Choices of visitors', 'Scelte dei visitatori')}>
          <div className="grid gap-3 text-sm sm:grid-cols-5">
            <Stat label={tr('Choices recorded', 'Scelte registrate')} value={s.total} />
            <Stat label={tr('Rejected all', 'Rifiutato tutto')} value={s.rejected} />
            {CATEGORIES.map((c) => (
              <Stat key={c} label={categoryLabel(t, c)} value={s.byCategory[c] ?? 0} />
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {tr(
              `Each record keeps the random id saved in the visitor's browser, the categories, the banner version (now ${s.version}), the IP without its last part and the browser.`,
              `Ogni registrazione conserva l’id casuale salvato nel browser del visitatore, le categorie, la versione del banner (ora ${s.version}), l’IP senza l’ultima parte e il browser.`,
            )}
          </p>
          <a
            className="mt-3 inline-block text-sm text-sky-700 underline"
            href="/api/v1/ext/privacy/consents.csv"
          >
            {tr('Download all (CSV)', 'Scarica tutto (CSV)')}
          </a>
        </Card>
      )}
      {s && s.recent.length > 0 && (
        <Card title={tr('Latest choices', 'Ultime scelte')}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2 font-medium">{tr('Date', 'Data')}</th>
                <th className="py-2 font-medium">{tr('Accepted', 'Accettati')}</th>
                <th className="py-2 font-medium">ID</th>
                <th className="py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {s.recent.map((r, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2">{new Date(r.date).toLocaleString(user.locale)}</td>
                  <td className="py-2">
                    {r.categories.length === 0
                      ? tr('Only necessary', 'Solo necessari')
                      : r.categories.map((c) => categoryLabel(t, c as Category)).join(', ')}
                  </td>
                  <td className="py-2 font-mono text-xs">{r.id}</td>
                  <td className="py-2">{r.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-slate-600">{label}</p>
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Privacy', it: 'Privacy' },
      capability: 'manage_privacy',
      component: PrivacyPage,
      // A shield with a check.
      icon: 'M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z M8.8 12l2.2 2.2 4.2-4.4',
    },
  ],
});
