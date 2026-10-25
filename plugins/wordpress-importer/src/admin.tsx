import {
  type AdminPageProps,
  adminUrl,
  Alert,
  Button,
  Card,
  defineAdminPlugin,
  errorMessage,
  uploadFile,
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import type { Job } from './server';

type Tr = (en: string, it: string) => string;

const KINDS: Record<string, [string, string]> = {
  entries: ['posts and pages', 'articoli e pagine'],
  media: ['media files', 'file multimediali'],
  terms: ['categories and tags', 'categorie e tag'],
  menus: ['menus', 'menu'],
  menuItems: ['menu items', 'voci di menu'],
  users: ['authors', 'autori'],
  redirects: ['redirects', 'redirect'],
  comments: ['comments', 'commenti'],
  contentTypes: ['content types', 'tipi di contenuto'],
  taxonomies: ['taxonomies', 'tassonomie'],
  locales: ['languages', 'lingue'],
  additionalCss: ['Additional CSS', 'CSS aggiuntivo'],
};

function Counts({ counts, tr }: { counts: Record<string, number>; tr: Tr }) {
  const items = Object.entries(counts).filter(([, n]) => n > 0);
  if (items.length === 0)
    return <p className="text-sm text-slate-600">{tr('Nothing.', 'Niente.')}</p>;
  return (
    <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      {items.map(([kind, n]) => (
        <li key={kind}>
          <strong>{n}</strong> {KINDS[kind] ? tr(...KINDS[kind]) : kind}
        </li>
      ))}
    </ul>
  );
}

function Messages({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <details className="rounded border border-slate-200">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        {title} ({items.length})
      </summary>
      <ul className="max-h-80 list-disc space-y-1 overflow-auto border-t border-slate-100 py-2 pl-8 pr-3 text-sm text-slate-700">
        {items.slice(0, 500).map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
    </details>
  );
}

function Upload({ site, tr, onStarted }: AdminPageProps & { tr: Tr; onStarted: () => void }) {
  const fileId = useId();
  const localeId = useId();
  const roleId = useId();
  const commentsId = useId();
  const [file, setFile] = useState<File | null>(null);
  const optionsId = useId();
  const [optionsFile, setOptionsFile] = useState<File | null>(null);
  const [locale, setLocale] = useState(site.defaultLocale);
  const [role, setRole] = useState('author');
  const [comments, setComments] = useState('approved');
  const captchaId = useId();
  const [formCaptcha, setFormCaptcha] = useState('');
  const [sent, setSent] = useState(0);
  const start = useMutation({
    mutationFn: async () => {
      // Divi's theme options go first: the import of the export reads them.
      if (optionsFile) {
        await uploadFile(optionsFile, { path: '/ext/wordpress-importer/divi-options' });
      }
      const query = new URLSearchParams({
        ...(optionsFile ? { diviOptions: '1' } : {}),
        locale,
        authorRole: role,
        comments,
        ...(formCaptcha ? { formCaptcha } : {}),
        // All the site's languages: pages translated with WPML go into theirs.
        ...(site.locales.length > 1
          ? { languages: site.locales.map((l) => l.code).join(',') }
          : {}),
      });
      return uploadFile(file!, {
        path: `/ext/wordpress-importer/imports?${query.toString()}`,
        onProgress: setSent,
      });
    },
    onSuccess: onStarted,
  });
  const select = 'w-full rounded border border-slate-300 px-3 py-2 text-sm';

  return (
    <div className="space-y-4">
      <Card title={tr('1. Export from WordPress', '1. Esporta da WordPress')}>
        <p className="text-sm text-slate-700">
          {tr(
            'In the WordPress admin open Tools → Export, choose “All content” and press “Download Export File”. You get an .xml file.',
            'Nell’amministrazione di WordPress apri Strumenti → Esporta, scegli «Tutti i contenuti» e premi «Scarica il file di esportazione». Ottieni un file .xml.',
          )}
        </p>
      </Card>
      <Card title={tr('2. Import it here', '2. Importalo qui')}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (file) start.mutate();
          }}
        >
          <div className="space-y-1">
            <label htmlFor={fileId} className="block text-sm font-medium text-slate-800">
              {tr('WordPress export file (.xml)', 'File di esportazione di WordPress (.xml)')}
            </label>
            <input
              id={fileId}
              type="file"
              accept=".xml,application/xml,text/xml"
              required
              className="block w-full text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={optionsId} className="block text-sm font-medium text-slate-800">
              {tr(
                'Divi theme options (et_divi.json, optional)',
                'Opzioni del tema Divi (et_divi.json, facoltativo)',
              )}
            </label>
            <input
              id={optionsId}
              type="file"
              accept=".json,application/json"
              className="block w-full text-sm"
              onChange={(e) => setOptionsFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-slate-600">
              {tr(
                'Sites built with Divi: its theme options (Divi → Theme Options → export, or the et_divi option) bring the global colors, fonts, presets and layout of the pages.',
                'Siti fatti con Divi: le sue opzioni del tema (Divi → Opzioni del tema → esporta, o l’opzione et_divi) portano i colori globali, i caratteri, i preset e il layout delle pagine.',
              )}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {site.locales.length > 1 && (
              <div className="space-y-1">
                <label htmlFor={localeId} className="block text-sm font-medium text-slate-800">
                  {tr('Language of the content', 'Lingua dei contenuti')}
                </label>
                <select
                  id={localeId}
                  className={select}
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                >
                  {site.locales.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">
                  {tr(
                    'Pages translated with WPML are recognised and go into their own language.',
                    'Le pagine tradotte con WPML vengono riconosciute e vanno nella loro lingua.',
                  )}
                </p>
              </div>
            )}
            <div className="space-y-1">
              <label htmlFor={roleId} className="block text-sm font-medium text-slate-800">
                {tr('Role of the imported authors', 'Ruolo degli autori importati')}
              </label>
              <select
                id={roleId}
                className={select}
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="author">{tr('Author', 'Autore')}</option>
                <option value="contributor">{tr('Contributor', 'Collaboratore')}</option>
                <option value="editor">{tr('Editor', 'Editore')}</option>
                <option value="subscriber">{tr('Subscriber', 'Sottoscrittore')}</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor={commentsId} className="block text-sm font-medium text-slate-800">
                {tr('Comments', 'Commenti')}
              </label>
              <select
                id={commentsId}
                className={select}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
              >
                <option value="approved">
                  {tr('Approved ones only', 'Solo quelli approvati')}
                </option>
                <option value="all">
                  {tr(
                    'All: also waiting for approval and spam',
                    'Tutti: anche quelli in attesa e lo spam',
                  )}
                </option>
                <option value="skip">{tr('None', 'Nessuno')}</option>
              </select>
              <p className="text-xs text-slate-500">
                {tr(
                  'Choose “None” if comments were closed and only old spam is left. Pingbacks and trackbacks are never imported.',
                  'Scegli «Nessuno» se i commenti erano chiusi ed è rimasto solo vecchio spam. Pingback e trackback non vengono mai importati.',
                )}
              </p>
            </div>
            <div className="space-y-1">
              <label htmlFor={captchaId} className="block text-sm font-medium text-slate-800">
                {tr('Form protection', 'Protezione dei moduli')}
              </label>
              <select
                id={captchaId}
                className={select}
                value={formCaptcha}
                onChange={(e) => setFormCaptcha(e.target.value)}
              >
                <option value="">{tr('None', 'Nessuna')}</option>
                <option value="site">
                  {tr('Site captcha (Captcha plugin)', 'Captcha del sito (plugin Captcha)')}
                </option>
                <option value="turnstile">
                  {tr(
                    'Cloudflare Turnstile (Fresco Pro keys)',
                    'Cloudflare Turnstile (chiavi di Fresco Pro)',
                  )}
                </option>
              </select>
              <p className="text-xs text-slate-500">
                {formCaptcha === 'turnstile'
                  ? tr(
                      'Every imported form gets Turnstile (reCAPTCHA fields are dropped either way): add its keys in Fresco Pro → Forms → Spam protection, or the Captcha plugin’s are used.',
                      'Ogni modulo importato avrà Turnstile (i campi reCAPTCHA vengono comunque tolti): inserisci le chiavi in Fresco Pro → Moduli → Protezione dallo spam, altrimenti si usano quelle del plugin Captcha.',
                    )
                  : tr(
                      'Every imported form uses the site captcha (reCAPTCHA fields are dropped either way): activate the free Captcha plugin and set Turnstile or reCAPTCHA once in Settings → Captcha.',
                      'Ogni modulo importato usa il captcha del sito (i campi reCAPTCHA vengono comunque tolti): attiva il plugin gratuito Captcha e imposta Turnstile o reCAPTCHA una volta in Impostazioni → Captcha.',
                    )}
              </p>
            </div>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>
              {tr(
                'Images and files are downloaded from the WordPress site: keep it online until the import ends.',
                'Immagini e file vengono scaricati dal sito WordPress: tienilo online finché l’importazione non finisce.',
              )}
            </li>
            <li>
              {tr(
                'Nothing already on this site is overwritten; the old addresses redirect to the new pages.',
                'Niente di quello che c’è già su questo sito viene sovrascritto; i vecchi indirizzi portano alle nuove pagine.',
              )}
            </li>
            <li>
              {tr(
                'Authors get an account without a password: they set one with “Forgot password”.',
                'Gli autori ricevono un account senza password: la impostano con «Password dimenticata».',
              )}
            </li>
          </ul>
          {start.isError && <Alert>{errorMessage(start.error)}</Alert>}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!file || start.isPending}>
              {start.isPending
                ? tr(
                    `Uploading… ${Math.round(sent * 100)}%`,
                    `Caricamento… ${Math.round(sent * 100)}%`,
                  )
                : tr('Import', 'Importa')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Progress({ job, tr }: { job: Job; tr: Tr }) {
  return (
    <Card title={tr('Importing…', 'Importazione in corso…')}>
      <div className="space-y-3" aria-live="polite">
        <p className="text-sm text-slate-700">
          {tr(
            `${job.file}: you can leave this page, the import goes on.`,
            `${job.file}: puoi lasciare questa pagina, l’importazione continua.`,
          )}
        </p>
        <div className="h-2 overflow-hidden rounded bg-slate-100">
          <div className="h-full w-1/3 animate-pulse rounded bg-sky-600" />
        </div>
        {job.progress.length > 0 && (
          <ul className="space-y-0.5 font-mono text-xs text-slate-600">
            {job.progress.slice(-6).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Result({ job, tr, onReset }: { job: Job; tr: Tr; onReset: () => void }) {
  const report = job.report;
  return (
    <div className="space-y-4">
      {job.status === 'failed' ? (
        <Alert>{job.error ?? tr('The import failed.', 'L’importazione non è riuscita.')}</Alert>
      ) : (
        <Alert kind="success">
          {tr(`${job.file} imported.`, `${job.file} importato.`)}{' '}
          {report && report.errors.length > 0
            ? tr(
                'Some records could not be imported: see below.',
                'Alcuni elementi non sono stati importati: vedi sotto.',
              )
            : ''}
        </Alert>
      )}
      {report && (
        <Card title={tr('Report', 'Resoconto')}>
          <div className="space-y-4">
            <div>
              <h3 className="mb-1 text-sm font-semibold">{tr('Created', 'Creati')}</h3>
              <Counts counts={report.created} tr={tr} />
            </div>
            {Object.values(report.skipped).some((n) => n > 0) && (
              <div>
                <h3 className="mb-1 text-sm font-semibold">
                  {tr('Already on the site, left as they are', 'Già presenti, lasciati come sono')}
                </h3>
                <Counts counts={report.skipped} tr={tr} />
              </div>
            )}
            <Messages title={tr('Not imported', 'Non importati')} items={report.errors} />
            <Messages
              title={tr('Adapted or left out', 'Adattati o tralasciati')}
              items={report.warnings}
            />
          </div>
        </Card>
      )}
      <div className="flex flex-wrap gap-3">
        <a
          href={adminUrl('/content/article')}
          className="rounded bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800"
        >
          {tr('See the posts', 'Vai agli articoli')}
        </a>
        <Button variant="secondary" onClick={onReset}>
          {tr('Import another file', 'Importa un altro file')}
        </Button>
      </div>
    </div>
  );
}

function ImporterPage(props: AdminPageProps) {
  const it = props.user.locale.startsWith('it');
  const tr: Tr = (en, itText) => (it ? itText : en);
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ['wordpress-importer', 'status'],
    queryFn: () => props.api<{ job: Job | null }>('GET', '/status'),
    refetchInterval: (query) => (query.state.data?.job?.status === 'running' ? 2_000 : false),
  });
  const reset = useMutation({
    mutationFn: () => props.api('DELETE', '/status'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wordpress-importer'] }),
  });
  const job = status.data?.job ?? null;

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">
        {tr('Import from WordPress', 'Importa da WordPress')}
      </h1>
      <p className="text-sm text-slate-700">
        {tr(
          'Brings posts, pages, images, categories, tags, menus and authors of a WordPress site into this one.',
          'Porta su questo sito articoli, pagine, immagini, categorie, tag, menu e autori di un sito WordPress.',
        )}
      </p>
      {status.isPending ? (
        <p className="text-sm text-slate-500">{tr('Loading…', 'Caricamento…')}</p>
      ) : status.isError ? (
        <Alert>{errorMessage(status.error)}</Alert>
      ) : job?.status === 'running' ? (
        <Progress job={job} tr={tr} />
      ) : job ? (
        <Result job={job} tr={tr} onReset={() => reset.mutate()} />
      ) : (
        <Upload
          {...props}
          tr={tr}
          onStarted={() => queryClient.invalidateQueries({ queryKey: ['wordpress-importer'] })}
        />
      )}
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Import from WordPress', it: 'Importa da WordPress' },
      capability: 'import_wordpress',
      component: ImporterPage,
      // An arrow into a tray.
      icon: 'M12 3.5v10.5 M8 10l4 4 4-4 M4 14.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-4.5',
    },
  ],
});
