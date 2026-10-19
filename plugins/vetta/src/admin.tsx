/**
 * Vetta SEO in the admin: the settings page (one tab per subject), the log
 * of pages not found, IndexNow, and the analysis in the editor.
 */
import {
  Alert,
  api as coreApi,
  Button,
  Card,
  defineAdminPlugin,
  errorMessage,
  FieldsForm,
  labelText,
  type AdminPageProps,
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { DEFAULTS, MODULES, moduleOn, type Config } from './config.js';
import { AnalysisPanel } from './panel.js';
import {
  breadcrumbFields,
  filesFields,
  generalFields,
  indexnowFields,
  knowledgeFields,
  linkFields,
  moduleFields,
  monitorFields,
  pagesFields,
  sitemapFields,
  socialFields,
  taxonomyFields,
  typeFields,
  webmasterFields,
  type Field,
} from './settings-fields.js';

type Label = string | Record<string, string>;
interface TypeView {
  slug: string;
  name?: Label;
  labels?: { plural?: Label; singular?: Label };
}

type Tab =
  | 'modules'
  | 'general'
  | 'pages'
  | 'types'
  | 'taxonomies'
  | 'social'
  | 'knowledge'
  | 'webmaster'
  | 'breadcrumbs'
  | 'sitemap'
  | 'links'
  | 'files'
  | 'notfound'
  | 'indexnow';

const TABS: { id: Tab; en: string; it: string; module?: (typeof MODULES)[number] }[] = [
  { id: 'modules', en: 'Modules', it: 'Moduli' },
  { id: 'general', en: 'General', it: 'Generale' },
  { id: 'pages', en: 'Home and other pages', it: 'Home e altre pagine' },
  { id: 'types', en: 'Content types', it: 'Tipi di contenuto' },
  { id: 'taxonomies', en: 'Categories and tags', it: 'Categorie e tag' },
  { id: 'social', en: 'Social networks', it: 'Social network', module: 'social' },
  {
    id: 'knowledge',
    en: 'Organization and local business',
    it: 'Organizzazione e attività locale',
  },
  { id: 'webmaster', en: 'Webmaster tools', it: 'Strumenti per webmaster' },
  { id: 'breadcrumbs', en: 'Breadcrumbs', it: 'Briciole di pane', module: 'breadcrumbs' },
  { id: 'sitemap', en: 'Sitemap', it: 'Sitemap', module: 'sitemap' },
  { id: 'links', en: 'Links and images', it: 'Link e immagini' },
  { id: 'files', en: 'llms.txt and robots.txt', it: 'llms.txt e robots.txt' },
  { id: 'notfound', en: 'Pages not found', it: 'Pagine non trovate', module: 'monitor404' },
  { id: 'indexnow', en: 'IndexNow', it: 'IndexNow', module: 'indexNow' },
];

const nameOf = (t: TypeView, locale: string) =>
  labelText((t.labels?.plural ?? t.name ?? t.slug) as never, locale) || t.slug;

/** Defaults of the fields, for what the form shows before anything is saved. */
function defaultsOf(fields: Field[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const own = (f as { default?: unknown }).default;
    out[f.name] = own !== undefined ? own : DEFAULTS[f.name];
  }
  return out;
}

function SettingsPage(props: AdminPageProps) {
  const locale = props.user.locale;
  const it = locale.startsWith('it');
  const tr = (en: string, itText: string) => (it ? itText : en);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('modules');
  const saved = useQuery({
    queryKey: ['vetta', 'config'],
    queryFn: () => props.api<{ config: Config; origin: string }>('GET', '/config'),
  });
  const types = useQuery({
    queryKey: ['content-types'],
    queryFn: () => coreApi<TypeView[]>('GET', '/content-types'),
  });
  const taxonomies = useQuery({
    queryKey: ['taxonomies'],
    queryFn: () => coreApi<TypeView[]>('GET', '/taxonomies'),
  });
  const [draft, setDraft] = useState<Config | null>(null);
  const config = draft ?? saved.data?.config ?? null;
  const save = useMutation({
    mutationFn: (next: Config) => props.api<{ config: Config }>('PUT', '/config', { config: next }),
    onSuccess: (result) => {
      queryClient.setQueryData(['vetta', 'config'], (old: { origin: string } | undefined) => ({
        ...old,
        config: result.config,
      }));
      setDraft(null);
    },
  });

  const fields = useMemo((): Field[] => {
    switch (tab) {
      case 'modules':
        return moduleFields();
      case 'general':
        return generalFields();
      case 'pages':
        return pagesFields();
      case 'types':
        return (types.data ?? []).flatMap((t) => typeFields(t.slug, nameOf(t, locale)));
      case 'taxonomies':
        return (taxonomies.data ?? []).flatMap((t) => taxonomyFields(t.slug, nameOf(t, locale)));
      case 'social':
        return socialFields();
      case 'knowledge':
        return knowledgeFields();
      case 'webmaster':
        return webmasterFields();
      case 'breadcrumbs':
        return breadcrumbFields();
      case 'sitemap':
        return sitemapFields();
      case 'links':
        return linkFields();
      case 'files':
        return filesFields();
      case 'notfound':
        return monitorFields();
      case 'indexnow':
        return indexnowFields();
    }
  }, [tab, types.data, taxonomies.data, locale]);
  const defaults = useMemo(() => {
    const d = defaultsOf(fields);
    for (const m of MODULES) d[`module_${m}`] = moduleOn({}, m);
    return d;
  }, [fields]);

  if (saved.error) return <Alert>{errorMessage(saved.error)}</Alert>;
  if (!config) return <p className="text-sm text-slate-600">{tr('Loading…', 'Caricamento…')}</p>;
  const origin = saved.data?.origin ?? window.location.origin;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Vetta SEO</h1>
        {draft && (
          <span className="text-sm text-slate-600">
            {tr('Not saved yet', 'Non ancora salvato')}
          </span>
        )}
        <Button onClick={() => save.mutate(config)} disabled={!draft || save.isPending}>
          {save.isPending ? tr('Saving…', 'Salvataggio…') : tr('Save', 'Salva')}
        </Button>
      </div>
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      {save.isSuccess && !draft && <Alert kind="success">{tr('Saved.', 'Salvato.')}</Alert>}
      <div className="grid gap-4 md:grid-cols-[13rem_minmax(0,46rem)]">
        <nav aria-label={tr('Sections', 'Sezioni')} className="space-y-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={t.id === tab ? 'page' : undefined}
              onClick={() => setTab(t.id)}
              className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm ${
                t.id === tab
                  ? 'bg-slate-900 font-medium text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>{it ? t.it : t.en}</span>
              {t.module && !moduleOn(config, t.module) && (
                <span className="text-xs opacity-70">{tr('off', 'spento')}</span>
              )}
            </button>
          ))}
        </nav>
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <TabIntro tab={tab} tr={tr} origin={origin} config={config} />
          {fields.length > 0 && (
            <FieldsForm
              fields={fields}
              values={config}
              defaults={defaults}
              locale={locale}
              onChange={(values) => setDraft({ ...config, ...values })}
            />
          )}
          {tab === 'notfound' && <NotFoundLog {...props} tr={tr} />}
          {tab === 'indexnow' && <IndexNowBox {...props} tr={tr} />}
        </section>
      </div>
    </div>
  );
}

