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
import type { SeoConfig } from './config';

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
      <SitemapCard tr={tr} locale={props.user.locale} />
      {saved.error && <Alert>{errorMessage(saved.error)}</Alert>}
      {saved.data && (
        <SeoForm key={JSON.stringify(saved.data)} {...props} initial={saved.data} tr={tr} />
      )}
    </div>
  );
}

function SitemapCard({ tr, locale }: { tr: Tr; locale: string }) {
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
        <ol className="list-decimal space-y-1 pl-5 text-slate-700">
          <li>
            {tr('Open ', 'Apri ')}
            <a
              className="text-sky-700 underline"
              href="https://search.google.com/search-console"
              target="_blank"
              rel="noreferrer"
            >
              Google Search Console
            </a>
            {tr(
              ' and add the site (the verification code goes in Analytics → Search engines, or use the DNS record).',
              ' e aggiungi il sito (il codice di verifica va in Statistiche → Motori di ricerca, oppure usa il record DNS).',
            )}
          </li>
          <li>
            {tr('In ', 'In ')}
            <strong>{tr('Sitemaps', 'Sitemap')}</strong>
            {tr(', enter ', ', inserisci ')}
            <code>sitemap.xml</code>
            {tr(' and choose Submit.', ' e scegli Invia.')}
          </li>
          <li>
            {tr('Do the same in ', 'Fai lo stesso in ')}
            <a
              className="text-sky-700 underline"
              href="https://www.bing.com/webmasters"
              target="_blank"
              rel="noreferrer"
            >
              Bing Webmaster Tools
            </a>
            {tr(
              '. robots.txt already points to the sitemap, and it follows every change by itself.',
              '. robots.txt indica già la sitemap, e si aggiorna da sola a ogni modifica.',
            )}
          </li>
        </ol>
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
                <li key={s.loc} className="flex flex-wrap gap-x-3">
                  <a
                    className="text-sky-700 hover:underline"
                    href={s.loc}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {new URL(s.loc).pathname}
                  </a>
                  {s.lastmod && (
                    <span className="text-slate-500">
                      {new Date(s.lastmod).toLocaleString(locale)}
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
  pages: [
    {
      path: '',
      title: 'SEO',
      capability: 'manage_settings',
      component: SeoPage,
    },
  ],
});
