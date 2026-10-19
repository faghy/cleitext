import {
  Alert,
  Button,
  Card,
  defineAdminPlugin,
  errorMessage,
  TextField,
  type AdminPageProps,
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

interface Product {
  slug: string;
  name: string;
  updatesMonths: number;
  demo: boolean;
  renewUrl: string | null;
}
interface Variant {
  provider: string;
  variantId: string;
  productSlug: string;
  seats: number;
  kind: 'new' | 'renewal';
}
interface Download {
  id: string;
  productSlug: string;
  version: string;
  licenseId: string | null;
  siteOrigin: string | null;
  createdAt: string;
}
interface Overview {
  products: Product[];
  variants: Variant[];
  downloads: Download[];
  repo: string;
  secrets: Record<'githubToken' | 'lemonSqueezySecret', boolean>;
}
interface LicenseRow {
  id: string;
  keyHint: string;
  productSlug: string;
  email: string;
  seats: number;
  used: number;
  updatesUntil: string | null;
  status: 'active' | 'revoked';
  source: string;
  orderRef: string | null;
  note: string | null;
  createdAt: string;
}
interface ActivationRow {
  id: string;
  siteOrigin: string;
  createdAt: string;
  lastSeenAt: string;
  deactivatedAt: string | null;
}

const T = {
  en: {
    title: 'Store',
    intro:
      'The license server of paid catalog themes. Buyers get a key by email; each site activates it once, then downloads the theme and its updates. Installed themes never stop working.',
    setup: 'Setup',
    server: 'License server (paid.licenseServer in catalog.config.json)',
    webhook: 'Lemon Squeezy webhook (events order_created and order_refunded)',
    repo: 'Private repository of the packages',
    repoMissing: 'Not set: Settings → Store.',
    githubToken: 'GitHub token (read access to the private repository)',
    lemonSqueezySecret: 'Lemon Squeezy signing secret',
    isSet: 'Set, kept encrypted.',
    notSet: 'Not set.',
    save: 'Save',
    remove: 'Remove',
    products: 'Products',
    productsHint: 'One per paid theme, with the slug of the theme.',
    slug: 'Slug',
    name: 'Name',
    months: 'Months of updates (0: no end)',
    demo: 'Demo downloadable without a license',
    renewUrl: 'Renewal checkout (https, optional)',
    saveProduct: 'Save product',
    variants: 'Lemon Squeezy variants',
    variantsHint:
      'What each variant sells: a new license for some sites (0: no limit), or a renewal of the updates. Renewals find the license through the custom data the renewal link carries.',
    variantId: 'Variant id',
    product: 'Product',
    seats: 'Sites',
    kind: 'Kind',
    newLicense: 'new license',
    renewal: 'renewal',
    saveVariant: 'Save variant',
    licenses: 'Licenses',
    search: 'Search by email, last characters of the key or order',
    create: 'New license by hand',
    email: 'Email',
    note: 'Note',
    send: 'Email the key to the buyer',
    createButton: 'Create license',
    created: 'License created. The key is shown only now:',
    mailed: 'It was emailed.',
    until: 'updates until {date}',
    forever: 'updates with no end',
    sitesUsed: '{used} of {total} sites',
    sitesUsedAny: '{used} sites (no limit)',
    revoke: 'Revoke',
    restore: 'Restore',
    extend: '+12 months',
    showSites: 'Sites',
    deactivate: 'Free this seat',
    noSites: 'No site has activated it.',
    revoked: 'revoked',
    none: 'None yet.',
    downloads: 'Latest downloads',
    demoDownload: 'demo',
    confirmRevoke: 'Revoke this license? Sites keep the theme but get no more downloads.',
  },
  it: {
    title: 'Store',
    intro:
      'Il server delle licenze dei temi a pagamento del catalogo. Chi compra riceve una chiave per email; ogni sito la attiva una volta, poi scarica il tema e i suoi aggiornamenti. I temi installati non smettono mai di funzionare.',
    setup: 'Configurazione',
    server: 'Server delle licenze (paid.licenseServer in catalog.config.json)',
    webhook: 'Webhook di Lemon Squeezy (eventi order_created e order_refunded)',
    repo: 'Repository privato dei pacchetti',
    repoMissing: 'Non impostato: Impostazioni → Store.',
    githubToken: 'Token di GitHub (lettura del repository privato)',
    lemonSqueezySecret: 'Segreto di firma di Lemon Squeezy',
    isSet: 'Impostato, conservato cifrato.',
    notSet: 'Non impostato.',
    save: 'Salva',
    remove: 'Rimuovi',
    products: 'Prodotti',
    productsHint: 'Uno per tema a pagamento, con lo slug del tema.',
    slug: 'Slug',
    name: 'Nome',
    months: 'Mesi di aggiornamenti (0: senza fine)',
    demo: 'Demo scaricabile senza licenza',
    renewUrl: 'Checkout del rinnovo (https, facoltativo)',
    saveProduct: 'Salva il prodotto',
    variants: 'Varianti di Lemon Squeezy',
    variantsHint:
      'Cosa vende ogni variante: una nuova licenza per un certo numero di siti (0: senza limite), o il rinnovo degli aggiornamenti. I rinnovi trovano la licenza dai dati personalizzati del link di rinnovo.',
    variantId: 'Id della variante',
    product: 'Prodotto',
    seats: 'Siti',
    kind: 'Tipo',
    newLicense: 'nuova licenza',
    renewal: 'rinnovo',
    saveVariant: 'Salva la variante',
    licenses: 'Licenze',
    search: 'Cerca per email, ultimi caratteri della chiave o ordine',
    create: 'Nuova licenza a mano',
    email: 'Email',
    note: 'Nota',
    send: 'Invia la chiave per email all’acquirente',
    createButton: 'Crea la licenza',
    created: 'Licenza creata. La chiave si vede solo adesso:',
    mailed: 'È stata inviata per email.',
    until: 'aggiornamenti fino al {date}',
    forever: 'aggiornamenti senza scadenza',
    sitesUsed: '{used} siti su {total}',
    sitesUsedAny: '{used} siti (senza limite)',
    revoke: 'Revoca',
    restore: 'Ripristina',
    extend: '+12 mesi',
    showSites: 'Siti',
    deactivate: 'Libera il posto',
    noSites: 'Nessun sito l’ha attivata.',
    revoked: 'revocata',
    none: 'Ancora nessuno.',
    downloads: 'Ultimi download',
    demoDownload: 'demo',
    confirmRevoke:
      'Revocare la licenza? I siti tengono il tema ma non possono più scaricare nulla.',
  },
};
type Strings = (typeof T)['en'];

const fill = (s: string, values: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));
const input =
  'rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-sky-600 focus:outline-none';