function TabIntro({
  tab,
  tr,
  origin,
  config,
}: {
  tab: Tab;
  tr: (en: string, it: string) => string;
  origin: string;
  config: Config;
}) {
  const p = (en: string, it: string) => <p className="text-sm text-slate-600">{tr(en, it)}</p>;
  switch (tab) {
    case 'modules':
      return p(
        'Switch on what the site needs. Each module has its tab.',
        'Accendi ciò che serve al sito. Ogni modulo ha la sua scheda.',
      );
    case 'types':
      return p(
        'Search titles and descriptions of each content type, when an entry has none of its own.',
        'Titoli e descrizioni per i motori di ogni tipo di contenuto, quando una voce non ne ha di propri.',
      );
    case 'taxonomies':
      return p(
        'Archives of categories, tags and other taxonomies. Tags stay out of search by default, as thin pages.',
        'Archivi di categorie, tag e altre tassonomie. I tag restano fuori dalla ricerca per default, perché pagine povere.',
      );
    case 'knowledge':
      return p(
        'Who is behind the site, in the structured data search engines read for their knowledge panel and maps.',
        'Chi c’è dietro il sito, nei dati strutturati che i motori leggono per il pannello informativo e le mappe.',
      );
    case 'breadcrumbs':
      return p(
        'Add the “Breadcrumbs” block where the path should show (or in a theme area).',
        'Aggiungi il blocco “Briciole di pane” dove deve comparire il percorso (o in un’area del tema).',
      );
    case 'sitemap':
      return (
        <p className="text-sm text-slate-600">
          {tr('The sitemap is at', 'La sitemap è in')}{' '}
          <a
            className="text-sky-700 underline"
            href={`${origin}/sitemap.xml`}
            target="_blank"
            rel="noreferrer"
          >
            {origin}/sitemap.xml
          </a>
          .{' '}
          {tr(
            'Content types and taxonomies are switched on and off in their tabs.',
            'Tipi di contenuto e tassonomie si includono o escludono nelle loro schede.',
          )}
        </p>
      );
    case 'files':
      return (
        <p className="text-sm text-slate-600">
          <a
            className="text-sky-700 underline"
            href={`${origin}/llms.txt`}
            target="_blank"
            rel="noreferrer"
          >
            /llms.txt
          </a>{' '}
          {moduleOn(config, 'llms') ? '' : tr('(module off)', '(modulo spento)')} ·{' '}
          <a
            className="text-sky-700 underline"
            href={`${origin}/robots.txt`}
            target="_blank"
            rel="noreferrer"
          >
            /robots.txt
          </a>{' '}
          {moduleOn(config, 'robotsTxt')
            ? ''
            : tr('(editor off: Cleitext’s rules)', '(editor spento: regole di Cleitext)')}
        </p>
      );
    default:
      return null;
  }
}

