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
  type EditorPanelProps,
  type ListCellProps,
  type ListRow,
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import type { LanguageView, OverviewRow, StringsResponse, TranslationsResponse } from './schema';

addMessages('it', {
  Languages: 'Lingue',
  Translations: 'Traduzioni',
  'Languages of the site. Content is written in each one, with its own address prefix.':
    'Lingue del sito. I contenuti si scrivono in ognuna, con il proprio prefisso nell’indirizzo.',
  Language: 'Lingua',
  Code: 'Codice',
  Address: 'Indirizzo',
  Content: 'Contenuti',
  Default: 'Predefinita',
  'Make default': 'Rendi predefinita',
  Domain: 'Dominio',
  'Domain of {name}, e.g. example.de (add it to the site first). Empty: use the address prefix.':
    'Dominio di {name}, es. example.de (aggiungilo prima al sito). Vuoto: usa il prefisso nell’indirizzo.',
  Remove: 'Rimuovi',
  'Move up': 'Sposta su',
  'Move down': 'Sposta giù',
  'Add a language': 'Aggiungi una lingua',
  'Choose a language': 'Scegli una lingua',
  'Other code (e.g. de-CH)': 'Altro codice (es. de-CH)',
  'Name shown to visitors': 'Nome mostrato ai visitatori',
  'Address prefix (optional, e.g. /en)': 'Prefisso dell’indirizzo (facoltativo, es. /en)',
  Add: 'Aggiungi',
  'Remove {name}?': 'Rimuovere {name}?',
  'Make {name} the default language? Its addresses lose their prefix.':
    'Rendere {name} la lingua predefinita? I suoi indirizzi perdono il prefisso.',
  '{entries} entries, {terms} terms': '{entries} contenuti, {terms} termini',
  'Written in {language}.': 'Scritto in {language}.',
  'Add translation': 'Aggiungi traduzione',
  '{language}: add': '{language}: aggiungi',
  '{language}: {title}': '{language}: {title}',
  'Translate into {language}': 'Traduci in {language}',
  'Name in {language}': 'Nome in {language}',
  '(no title)': '(senza titolo)',
  Unlink: 'Scollega',
  'needs update': 'da aggiornare',
  'Automatic translation': 'Traduzione automatica',
  'Content not translated yet': 'Contenuti non ancora tradotti',
  'Show it in the other languages': 'Mostrali nelle altre lingue',
  'The home page, the posts page, search and feeds of a language also list the posts not translated into it yet, in the default language.':
    'La home, la pagina degli articoli, la ricerca e i feed di una lingua elencano anche gli articoli non ancora tradotti in quella lingua, nella lingua predefinita.',
  'With a DeepL API key, new translations can be translated automatically. The texts are sent to DeepL; the key is stored encrypted.':
    'Con una chiave API di DeepL le nuove traduzioni possono essere tradotte automaticamente. I testi vengono inviati a DeepL; la chiave è salvata cifrata.',
  'A DeepL key is saved.': 'È salvata una chiave DeepL.',
  'Remove the key': 'Rimuovi la chiave',
  'DeepL API key': 'Chiave API di DeepL',
  'Translate automatically (DeepL)': 'Traduci automaticamente (DeepL)',
  'Translating…': 'Traduzione in corso…',
  'This replaces the text of this translation with a new automatic one. Continue?':
    'Il testo di questa traduzione sarà sostituito da una nuova traduzione automatica. Continuare?',
  'Translate again from the original': 'Traduci di nuovo dall’originale',
  'The copy was made, but not translated: {error}':
    'La copia è stata creata, ma non tradotta: {error}',
  'The original changed after this translation: check it and save it.':
    'L’originale è cambiato dopo questa traduzione: controllala e salvala.',
  'Site title and tagline': 'Titolo e motto del sito',
  'In the other languages. Empty texts show those of Settings.':
    'Nelle altre lingue. I testi vuoti mostrano quelli delle Impostazioni.',
  'Site title': 'Titolo del sito',
  Tagline: 'Motto',
  Save: 'Salva',
  'Saved.': 'Salvato.',
  'Content type': 'Tipo di contenuto',
  Posts: 'Articoli',
  Pages: 'Pagine',
  Title: 'Titolo',
  Translate: 'Traduci',
  '{missing} to translate, {outdated} to update': '{missing} da tradurre, {outdated} da aggiornare',
  draft: 'bozza',
  pending: 'in revisione',
  scheduled: 'programmato',
  published: 'pubblicato',
  private: 'privato',
});

