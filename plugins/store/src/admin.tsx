import {
  Alert,
  Button,
  Card,
  defineAdminPlugin,
  errorMessage,
  TextField,
  uploadFile,
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

interface PublicFile {
  productSlug: string;
  version: string;
  filename: string;
  sha256: string;
  size: number;
  downloads: number;
  createdAt: string;
}

const D = {
  en: {
    title: 'Public downloads',
    hint: 'Free files anyone can download, such as the Cleitext Toolkit for Plesk. Each version is published once and never changes; /downloads/<product>/latest.json always describes the highest version.',
    product: 'Product',
    version: 'Version (e.g. 0.6.0-1)',
    file: 'File (.zip)',
    upload: 'Publish',
    uploading: 'Publishing…',
    published: 'Published.',
    latest: 'Latest (manifest)',
    downloads: 'downloads',
    remove: 'Delete',
    confirmRemove: 'Delete this version? Its address stops working.',
    none: 'No public files yet.',
  },
  it: {
    title: 'Download pubblici',
    hint: 'File gratuiti che chiunque può scaricare, come il Cleitext Toolkit per Plesk. Ogni versione si pubblica una volta e non cambia più; /downloads/<prodotto>/latest.json descrive sempre la versione più alta.',
    product: 'Prodotto',
    version: 'Versione (es. 0.6.0-1)',
    file: 'File (.zip)',
    upload: 'Pubblica',
    uploading: 'Pubblicazione…',
    published: 'Pubblicato.',
    latest: 'Ultima (manifest)',
    downloads: 'download',
    remove: 'Elimina',
    confirmRemove: 'Eliminare questa versione? Il suo indirizzo smette di funzionare.',
    none: 'Ancora nessun file pubblico.',
  },
};

const sizeOf = (bytes: number) =>
  bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

function PublicDownloads({
  api,
  locale,
  products,
}: {
  api: AdminPageProps['api'];
  locale: string;
  products: Product[];
}) {
  const t = locale.startsWith('it') ? D.it : D.en;
  const client = useQueryClient();
  const list = useQuery({
    queryKey: ['store', 'files'],
    queryFn: () => api<PublicFile[]>('GET', '/admin/files'),
  });
  const [slug, setSlug] = useState('');
  const [version, setVersion] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const publish = useMutation({
    mutationFn: () =>
      uploadFile(file!, {
        path: `/ext/store/admin/products/${encodeURIComponent(slug)}/files?version=${encodeURIComponent(version.trim())}`,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['store', 'files'] }),
  });
  const remove = useMutation({
    mutationFn: (f: PublicFile) =>
      api(
        'DELETE',
        `/admin/products/${encodeURIComponent(f.productSlug)}/files/${encodeURIComponent(f.version)}`,
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['store', 'files'] }),
  });
  const origin = window.location.origin;
  const slugs = [...new Set((list.data ?? []).map((f) => f.productSlug))];
  return (
    <Card title={t.title}>
      <p className="mb-3 text-sm text-slate-600">{t.hint}</p>
      {(list.error ?? publish.error ?? remove.error) && (
        <Alert>{errorMessage(list.error ?? publish.error ?? remove.error)}</Alert>
      )}
      {publish.isSuccess && <p className="mb-2 text-sm text-emerald-700">{t.published}</p>}
      <form
        className="mb-4 grid gap-3 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (slug && version.trim() && file) publish.mutate();
        }}
      >
        <label className="space-y-1 text-sm">
          <span className="block font-medium">{t.product}</span>
          <select
            className={`${input} w-full`}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          >
            <option value="" />
            {products.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <TextField label={t.version} value={version} onChange={(e) => setVersion(e.target.value)} />
        <label className="space-y-1 text-sm">
          <span className="block font-medium">{t.file}</span>
          <input
            type="file"
            accept=".zip,application/zip"
            className="block w-full text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <div className="flex items-end">
          <Button type="submit" disabled={publish.isPending || !slug || !version.trim() || !file}>
            {publish.isPending ? t.uploading : t.upload}
          </Button>
        </div>
      </form>
      {list.data?.length === 0 && <p className="text-sm text-slate-600">{t.none}</p>}
      {slugs.map((s) => (
        <p key={s} className="mb-2 text-sm">
          {t.latest}:{' '}
          <a
            className="break-all text-sky-700 underline"
            href={`${origin}/downloads/${s}/latest.json`}
          >
            {origin}/downloads/{s}/latest.json
          </a>
        </p>
      ))}
      <ul className="space-y-3 text-sm">
        {list.data?.map((f) => (
          <li key={`${f.productSlug}:${f.version}`} className="rounded border border-slate-200 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{f.productSlug}</strong> <code>{f.version}</code> · {sizeOf(f.size)} ·{' '}
              {f.downloads} {t.downloads} · {new Date(f.createdAt).toLocaleDateString(locale)}
              <Button
                variant="danger"
                onClick={() => {
                  if (window.confirm(t.confirmRemove)) remove.mutate(f);
                }}
              >
                {t.remove}
              </Button>
            </div>
            <a
              className="block break-all text-sky-700 underline"
              href={`${origin}/downloads/${f.productSlug}/${f.filename}`}
            >
              {origin}/downloads/{f.productSlug}/{f.filename}
            </a>
            <code className="block break-all text-xs text-slate-600">SHA-256 {f.sha256}</code>
          </li>
        ))}
      </ul>
    </Card>
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

      <PublicDownloads api={api} locale={locale} products={data?.products ?? []} />

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
      'What Cleitext sites run, as they report it about once a day: the version of Cleitext, the theme and the plugins. Sites can turn it off in Settings → General; sites not seen for 180 days are deleted.',
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
    summary: 'Summary',
    totalSites: 'Sites',
    totalServers: 'Servers',
    totalCore: 'Cleitext versions',
    item: 'Name',
    kind: 'Type',
    active: 'In use',
    inactive: 'Installed only',
    versions: 'Versions',
    byPlugin: 'Plugin',
    byTheme: 'Theme',
    any: 'All',
    clear: 'Clear filters',
    installedOn: 'installed on',
    usedOn: 'in use on',
    only: 'installed only on',
  },
  it: {
    title: 'Installazioni',
    intro:
      'Cosa usano i siti Cleitext, come lo comunicano circa una volta al giorno: la versione di Cleitext, il tema e i plugin. I siti possono spegnerlo in Impostazioni → Generali; quelli non visti da 180 giorni vengono cancellati.',
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
    summary: 'Riepilogo',
    totalSites: 'Siti',
    totalServers: 'Server',
    totalCore: 'Versioni di Cleitext',
    item: 'Nome',
    kind: 'Tipo',
    active: 'In uso',
    inactive: 'Solo installato',
    versions: 'Versioni',
    byPlugin: 'Plugin',
    byTheme: 'Tema',
    any: 'Tutti',
    clear: 'Togli i filtri',
    installedOn: 'installato su',
    usedOn: 'in uso su',
    only: 'solo installato su',
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

interface ServerReportRow {
  productSlug: string;
  serverHash: string;
  productVersion: string;
  panel: string;
  panelVersion: string;
  installations: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

const P = {
  en: {
    title: 'Plesk servers (Cleitext Toolkit)',
    hint: 'Servers whose administrator chose to send anonymous statistics from the Toolkit (off by default): a hash naming the server, the versions and how many Cleitext installations it manages. No domain, address or IP is kept.',
    servers: 'servers',
    installations: 'Cleitext installations',
    byVersion: 'By Toolkit version',
    byPanel: 'By Plesk version',
    server: 'Server',
    version: 'Toolkit',
    panel: 'Panel',
    firstSeen: 'First seen',
    lastSeen: 'Last report',
    none: 'No reports yet.',
  },
  it: {
    title: 'Server Plesk (Cleitext Toolkit)',
    hint: 'I server il cui amministratore ha scelto di inviare statistiche anonime dal Toolkit (spento di serie): un hash che identifica il server, le versioni e quante installazioni di Cleitext gestisce. Nessun dominio, indirizzo o IP viene conservato.',
    servers: 'server',
    installations: 'installazioni di Cleitext',
    byVersion: 'Per versione del Toolkit',
    byPanel: 'Per versione di Plesk',
    server: 'Server',
    version: 'Toolkit',
    panel: 'Pannello',
    firstSeen: 'Prima volta',
    lastSeen: 'Ultimo invio',
    none: 'Ancora nessun invio.',
  },
};

function ServerReports({
  api,
  locale,
  days,
}: {
  api: AdminPageProps['api'];
  locale: string;
  days: number;
}) {
  const t = locale.startsWith('it') ? P.it : P.en;
  const rows = useQuery({
    queryKey: ['store', 'server-reports', days],
    queryFn: () => api<ServerReportRow[]>('GET', `/admin/server-reports?days=${days}`),
  });
  const data = rows.data ?? [];
  const total = data.reduce((n, r) => n + r.installations, 0);
  const group = (key: (r: ServerReportRow) => string) => {
    const map = new Map<string, { servers: number; installations: number }>();
    for (const r of data) {
      const g = map.get(key(r)) ?? { servers: 0, installations: 0 };
      g.servers++;
      g.installations += r.installations;
      map.set(key(r), g);
    }
    return [...map].sort((a, b) => b[1].servers - a[1].servers);
  };
  const breakdown = (title: string, groups: ReturnType<typeof group>) => (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <ul className="space-y-0.5 text-sm">
        {groups.map(([name, g]) => (
          <li key={name}>
            <code>{name}</code>: {g.servers} {t.servers}, {g.installations} {t.installations}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <Card title={t.title}>
      <p className="mb-3 text-sm text-slate-600">{t.hint}</p>
      {rows.error && <Alert>{errorMessage(rows.error)}</Alert>}
      {data.length === 0 ? (
        <p className="text-sm text-slate-600">{t.none}</p>
      ) : (
        <div className="space-y-4">
          <p className="text-lg">
            <strong>{data.length}</strong> {t.servers} · <strong>{total}</strong> {t.installations}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {breakdown(
              t.byVersion,
              group((r) => r.productVersion),
            )}
            {breakdown(
              t.byPanel,
              group((r) => `${r.panel} ${r.panelVersion}`),
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-1 pr-3">{t.server}</th>
                  <th className="py-1 pr-3">{t.version}</th>
                  <th className="py-1 pr-3">{t.panel}</th>
                  <th className="py-1 pr-3">Cleitext</th>
                  <th className="py-1 pr-3">{t.firstSeen}</th>
                  <th className="py-1">{t.lastSeen}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr
                    key={`${r.productSlug}:${r.serverHash}`}
                    className="border-b border-slate-100"
                  >
                    <td className="py-1 pr-3 font-mono text-xs">{r.serverHash.slice(0, 8)}</td>
                    <td className="py-1 pr-3 font-mono">{r.productVersion}</td>
                    <td className="py-1 pr-3">
                      {r.panel} <span className="font-mono">{r.panelVersion}</span>
                    </td>
                    <td className="py-1 pr-3">{r.installations}</td>
                    <td className="py-1 pr-3">
                      {new Date(r.firstSeenAt).toLocaleDateString(locale)}
                    </td>
                    <td className="py-1">{new Date(r.lastSeenAt).toLocaleString(locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

function InstallationsPage({ api, user }: AdminPageProps) {
  const t = user.locale.startsWith('it') ? I.it : I.en;
  const locale = user.locale;
  const client = useQueryClient();
  const [days, setDays] = useState(90);
  const [view, setView] = useState<'items' | 'sites'>('items');
  const [q, setQ] = useState('');
  const [plugin, setPlugin] = useState('');
  const [theme, setTheme] = useState('');
  const rows = useQuery({
    queryKey: ['store', 'installs', days],
    queryFn: () => api<InstallRow[]>('GET', `/admin/installs?days=${days}`),
  });
  const forget = useMutation({
    mutationFn: (origin: string) => api('DELETE', '/admin/installs', { origin }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['store', 'installs'] }),
  });
  const needle = q.trim().toLowerCase();
  const all = rows.data ?? [];
  // Every plugin and theme reported, for the filters.
  const pluginSlugs = [...new Set(all.flatMap((r) => r.plugins.map((p) => p.slug)))].sort();
  const themeSlugs = [
    ...new Set(all.flatMap((r) => [r.themeSlug ?? '', ...r.themes.map((x) => x.slug)])),
  ]
    .filter(Boolean)
    .sort();
  // The sites using the chosen plugin (active) and theme (the site's own).
  // The sites where the chosen plugin and theme are installed (in use or not).
  const hasPlugin = (r: InstallRow) => r.plugins.some((p) => p.slug === plugin);
  const hasTheme = (r: InstallRow) =>
    r.themeSlug === theme || r.themes.some((x) => x.slug === theme);
  const data = all.filter((r) => (!plugin || hasPlugin(r)) && (!theme || hasTheme(r)));
  // The totals of the chosen plugin or theme, on all the sites.
  const chosen = [
    ...(plugin
      ? [
          {
            name: plugin,
            entries: all.flatMap((r) =>
              r.plugins
                .filter((p) => p.slug === plugin)
                .map((p) => ({ version: p.version, active: p.active })),
            ),
          },
        ]
      : []),
    ...(theme
      ? [
          {
            name: theme,
            entries: all.filter(hasTheme).map((r) => ({
              version:
                r.themes.find((x) => x.slug === theme)?.version ??
                (r.themeSlug === theme ? (r.themeVersion ?? '') : ''),
              active: r.themeSlug === theme,
            })),
          },
        ]
      : []),
  ];
  const servers = new Set(data.map((r) => r.installId)).size;
  const coreVersions = new Set(data.map((r) => r.coreVersion)).size;
  const summary = usageOf(data).map((u) => {
    const entries = [...u.versions.values()].flat();
    return {
      ...u,
      active: new Set(entries.filter((e) => e.active).map((e) => e.origin)).size,
      inactive: new Set(entries.filter((e) => !e.active).map((e) => e.origin)).size,
    };
  });
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
      <ServerReports api={api} locale={locale} days={days} />
      {forget.error && <Alert>{errorMessage(forget.error)}</Alert>}
      <div className="flex flex-wrap items-end gap-4">
        <label className="block space-y-1 text-sm">
          <span className="block font-medium text-slate-800">{t.seen}</span>
          <select
            className="rounded border border-slate-300 bg-white px-2 py-2"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 30, 90, 180].map((d) => (
              <option key={d} value={d}>
                {d} {t.days}
              </option>
            ))}
          </select>
        </label>
        <TextField label={t.filter} value={q} onChange={(e) => setQ(e.target.value)} />
        {(
          [
            [t.byPlugin, plugin, setPlugin, pluginSlugs],
            [t.byTheme, theme, setTheme, themeSlugs],
          ] as const
        ).map(([label, value, set, options]) => (
          <label key={label} className="block space-y-1 text-sm">
            <span className="block font-medium text-slate-800">{label}</span>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-2"
              value={value}
              onChange={(e) => set(e.target.value)}
            >
              <option value="">{t.any}</option>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        ))}
        {(plugin || theme) && (
          <button
            type="button"
            className="py-2 text-sm text-sky-700 hover:underline"
            onClick={() => {
              setPlugin('');
              setTheme('');
            }}
          >
            {t.clear}
          </button>
        )}
      </div>
      {chosen.map((c) => {
        const versions = new Map<string, number>();
        for (const e of c.entries)
          versions.set(e.version || '?', (versions.get(e.version || '?') ?? 0) + 1);
        const used = c.entries.filter((e) => e.active).length;
        return (
          <div key={c.name} className="rounded border border-sky-200 bg-sky-50 p-4" role="status">
            <p className="text-lg">
              <strong>{c.name}</strong>: {t.installedOn}{' '}
              <strong className="text-2xl">{c.entries.length}</strong> {t.sites}
            </p>
            <p className="text-sm text-slate-700">
              {t.usedOn} {used} · {t.only} {c.entries.length - used} ·{' '}
              <span className="font-mono text-xs">
                {[...versions.entries()]
                  .sort(([a], [b]) => byVersion(a, b))
                  .map(([v, n]) => `${v} (${n})`)
                  .join(' · ')}
              </span>
            </p>
          </div>
        );
      })}
      {all.length > 0 && (
        <Card title={t.summary}>
          <dl className="mb-4 grid grid-cols-3 gap-4 text-center">
            {(
              [
                [t.totalSites, data.length],
                [t.totalServers, servers],
                [t.totalCore, coreVersions],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="rounded bg-slate-50 p-3">
                <dt className="text-xs text-slate-600">{label}</dt>
                <dd className="text-2xl font-semibold">{n}</dd>
              </div>
            ))}
          </dl>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-600">
                  <th className="py-2 pr-3 font-medium">{t.item}</th>
                  <th className="py-2 pr-3 font-medium">{t.kind}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t.active}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t.inactive}</th>
                  <th className="py-2 pl-6 font-medium">{t.versions}</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((u) => (
                  <tr key={u.key} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3">
                      {u.kind === 'core' ? (
                        t.core
                      ) : (
                        <button
                          type="button"
                          className="text-sky-700 hover:underline"
                          onClick={() =>
                            u.kind === 'plugin' ? setPlugin(u.slug) : setTheme(u.slug)
                          }
                        >
                          {u.slug}
                        </button>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-600">
                      {u.kind === 'core' ? '' : t[u.kind]}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-medium">{u.active}</td>
                    <td className="py-1.5 pr-3 text-right text-slate-600">{u.inactive || ''}</td>
                    <td className="py-1.5 pl-6 font-mono text-xs">
                      {[...u.versions.entries()]
                        .sort(([a], [b]) => byVersion(a, b))
                        .map(([v, list]) => `${v} (${new Set(list.map((x) => x.origin)).size})`)
                        .join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <div className="flex gap-1 border-b border-slate-200" role="tablist">
        {tab('items', t.byItem)}
        {tab('sites', `${t.bySite} (${data.length})`)}
      </div>
      {rows.data && all.length === 0 && <p className="text-sm text-slate-600">{t.none}</p>}
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
