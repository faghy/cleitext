/**
 * NewLetter in the admin: the connection to the service (key, test, lists),
 * the form's defaults and texts, the "subscribe me" box of other plugins,
 * and the log of subscriptions. Also Fresco's Newsletter widget and the
 * Italian texts.
 */
import {
  addMessages,
  Alert,
  Button,
  Card,
  defineAdminPlugin,
  errorMessage,
  TextField,
  useT,
  type AdminPageProps,
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { registerFrescoWidget, MAIL_ICON } from './admin/fresco';
import { IT } from './admin/it';
import { CAPABILITY, NAME, TAGLINE } from './config';
import type { Settings } from './model/settings';
import { EDITABLE, stringsFor, type EditableText } from './model/strings';
import type { ProviderId } from './model/types';
import type { ProviderField, ProviderList } from './providers/types';
import type { LogEntry } from './schema';

addMessages('it', IT);
registerFrescoWidget();

type Api = AdminPageProps['api'];

interface SettingsAnswer {
  settings: Settings;
  hasKey: boolean;
  ready: boolean;
}

const PROVIDERS: { id: ProviderId; name: string; key: string; tags: boolean }[] = [
  { id: 'brevo', name: 'Brevo', key: 'SMTP & API → API keys', tags: false },
  { id: 'mailchimp', name: 'Mailchimp', key: 'Profile → Extras → API keys', tags: true },
  { id: 'mailerlite', name: 'MailerLite', key: 'Integrations → API', tags: false },
  { id: 'kit', name: 'Kit (ConvertKit)', key: 'Settings → Developer → API keys (v4)', tags: true },
  { id: 'activecampaign', name: 'ActiveCampaign', key: 'Settings → Developer', tags: true },
];

const QUERY = ['newletter', 'settings'];
const input = 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-sm font-medium text-slate-800">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

const split = (value: string) =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

// ---- Connection ------------------------------------------------------------------------

function Connection({ api, data }: { api: Api; data: SettingsAnswer }) {
  const { t } = useT();
  const client = useQueryClient();
  const [provider, setProvider] = useState<ProviderId>(data.settings.provider ?? 'brevo');
  const [key, setKey] = useState('');
  const [apiUrl, setApiUrl] = useState(data.settings.apiUrl);
  const [tested, setTested] = useState<{ ok: boolean; text: string } | null>(null);
  const info = PROVIDERS.find((p) => p.id === provider)!;
  const changed = provider !== data.settings.provider;

  const test = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; account: string }>('POST', '/verify', {
        provider,
        ...(key ? { key } : {}),
        ...(apiUrl ? { apiUrl } : {}),
      }),
    onSuccess: (r) =>
      setTested({ ok: true, text: t('Connected to {account}.', { account: r.account }) }),
    onError: (e) => setTested({ ok: false, text: errorMessage(e) }),
  });
  const save = useMutation({
    mutationFn: () =>
      api<SettingsAnswer>('PUT', '/connection', {
        provider,
        ...(key ? { key } : {}),
        ...(apiUrl ? { apiUrl } : {}),
      }),
    onSuccess: (r) => {
      setKey('');
      setTested(null);
      client.setQueryData(QUERY, r);
      void client.invalidateQueries({ queryKey: ['newletter', 'lists'] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api<SettingsAnswer>('DELETE', '/connection'),
    onSuccess: (r) => client.setQueryData(QUERY, r),
  });

  return (
    <Card title={t('Connection')}>
      <div className="space-y-4">
        {data.settings.account && data.hasKey && !changed ? (
          <Alert kind="success">
            {t('Connected to {service}: {account}.', {
              service: info.name,
              account: data.settings.account,
            })}
          </Alert>
        ) : null}
        <Field label={t('Service')}>
          <select
            className={input}
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value as ProviderId);
              setTested(null);
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        {provider === 'activecampaign' ? (
          <TextField
            label={t('API address of your account')}
            placeholder="https://acme.api-us1.com"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
          />
        ) : null}
        <TextField
          label={t('API key')}
          type="password"
          autoComplete="off"
          value={key}
          placeholder={
            data.hasKey && !changed ? t('Saved: type a new one to replace it') : undefined
          }
          hint={t('Find it in {service}: {where}. It is stored encrypted and never shown again.', {
            service: info.name,
            where: info.key,
          })}
          onChange={(e) => setKey(e.target.value)}
        />
        {tested ? <Alert kind={tested.ok ? 'success' : 'error'}>{tested.text}</Alert> : null}
        {save.error ? <Alert>{errorMessage(save.error)}</Alert> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={test.isPending || (!key && (!data.hasKey || changed))}
            onClick={() => test.mutate()}
          >
            {test.isPending ? t('Testing…') : t('Test connection')}
          </Button>
          <Button
            disabled={save.isPending || (!key && (!data.hasKey || changed))}
            onClick={() => save.mutate()}
          >
            {save.isPending ? t('Saving…') : t('Save connection')}
          </Button>
          {data.hasKey ? (
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(t('Disconnect the service? The forms stop showing.')))
                  remove.mutate();
              }}
            >
              {t('Disconnect')}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

// ---- Lists and fields ------------------------------------------------------------------

function ListPicker({
  lists,
  value,
  onChange,
  label,
}: {
  lists: ProviderList[];
  value: string[];
  onChange: (ids: string[]) => void;
  label: string;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium text-slate-800">{label}</legend>
      {lists.map((l) => (
        <Check
          key={l.id}
          checked={value.includes(l.id)}
          onChange={(on) => onChange(on ? [...value, l.id] : value.filter((id) => id !== l.id))}
        >
          {l.name}{' '}
          <span className="text-xs text-slate-500">
            ({l.id}
            {l.count !== undefined ? ` · ${l.count}` : ''})
          </span>
        </Check>
      ))}
    </fieldset>
  );
}

function useLists(api: Api, enabled: boolean) {
  return useQuery({
    queryKey: ['newletter', 'lists'],
    queryFn: () => api<ProviderList[]>('GET', '/lists'),
    enabled,
    retry: false,
  });
}

function useFields(api: Api, enabled: boolean, list: string) {
  return useQuery({
    queryKey: ['newletter', 'fields', list],
    queryFn: () => api<ProviderField[]>('GET', `/fields?list=${encodeURIComponent(list)}`),
    enabled,
    retry: false,
  });
}

// ---- The settings form ------------------------------------------------------------------

function SettingsForm({
  api,
  data,
  locales,
}: {
  api: Api;
  data: SettingsAnswer;
  locales: string[];
}) {
  const { t } = useT();
  const client = useQueryClient();
  const [s, setS] = useState<Settings>(data.settings);
  const [saved, setSaved] = useState(false);
  useEffect(() => setS(data.settings), [data.settings]);
  const set = (patch: Partial<Settings>) => {
    setS((v) => ({ ...v, ...patch }));
    setSaved(false);
  };
  const connected = data.hasKey && Boolean(data.settings.provider);
  const lists = useLists(api, connected);
  const fields = useFields(api, connected, s.lists[0] ?? '');
  const provider = PROVIDERS.find((p) => p.id === s.provider);
  const save = useMutation({
    mutationFn: () => {
      const names = Object.fromEntries((lists.data ?? []).map((l) => [l.id, l.name]));
      return api<SettingsAnswer>('PUT', '/settings', { ...s, listNames: names });
    },
    onSuccess: (r) => {
      client.setQueryData(QUERY, r);
      setSaved(true);
    },
  });
  const textOf = (locale: string, key: EditableText) => s.texts[locale]?.[key] ?? '';
  const setText = (locale: string, key: EditableText, value: string) =>
    set({ texts: { ...s.texts, [locale]: { ...s.texts[locale], [key]: value } } });
  const textLabels: Record<EditableText, string> = {
    button: t('Button'),
    success: t('After subscribing'),
    pending: t('After subscribing, with double opt-in'),
    already: t('Already subscribed'),
    error: t('Error'),
    consent: t('Consent ({privacy} is the link to the privacy policy)'),
    optIn: t('“Subscribe me” box in other forms'),
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {connected ? (
        <Card title={t('Lists')}>
          <div className="space-y-4">
            {lists.error ? <Alert>{errorMessage(lists.error)}</Alert> : null}
            {lists.isLoading ? <p className="text-sm">{t('Loading…')}</p> : null}
            {lists.data && lists.data.length === 0 ? (
              <p className="text-sm">
                {t('The account has no lists yet: make one in the service.')}
              </p>
            ) : null}
            {lists.data && lists.data.length > 0 ? (
              <ListPicker
                lists={lists.data}
                value={s.lists}
                onChange={(ids) => set({ lists: ids })}
                label={t('Subscribe people to')}
              />
            ) : null}
            {fields.data && fields.data.length > 0 ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('Field of the name')} hint={t('Empty: the service’s usual one.')}>
                    <select
                      className={input}
                      value={s.firstNameKey}
                      onChange={(e) => set({ firstNameKey: e.target.value })}
                    >
                      <option value="">—</option>
                      {fields.data.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label} ({f.key})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label={t('Field of the surname')}
                    hint={t('Empty: the service’s usual one.')}
                  >
                    <select
                      className={input}
                      value={s.lastNameKey}
                      onChange={(e) => set({ lastNameKey: e.target.value })}
                    >
                      <option value="">—</option>
                      {fields.data.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label} ({f.key})
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-slate-800">
                    {t('Extra fields of forms with “All fields”')}
                  </legend>
                  {fields.data
                    .filter((f) => f.type !== 'other')
                    .map((f) => {
                      const on = s.customFields.find((c) => c.key === f.key);
                      return (
                        <div key={f.key} className="flex flex-wrap items-center gap-3">
                          <Check
                            checked={Boolean(on)}
                            onChange={(checked) =>
                              set({
                                customFields: checked
                                  ? [
                                      ...s.customFields,
                                      { key: f.key, label: { en: f.label }, required: false },
                                    ]
                                  : s.customFields.filter((c) => c.key !== f.key),
                              })
                            }
                          >
                            {f.label} <span className="text-xs text-slate-500">({f.key})</span>
                          </Check>
                          {on
                            ? locales.map((locale) => (
                                <input
                                  key={locale}
                                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                                  aria-label={t('Label in {language}', { language: locale })}
                                  placeholder={locale}
                                  value={on.label[locale] ?? ''}
                                  onChange={(e) =>
                                    set({
                                      customFields: s.customFields.map((c) =>
                                        c.key === f.key
                                          ? {
                                              ...c,
                                              label: { ...c.label, [locale]: e.target.value },
                                            }
                                          : c,
                                      ),
                                    })
                                  }
                                />
                              ))
                            : null}
                          {on ? (
                            <Check
                              checked={on.required}
                              onChange={(required) =>
                                set({
                                  customFields: s.customFields.map((c) =>
                                    c.key === f.key ? { ...c, required } : c,
                                  ),
                                })
                              }
                            >
                              {t('Required')}
                            </Check>
                          ) : null}
                        </div>
                      );
                    })}
                </fieldset>
              </>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card title={t('Form defaults')}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Fields')}>
              <select
                className={input}
                value={s.fields}
                onChange={(e) => set({ fields: e.target.value as Settings['fields'] })}
              >
                <option value="email">{t('Email only')}</option>
                <option value="name">{t('Name and email')}</option>
                <option value="name-surname">{t('Name, surname and email')}</option>
                <option value="all">{t('All fields (with the extra ones)')}</option>
              </select>
            </Field>
            <Field label={t('Layout')}>
              <select
                className={input}
                value={s.layout}
                onChange={(e) => set({ layout: e.target.value as Settings['layout'] })}
              >
                <option value="stacked">{t('Stacked')}</option>
                <option value="inline">{t('On one line')}</option>
              </select>
            </Field>
          </div>
          <Check checked={s.doubleOptIn} onChange={(doubleOptIn) => set({ doubleOptIn })}>
            {t('Double opt-in: people confirm by email before they are subscribed (recommended)')}
          </Check>
          {s.provider === 'brevo' && s.doubleOptIn ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label={t('Brevo DOI template id')}
                inputMode="numeric"
                value={s.brevoTemplateId ? String(s.brevoTemplateId) : ''}
                hint={t('A template of the “Double opt-in” kind, in Brevo → Templates.')}
                onChange={(e) =>
                  set({ brevoTemplateId: Number(e.target.value.replace(/\D/g, '')) || null })
                }
              />
              <TextField
                label={t('Page after the confirmation')}
                placeholder="https://"
                value={s.brevoRedirectUrl}
                hint={t('The full https address of a thank-you page of the site.')}
                onChange={(e) => set({ brevoRedirectUrl: e.target.value })}
              />
            </div>
          ) : null}
          {s.provider === 'kit' && s.doubleOptIn ? (
            <p className="text-xs text-slate-600">
              {t('With Kit, double opt-in is a setting of each form in Kit (Incentive email).')}
            </p>
          ) : null}
          {s.provider === 'activecampaign' && s.doubleOptIn ? (
            <p className="text-xs text-slate-600">
              {t(
                'ActiveCampaign cannot send its confirmation email through its API: people are subscribed at once.',
              )}
            </p>
          ) : null}
          {provider?.tags ? (
            <TextField
              label={t('Tags')}
              value={s.tags.join(', ')}
              hint={t('Separated by commas, added to every subscriber of the forms.')}
              onChange={(e) => set({ tags: split(e.target.value) })}
            />
          ) : null}
          <TextField
            label={t('Privacy policy address')}
            placeholder="/privacy-policy"
            value={s.privacyUrl}
            hint={t('Linked in the consent of the form.')}
            onChange={(e) => set({ privacyUrl: e.target.value })}
          />
        </div>
      </Card>

      <Card title={t('Texts')}>
        <div className="space-y-6">
          <p className="text-sm text-slate-600">
            {t('Leave a text empty to use the default one, shown in grey.')}
          </p>
          {locales.map((locale) => (
            <fieldset key={locale} className="space-y-3">
              <legend className="text-sm font-semibold uppercase text-slate-700">{locale}</legend>
              {EDITABLE.map((key) => (
                <TextField
                  key={key}
                  label={textLabels[key]}
                  value={textOf(locale, key)}
                  placeholder={stringsFor(locale)[key]}
                  onChange={(e) => setText(locale, key, e.target.value)}
                />
              ))}
            </fieldset>
          ))}
        </div>
      </Card>

      <Card title={t('“Subscribe me” in other forms')}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {t(
              'An unticked box, so people subscribe only if they want to. It shows where the plugin is active.',
            )}
          </p>
          <Check
            checked={s.integrations.forms}
            onChange={(forms) => set({ integrations: { ...s.integrations, forms } })}
          >
            {t('Contact forms (Forms)')}
          </Check>
          <Check
            checked={s.integrations.shop}
            onChange={(shop) => set({ integrations: { ...s.integrations, shop } })}
          >
            {t('Checkout (Cleishop)')}
          </Check>
          <Check
            checked={s.integrations.agenda}
            onChange={(agenda) => set({ integrations: { ...s.integrations, agenda } })}
          >
            {t('Bookings (Agenda)')}
          </Check>
          {lists.data && lists.data.length > 0 ? (
            <ListPicker
              lists={lists.data}
              value={s.integrationLists}
              onChange={(ids) => set({ integrationLists: ids })}
              label={t('Lists for these subscribers (none: the lists above)')}
            />
          ) : null}
          {provider?.tags ? (
            <TextField
              label={t('Tags for these subscribers')}
              value={s.integrationTags.join(', ')}
              onChange={(e) => set({ integrationTags: split(e.target.value) })}
            />
          ) : null}
        </div>
      </Card>

      <Card title={t('Log')}>
        <TextField
          label={t('Days the log keeps a subscription')}
          type="number"
          min={0}
          max={3650}
          value={String(s.retentionDays)}
          hint={t(
            '0 keeps them. The log has no email address in clear, only a hint and a fingerprint.',
          )}
          onChange={(e) => set({ retentionDays: Math.max(0, Number(e.target.value) || 0) })}
        />
      </Card>

      {save.error ? <Alert>{errorMessage(save.error)}</Alert> : null}
      {saved ? <Alert kind="success">{t('Settings saved.')}</Alert> : null}
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? t('Saving…') : t('Save settings')}
      </Button>
    </form>
  );
}

// ---- Log -------------------------------------------------------------------------------

function LogTable({ api, locale }: { api: Api; locale: string }) {
  const { t } = useT();
  const client = useQueryClient();
  const list = useQuery({
    queryKey: ['newletter', 'log'],
    queryFn: () => api<LogEntry[]>('GET', '/log?limit=200'),
  });
  const clear = useMutation({
    mutationFn: () => api('DELETE', '/log'),
    onSuccess: () => client.invalidateQueries({ queryKey: ['newletter', 'log'] }),
  });
  const status: Record<string, string> = {
    queued: t('Sending'),
    subscribed: t('Subscribed'),
    pending: t('Waiting for confirmation'),
    already: t('Already subscribed'),
    error: t('Error'),
    spam: t('Held as spam'),
  };
  const source: Record<string, string> = {
    form: t('Signup form'),
    forms: t('Contact form'),
    shop: t('Checkout'),
    agenda: t('Booking'),
  };
  return (
    <Card title={t('Latest subscriptions')}>
      <div className="space-y-3">
        {list.error ? <Alert>{errorMessage(list.error)}</Alert> : null}
        {list.data && list.data.length === 0 ? (
          <p className="text-sm text-slate-600">{t('No subscriptions yet.')}</p>
        ) : null}
        {list.data && list.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-3">{t('Date')}</th>
                  <th className="py-2 pr-3">{t('Email')}</th>
                  <th className="py-2 pr-3">{t('From')}</th>
                  <th className="py-2 pr-3">{t('Lists')}</th>
                  <th className="py-2 pr-3">{t('Status')}</th>
                  <th className="py-2">{t('Details')}</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString(locale)}
                    </td>
                    <td className="py-2 pr-3">{e.emailHint}</td>
                    <td className="py-2 pr-3">{source[e.source] ?? e.source}</td>
                    <td className="py-2 pr-3">{e.listIds.join(', ')}</td>
                    <td
                      className={`py-2 pr-3 ${e.status === 'error' ? 'text-red-700' : ''}`}
                      data-status={e.status}
                    >
                      {status[e.status] ?? e.status}
                    </td>
                    <td className="py-2 text-xs text-slate-600">
                      {[e.error, e.notes].filter(Boolean).join(' ')}
                      {e.consent ? (
                        <details>
                          <summary>{t('Consent')}</summary>
                          <p>{new Date(e.consent.at).toLocaleString(locale)}</p>
                          <p>“{e.consent.text}”</p>
                          {e.consent.ipHash ? (
                            <p>
                              {t('IP fingerprint')}: {e.consent.ipHash.slice(0, 12)}…
                            </p>
                          ) : null}
                        </details>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void list.refetch()}>
            {t('Refresh')}
          </Button>
          {list.data && list.data.length > 0 ? (
            <Button
              variant="danger"
              disabled={clear.isPending}
              onClick={() => {
                if (window.confirm(t('Delete the whole log, with the consent records?')))
                  clear.mutate();
              }}
            >
              {t('Clear the log')}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

// ---- The page --------------------------------------------------------------------------

type Tab = 'settings' | 'log';

function NewLetterPage({ api, site, user }: AdminPageProps) {
  const { t, language } = useT();
  const [tab, setTab] = useState<Tab>(() =>
    new URLSearchParams(window.location.search).get('tab') === 'log' ? 'log' : 'settings',
  );
  const settings = useQuery({
    queryKey: QUERY,
    queryFn: () => api<SettingsAnswer>('GET', '/settings'),
  });
  const locales = site.locales.length
    ? site.locales.map((l) => (typeof l === 'string' ? l : l.code))
    : [site.defaultLocale];
  return (
    <div className="max-w-4xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{NAME.en}</h1>
        <p className="text-slate-600 italic">{language === 'it' ? TAGLINE.it : TAGLINE.en}</p>
      </header>
      <div role="tablist" aria-label={NAME.en} className="flex gap-2 border-b border-slate-200">
        {(['settings', 'log'] as Tab[]).map((id) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === id ? 'border-sky-700 font-semibold text-sky-800' : 'border-transparent text-slate-600'}`}
            onClick={() => setTab(id)}
          >
            {id === 'settings' ? t('Settings') : t('Subscriptions')}
          </button>
        ))}
      </div>
      {settings.error ? <Alert>{errorMessage(settings.error)}</Alert> : null}
      {settings.data && tab === 'settings' ? (
        <>
          {!settings.data.ready ? (
            <Alert kind="error">
              {t('Connect a service and choose a list: until then the forms do not show.')}
            </Alert>
          ) : null}
          <Connection api={api} data={settings.data} />
          <SettingsForm api={api} data={settings.data} locales={locales} />
        </>
      ) : null}
      {tab === 'log' ? <LogTable api={api} locale={user.locale} /> : null}
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: NAME.en, it: NAME.it },
      capability: CAPABILITY,
      component: NewLetterPage,
      icon: MAIL_ICON,
    },
  ],
});