const several = (props: AdminPageProps) => props.site.locales.length > 1;
const statusLabel = (status: string | undefined, t: (s: string) => string) =>
  status && status !== 'published' ? ` (${t(status)})` : '';

/** Common languages for the picker, by their own name. */
const COMMON = [
  'en',
  'it',
  'fr',
  'de',
  'es',
  'pt',
  'nl',
  'pl',
  'sv',
  'da',
  'fi',
  'nb',
  'cs',
  'sk',
  'hu',
  'ro',
  'el',
  'bg',
  'hr',
  'sl',
  'sr',
  'et',
  'lv',
  'lt',
  'uk',
  'ru',
  'tr',
  'ar',
  'he',
  'hi',
  'zh',
  'ja',
  'ko',
  'ca',
  'eu',
  'gl',
  'ga',
  'mt',
  'sq',
  'pt-BR',
  'en-GB',
  'en-US',
  'fr-CA',
];

function nativeName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    if (name && name !== code) return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    // Unknown here.
  }
  return code.toUpperCase();
}

// ---- Settings → Languages -----------------------------------------------------------

function LanguagesPage({ api }: AdminPageProps) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['multilingual', 'languages'],
    queryFn: () => api<LanguageView[]>('GET', '/languages'),
  });
  // Every screen reads the languages from the session.
  const done = async (views: LanguageView[]) => {
    queryClient.setQueryData(['multilingual', 'languages'], views);
    await queryClient.invalidateQueries({ queryKey: ['me'] });
  };
  const change = useMutation({
    mutationFn: ({ code, body }: { code: string; body: Record<string, unknown> }) =>
      api<LanguageView[]>('PATCH', `/languages/${code}`, body),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: (code: string) => api<LanguageView[]>('DELETE', `/languages/${code}`),
    onSuccess: done,
  });
  const views = list.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('Languages')}</h1>
      <p className="text-sm text-slate-600">
        {t('Languages of the site. Content is written in each one, with its own address prefix.')}
      </p>
      {list.error && <Alert>{errorMessage(list.error)}</Alert>}
      {change.error && <Alert>{errorMessage(change.error)}</Alert>}
      {remove.error && <Alert>{errorMessage(remove.error)}</Alert>}
      <Card>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-600">
            <tr>
              <th className="py-2 font-medium">{t('Language')}</th>
              <th className="py-2 font-medium">{t('Code')}</th>
              <th className="py-2 font-medium">{t('Address')}</th>
              <th className="py-2 font-medium">{t('Content')}</th>
              <th className="py-2 font-medium">
                <span className="sr-only">{t('Actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {views.map((view, index) => (
              <tr key={view.code} className="border-b border-slate-100 align-top">
                <td className="py-2 font-medium">
                  {view.name}
                  {view.isDefault && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                      {t('Default')}
                    </span>
                  )}
                </td>
                <td className="py-2">{view.code}</td>
                <td className="py-2 text-slate-600">{view.host ?? (view.prefix || '/')}</td>
                <td className="py-2 text-slate-600">
                  {t('{entries} entries, {terms} terms', {
                    entries: view.usage.entries,
                    terms: view.usage.terms,
                  })}
                </td>
                <td className="py-2">
                  <div className="flex flex-wrap justify-end gap-3 text-xs">
                    {!view.isDefault && index > 1 && (
                      <button
                        type="button"
                        className="text-sky-700 hover:underline"
                        onClick={() =>
                          change.mutate({
                            code: view.code,
                            body: { position: views[index - 1]!.position - 1 },
                          })
                        }
                      >
                        {t('Move up')}
                        <span className="sr-only"> {view.name}</span>
                      </button>
                    )}
                    {!view.isDefault && index < views.length - 1 && (
                      <button
                        type="button"
                        className="text-sky-700 hover:underline"
                        onClick={() =>
                          change.mutate({
                            code: view.code,
                            body: { position: views[index + 1]!.position + 1 },
                          })
                        }
                      >
                        {t('Move down')}
                        <span className="sr-only"> {view.name}</span>
                      </button>
                    )}
                    {!view.isDefault && (
                      <button
                        type="button"
                        className="text-sky-700 hover:underline"
                        onClick={() => {
                          if (
                            window.confirm(
                              t(
                                'Make {name} the default language? Its addresses lose their prefix.',
                                {
                                  name: view.name,
                                },
                              ),
                            )
                          )
                            change.mutate({ code: view.code, body: { isDefault: true } });
                        }}
                      >
                        {t('Make default')}
                        <span className="sr-only"> {view.name}</span>
                      </button>
                    )}
                    {!view.isDefault && (
                      <button
                        type="button"
                        className="text-sky-700 hover:underline"
                        onClick={() => {
                          const host = window.prompt(
                            t(
                              'Domain of {name}, e.g. example.de (add it to the site first). Empty: use the address prefix.',
                              { name: view.name },
                            ),
                            view.host ?? '',
                          );
                          if (host !== null)
                            change.mutate({ code: view.code, body: { host: host.trim() || null } });
                        }}
                      >
                        {t('Domain')}
                        <span className="sr-only"> {view.name}</span>
                      </button>
                    )}
                    {!view.isDefault && (
                      <button
                        type="button"
                        className="text-red-700 hover:underline"
                        onClick={() => {
                          if (window.confirm(t('Remove {name}?', { name: view.name })))
                            remove.mutate(view.code);
                        }}
                      >
                        {t('Remove')}
                        <span className="sr-only"> {view.name}</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <AddLanguage api={api} taken={views.map((v) => v.code)} onAdded={done} />
      <SiteTexts api={api} languages={views.filter((v) => !v.isDefault)} />
      <Options api={api} />
      <MachineSettings api={api} />
    </div>
  );
}

function AddLanguage({
  api,
  taken,
  onAdded,
}: {
  api: AdminPageProps['api'];
  taken: string[];
  onAdded: (views: LanguageView[]) => Promise<void>;
}) {
  const { t } = useT();
  const pickerId = useId();
  const [choice, setChoice] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const add = useMutation({
    mutationFn: () =>
      api<LanguageView[]>('POST', '/languages', {
        code: code.trim(),
        name: name.trim(),
        ...(prefix.trim() ? { urlPrefix: prefix.trim() } : {}),
      }),
    onSuccess: async (views) => {
      setChoice('');
      setCode('');
      setName('');
      setPrefix('');
      await onAdded(views);
    },
  });
  return (
    <Card title={t('Add a language')}>
      <form
        className="grid max-w-xl gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        {add.error && <Alert>{errorMessage(add.error)}</Alert>}
        <div className="space-y-1 text-sm">
          <label htmlFor={pickerId} className="block font-medium text-slate-800">
            {t('Language')}
          </label>
          <select
            id={pickerId}
            className="w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm"
            value={choice}
            onChange={(e) => {
              setChoice(e.target.value);
              if (e.target.value) {
                setCode(e.target.value);
                setName(nativeName(e.target.value));
              }
            }}
          >
            <option value="">{t('Choose a language')}</option>
            {COMMON.filter((c) => !taken.includes(c)).map((c) => (
              <option key={c} value={c}>
                {nativeName(c)} ({c})
              </option>
            ))}
          </select>
        </div>
        <TextField
          label={t('Other code (e.g. de-CH)')}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setChoice('');
          }}
          required
        />
        <TextField
          label={t('Name shown to visitors')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <TextField
          label={t('Address prefix (optional, e.g. /en)')}
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
        />
        <div>
          <Button type="submit" disabled={add.isPending}>
            {t('Add')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SiteTexts({ api, languages }: { api: AdminPageProps['api']; languages: LanguageView[] }) {
  const { t } = useT();
  const texts = useQuery({
    queryKey: ['multilingual', 'strings'],
    queryFn: () => api<StringsResponse>('GET', '/strings'),
  });
  if (languages.length === 0 || !texts.data) return null;
  return (
    <Card title={t('Site title and tagline')}>
      <p className="mb-3 text-sm text-slate-600">
        {t('In the other languages. Empty texts show those of Settings.')}
      </p>
      <div className="grid gap-6">
        {languages.map((language) => (
          <SiteTextsForm
            key={language.code}
            api={api}
            language={language}
            initial={texts.data[language.code] ?? { title: '', tagline: '' }}
          />
        ))}
      </div>
    </Card>
  );
}

function SiteTextsForm({
  api,
  language,
  initial,
}: {
  api: AdminPageProps['api'];
  language: LanguageView;
  initial: { title: string; tagline: string };
}) {
  const { t } = useT();
  const [title, setTitle] = useState(initial.title);
  const [tagline, setTagline] = useState(initial.tagline);
  const save = useMutation({
    mutationFn: () => api<void>('PUT', `/strings/${language.code}`, { title, tagline }),
  });
  return (
    <form
      className="grid max-w-xl gap-3"
      aria-label={language.name}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h3 className="font-medium">{language.name}</h3>
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      {save.isSuccess && <Alert kind="success">{t('Saved.')}</Alert>}
      <TextField label={t('Site title')} value={title} onChange={(e) => setTitle(e.target.value)} />
      <TextField
        label={t('Tagline')}
        value={tagline}
        onChange={(e) => setTagline(e.target.value)}
      />
      <div>
        <Button type="submit" disabled={save.isPending}>
          {t('Save')}
        </Button>
      </div>
    </form>
  );
}

function Options({ api }: { api: AdminPageProps['api'] }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const options = useQuery({
    queryKey: ['multilingual', 'options'],
    queryFn: () => api<{ showUntranslated: boolean }>('GET', '/options'),
  });
  const save = useMutation({
    mutationFn: (showUntranslated: boolean) => api<void>('PUT', '/options', { showUntranslated }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['multilingual', 'options'] }),
  });
  if (!options.data) return null;
  return (
    <Card title={t('Content not translated yet')}>
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={options.data.showUntranslated}
          disabled={save.isPending}
          onChange={(e) => save.mutate(e.target.checked)}
        />
        <span>
          {t('Show it in the other languages')}
          <span className="block text-slate-600">
            {t(
              'The home page, the posts page, search and feeds of a language also list the posts not translated into it yet, in the default language.',
            )}
          </span>
        </span>
      </label>
    </Card>
  );
}

function MachineSettings({ api }: { api: AdminPageProps['api'] }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const state = useQuery({
    queryKey: ['multilingual', 'machine'],
    queryFn: () => api<{ configured: boolean }>('GET', '/machine'),
  });
  const [key, setKey] = useState('');
  const done = async () => {
    setKey('');
    await queryClient.invalidateQueries({ queryKey: ['multilingual', 'machine'] });
  };
  const save = useMutation({
    mutationFn: () => api<void>('PUT', '/machine', { apiKey: key }),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => api<void>('DELETE', '/machine'),
    onSuccess: done,
  });
  return (
    <Card title={t('Automatic translation')}>
      <div className="grid max-w-xl gap-3 text-sm">
        <p className="text-slate-600">
          {t(
            'With a DeepL API key, new translations can be translated automatically. The texts are sent to DeepL; the key is stored encrypted.',
          )}
        </p>
        {save.error && <Alert>{errorMessage(save.error)}</Alert>}
        {state.data?.configured ? (
          <div className="flex items-center gap-3">
            <span>{t('A DeepL key is saved.')}</span>
            <Button variant="secondary" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {t('Remove the key')}
            </Button>
          </div>
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <TextField
              label={t('DeepL API key')}
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
            />
            <div>
              <Button type="submit" disabled={save.isPending}>
                {t('Save')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}

// ---- Translations overview ----------------------------------------------------------

function OverviewPage({ api, site, user }: AdminPageProps) {
  const { t } = useT();
  // Admin addresses, opened as links (pages get no router).
  const open = (id: string) => window.location.assign(`/admin/entries/${id}`);
  const [type, setType] = useState('article');
  const list = useQuery({
    queryKey: ['multilingual', 'overview', type],
    queryFn: () => api<OverviewRow[]>('GET', `/overview?type=${type}`),
  });
  const create = useMutation({
    mutationFn: ({ id, locale }: { id: string; locale: string }) =>
      api<{ id: string }>('POST', `/translations/entry/${id}`, { locale }),
    onSuccess: ({ id }) => open(id),
  });
  const others = site.locales.filter((l) => l.code !== site.defaultLocale);
  const rows = list.data ?? [];
  const missing = rows.filter((r) =>
    others.some((l) => !r.links.some((x) => x.locale === l.code)),
  ).length;
  const outdated = rows.filter((r) => r.links.some((x) => x.needsUpdate)).length;
  const canEdit = user.capabilities.includes('edit_entries');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('Translations')}</h1>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <span>{t('Content type')}</span>
          <select
            className="rounded border border-slate-300 bg-white px-2 py-1"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="article">{t('Posts')}</option>
            <option value="page">{t('Pages')}</option>
          </select>
        </label>
        {list.data && (
          <p className="text-slate-600">
            {t('{missing} to translate, {outdated} to update', { missing, outdated })}
          </p>
        )}
      </div>
      {list.error && <Alert>{errorMessage(list.error)}</Alert>}
      {create.error && <Alert>{errorMessage(create.error)}</Alert>}
      <Card>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-600">
            <tr>
              <th className="py-2 font-medium">{t('Title')}</th>
              {others.map((l) => (
                <th key={l.code} className="py-2 font-medium">
                  {l.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="py-2">
                  <a
                    href={`/admin/entries/${row.id}`}
                    className="font-medium text-sky-700 hover:underline"
                  >
                    {row.title || t('(no title)')}
                  </a>
                  <span className="text-slate-500">{statusLabel(row.status, t)}</span>
                </td>
                {others.map((l) => {
                  const link = row.links.find((x) => x.locale === l.code);
                  return (
                    <td key={l.code} className="py-2">
                      {link ? (
                        <a
                          href={`/admin/entries/${link.id}`}
                          className="text-sky-700 hover:underline"
                        >
                          {link.title || t('(no title)')}
                          <span className="text-slate-500">{statusLabel(link.status, t)}</span>
                          {link.needsUpdate && <NeedsUpdate />}
                        </a>
                      ) : canEdit ? (
                        <button
                          type="button"
                          className="text-sky-700 hover:underline"
                          disabled={create.isPending}
                          onClick={() => create.mutate({ id: row.id, locale: l.code })}
                        >
                          {t('Translate')}
                          <span className="sr-only">
                            {' '}
                            {row.title} → {l.name}
                          </span>
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function NeedsUpdate() {
  const { t } = useT();
  return (
    <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-900">
      {t('needs update')}
    </span>
  );
}

// ---- Editor: Translations -----------------------------------------------------------

function TranslationsPanel({ api, entry, site, navigate }: EditorPanelProps) {
  const { t } = useT();
  const key = ['multilingual', 'translations', 'entry', entry.id, entry.updatedAt];
  const queryClient = useQueryClient();
  const data = useQuery({
    queryKey: key,
    queryFn: () => api<TranslationsResponse>('GET', `/translations?kind=entry&ids=${entry.id}`),
  });
  const machine = useQuery({
    queryKey: ['multilingual', 'machine'],
    queryFn: () => api<{ configured: boolean }>('GET', '/machine'),
  });
  const [automatic, setAutomatic] = useState(true);
  const useMachine = Boolean(machine.data?.configured) && automatic;
  const create = useMutation({
    mutationFn: (locale: string) =>
      api<{ id: string; warning?: string }>('POST', `/translations/entry/${entry.id}`, {
        locale,
        ...(useMachine ? { machine: true } : {}),
      }),
    onSuccess: async ({ id, warning }) => {
      await queryClient.invalidateQueries({ queryKey: ['multilingual', 'translations'] });
      if (warning)
        window.alert(t('The copy was made, but not translated: {error}', { error: warning }));
      navigate(`/entries/${id}`);
    },
  });
  const refresh = useMutation({
    mutationFn: () => api<void>('POST', `/translations/entry/${entry.id}/machine`),
    // The editor reloads the new version.
    onSuccess: () => window.location.reload(),
  });
  const own = data.data?.[entry.id];
  const links = own?.links ?? [];
  const nameOf = (code: string) => site.locales.find((l) => l.code === code)?.name ?? code;
  const missing = site.locales.filter(
    (l) => l.code !== entry.locale && !links.some((link) => link.locale === l.code),
  );

  return (
    <div className="space-y-2 text-sm">
      <p>{t('Written in {language}.', { language: nameOf(entry.locale) })}</p>
      {own?.needsUpdate && (
        <p className="rounded bg-amber-50 px-2 py-1 text-amber-900" role="status">
          {t('The original changed after this translation: check it and save it.')}
        </p>
      )}
      {own && !own.isOriginal && machine.data?.configured && (
        <Button
          variant="secondary"
          disabled={refresh.isPending}
          onClick={() => {
            if (
              window.confirm(
                t('This replaces the text of this translation with a new automatic one. Continue?'),
              )
            )
              refresh.mutate();
          }}
        >
          {refresh.isPending ? t('Translating…') : t('Translate again from the original')}
        </Button>
      )}
      {refresh.error && <Alert>{errorMessage(refresh.error)}</Alert>}
      {data.error && <Alert>{errorMessage(data.error)}</Alert>}
      {create.error && <Alert>{errorMessage(create.error)}</Alert>}
      {links.length > 0 && (
        <ul className="space-y-1">
          {links.map((link) => (
            <li key={link.id}>
              <a
                href={`/admin/entries/${link.id}`}
                className="text-sky-700 hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/entries/${link.id}`);
                }}
              >
                {t('{language}: {title}', {
                  language: nameOf(link.locale),
                  title: link.title || t('(no title)'),
                })}
              </a>
              <span className="text-slate-500">{statusLabel(link.status, t)}</span>
              {link.needsUpdate && <NeedsUpdate />}
            </li>
          ))}
        </ul>
      )}
      {missing.length > 0 && machine.data?.configured && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={automatic}
            onChange={(e) => setAutomatic(e.target.checked)}
          />
          {t('Translate automatically (DeepL)')}
        </label>
      )}
      {create.isPending && useMachine && <p role="status">{t('Translating…')}</p>}
      {missing.length > 0 && (
        <select
          value=""
          disabled={create.isPending}
          onChange={(e) => e.target.value && create.mutate(e.target.value)}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1"
          aria-label={t('Add translation')}
        >
          <option value="">{t('Add translation')}…</option>
          {missing.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// ---- Lists: Translations column -----------------------------------------------------

type Row = TranslationsResponse[string];

function loadTranslations(kind: 'entry' | 'term') {
  return async (rows: ListRow[], props: AdminPageProps): Promise<Record<string, Row>> => {
    const result: Record<string, Row> = {};
    for (let i = 0; i < rows.length; i += 200) {
      const ids = rows.slice(i, i + 200).map((r) => r.id);
      Object.assign(
        result,
        await props.api<TranslationsResponse>(
          'GET',
          `/translations?kind=${kind}&ids=${ids.join(',')}`,
        ),
      );
    }
    return result;
  };
}

function EntryTranslationsCell({ api, row, data, site, navigate }: ListCellProps<Row>) {
  const { t } = useT();
  const create = useMutation({
    mutationFn: (locale: string) =>
      api<{ id: string }>('POST', `/translations/entry/${row.id}`, { locale }),
    onSuccess: ({ id }) => navigate(`/entries/${id}`),
  });
  const others = site.locales.filter((l) => l.code !== row.locale);
  return (
    <ul className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
      {others.map((l) => {
        const link = data?.links.find((x) => x.locale === l.code);
        return (
          <li key={l.code}>
            {link ? (
              <a
                href={`/admin/entries/${link.id}`}
                className="rounded bg-sky-50 px-1 font-medium text-sky-800 uppercase hover:underline"
                title={`${l.name}: ${link.title || t('(no title)')}${statusLabel(link.status, t)}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/entries/${link.id}`);
                }}
              >
                {l.code}
                {link.needsUpdate && <span aria-hidden="true"> ⚠</span>}
                <span className="sr-only">
                  {' '}
                  {t('{language}: {title}', {
                    language: l.name,
                    title: link.title || t('(no title)'),
                  })}
                  {link.needsUpdate ? ` (${t('needs update')})` : ''}
                </span>
              </a>
            ) : (
              <button
                type="button"
                className="rounded border border-dashed border-slate-400 px-1 text-slate-700 uppercase hover:border-sky-700 hover:text-sky-800"
                disabled={create.isPending}
                title={t('Translate into {language}', { language: l.name })}
                onClick={() => create.mutate(l.code)}
              >
                + {l.code}
                <span className="sr-only">
                  {' '}
                  {t('Translate into {language}', { language: l.name })}:{' '}
                  {row.title || t('(no title)')}
                </span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TermTranslationsCell({ api, row, data, site, refresh, user }: ListCellProps<Row>) {
  const { t } = useT();
  const create = useMutation({
    mutationFn: (input: { locale: string; name: string }) =>
      api<{ id: string }>('POST', `/translations/term/${row.id}`, input),
    onSuccess: refresh,
  });
  const canManage = user.capabilities.includes('manage_terms');
  const others = site.locales.filter((l) => l.code !== row.locale);
  return (
    <ul className="space-y-1 text-xs">
      {create.error && (
        <li>
          <Alert>{errorMessage(create.error)}</Alert>
        </li>
      )}
      {others.map((l) => {
        const link = data?.links.find((x) => x.locale === l.code);
        return (
          <li key={l.code}>
            <span className="mr-1 text-slate-500 uppercase">{l.code}</span>
            {link ? (
              <span>{link.title}</span>
            ) : canManage ? (
              <button
                type="button"
                className="text-sky-700 hover:underline"
                disabled={create.isPending}
                onClick={() => {
                  const name = window.prompt(
                    t('Name in {language}', { language: l.name }),
                    row.title,
                  );
                  if (name?.trim()) create.mutate({ locale: l.code, name: name.trim() });
                }}
              >
                {t('Add translation')}
                <span className="sr-only">
                  {' '}
                  {row.title} → {l.name}
                </span>
              </button>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Languages', it: 'Lingue' },
      capability: 'manage_settings',
      component: LanguagesPage,
      // Two scripts: a character and a letter.
      icon: 'M3 5.5h9 M7.5 3.5v2 M5 5.5c.7 3 2.8 5.4 6 6.5 M10 5.5c-.7 3.2-2.9 5.8-6 7.2 M12.5 21l4-10 4 10 M13.8 18h5.4',
    },
    {
      path: 'overview',
      title: { en: 'Translations', it: 'Traduzioni' },
      capability: 'edit_entries',
      component: OverviewPage,
      // A list with check marks.
      icon: 'M10 6h10 M10 12h10 M10 18h10 M3.5 6l1.5 1.5L7.5 5 M3.5 12l1.5 1.5L7.5 11 M3.5 18l1.5 1.5L7.5 17',
    },
  ],
  editorPanels: [
    {
      id: 'translations',
      title: { en: 'Translations', it: 'Traduzioni' },
      capability: 'edit_entries',
      visible: several,
      component: TranslationsPanel,
    },
  ],
  entryColumns: [
    {
      id: 'translations',
      title: { en: 'Translations', it: 'Traduzioni' },
      capability: 'edit_entries',
      visible: several,
      load: loadTranslations('entry'),
      cell: EntryTranslationsCell,
    },
  ],
  termColumns: [
    {
      id: 'translations',
      title: { en: 'Translations', it: 'Traduzioni' },
      capability: 'edit_entries',
      visible: several,
      load: loadTranslations('term'),
      cell: TermTranslationsCell,
    },
  ],
});
