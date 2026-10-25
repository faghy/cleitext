import { FieldsForm } from '@cleitext/admin-sdk';
import {
  formatPhpDate,
  labelText,
  type CoreSettings,
  type EntryListResponse,
  type FieldValues,
} from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { api, ApiError, errorMessage } from '../api';
import { ME_QUERY_KEY, useMe } from '../auth';
import { Alert, Button, Card, TextField, useT } from '../components/ui';
import { MailCard } from './mail-settings';
import { DiscussionCard, MembershipCard } from './settings-community';
import { contentTypesQuery, siteEditors, usePluginAdmin, type LoadedAdminPlugin } from '../plugins';

const selectClass = 'w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm';
const ASSISTANTS_PATH: string = '/assistants';

/** The arrow's own colour on the public pages, shown when none is chosen. */
const DEFAULT_ARROW_COLOR = '#111827';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

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
      <MaintenanceCard />
      {settings.data && <SettingsForm initial={settings.data} />}
      <MailCard />
      <PluginSettings />
    </div>
  );
}

export const MAINTENANCE_QUERY_KEY = ['settings', 'maintenance'];

/**
 * Maintenance mode (RF-SIT-06), as `cleitext site:maintenance`: visitors get
 * a 503 page (the theme's, or a plugin's such as Maintenance), signed-in
 * users see the site.
 */
function MaintenanceCard() {
  const { t } = useT();
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: MAINTENANCE_QUERY_KEY,
    queryFn: () => api<{ enabled: boolean }>('GET', '/settings/maintenance'),
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api<{ enabled: boolean }>('PUT', '/settings/maintenance', { enabled }),
    onSuccess: (next) => queryClient.setQueryData(MAINTENANCE_QUERY_KEY, next),
  });
  const enabled = status.data?.enabled ?? false;
  return (
    <Card id="maintenance" title={t('Maintenance mode')}>
      <div className="space-y-3 text-sm">
        {status.error && <Alert>{errorMessage(status.error)}</Alert>}
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            role="switch"
            className="h-4 w-4"
            checked={enabled}
            disabled={!status.data || toggle.isPending}
            onChange={(e) => toggle.mutate(e.target.checked)}
          />
          <span className="font-medium text-slate-800">
            {enabled ? t('Maintenance mode is on') : t('Maintenance mode is off')}
          </span>
        </label>
        <p className="text-slate-600">
          {t(
            'Visitors see a maintenance page; signed-in users see the site. Search engines are told to come back later (status 503).',
          )}
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <a
            className="text-sky-700 underline"
            href="/api/v1/settings/maintenance/preview"
            target="_blank"
            rel="noopener"
          >
            {t('Preview the maintenance page')}
            <span className="sr-only"> {t('(opens in a new tab)')}</span>
          </a>
        </p>
        {toggle.error && <Alert>{errorMessage(toggle.error)}</Alert>}
      </div>
    </Card>
  );
}

/**
 * Settings → Writing: the editor new entries of each content type open with,
 * among the block editor and those of the active plugins (page builders, the
 * Classic Editor…). AI assistants use it too. Shown when there is a choice.
 */
