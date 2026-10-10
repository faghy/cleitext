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
import { useState } from 'react';
import type { LanguageView, TranslationsResponse } from './schema';

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
                <td className="py-2 text-slate-600">{view.prefix || '/'}</td>
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
        <label className="block space-y-1 text-sm">
          <span className="block font-medium text-slate-800">{t('Language')}</span>
          <select
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
        </label>
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

// ---- Editor: Translations -----------------------------------------------------------

function TranslationsPanel({ api, entry, site, navigate }: EditorPanelProps) {
  const { t } = useT();
  const key = ['multilingual', 'translations', 'entry', entry.id];
  const queryClient = useQueryClient();
  const data = useQuery({
    queryKey: key,
    queryFn: () => api<TranslationsResponse>('GET', `/translations?kind=entry&ids=${entry.id}`),
  });
  const create = useMutation({
    mutationFn: (locale: string) =>
      api<{ id: string }>('POST', `/translations/entry/${entry.id}`, { locale }),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ['multilingual', 'translations'] });
      navigate(`/entries/${id}`);
    },
  });
  const links = data.data?.[entry.id]?.links ?? [];
  const nameOf = (code: string) => site.locales.find((l) => l.code === code)?.name ?? code;
  const missing = site.locales.filter(
    (l) => l.code !== entry.locale && !links.some((link) => link.locale === l.code),
  );

  return (
    <div className="space-y-2 text-sm">
      <p>{t('Written in {language}.', { language: nameOf(entry.locale) })}</p>
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
            </li>
          ))}
        </ul>
      )}
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
                <span className="sr-only">
                  {' '}
                  {t('{language}: {title}', {
                    language: l.name,
                    title: link.title || t('(no title)'),
                  })}
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
