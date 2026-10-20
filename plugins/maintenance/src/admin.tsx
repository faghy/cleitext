import {
  type AdminPageProps,
  adminUrl,
  Alert,
  api as coreApi,
  Button,
  Card,
  defineAdminPlugin,
  errorMessage,
  TextField,
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import {
  DEFAULT_COLORS,
  defaultTexts,
  type MaintenanceConfig,
  type Mode,
  type PageTexts,
} from './page';

const PREVIEW_PATH = '/settings/maintenance/preview';
const input = 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm';

/** `YYYY-MM-DDTHH:mm` in the browser's time, for a datetime-local input. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function MaintenancePage(props: AdminPageProps) {
  const it = props.user.locale.startsWith('it');
  const tr = (en: string, itText: string) => (it ? itText : en);
  const queryClient = useQueryClient();
  const saved = useQuery({
    queryKey: ['maintenance', 'config'],
    queryFn: () => props.api<MaintenanceConfig>('GET', '/config'),
  });
  const status = useQuery({
    queryKey: ['settings', 'maintenance'],
    queryFn: () => coreApi<{ enabled: boolean }>('GET', '/settings/maintenance'),
  });
  const [draft, setDraft] = useState<MaintenanceConfig | null>(null);
  const [locale, setLocale] = useState(props.site.defaultLocale);
  useEffect(() => {
    if (saved.data && !draft) setDraft(saved.data);
  }, [saved.data, draft]);
  const save = useMutation({
    mutationFn: (next: MaintenanceConfig) => props.api<MaintenanceConfig>('PUT', '/config', next),
    onSuccess: async (next) => {
      queryClient.setQueryData(['maintenance', 'config'], next);
      setDraft(next);
      await queryClient.invalidateQueries({ queryKey: ['maintenance', 'preview'] });
    },
  });
  const preview = useQuery({
    queryKey: ['maintenance', 'preview', locale],
    queryFn: () =>
      coreApi<string>('GET', `${PREVIEW_PATH}?locale=${encodeURIComponent(locale)}`, undefined, {
        text: true,
      }),
  });

  if (saved.isError) return <Alert>{errorMessage(saved.error)}</Alert>;
  if (!draft) return <p className="text-sm text-slate-500">…</p>;

  const set = (changes: Partial<MaintenanceConfig>) => setDraft({ ...draft, ...changes });
  const texts: PageTexts = draft.texts[locale] ?? { title: '', message: '' };
  const placeholder = defaultTexts(draft.mode, locale);
  const setTexts = (changes: Partial<PageTexts>) =>
    set({ texts: { ...draft.texts, [locale]: { ...texts, ...changes } } });
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.data);
  const languages =
    props.site.locales.length > 0 ? props.site.locales : [{ code: locale, name: locale }];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{tr('Maintenance page', 'Pagina di manutenzione')}</h1>

      <div
        className={`rounded border px-3 py-2 text-sm ${status.data?.enabled ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-700'}`}
        role="status"
      >
        {status.data?.enabled
          ? tr(
              'Maintenance mode is on: visitors see this page, signed-in users see the site.',
              'La modalità manutenzione è attiva: i visitatori vedono questa pagina, chi ha effettuato l’accesso vede il sito.',
            )
          : tr(
              'Maintenance mode is off: visitors see the site. This page is shown only while it is on.',
              'La modalità manutenzione è spenta: i visitatori vedono il sito. Questa pagina compare solo quando è attiva.',
            )}{' '}
        <a className="font-medium underline" href={adminUrl('/settings#maintenance')}>
          {tr(
            'Turn it on or off in Settings → General',
            'Attivala o spegnila in Impostazioni → Generali',
          )}
        </a>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={tr('Content', 'Contenuto')}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(draft);
            }}
          >
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium text-slate-800">
                {tr('Kind of page', 'Tipo di pagina')}
              </legend>
              {(
                [
                  ['maintenance', tr('Maintenance', 'Manutenzione')],
                  ['coming-soon', tr('Coming soon', 'Prossimamente')],
                ] as [Mode, string][]
              ).map(([value, label]) => (
                <label key={value} className="mr-4 inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="mode"
                    checked={draft.mode === value}
                    onChange={() => set({ mode: value })}
                  />
                  {label}
                </label>
              ))}
              <p className="text-xs text-slate-500">
                {tr(
                  'Both answer with status 503, so search engines come back later instead of dropping the pages.',
                  'In entrambi i casi la risposta è 503: i motori di ricerca ripassano più tardi senza togliere le pagine.',
                )}
              </p>
            </fieldset>

            {languages.length > 1 && (
              <div
                role="tablist"
                aria-label={tr('Language', 'Lingua')}
                className="flex flex-wrap gap-1"
              >
                {languages.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    role="tab"
                    aria-selected={l.code === locale}
                    onClick={() => setLocale(l.code)}
                    className={`rounded px-2 py-1 text-sm ${l.code === locale ? 'bg-sky-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            )}
            <TextField
              label={tr('Title', 'Titolo')}
              value={texts.title}
              maxLength={200}
              placeholder={placeholder.title}
              onChange={(e) => setTexts({ title: e.target.value })}
            />
            <TextArea
              label={tr('Message', 'Messaggio')}
              value={texts.message}
              placeholder={placeholder.message}
              hint={tr('Empty: the text shown in grey.', 'Vuoto: il testo in grigio.')}
              onChange={(message) => setTexts({ message })}
            />
            <TextField
              label={tr('Back on (optional)', 'Di nuovo online il (facoltativo)')}
              type="datetime-local"
              value={toLocalInput(draft.returnAt)}
              hint={tr(
                'Shown to visitors, and tells search engines when to come back.',
                'Mostrata ai visitatori, e indica ai motori di ricerca quando ripassare.',
              )}
              onChange={(e) =>
                set({ returnAt: e.target.value ? new Date(e.target.value).toISOString() : null })
              }
            />
            <TextField
              label={tr('Contact email (optional)', 'Email di contatto (facoltativa)')}
              type="email"
              value={draft.email}
              onChange={(e) => set({ email: e.target.value })}
            />
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-800">
                {tr('Colours', 'Colori')}
              </legend>
              <div className="flex flex-wrap gap-4">
                {(
                  [
                    ['background', tr('Background', 'Sfondo')],
                    ['text', tr('Text', 'Testo')],
                    ['accent', tr('Accent', 'Accento')],
                  ] as [keyof MaintenanceConfig['colors'], string][]
                ).map(([key, label]) => (
                  <label key={key} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="color"
                      value={draft.colors[key]}
                      onChange={(e) => set({ colors: { ...draft.colors, [key]: e.target.value } })}
                    />
                    {label}
                  </label>
                ))}
                <button
                  type="button"
                  className="text-sm text-sky-700 underline"
                  onClick={() => set({ colors: DEFAULT_COLORS })}
                >
                  {tr('Default colours', 'Colori predefiniti')}
                </button>
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.showLogo}
                onChange={(e) => set({ showLogo: e.target.checked })}
              />
              {tr(
                'Show the logo (the site’s logo, else its icon, else its title)',
                'Mostra il logo (quello del sito, altrimenti l’icona, altrimenti il titolo)',
              )}
            </label>
            {save.error && <Alert>{errorMessage(save.error)}</Alert>}
            {save.isSuccess && !dirty && <Alert kind="success">{tr('Saved.', 'Salvato.')}</Alert>}
            <Button type="submit" disabled={save.isPending || !dirty}>
              {tr('Save', 'Salva')}
            </Button>
          </form>
        </Card>

        <Card title={tr('Preview', 'Anteprima')}>
          <p className="mb-2 text-sm text-slate-600">
            {dirty
              ? tr('Save to see your changes here.', 'Salva per vedere qui le modifiche.')
              : tr('The page as visitors see it.', 'La pagina come la vedono i visitatori.')}{' '}
            <a
              className="text-sky-700 underline"
              href={`/api/v1${PREVIEW_PATH}?locale=${encodeURIComponent(locale)}`}
              target="_blank"
              rel="noopener"
            >
              {tr('Open in a new tab', 'Apri in una nuova scheda')}
            </a>
          </p>
          {preview.isError && <Alert>{errorMessage(preview.error)}</Alert>}
          <iframe
            title={tr('Preview of the maintenance page', 'Anteprima della pagina di manutenzione')}
            sandbox=""
            srcDoc={preview.data ?? ''}
            className="h-[32rem] w-full rounded border border-slate-200 bg-white"
          />
        </Card>
      </div>
    </div>
  );
}

function TextArea(props: {
  label: string;
  value: string;
  placeholder: string;
  hint: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {props.label}
      </label>
      <textarea
        id={id}
        rows={4}
        maxLength={2000}
        className={input}
        value={props.value}
        placeholder={props.placeholder}
        aria-describedby={`${id}-hint`}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <p id={`${id}-hint`} className="text-xs text-slate-500">
        {props.hint}
      </p>
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Maintenance page', it: 'Pagina di manutenzione' },
      parent: '/settings',
      capability: 'manage_settings',
      component: MaintenancePage,
    },
  ],
});
