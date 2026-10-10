import { FieldsForm } from '@cleitext/admin-sdk';
import {
  labelText,
  type CoreSettings,
  type EntryListResponse,
  type FieldValues,
} from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { api, ApiError, errorMessage } from '../api';
import { ME_QUERY_KEY, useMe } from '../auth';
import { Alert, Button, Card, TextField, useT } from '../components/ui';
import { MailCard } from './mail-settings';
import { SecurityCard } from './security-settings';
import { usePluginAdmin, type LoadedAdminPlugin } from '../plugins';

const selectClass = 'w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm';
const TIME_ZONES = ['UTC', ...Intl.supportedValuesOf('timeZone').filter((z) => z !== 'UTC')];

/** Settings → General and Reading (RF-SET-01). */
export function SettingsPage() {
  const { t } = useT();
  const settings = useQuery({
    queryKey: ['settings', 'core'],
    queryFn: () => api<CoreSettings>('GET', '/settings/core'),
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('Settings')}</h1>
      {settings.error && <Alert>{errorMessage(settings.error)}</Alert>}
      {settings.data && <SettingsForm initial={settings.data} />}
      <MailCard />
      <SecurityCard />
      <PluginSettings />
    </div>
  );
}

/** Settings declared by active plugins (`ctx.settings.define`). */
function PluginSettings() {
  const plugins = usePluginAdmin().filter((p) => p.settings);
  return plugins.map((plugin) => <PluginSettingsCard key={plugin.slug} plugin={plugin} />);
}

function PluginSettingsCard({ plugin }: { plugin: LoadedAdminPlugin }) {
  const me = useMe();
  const { t } = useT();
  const queryClient = useQueryClient();
  const queryKey = ['settings', 'plugin', plugin.slug];
  const current = useQuery({
    queryKey,
    queryFn: () => api<FieldValues>('GET', `/plugins/${plugin.slug}/settings`),
  });
  const [values, setValues] = useState<FieldValues | null>(null);
  const save = useMutation({
    mutationFn: () => api<FieldValues>('PATCH', `/plugins/${plugin.slug}/settings`, values ?? {}),
    onSuccess: (saved) => {
      setValues(null);
      queryClient.setQueryData(queryKey, saved);
    },
  });
  const errors =
    save.error instanceof ApiError
      ? Object.fromEntries((save.error.problem.errors ?? []).map((e) => [e.path, e.message]))
      : {};
  const shown = values ?? current.data;
  return (
    <section
      id={`plugin-${plugin.slug}`}
      aria-label={labelText(plugin.settings!.title, me.user.locale)}
    >
      <Card title={labelText(plugin.settings!.title, me.user.locale)}>
        {current.error && <Alert>{errorMessage(current.error)}</Alert>}
        {shown && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <FieldsForm
              fields={plugin.settings!.fields}
              values={shown}
              locale={me.user.locale}
              errors={errors}
              onChange={setValues}
            />
            {save.isSuccess && !values && <Alert kind="success">{t('Settings saved.')}</Alert>}
            {save.error && Object.keys(errors).length === 0 && (
              <Alert>{errorMessage(save.error)}</Alert>
            )}
            <Button type="submit" disabled={save.isPending || !values}>
              {t('Save {plugin} settings', { plugin: plugin.name })}
            </Button>
          </form>
        )}
      </Card>
    </section>
  );
}

