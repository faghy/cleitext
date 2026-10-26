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
import { useEffect, useId, useState } from 'react';
import { detectLanguages, matchLocale, scanWxr, sharedAddresses } from './languages';
import { scanPostsPermalink, type PostsPermalink } from './permalinks';
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

/** What the preview found in the file (read in the browser, before the upload). */
interface Preview {
  source: 'wpml' | 'polylang' | 'addresses' | null;
  found: { code: string; count: number; locale: string | null }[];
  main: string | null;
  shared: number;
  /** The structure of the posts' addresses in WordPress (1.31.0). */
  posts: PostsPermalink | null;
}

/** Files larger than this are not read for the preview (the import still recognises languages). */
const PREVIEW_MAX = 400 * 1024 * 1024;

async function preview(file: File, locales: string[]): Promise<Preview> {
  const xml = await file.text();
  const facts = scanWxr(xml);
  const detection = detectLanguages(facts, locales);
  return {
    source: detection.source,
    found: detection.found.map((f) => ({ ...f, locale: matchLocale(f.code, locales) })),
    main: detection.main,
    shared: sharedAddresses(facts),
    posts: scanPostsPermalink(xml),
  };
}

/** The addresses of the posts in WordPress, and whether they replace the site's. */
function Addresses({
  tr,
  posts,
  replace,
  setReplace,
}: {
  tr: Tr;
  posts: PostsPermalink | null;
  replace: boolean;
  setReplace: (value: boolean) => void;
}) {
  return (
    <fieldset
      className="space-y-2 rounded border border-slate-200 p-3"
      data-testid="import-addresses"
    >
      <legend className="px-1 text-sm font-medium text-slate-800">
        {tr('Addresses', 'Indirizzi')}
      </legend>
      {posts ? (
        <p className="text-sm text-slate-700">
          {tr('Posts in WordPress:', 'Articoli in WordPress:')} <code>{posts.wordpress}</code>
          {posts.cleitext
            ? tr(
                ` – here ${posts.cleitext}, so they keep their addresses.`,
                ` – qui ${posts.cleitext}, così mantengono i loro indirizzi.`,
              )
            : tr(
                ' – Cleitext cannot keep these: the old addresses redirect to the new ones.',
                ' – Cleitext non può mantenerli: i vecchi indirizzi portano a quelli nuovi.',
              )}
        </p>
      ) : null}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={replace}
          onChange={(e) => setReplace(e.target.checked)}
        />
        <span>
          {tr(
            'Use the addresses of WordPress also if this site already has posts, categories or tags (their current addresses redirect)',
            'Usa gli indirizzi di WordPress anche se questo sito ha già articoli, categorie o tag (i loro indirizzi attuali vengono reindirizzati)',
          )}
        </span>
      </label>
      <p className="text-xs text-slate-500">
        {tr(
          'On a site without posts the addresses of posts, categories and tags follow WordPress’s anyway. Otherwise the site keeps its own and the report says what differs.',
          'Su un sito senza articoli gli indirizzi di articoli, categorie e tag seguono comunque quelli di WordPress. Altrimenti il sito mantiene i suoi e il resoconto dice cosa cambia.',
        )}
      </p>
    </fieldset>
  );
}

const SOURCES: Record<string, [string, string]> = {
  wpml: ['WPML', 'WPML'],
  polylang: ['Polylang', 'Polylang'],
  addresses: ['the addresses (/en/…)', 'gli indirizzi (/en/…)'],
};