function WritingCard({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const me = useMe();
  const { t } = useT();
  const plugins = usePluginAdmin();
  const types = useQuery(contentTypesQuery);
  const editable = (types.data ?? []).filter((type) => type.supports.includes('blocks'));
  const rows = editable
    .map((type) => ({ type, editors: siteEditors(plugins, me.capabilities, type.slug) }))
    .filter((row) => row.editors.length > 1);
  if (rows.length === 0) return null;
  return (
    <Card id="writing" title={t('Writing')}>
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">
          {t(
            'The editor new entries open with. Entries keep the editor they were made with; each can still switch from its editor.',
          )}
        </p>
        {rows.map(({ type, editors }) => (
          <label key={type.slug} className="block space-y-1">
            <span className="block font-medium text-slate-800">
              {labelText(type.name, me.user.locale)}
            </span>
            <select
              className={selectClass}
              value={value[type.slug] ?? 'blocks'}
              onChange={(e) => {
                const next = { ...value };
                if (e.target.value === 'blocks') delete next[type.slug];
                else next[type.slug] = e.target.value;
                onChange(next);
              }}
            >
              {editors.map((editor) => (
                <option key={editor.id} value={editor.id}>
                  {labelText(editor.title, me.user.locale)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </Card>
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
        <Card id="general" title={t('General')}>
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
                value={values.dateFormat ? 'custom' : values.dateStyle}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    set('dateFormat', values.dateFormat || 'F j, Y');
                    return;
                  }
                  set('dateFormat', '');
                  set('dateStyle', e.target.value as CoreSettings['dateStyle']);
                }}
              >
                {(['long', 'medium', 'short'] as const).map((style) => (
                  <option key={style} value={style}>
                    {new Date().toLocaleDateString(me.site.defaultLocale, { dateStyle: style })}
                  </option>
                ))}
                <option value="custom">{t('Custom format')}</option>
              </select>
            </label>
            {values.dateFormat && (
              <TextField
                label={t('Custom format')}
                value={values.dateFormat}
                maxLength={64}
                onChange={(e) => set('dateFormat', e.target.value)}
                hint={`${t('Letters as in WordPress and PHP, e.g. F j, Y or d/m/Y.')} ${formatPhpDate(
                  new Date(),
                  values.dateFormat,
                  me.site.defaultLocale,
                  values.timezone,
                )}`}
              />
            )}
          </div>
        </Card>

        <Card id="reading" title={t('Reading')}>
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
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={values.backToTop}
                onChange={(e) => set('backToTop', e.target.checked)}
              />
              <span>
                <span className="block font-medium text-slate-800">{t('“Back to top” arrow')}</span>
                <span className="text-xs text-slate-500">
                  {t(
                    'Shows a round arrow in a corner of the public pages when visitors scroll down; it takes them back to the top with a smooth scroll.',
                  )}
                </span>
              </span>
            </label>
            {values.backToTop && (
              <div className="grid gap-4 pl-6 sm:grid-cols-2">
                <ColorField
                  label={t('Arrow colour')}
                  value={values.backToTopColor}
                  fallback={DEFAULT_ARROW_COLOR}
                  onChange={(color) => set('backToTopColor', color)}
                  resetLabel={t('Default')}
                />
                <label className="block space-y-1 text-sm">
                  <span className="block font-medium text-slate-800">{t('Position')}</span>
                  <select
                    className={selectClass}
                    value={values.backToTopPosition}
                    onChange={(e) =>
                      set('backToTopPosition', e.target.value as CoreSettings['backToTopPosition'])
                    }
                  >
                    <option value="right">{t('Bottom right')}</option>
                    <option value="left">{t('Bottom left')}</option>
                  </select>
                </label>
              </div>
            )}
          </div>
        </Card>
        <WritingCard
          value={values.defaultEditors}
          onChange={(next) => set('defaultEditors', next)}
        />
        <div className="flex flex-wrap items-center justify-center gap-3 lg:col-span-2">
          <Button type="submit" disabled={save.isPending}>
            {t('Save changes')}
          </Button>
          {save.isSuccess && (
            <span role="status" className="text-sm text-green-700">
              {t('Settings saved.')}
            </span>
          )}
        </div>
        <MembershipCard
          values={values}
          set={set}
          pages={(pages.data?.items ?? []).map((p) => ({ id: p.id, title: p.title }))}
        />
        <DiscussionCard values={values} set={set} />
        <Card id="assistants" title={t('AI assistants (MCP)')}>
          <div className="space-y-3 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={values.mcp}
                onChange={(e) => set('mcp', e.target.checked)}
              />
              <span>
                <span className="block font-medium text-slate-800">
                  {t('Let AI assistants work on this site')}
                </span>
                <span className="text-xs text-slate-500">
                  {t(
                    'People connect their AI assistant (ChatGPT, Cursor or another MCP client) with their own account and ask it to write pages and posts. The assistant uses the blocks of the editor and the sections of the theme, acts with the permissions of the person, and creates drafts unless allowed to publish. Save, then open the Chriss page to connect one.',
                  )}
                </span>
              </span>
            </label>
            <Link
              to={ASSISTANTS_PATH}
              className="inline-block rounded border border-slate-300 bg-white px-3 py-2 font-medium text-slate-800 hover:bg-slate-50"
            >
              {t('Open Chriss')}
            </Link>
          </div>
        </Card>
        <Card id="privacy" title={t('Privacy')}>
          <label className="block space-y-1 text-sm">
            <span className="block font-medium text-slate-800">
              {t('Web fonts from Google Fonts and Bunny Fonts')}
            </span>
            <select
              className={selectClass}
              value={values.webFonts}
              onChange={(e) => set('webFonts', e.target.value as CoreSettings['webFonts'])}
            >
              <option value="local">{t('Host them on this site (recommended)')}</option>
              <option value="provider">{t('Load them from Google or Bunny Fonts')}</option>
              <option value="theme">{t('Leave the pages as the theme wrote them')}</option>
            </select>
            <span className="block text-xs text-slate-500">
              {values.webFonts === 'local'
                ? t(
                    'The fonts the theme and the plugins link are downloaded once by the site and served from here: visitors’ browsers never contact the font services, so no IP address is sent to them before consent.',
                  )
                : t(
                    'Visitors’ browsers load the fonts from the service, which receives their IP address as soon as a page opens: in the EU this needs their consent (LG München, 2022).',
                  )}
            </span>
          </label>
        </Card>
        <Card id="install-report" title={t('Installation report')}>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={values.installReport}
              onChange={(e) => set('installReport', e.target.checked)}
            />
            <span>
              <span className="block font-medium text-slate-800">
                {t('Tell cleitext.com which versions this site runs')}
              </span>
              <span className="text-xs text-slate-500">
                {t(
                  "About once a day, as WordPress does with wordpress.org: the site's address, the version of Cleitext, the themes and plugins installed with their versions and whether they are active, and a random identifier of the server. Nothing about content, users or visitors. It helps the maintainers know which versions are in use and warn the sites hit by a broken update; sites not seen for 180 days are deleted from the registry.",
                )}
              </span>
            </span>
          </label>
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

/** A colour: the browser's picker plus a hexadecimal field (`#rrggbb`); null is the default. */
function ColorField({
  label,
  value,
  fallback,
  onChange,
  resetLabel,
}: {
  label: string;
  value: string | null;
  fallback: string;
  onChange: (color: string | null) => void;
  resetLabel: string;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [shown, setShown] = useState(value);
  // Follows changes from outside (picker, reset, saved values).
  if (value !== shown) {
    setShown(value);
    setDraft(value ?? '');
  }
  const invalid = draft !== '' && !HEX_COLOR.test(draft);
  return (
    <div className="space-y-1 text-sm">
      <span className="block font-medium text-slate-800">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          className="h-9 w-11 shrink-0 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
          value={value ?? fallback}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
        />
        <input
          type="text"
          aria-label={`${label} (hex)`}
          className={`w-28 rounded border px-2 py-2 font-mono text-sm ${invalid ? 'border-red-500' : 'border-slate-300'}`}
          placeholder={fallback}
          maxLength={7}
          spellCheck={false}
          value={draft}
          onChange={(e) => {
            let next = e.target.value.trim();
            if (next && !next.startsWith('#')) next = `#${next}`;
            setDraft(next);
            if (next === '') onChange(null);
            else if (HEX_COLOR.test(next)) onChange(next.toLowerCase());
          }}
        />
        {value && (
          <button
            type="button"
            className="text-xs text-slate-600 underline hover:text-slate-900"
            onClick={() => onChange(null)}
          >
            {resetLabel}
          </button>
        )}
      </div>
    </div>
  );
}