function SettingsForm({ initial }: { initial: CoreSettings }) {
  const me = useMe();
  const { t } = useT();
  const queryClient = useQueryClient();
  const [values, setValues] = useState(initial);
  const set = <K extends keyof CoreSettings>(key: K, value: CoreSettings[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  // Pages are chosen in the default language; with the language plugin,
  // their translations take their place in the other languages.
  const pages = useQuery({
    queryKey: ['settings-pages', me.site.defaultLocale],
    queryFn: () =>
      api<EntryListResponse>(
        'GET',
        `/entries?type=page&status=published&locale=${encodeURIComponent(me.site.defaultLocale)}&limit=100`,
      ),
  });

  const save = useMutation({
    mutationFn: () => api<CoreSettings>('PATCH', '/settings/core', values),
    onSuccess: async (saved) => {
      setValues(saved);
      queryClient.setQueryData(['settings', 'core'], saved);
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
  const fieldError = (field: string) =>
    save.error instanceof ApiError ? save.error.fieldError(field) : undefined;

  const pageSelect = (
    key: 'frontPage' | 'postsPage' | 'errorPage',
    label: string,
    empty: string,
    hint?: ReactNode,
  ) => (
    <label className="block space-y-1 text-sm">
      <span className="block font-medium text-slate-800">{label}</span>
      <select
        className={selectClass}
        value={values[key] ?? ''}
        onChange={(e) => set(key, e.target.value || null)}
      >
        <option value="">{empty}</option>
        {pages.data?.items.map((page) => (
          <option key={page.id} value={page.id}>
            {page.title}
          </option>
        ))}
      </select>
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );

  const titleError = fieldError('title');
  const perPageError = fieldError('postsPerPage');

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('General')}>
          <div className="space-y-4">
            <TextField
              label={t('Site title')}
              value={values.title}
              placeholder={me.site.name}
              onChange={(e) => set('title', e.target.value)}
              hint={t(
                'Shown in the header and in the browser tab. The site name is used when empty.',
              )}
              {...(titleError ? { error: titleError } : {})}
            />
            <TextField
              label={t('Tagline')}
              value={values.tagline}
              onChange={(e) => set('tagline', e.target.value)}
              hint={t('In a few words, what the site is about.')}
            />
            <label className="block space-y-1 text-sm">
              <span className="block font-medium text-slate-800">{t('Time zone')}</span>
              <select
                className={selectClass}
                value={values.timezone}
                onChange={(e) => set('timezone', e.target.value)}
              >
                {TIME_ZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
              <span className="block text-xs text-slate-500">
                {t('Dates on the site and scheduled publishing use this time zone.')}
              </span>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="block font-medium text-slate-800">{t('Date format')}</span>
              <select
                className={selectClass}
                value={values.dateStyle}
                onChange={(e) => set('dateStyle', e.target.value as CoreSettings['dateStyle'])}
              >
                {(['long', 'medium', 'short'] as const).map((style) => (
                  <option key={style} value={style}>
                    {new Date().toLocaleDateString(me.site.defaultLocale, { dateStyle: style })}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Card>

        <Card title={t('Reading')}>
          <div className="space-y-4">
            {pageSelect('frontPage', t('Home page'), t('Latest posts'))}
            {values.frontPage &&
              pageSelect(
                'postsPage',
                t('Posts page'),
                t('None'),
                t('Lists the latest posts when the home page is a static page.'),
              )}
            <TextField
              label={t('Posts per page')}
              type="number"
              min={1}
              max={100}
              value={values.postsPerPage}
              onChange={(e) => set('postsPerPage', Number(e.target.value))}
              {...(perPageError ? { error: perPageError } : {})}
            />
            <TextField
              label={t('Empty the trash after (days)')}
              type="number"
              min={0}
              max={3650}
              value={values.trashDays}
              onChange={(e) => set('trashDays', Number(e.target.value))}
              hint={t('Trashed entries are deleted after this many days. 0 keeps them.')}
              {...(fieldError('trashDays') ? { error: fieldError('trashDays')! } : {})}
            />
            {pageSelect(
              'errorPage',
              t('“Not found” page'),
              t('Theme default'),
              t('Shown with a 404 status for missing addresses.'),
            )}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={values.discourageSearchEngines}
                onChange={(e) => set('discourageSearchEngines', e.target.checked)}
              />
              <span>
                <span className="block font-medium text-slate-800">
                  {t('Discourage search engines')}
                </span>
                <span className="text-xs text-slate-500">
                  {t(
                    'Asks search engines not to index the site. It is up to them to honour the request.',
                  )}
                </span>
              </span>
            </label>
          </div>
        </Card>
      </div>

      {pages.error && <Alert>{errorMessage(pages.error)}</Alert>}
      {save.isSuccess && <Alert kind="success">{t('Settings saved.')}</Alert>}
      {save.error && !titleError && !perPageError && <Alert>{errorMessage(save.error)}</Alert>}
      <Button type="submit" disabled={save.isPending}>
        {t('Save changes')}
      </Button>
    </form>
  );
}
