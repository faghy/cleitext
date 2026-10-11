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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DEFAULT_TITLE, TITLE_VARIABLES, type SeoConfig } from './config';
import { SeoAnalysisPanel } from './panel';

interface TypeView {
  slug: string;
  name: string | Record<string, string>;
}
interface TaxonomyView {
  slug: string;
  name: string | Record<string, string>;
}

type Tr = (en: string, it: string) => string;

/** The sitemaps listed in /sitemap.xml, read as the search engines do. */
async function sitemapIndex(): Promise<{ loc: string; lastmod: string }[]> {
  const res = await fetch('/sitemap.xml', { credentials: 'omit' });
  if (!res.ok) throw new Error(`sitemap.xml: ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'application/xml');
  return [...doc.getElementsByTagName('sitemap')].map((node) => ({
    loc: node.getElementsByTagName('loc')[0]?.textContent ?? '',
    lastmod: node.getElementsByTagName('lastmod')[0]?.textContent ?? '',
  }));
}

function SeoPage(props: AdminPageProps) {
  const it = props.user.locale.startsWith('it');
  const tr: Tr = (en, itText) => (it ? itText : en);
  const saved = useQuery({
    queryKey: ['seo', 'config'],
    queryFn: () => props.api<SeoConfig>('GET', '/config'),
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">SEO</h1>
      <SitemapCard tr={tr} locale={props.user.locale} api={props.api} />
      {saved.error && <Alert>{errorMessage(saved.error)}</Alert>}
      {saved.data && (
        <SeoForm key={JSON.stringify(saved.data)} {...props} initial={saved.data} tr={tr} />
      )}
    </div>
  );
}

function SitemapCard({ tr, locale, api }: { tr: Tr; locale: string; api: AdminPageProps['api'] }) {
  const address = `${window.location.origin}/sitemap.xml`;
  const [copied, setCopied] = useState(false);
  const index = useQuery({ queryKey: ['seo', 'sitemaps'], queryFn: sitemapIndex });
  return (
    <Card title={tr('XML sitemap', 'Sitemap XML')}>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded border border-slate-200 bg-slate-50 px-3 py-2 select-all">
            {address}
          </code>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(address);
              setCopied(true);
            }}
          >
            {copied ? tr('Copied', 'Copiato') : tr('Copy', 'Copia')}
          </Button>
          <a
            className="text-sky-700 hover:underline"
            href="/sitemap.xml"
            target="_blank"
            rel="noreferrer"
          >
            {tr('Open', 'Apri')}
          </a>
        </div>
        <Verification tr={tr} api={api} />
        {index.error && <Alert>{errorMessage(index.error)}</Alert>}
        {index.data && (
          <details>
            <summary className="cursor-pointer text-slate-700">
              {tr(
                `${index.data.length} sitemaps in the index`,
                `${index.data.length} sitemap nell’indice`,
              )}
            </summary>
            <ul className="mt-2 space-y-1">
              {index.data.map((s) => (
                <li key={s.loc} className="flex flex-wrap items-baseline gap-x-3">
                  <a
                    className="text-sky-700 hover:underline"
                    href={s.loc}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {new URL(s.loc).pathname}
                  </a>
                  {s.lastmod && (
                    <span className="text-xs text-slate-500">
                      {tr('changed', 'modificata il')} {new Date(s.lastmod).toLocaleString(locale)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}

interface VerificationView {
  host: string;
  dns: { domain: string; google: boolean; bing: boolean }[];
  meta: { google: boolean; bing: boolean };
}

const link = (href: string, label: string) => (
  <a className="text-sky-700 underline" href={href} target="_blank" rel="noreferrer">
    {label}
  </a>
);

/** How Search Console sees the site: a domain property (DNS) or an address prefix (tag). */
function Verification({ tr, api }: { tr: Tr; api: AdminPageProps['api'] }) {
  const check = useQuery({
    queryKey: ['seo', 'verification'],
    queryFn: () => api<VerificationView>('GET', '/verification'),
  });
  const v = check.data;
  const dns = v?.dns.find((d) => d.google);
  const searchConsole = link('https://search.google.com/search-console', 'Google Search Console');
  const domain = v ? v.host.split('.').slice(-2).join('.') : '';
  return (
    <div className="space-y-2 text-slate-700">
      {check.isPending && (
        <p className="text-slate-500">
          {tr('Checking the verification…', 'Controllo della verifica…')}
        </p>
      )}
      {dns ? (
        <p className="rounded bg-emerald-50 px-3 py-2 text-emerald-900">
          ✓{' '}
          {tr(
            `Verified with a DNS record on ${dns.domain}: in Search Console the site is a Domain property, so there is no tag to paste.`,
            `Verificato con un record DNS su ${dns.domain}: in Search Console il sito è una proprietà Dominio, quindi non c’è nessun tag da incollare.`,
          )}
        </p>
      ) : v?.meta.google ? (
        <p className="rounded bg-emerald-50 px-3 py-2 text-emerald-900">
          ✓{' '}
          {tr(
            'The home page has the Google verification tag (property by URL prefix).',
            'La home ha il tag di verifica di Google (proprietà con prefisso URL).',
          )}
        </p>
      ) : (
        v && (
          <div className="rounded bg-amber-50 px-3 py-2 text-amber-900">
            <p>
              {tr(
                'The site is not verified for Google yet. Two ways, in ',
                'Il sito non è ancora verificato per Google. Due modi, in ',
              )}
              {searchConsole}:
            </p>
            <ul className="mt-1 list-disc pl-5">
              <li>
                <strong>{tr('Domain', 'Dominio')}</strong>{' '}
                {tr(
                  `(recommended): add the TXT record Google gives you to the DNS of ${domain}. It covers every subdomain and protocol, and needs no tag.`,
                  `(consigliato): aggiungi al DNS di ${domain} il record TXT che ti dà Google. Copre tutti i sottodomini e i protocolli, e non serve nessun tag.`,
                )}
              </li>
              <li>
                <strong>{tr('URL prefix', 'Prefisso URL')}</strong>{' '}
                {tr(
                  '— choose the HTML tag and paste it in Analytics → Search engines.',
                  '— scegli il tag HTML e incollalo in Statistiche → Motori di ricerca.',
                )}
              </li>
            </ul>
          </div>
        )
      )}
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          {tr('In ', 'In ')}
          {searchConsole}
          {tr(', open ', ', apri ')}
          <strong>{tr('Sitemaps', 'Sitemap')}</strong>
          {tr(', enter ', ', inserisci ')}
          <code>sitemap.xml</code>
          {tr(' and choose Submit.', ' e scegli Invia.')}
        </li>
        <li>
          {link('https://www.bing.com/webmasters', 'Bing Webmaster Tools')}
          {tr(
            ' can import the site and its sitemap from Search Console in one click.',
            ' può importare il sito e la sua sitemap da Search Console con un clic.',
          )}
          {v?.dns.some((d) => d.bing) || v?.meta.bing
            ? tr(' Bing: verified ✓', ' Bing: verificato ✓')
            : ''}
        </li>
        <li>
          {tr(
            'robots.txt already points to the sitemap, and it follows every change by itself.',
            'robots.txt indica già la sitemap, e si aggiorna da sola a ogni modifica.',
          )}
        </li>
      </ol>
    </div>
  );
}

function SeoForm({ api, initial, tr, user }: AdminPageProps & { initial: SeoConfig; tr: Tr }) {
  const queryClient = useQueryClient();
  const [cfg, setCfg] = useState(initial);
  const [profiles, setProfiles] = useState(initial.representation.sameAs.join('\n'));
  const types = useQuery({
    queryKey: ['content-types'],
    queryFn: () => coreApi<TypeView[]>('GET', '/content-types'),
  });
  const taxonomies = useQuery({
    queryKey: ['taxonomies'],
    queryFn: () => coreApi<TaxonomyView[]>('GET', '/taxonomies'),
  });
  const save = useMutation({
    mutationFn: () =>
      api<SeoConfig>('PUT', '/config', {
        ...cfg,
        representation: {
          ...cfg.representation,
          sameAs: profiles
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: async (next) => {
      queryClient.setQueryData(['seo', 'config'], next);
      await queryClient.invalidateQueries({ queryKey: ['seo', 'sitemaps'] });
    },
  });
  const toggle = (key: 'hiddenTypes' | 'hiddenTaxonomies', slug: string, show: boolean) =>
    setCfg((c) => ({
      ...c,
      [key]: show ? c[key].filter((s) => s !== slug) : [...c[key], slug],
    }));
  const rep = cfg.representation;
  const setRep = (change: Partial<SeoConfig['representation']>) =>
    setCfg((c) => ({ ...c, representation: { ...c.representation, ...change } }));
  const name = (n: TypeView['name']) => labelText(n, user.locale);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Card title={tr('Search appearance', 'Aspetto nei risultati di ricerca')}>
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            {tr(
              'What should appear in search results. What you turn off gets a noindex and leaves the sitemap, like a single page set to “Hide from search engines”.',
              'Cosa deve comparire nei risultati di ricerca. Ciò che spegni riceve un noindex ed esce dalla sitemap, come una singola pagina con “Nascondi ai motori di ricerca”.',
            )}
          </p>
          <fieldset className="space-y-2">
            <legend className="font-medium text-slate-800">
              {tr('Content types', 'Tipi di contenuto')}
            </legend>
            {types.data?.map((t) => (
              <label key={t.slug} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!cfg.hiddenTypes.includes(t.slug)}
                  onChange={(e) => toggle('hiddenTypes', t.slug, e.target.checked)}
                />
                {tr(
                  `Show ${name(t.name)} in search results`,
                  `Mostra ${name(t.name)} nei risultati`,
                )}
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="font-medium text-slate-800">
              {tr('Archives of taxonomies', 'Archivi delle tassonomie')}
            </legend>
            {taxonomies.data?.map((t) => (
              <label key={t.slug} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!cfg.hiddenTaxonomies.includes(t.slug)}
                  onChange={(e) => toggle('hiddenTaxonomies', t.slug, e.target.checked)}
                />
                {tr(
                  `Show ${name(t.name)} archives in search results`,
                  `Mostra gli archivi di ${name(t.name)} nei risultati`,
                )}
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cfg.sitemapImages}
              onChange={(e) => setCfg((c) => ({ ...c, sitemapImages: e.target.checked }))}
            />
            {tr(
              'List the images of each page in the sitemap',
              'Elenca nella sitemap le immagini di ogni pagina',
            )}
          </label>
          <p className="text-xs text-slate-500">
            {tr(
              'Title separator, default description and X account are in Settings → SEO.',
              'Separatore del titolo, descrizione predefinita e account X sono in Impostazioni → SEO.',
            )}
          </p>
        </div>
      </Card>

      <Card title={tr('Titles', 'Titoli')}>
        <div className="max-w-2xl space-y-3 text-sm">
          <p className="text-slate-600">
            {tr(
              'How the title in search results is built for each content type. Variables: ',
              'Come si compone il titolo nei risultati per ogni tipo di contenuto. Variabili: ',
            )}
            {TITLE_VARIABLES.map((v) => (
              <code key={v} className="mr-1">{`%%${v}%%`}</code>
            ))}
          </p>
          {types.data?.map((t) => (
            <TextField
              key={t.slug}
              label={name(t.name)}
              placeholder={DEFAULT_TITLE}
              value={cfg.titles[t.slug] ?? ''}
              onChange={(e) =>
                setCfg((c) => ({ ...c, titles: { ...c.titles, [t.slug]: e.target.value } }))
              }
            />
          ))}
        </div>
      </Card>

      <Card title={tr('Site representation', 'Rappresentazione del sito')}>
        <div className="max-w-2xl space-y-3 text-sm">
          <p className="text-slate-600">
            {tr(
              'Who is behind the site: Google can show it in the knowledge panel (schema.org Organization or Person).',
              'Chi c’è dietro il sito: Google può mostrarlo nel pannello informativo (schema.org Organization o Person).',
            )}
          </p>
          <div className="flex gap-4">
            {(['organization', 'person'] as const).map((kind) => (
              <label key={kind} className="flex items-center gap-2">
                <input type="radio" checked={rep.kind === kind} onChange={() => setRep({ kind })} />
                {kind === 'organization'
                  ? tr('Organization', 'Organizzazione')
                  : tr('Person', 'Persona')}
              </label>
            ))}
          </div>
          <TextField
            label={
              rep.kind === 'organization'
                ? tr('Organization name', 'Nome dell’organizzazione')
                : tr('Name', 'Nome')
            }
            value={rep.name}
            onChange={(e) => setRep({ name: e.target.value })}
          />
          <TextField
            label={
              rep.kind === 'organization'
                ? tr('Logo address', 'Indirizzo del logo')
                : tr('Photo address', 'Indirizzo della foto')
            }
            hint={tr(
              'The full address of an image, e.g. from Media.',
              'L’indirizzo completo di un’immagine, per esempio dai Media.',
            )}
            value={rep.logo}
            onChange={(e) => setRep({ logo: e.target.value })}
          />
          <label className="block space-y-1">
            <span className="block font-medium text-slate-800">
              {tr('Social profiles', 'Profili social')}
            </span>
            <textarea
              rows={4}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5"
              placeholder="https://www.linkedin.com/company/…"
              value={profiles}
              onChange={(e) => setProfiles(e.target.value)}
            />
            <span className="block text-xs text-slate-500">
              {tr('One address per line.', 'Un indirizzo per riga.')}
            </span>
          </label>
        </div>
      </Card>

      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      {save.isSuccess && <Alert kind="success">{tr('Saved.', 'Salvato.')}</Alert>}
      <Button type="submit" disabled={save.isPending}>
        {tr('Save', 'Salva')}
      </Button>
    </form>
  );
}

export default defineAdminPlugin({
  editorPanels: [
    {
      id: 'seo-analysis',
      title: { en: 'SEO analysis', it: 'Analisi SEO' },
      types: ['page', 'article'],
      capability: 'edit_entries',
      component: SeoAnalysisPanel,
    },
  ],
  pages: [
    {
      path: '',
      title: 'SEO',
      capability: 'manage_settings',
      component: SeoPage,
    },
  ],
});