/** The languages found in the file, and which of the site's to import. */
function Languages({
  site,
  tr,
  data,
  chosen,
  setChosen,
}: Pick<AdminPageProps, 'site'> & {
  tr: Tr;
  data: Preview | null;
  chosen: string[];
  setChosen: (codes: string[]) => void;
}) {
  return (
    <fieldset
      className="space-y-2 rounded border border-slate-200 p-3"
      data-testid="import-languages"
    >
      <legend className="px-1 text-sm font-medium text-slate-800">
        {tr('Languages to import', 'Lingue da importare')}
      </legend>
      {data?.source ? (
        <p className="text-sm text-slate-700">
          {tr('Found by', 'Trovate da')} {tr(...SOURCES[data.source]!)}:{' '}
          {data.found
            .map(
              (f) =>
                `${f.code} (${f.count})${f.locale ? '' : tr(' – not on this site', ' – non presente nel sito')}`,
            )
            .join(', ')}
        </p>
      ) : data && data.shared > 0 ? (
        <p className="text-sm text-slate-700">
          {tr(
            `${data.shared} page(s) share their address with others: translations exported by WP-CLI, whose language is guessed from their text.`,
            `${data.shared} pagine condividono l’indirizzo con altre: traduzioni esportate da WP-CLI, la cui lingua viene riconosciuta dal testo.`,
          )}
        </p>
      ) : data ? (
        <p className="text-sm text-slate-700">
          {tr('No translations found in the file.', 'Nel file non ci sono traduzioni.')}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {site.locales.map((l) => (
          <label key={l.code} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={chosen.includes(l.code)}
              onChange={(e) =>
                setChosen(
                  e.target.checked ? [...chosen, l.code] : chosen.filter((c) => c !== l.code),
                )
              }
            />
            {l.name}
          </label>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        {tr(
          'Pages in a language left unchecked, or that the site does not have, are not imported (the report counts them): add the language with Multilingual and import the file again.',
          'Le pagine in una lingua non selezionata, o che il sito non ha, non vengono importate (il resoconto le conta): aggiungi la lingua con Multilingual e importa di nuovo il file.',
        )}
      </p>
    </fieldset>
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
  const defaultsId = useId();
  const [elementorDefaults, setElementorDefaults] = useState('auto');
  const [replacePermalinks, setReplacePermalinks] = useState(false);
  const [sent, setSent] = useState(0);
  const codes = site.locales.map((l) => l.code);
  const [found, setFound] = useState<Preview | null>(null);
  const [chosen, setChosen] = useState<string[]>(codes);
  // The file's languages, read here before the upload, to confirm or change them.
  useEffect(() => {
    setFound(null);
    if (!file || file.size > PREVIEW_MAX) return;
    let live = true;
    preview(file, codes)
      .then((data) => {
        if (!live) return;
        setFound(data);
        const present = data.found.map((f) => f.locale).filter((l): l is string => Boolean(l));
        if (present.length > 0) setChosen([...new Set([...present])]);
        const main = data.main ? matchLocale(data.main, codes) : null;
        if (main) setLocale(main);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [file]);
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
        ...(elementorDefaults !== 'auto' ? { elementorDefaults } : {}),
        ...(replacePermalinks ? { permalinks: 'replace' } : {}),
        // The languages confirmed in the preview (the content language always).
        ...(site.locales.length > 1
          ? { languages: [...new Set([locale, ...chosen])].join(',') }
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
          {site.locales.length > 1 && (
            <Languages site={site} tr={tr} data={found} chosen={chosen} setChosen={setChosen} />
          )}
          <Addresses
            tr={tr}
            posts={found?.posts ?? null}
            replace={replacePermalinks}
            setReplace={setReplacePermalinks}
          />
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
                    'The main language of the WordPress site. Pages translated with WPML or Polylang go into their own language.',
                    'La lingua principale del sito WordPress. Le pagine tradotte con WPML o Polylang vanno nella loro lingua.',
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
            <div className="space-y-1">
              <label htmlFor={defaultsId} className="block text-sm font-medium text-slate-800">
                {tr(
                  'Colors and fonts of Elementor widgets',
                  'Colori e font dei widget di Elementor',
                )}
              </label>
              <select
                id={defaultsId}
                className={select}
                value={elementorDefaults}
                onChange={(e) => setElementorDefaults(e.target.value)}
              >
                <option value="auto">{tr('Automatic', 'Automatico')}</option>
                <option value="kit">{tr('Elementor’s kit', 'Kit di Elementor')}</option>
                <option value="theme">{tr('From the theme', 'Dal tema')}</option>
              </select>
              <p className="text-xs text-slate-500">
                {tr(
                  'Choose “From the theme” if Elementor → Settings had “Disable Default Colors” and “Disable Default Fonts” on (the export does not say). Automatic takes the theme’s when the kit still has Elementor’s own colors. The kit’s global colors and fonts are kept either way.',
                  'Scegli «Dal tema» se in Elementor → Impostazioni erano attivi «Disattiva i colori predefiniti» e «Disattiva i font predefiniti» (l’esportazione non lo dice). Automatico usa quelli del tema quando il kit ha ancora i colori di Elementor. I colori e i font globali del kit vengono comunque conservati.',
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

const PHASES: Record<string, [string, string]> = {
  parsing: ['Reading the file', 'Lettura del file'],
  structure: ['Authors, categories and tags', 'Autori, categorie e tag'],
  media: ['Downloading media', 'Scaricamento dei file multimediali'],
  entries: ['Posts and pages', 'Articoli e pagine'],
  menus: ['Menus and redirects', 'Menu e redirect'],
  finishing: ['Finishing', 'Ultimi ritocchi'],
};

/** How far the job is, 0–1: reading counts little, media and entries the rest. */
function fraction(counts: NonNullable<Job['counts']>): number | null {
  const share = (part: { done: number; total: number }) =>
    part.total > 0 ? Math.min(1, part.done / part.total) : 1;
  switch (counts.phase) {
    case 'parsing':
      return null;
    case 'structure':
      return 0.05;
    case 'media':
      return 0.05 + 0.45 * share(counts.media);
    case 'entries':
      return 0.5 + 0.45 * share(counts.entries);
    default:
      return 0.97;
  }
}

function Progress({ job, tr, onCancel }: { job: Job; tr: Tr; onCancel: () => void }) {
  const counts = job.counts;
  const share = counts ? fraction(counts) : null;
  const phase = counts ? PHASES[counts.phase] : undefined;
  const [asked, setAsked] = useState(false);
  return (
    <Card title={tr('Importing…', 'Importazione in corso…')}>
      <div className="space-y-3" aria-live="polite">
        <p className="text-sm text-slate-700">
          {tr(
            `${job.file}: you can leave this page, the import goes on.`,
            `${job.file}: puoi lasciare questa pagina, l’importazione continua.`,
          )}
        </p>
        {counts && (
          <p className="text-sm font-medium text-slate-800" data-testid="import-phase">
            {phase ? tr(phase[0], phase[1]) : counts.phase}
          </p>
        )}
        <div
          className="h-2 overflow-hidden rounded bg-slate-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          {...(share !== null ? { 'aria-valuenow': Math.round(share * 100) } : {})}
        >
          {share === null ? (
            <div className="h-full w-1/3 animate-pulse rounded bg-sky-600" />
          ) : (
            <div
              className="h-full rounded bg-sky-600 transition-all"
              style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
            />
          )}
        </div>
        {counts?.parsed && (
          <ul className="grid gap-x-6 gap-y-1 text-sm text-slate-700 sm:grid-cols-2">
            <li>
              {tr('Media files', 'File multimediali')}:{' '}
              <strong>
                {counts.media.done}/{counts.media.total}
              </strong>
            </li>
            <li>
              {tr('Posts and pages', 'Articoli e pagine')}:{' '}
              <strong>
                {counts.entries.done}/{counts.entries.total}
              </strong>
            </li>
          </ul>
        )}
        {job.progress.length > 0 && (
          <ul className="space-y-0.5 font-mono text-xs text-slate-600">
            {job.progress.slice(-6).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
        <div>
          <Button
            variant="secondary"
            disabled={asked}
            onClick={() => {
              setAsked(true);
              onCancel();
            }}
          >
            {asked ? tr('Cancelling…', 'Annullamento…') : tr('Cancel', 'Annulla')}
          </Button>
          <p className="mt-1 text-xs text-slate-500">
            {tr(
              'It stops after the current item; what was imported is kept, and importing the same file again adds only the rest.',
              'Si ferma dopo l’elemento in corso; quello che è stato importato resta, e importando di nuovo lo stesso file si aggiunge solo il resto.',
            )}
          </p>
        </div>
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
      ) : job.status === 'cancelled' ? (
        <Alert>
          {tr(
            'The import was cancelled: what was imported so far is kept.',
            'L’importazione è stata annullata: quello che è stato importato finora resta.',
          )}
        </Alert>
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
  const cancel = useMutation({
    mutationFn: () => props.api('POST', '/cancel'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['wordpress-importer'] }),
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
        <Progress key={job.id} job={job} tr={tr} onCancel={() => cancel.mutate()} />
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