interface NotFoundRow {
  id: string;
  path: string;
  hits: number;
  referrer: string | null;
  userAgent: string | null;
  lastSeen: string;
}

function NotFoundLog(props: AdminPageProps & { tr: (en: string, it: string) => string }) {
  const { tr } = props;
  const queryClient = useQueryClient();
  const rows = useQuery({
    queryKey: ['vetta', 'not-found'],
    queryFn: () => props.api<NotFoundRow[]>('GET', '/not-found'),
  });
  const clear = useMutation({
    mutationFn: (ids?: string[]) => props.api('DELETE', '/not-found', ids ? { ids } : {}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['vetta', 'not-found'] }),
  });
  return (
    <Card title={tr('Addresses not found', 'Indirizzi non trovati')}>
      {rows.error && <Alert>{errorMessage(rows.error)}</Alert>}
      {rows.data?.length === 0 && (
        <p className="text-sm text-slate-600">{tr('Nothing yet.', 'Ancora niente.')}</p>
      )}
      {rows.data && rows.data.length > 0 && (
        <>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-1 pr-2">{tr('Address', 'Indirizzo')}</th>
                <th className="py-1 pr-2">{tr('Visits', 'Visite')}</th>
                <th className="py-1 pr-2">{tr('Last', 'Ultima')}</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {rows.data.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 align-top">
                  <td className="py-1 pr-2 break-all">
                    <code>{row.path}</code>
                    {row.referrer && (
                      <div className="text-xs text-slate-500">
                        {tr('from', 'da')} {row.referrer}
                      </div>
                    )}
                  </td>
                  <td className="py-1 pr-2">{row.hits}</td>
                  <td className="py-1 pr-2 whitespace-nowrap">
                    {new Date(row.lastSeen).toLocaleString()}
                  </td>
                  <td className="py-1 whitespace-nowrap">
                    <a
                      className="mr-2 text-sky-700 underline"
                      href={`/cl-admin/redirects?from=${encodeURIComponent(row.path)}`}
                    >
                      {tr('Redirect', 'Reindirizza')}
                    </a>
                    <button
                      type="button"
                      className="text-red-700 underline"
                      onClick={() => clear.mutate([row.id])}
                    >
                      {tr('Remove', 'Togli')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3">
            <Button variant="secondary" onClick={() => clear.mutate(undefined)}>
              {tr('Clear the log', 'Svuota il registro')}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

interface LogRow {
  id: string;
  urls: string[];
  status: number;
  manual: boolean;
  message: string;
  createdAt: string;
}

function IndexNowBox(props: AdminPageProps & { tr: (en: string, it: string) => string }) {
  const { tr } = props;
  const queryClient = useQueryClient();
  const [urls, setUrls] = useState('');
  const log = useQuery({
    queryKey: ['vetta', 'indexnow'],
    queryFn: () => props.api<LogRow[]>('GET', '/indexnow'),
  });
  const send = useMutation({
    mutationFn: () => props.api<{ status: number; message: string }>('POST', '/indexnow', { urls }),
    onSuccess: () => {
      setUrls('');
      void queryClient.invalidateQueries({ queryKey: ['vetta', 'indexnow'] });
    },
  });
  return (
    <Card title={tr('Send addresses now', 'Invia indirizzi ora')}>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">
          {tr('Addresses of this site, one per line', 'Indirizzi di questo sito, uno per riga')}
        </span>
        <textarea
          className="h-24 w-full rounded border border-slate-300 p-2 font-mono text-sm"
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
        />
      </label>
      <div className="mt-2">
        <Button onClick={() => send.mutate()} disabled={!urls.trim() || send.isPending}>
          {tr('Send', 'Invia')}
        </Button>
      </div>
      {send.error && <Alert>{errorMessage(send.error)}</Alert>}
      {send.data && (
        <Alert kind={send.data.status >= 200 && send.data.status < 300 ? 'success' : 'error'}>
          {send.data.message}
        </Alert>
      )}
      <h3 className="mt-4 mb-1 text-sm font-semibold">{tr('Last sent', 'Ultimi invii')}</h3>
      {log.data?.length === 0 && (
        <p className="text-sm text-slate-600">{tr('Nothing sent yet.', 'Ancora nessun invio.')}</p>
      )}
      <ul className="space-y-1 text-sm">
        {log.data?.map((row) => (
          <li key={row.id}>
            <span
              className={
                row.status >= 200 && row.status < 300 ? 'text-emerald-700' : 'text-red-700'
              }
            >
              {row.status || '—'}
            </span>{' '}
            {new Date(row.createdAt).toLocaleString()} ·{' '}
            {row.manual ? tr('by hand', 'a mano') : tr('automatic', 'automatico')} ·{' '}
            {row.urls.join(', ')} <span className="text-slate-500">{row.message}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default defineAdminPlugin({
  editorPanels: [
    {
      id: 'vetta-analysis',
      title: { en: 'SEO analysis', it: 'Analisi SEO' },
      capability: 'edit_entries',
      component: AnalysisPanel,
    },
  ],
  pages: [
    {
      path: '',
      title: 'Vetta SEO',
      capability: 'manage_vetta',
      component: SettingsPage,
      // A peak with a flag.
      icon: 'M3 20l6.5-11 4 6.5L16 12l5 8z M13 4v5 M13 4h4l-1 1.5 1 1.5h-4',
    },
  ],
});