function Secret({
  name,
  label,
  set,
  t,
  api,
  onChange,
}: {
  name: string;
  label: string;
  set: boolean;
  t: Strings;
  api: AdminPageProps['api'];
  onChange: () => void;
}) {
  const [value, setValue] = useState('');
  const save = useMutation({
    mutationFn: () => api('PUT', `/admin/secrets/${name}`, { value }),
    onSuccess: () => {
      setValue('');
      onChange();
    },
  });
  const remove = useMutation({
    mutationFn: () => api('DELETE', `/admin/secrets/${name}`),
    onSuccess: onChange,
  });
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <TextField
        label={label}
        type="password"
        autoComplete="off"
        value={value}
        hint={set ? t.isSet : t.notSet}
        onChange={(e) => setValue(e.target.value)}
      />
      {(save.error ?? remove.error) && <Alert>{errorMessage(save.error ?? remove.error)}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={!value || save.isPending}>
          {t.save}
        </Button>
        {set && (
          <Button type="button" variant="danger" onClick={() => remove.mutate()}>
            {t.remove}
          </Button>
        )}
      </div>
    </form>
  );
}

function Activations({
  id,
  api,
  t,
  locale,
}: {
  id: string;
  api: AdminPageProps['api'];
  t: Strings;
  locale: string;
}) {
  const client = useQueryClient();
  const list = useQuery({
    queryKey: ['store', 'activations', id],
    queryFn: () => api<ActivationRow[]>('GET', `/admin/licenses/${id}/activations`),
  });
  const deactivate = useMutation({
    mutationFn: (activation: string) => api('POST', `/admin/activations/${activation}/deactivate`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['store'] }),
  });
  if (list.data?.length === 0) return <p className="text-sm text-slate-600">{t.noSites}</p>;
  return (
    <ul className="space-y-1 text-sm">
      {list.data?.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-2">
          <span className={a.deactivatedAt ? 'text-slate-400 line-through' : ''}>
            {a.siteOrigin}
          </span>
          <span className="text-xs text-slate-500">
            {new Date(a.createdAt).toLocaleDateString(locale)} –{' '}
            {new Date(a.deactivatedAt ?? a.lastSeenAt).toLocaleDateString(locale)}
          </span>
          {!a.deactivatedAt && (
            <Button variant="secondary" onClick={() => deactivate.mutate(a.id)}>
              {t.deactivate}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function StorePage({ api, user }: AdminPageProps) {
  const t = user.locale.startsWith('it') ? T.it : T.en;
  const locale = user.locale;
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ['store'] });
  const overview = useQuery({
    queryKey: ['store', 'overview'],
    queryFn: () => api<Overview>('GET', '/admin/overview'),
  });
  const [q, setQ] = useState('');
  const list = useQuery({
    queryKey: ['store', 'licenses', q],
    queryFn: () => api<LicenseRow[]>('GET', `/admin/licenses?q=${encodeURIComponent(q)}`),
  });
  const [open, setOpen] = useState<string | null>(null);

  const [product, setProduct] = useState({
    slug: '',
    name: '',
    updatesMonths: 12,
    demo: true,
    renewUrl: '',
  });
  const saveProduct = useMutation({
    mutationFn: () => api('PUT', `/admin/products/${product.slug}`, product),
    onSuccess: refresh,
  });
  const [variant, setVariant] = useState({ variantId: '', productSlug: '', seats: 1, kind: 'new' });
  const saveVariant = useMutation({
    mutationFn: () => api('PUT', '/admin/variants', variant),
    onSuccess: refresh,
  });
  const removeVariant = useMutation({
    mutationFn: (v: Variant) => api('DELETE', `/admin/variants/${v.provider}/${v.variantId}`),
    onSuccess: refresh,
  });
  const [draft, setDraft] = useState({
    productSlug: '',
    email: '',
    seats: 1,
    note: '',
    send: true,
  });
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string; key: string; mailed: boolean }>('POST', '/admin/licenses', draft),
    onSuccess: refresh,
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      api('POST', `/admin/licenses/${v.id}/status`, { status: v.status }),
    onSuccess: refresh,
  });
  const extend = useMutation({
    mutationFn: (id: string) => api('POST', `/admin/licenses/${id}/extend`, { months: 12 }),
    onSuccess: refresh,
  });

  const base = `${window.location.origin}/api/v1/ext/store/v1`;
  const data = overview.data;
  const submit = (fn: () => void) => (e: FormEvent) => {
    e.preventDefault();
    fn();
  };
  const actionError =
    saveProduct.error ??
    saveVariant.error ??
    removeVariant.error ??
    setStatus.error ??
    extend.error;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="text-sm text-slate-600">{t.intro}</p>
      </div>
      {overview.error && <Alert>{errorMessage(overview.error)}</Alert>}
      {actionError && <Alert>{errorMessage(actionError)}</Alert>}

      <Card title={t.setup}>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="font-medium">{t.server}</dt>
            <dd>
              <code className="break-all">{base}</code>
            </dd>
          </div>
          <div>
            <dt className="font-medium">{t.webhook}</dt>
            <dd>
              <code className="break-all">{base}/webhooks/lemonsqueezy</code>
            </dd>
          </div>
          <div>
            <dt className="font-medium">{t.repo}</dt>
            <dd>{data?.repo ? <code>{data.repo}</code> : t.repoMissing}</dd>
          </div>
        </dl>
        {data && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Secret
              name="githubToken"
              label={t.githubToken}
              set={data.secrets.githubToken}
              t={t}
              api={api}
              onChange={refresh}
            />
            <Secret
              name="lemonSqueezySecret"
              label={t.lemonSqueezySecret}
              set={data.secrets.lemonSqueezySecret}
              t={t}
              api={api}
              onChange={refresh}
            />
          </div>
        )}
      </Card>

      <Card title={t.products}>
        <p className="mb-3 text-sm text-slate-600">{t.productsHint}</p>
        {data?.products.length === 0 && <p className="text-sm text-slate-600">{t.none}</p>}
        <ul className="mb-4 space-y-1 text-sm">
          {data?.products.map((p) => (
            <li key={p.slug}>
              <button
                type="button"
                className="text-sky-700 underline"
                onClick={() => setProduct({ ...p, renewUrl: p.renewUrl ?? '' })}
              >
                {p.name}
              </button>{' '}
              <code>{p.slug}</code> · {p.updatesMonths || '∞'} · {p.demo ? t.demo : ''}
            </li>
          ))}
        </ul>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={submit(() => saveProduct.mutate())}>
          <TextField
            label={t.slug}
            value={product.slug}
            onChange={(e) => setProduct({ ...product, slug: e.target.value })}
          />
          <TextField
            label={t.name}
            value={product.name}
            onChange={(e) => setProduct({ ...product, name: e.target.value })}
          />
          <TextField
            label={t.months}
            type="number"
            min={0}
            max={120}
            value={product.updatesMonths}
            onChange={(e) => setProduct({ ...product, updatesMonths: Number(e.target.value) })}
          />
          <TextField
            label={t.renewUrl}
            value={product.renewUrl}
            onChange={(e) => setProduct({ ...product, renewUrl: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={product.demo}
              onChange={(e) => setProduct({ ...product, demo: e.target.checked })}
            />
            {t.demo}
          </label>
          <div>
            <Button type="submit" disabled={saveProduct.isPending}>
              {t.saveProduct}
            </Button>
          </div>
        </form>
      </Card>

      <Card title={t.variants}>
        <p className="mb-3 text-sm text-slate-600">{t.variantsHint}</p>
        <ul className="mb-4 space-y-1 text-sm">
          {data?.variants.map((v) => (
            <li key={`${v.provider}:${v.variantId}`} className="flex flex-wrap items-center gap-2">
              <code>{v.variantId}</code> → {v.productSlug} ·{' '}
              {v.kind === 'renewal'
                ? t.renewal
                : `${t.newLicense}, ${v.seats || '∞'} ${t.seats.toLowerCase()}`}
              <Button variant="danger" onClick={() => removeVariant.mutate(v)}>
                {t.remove}
              </Button>
            </li>
          ))}
        </ul>
        <form className="grid gap-3 md:grid-cols-4" onSubmit={submit(() => saveVariant.mutate())}>
          <TextField
            label={t.variantId}
            value={variant.variantId}
            onChange={(e) => setVariant({ ...variant, variantId: e.target.value })}
          />
          <label className="space-y-1 text-sm">
            <span className="block font-medium">{t.product}</span>
            <select
              className={`${input} w-full`}
              value={variant.productSlug}
              onChange={(e) => setVariant({ ...variant, productSlug: e.target.value })}
            >
              <option value="" />
              {data?.products.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="block font-medium">{t.kind}</span>
            <select
              className={`${input} w-full`}
              value={variant.kind}
              onChange={(e) => setVariant({ ...variant, kind: e.target.value })}
            >
              <option value="new">{t.newLicense}</option>
              <option value="renewal">{t.renewal}</option>
            </select>
          </label>
          <TextField
            label={t.seats}
            type="number"
            min={0}
            value={variant.seats}
            onChange={(e) => setVariant({ ...variant, seats: Number(e.target.value) })}
          />
          <div>
            <Button type="submit" disabled={saveVariant.isPending}>
              {t.saveVariant}
            </Button>
          </div>
        </form>
      </Card>

      <Card title={t.licenses}>
        <form
          className="mb-4 space-y-3 rounded border border-slate-200 p-3"
          onSubmit={submit(() => create.mutate())}
        >
          <h3 className="text-sm font-semibold">{t.create}</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="space-y-1 text-sm">
              <span className="block font-medium">{t.product}</span>
              <select
                className={`${input} w-full`}
                value={draft.productSlug}
                onChange={(e) => setDraft({ ...draft, productSlug: e.target.value })}
              >
                <option value="" />
                {data?.products.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <TextField
              label={t.email}
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
            <TextField
              label={t.seats}
              type="number"
              min={0}
              value={draft.seats}
              onChange={(e) => setDraft({ ...draft, seats: Number(e.target.value) })}
            />
            <TextField
              label={t.note}
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.send}
              onChange={(e) => setDraft({ ...draft, send: e.target.checked })}
            />
            {t.send}
          </label>
          {create.error && <Alert>{errorMessage(create.error)}</Alert>}
          {create.data && (
            <Alert kind="success">
              {t.created} <code className="select-all font-semibold">{create.data.key}</code>
              {create.data.mailed && ` ${t.mailed}`}
            </Alert>
          )}
          <Button type="submit" disabled={create.isPending}>
            {t.createButton}
          </Button>
        </form>

        <input
          className={`${input} mb-3 w-full`}
          aria-label={t.search}
          placeholder={t.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {list.error && <Alert>{errorMessage(list.error)}</Alert>}
        {list.data?.length === 0 && <p className="text-sm text-slate-600">{t.none}</p>}
        <ul className="divide-y divide-slate-100">
          {list.data?.map((l) => (
            <li key={l.id} className="space-y-2 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <code>…{l.keyHint}</code>
                <strong>{l.productSlug}</strong>
                <a className="text-sky-700" href={`mailto:${l.email}`}>
                  {l.email}
                </a>
                <span>
                  {l.seats === 0
                    ? fill(t.sitesUsedAny, { used: l.used })
                    : fill(t.sitesUsed, { used: l.used, total: l.seats })}
                </span>
                <span>
                  {l.updatesUntil
                    ? fill(t.until, { date: new Date(l.updatesUntil).toLocaleDateString(locale) })
                    : t.forever}
                </span>
                <span className="text-xs text-slate-500">
                  {l.source}
                  {l.orderRef && ` #${l.orderRef}`} ·{' '}
                  {new Date(l.createdAt).toLocaleDateString(locale)}
                  {l.note && ` · ${l.note}`}
                </span>
                {l.status === 'revoked' && (
                  <span className="font-medium text-red-700">{t.revoked}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setOpen(open === l.id ? null : l.id)}
                  aria-expanded={open === l.id}
                >
                  {t.showSites}
                </Button>
                {l.updatesUntil && (
                  <Button variant="secondary" onClick={() => extend.mutate(l.id)}>
                    {t.extend}
                  </Button>
                )}
                {l.status === 'active' ? (
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (window.confirm(t.confirmRevoke))
                        setStatus.mutate({ id: l.id, status: 'revoked' });
                    }}
                  >
                    {t.revoke}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => setStatus.mutate({ id: l.id, status: 'active' })}
                  >
                    {t.restore}
                  </Button>
                )}
              </div>
              {open === l.id && <Activations id={l.id} api={api} t={t} locale={locale} />}
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t.downloads}>
        {data?.downloads.length === 0 && <p className="text-sm text-slate-600">{t.none}</p>}
        <ul className="space-y-1 text-sm">
          {data?.downloads.map((d) => (
            <li key={d.id}>
              {new Date(d.createdAt).toLocaleString(locale)} · {d.productSlug} {d.version} ·{' '}
              {d.licenseId ? '' : `${t.demoDownload} · `}
              {d.siteOrigin ?? ''}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

interface InstallRow {
  origin: string;
  installId: string;
  coreVersion: string;
  themeSlug: string | null;
  themeVersion: string | null;
  plugins: { slug: string; version: string; active: boolean }[];
  themes: { slug: string; version: string }[];
  firstSeenAt: string;
  lastSeenAt: string;
}

const I = {
  en: {
    title: 'Installations',
    intro:
      'What Cleitext sites run, as they report it about once a day: the version of Cleitext, the theme and the plugins. Sites with INSTALL_REPORT_URL empty do not report.',
    byItem: 'By plugin and theme',
    bySite: 'By site',
    seen: 'Seen in the last',
    days: 'days',
    filter: 'Filter',
    none: 'No reports yet.',
    core: 'Cleitext',
    plugin: 'plugin',
    theme: 'theme',
    inUse: 'in use',
    installedOnly: 'installed, not active',
    sites: 'sites',
    server: 'server',
    lastSeen: 'last report',
    forget: 'Forget',
    confirmForget: 'Forget this site? It comes back with its next report.',
  },
  it: {
    title: 'Installazioni',
    intro:
      'Cosa usano i siti Cleitext, come lo comunicano circa una volta al giorno: la versione di Cleitext, il tema e i plugin. I siti con INSTALL_REPORT_URL vuoto non inviano nulla.',
    byItem: 'Per plugin e tema',
    bySite: 'Per sito',
    seen: 'Visti negli ultimi',
    days: 'giorni',
    filter: 'Filtra',
    none: 'Nessun resoconto ancora.',
    core: 'Cleitext',
    plugin: 'plugin',
    theme: 'tema',
    inUse: 'in uso',
    installedOnly: 'installato, non attivo',
    sites: 'siti',
    server: 'server',
    lastSeen: 'ultimo resoconto',
    forget: 'Dimentica',
    confirmForget: 'Dimenticare questo sito? Ricompare con il prossimo resoconto.',
  },
};

interface Usage {
  key: string;
  kind: 'core' | 'plugin' | 'theme';
  slug: string;
  versions: Map<string, { origin: string; active: boolean }[]>;
}

/** Plugin or theme → version → sites (in use first). */
function usageOf(rows: InstallRow[]): Usage[] {
  const all = new Map<string, Usage>();
  const add = (
    kind: Usage['kind'],
    slug: string,
    version: string,
    origin: string,
    active: boolean,
  ) => {
    const key = `${kind}:${slug}`;
    const usage = all.get(key) ?? { key, kind, slug, versions: new Map() };
    all.set(key, usage);
    const list = usage.versions.get(version || '?') ?? [];
    list.push({ origin, active });
    usage.versions.set(version || '?', list);
  };
  for (const row of rows) {
    add('core', 'cleitext', row.coreVersion, row.origin, true);
    for (const p of row.plugins) add('plugin', p.slug, p.version, row.origin, p.active);
    for (const t of row.themes) {
      add('theme', t.slug, t.version, row.origin, t.slug === row.themeSlug);
    }
    if (row.themeSlug && !row.themes.some((t) => t.slug === row.themeSlug)) {
      add('theme', row.themeSlug, row.themeVersion ?? '', row.origin, true);
    }
  }
  const order = { core: 0, theme: 1, plugin: 2 };
  return [...all.values()].sort(
    (a, b) => order[a.kind] - order[b.kind] || a.slug.localeCompare(b.slug),
  );
}

const byVersion = (a: string, b: string) =>
  b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });

function InstallationsPage({ api, user }: AdminPageProps) {
  const t = user.locale.startsWith('it') ? I.it : I.en;
  const locale = user.locale;
  const client = useQueryClient();
  const [days, setDays] = useState(90);
  const [view, setView] = useState<'items' | 'sites'>('items');
  const [q, setQ] = useState('');
  const rows = useQuery({
    queryKey: ['store', 'installs', days],
    queryFn: () => api<InstallRow[]>('GET', `/admin/installs?days=${days}`),
  });
  const forget = useMutation({
    mutationFn: (origin: string) => api('DELETE', '/admin/installs', { origin }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['store', 'installs'] }),
  });
  const needle = q.trim().toLowerCase();
  const data = rows.data ?? [];
  const usages = usageOf(data).filter((u) => !needle || u.slug.includes(needle));
  const sites = data.filter(
    (r) =>
      !needle ||
      r.origin.includes(needle) ||
      r.plugins.some((p) => p.slug.includes(needle)) ||
      (r.themeSlug ?? '').includes(needle),
  );
  const tab = (id: 'items' | 'sites', label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === id}
      className={`-mb-px border-b-2 px-3 py-2 text-sm ${view === id ? 'border-sky-700 font-medium text-sky-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
      onClick={() => setView(id)}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-5xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="text-sm text-slate-600">{t.intro}</p>
      </div>
      {rows.error && <Alert>{errorMessage(rows.error)}</Alert>}
      {forget.error && <Alert>{errorMessage(forget.error)}</Alert>}
      <div className="flex flex-wrap items-end gap-4">
        <label className="block space-y-1 text-sm">
          <span className="block font-medium text-slate-800">{t.seen}</span>
          <select
            className="rounded border border-slate-300 bg-white px-2 py-2"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 30, 90, 365].map((d) => (
              <option key={d} value={d}>
                {d} {t.days}
              </option>
            ))}
          </select>
        </label>
        <TextField label={t.filter} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex gap-1 border-b border-slate-200" role="tablist">
        {tab('items', t.byItem)}
        {tab('sites', `${t.bySite} (${data.length})`)}
      </div>
      {rows.data && data.length === 0 && <p className="text-sm text-slate-600">{t.none}</p>}
      {view === 'items' &&
        usages.map((u) => {
          const total = new Set([...u.versions.values()].flat().map((s) => s.origin)).size;
          return (
            <Card
              key={u.key}
              title={`${u.kind === 'core' ? t.core : u.slug} · ${u.kind === 'core' ? '' : `${t[u.kind]} · `}${total} ${t.sites}`}
            >
              <table className="w-full text-left text-sm">
                <tbody>
                  {[...u.versions.entries()]
                    .sort(([a], [b]) => byVersion(a, b))
                    .map(([version, list]) => (
                      <tr key={version} className="border-b border-slate-100 align-top">
                        <td className="w-28 py-2 font-mono">{version}</td>
                        <td className="py-2">
                          <ul className="space-y-0.5">
                            {[...list]
                              .sort((a, b) => Number(b.active) - Number(a.active))
                              .map((s) => (
                                <li key={s.origin}>
                                  <a className="text-sky-700 hover:underline" href={s.origin}>
                                    {s.origin.replace(/^https?:\/\//, '')}
                                  </a>
                                  {u.kind !== 'core' && (
                                    <span className="ml-2 text-xs text-slate-500">
                                      {s.active ? t.inUse : t.installedOnly}
                                    </span>
                                  )}
                                </li>
                              ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
          );
        })}
      {view === 'sites' &&
        sites.map((r) => (
          <Card key={r.origin} title={r.origin.replace(/^https?:\/\//, '')}>
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="font-medium">{t.core}</dt>
              <dd className="font-mono">{r.coreVersion}</dd>
              <dt className="font-medium">{t.theme}</dt>
              <dd>
                {r.themeSlug} <span className="font-mono">{r.themeVersion}</span>
              </dd>
              <dt className="font-medium">plugin</dt>
              <dd>
                {r.plugins
                  .filter((p) => p.active)
                  .map((p) => `${p.slug} ${p.version}`)
                  .join(', ') || '—'}
              </dd>
              <dt className="font-medium">{t.server}</dt>
              <dd className="font-mono text-xs">{r.installId.slice(0, 8)}</dd>
              <dt className="font-medium">{t.lastSeen}</dt>
              <dd>{new Date(r.lastSeenAt).toLocaleString(locale)}</dd>
            </dl>
            <div className="mt-3">
              <Button
                variant="secondary"
                onClick={() => {
                  if (window.confirm(t.confirmForget)) forget.mutate(r.origin);
                }}
              >
                {t.forget}
              </Button>
            </div>
          </Card>
        ))}
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Store', it: 'Store' },
      capability: 'manage_store',
      component: StorePage,
      // A shopping bag.
      icon: 'M5.5 8h13l-1 12.5h-11z M9 10.5V7a3 3 0 0 1 6 0v3.5',
    },
    {
      path: 'installations',
      title: { en: 'Installations', it: 'Installazioni' },
      parent: '',
      capability: 'manage_store',
      component: InstallationsPage,
    },
  ],
});
