import { Alert, errorMessage, useT, type AdminPageProps } from '@cleitext/admin-sdk';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { ProductListItem } from '../list';
import { ImportPanel } from './import';
import { ProductForm } from './product-form';
import {
  core,
  formatMoney,
  moneyInput,
  termPaths,
  useAddress,
  useSetup,
  type ProductList,
  type ProductView,
  type Setup,
  type ShopApi,
  productCount,
} from './shared';
import { CSS } from './styles';

/** Shop → Products: the list, or the form of one product (`?product=`). */
export function ProductsPage(props: AdminPageProps) {
  const address = useAddress();
  const [params, setParams] = useState(() => address.read());
  useEffect(() => {
    const update = () => setParams(address.read());
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  const editing = params.get('product');
  return (
    <div className="sh">
      <style>{CSS}</style>
      {editing ? (
        <ProductForm
          key={editing}
          {...props}
          id={editing === 'new' ? null : editing}
          onClose={() => address.go({ product: null })}
          onCreated={(id) => address.go({ product: id }, true)}
        />
      ) : (
        <ProductListPage {...props} params={params} go={address.go} />
      )}
    </div>
  );
}

const STATUSES = ['published', 'draft', 'pending', 'private', 'trashed'] as const;
const FILTER_KEYS = [
  'locale',
  'q',
  'category',
  'brand',
  'status',
  'stock',
  'condition',
  'sale',
  'kind',
  'sort',
  'dir',
  'page',
  'perPage',
];

function ProductListPage({
  api,
  site,
  user,
  params,
  go,
}: AdminPageProps & {
  params: URLSearchParams;
  go: (params: Record<string, string | null>, replace?: boolean) => void;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const setup = useSetup(api);
  const locale = params.get('locale') ?? site.defaultLocale;
  const query = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = key === 'locale' ? locale : params.get(key);
    if (value) query.set(key, value);
  }
  const list = useQuery({
    queryKey: ['shop', 'products', query.toString()],
    queryFn: () => api<ProductList>('GET', `/products?${query}`),
    placeholderData: keepPreviousData,
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [importing, setImporting] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['shop', 'products'] });

  /** Changes filters; the page goes back to the first one. */
  const filter = (changes: Record<string, string | null>) => {
    setSelected([]);
    go({ page: null, ...changes }, true);
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get('q') ?? '') !== search.trim()) filter({ q: search.trim() || null });
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const bulk = useMutation({
    mutationFn: async (action: 'publish' | 'trash' | 'restore' | 'delete' | 'duplicate') => {
      for (const id of selected) {
        if (action === 'duplicate') await api('POST', `/products/${id}/duplicate`);
        else if (action === 'delete') await core('DELETE', `/entries/${id}`);
        else await core('POST', `/entries/${id}/${action}`);
      }
    },
    onSuccess: async () => {
      setSelected([]);
      await refresh();
    },
  });

  if (setup.isPending) return <p className="sh-muted">{t('Loading…')}</p>;
  if (setup.error) return <Alert>{errorMessage(setup.error)}</Alert>;
  const data = list.data;
  const currency = setup.data.settings.currency;
  const categories = setup.data.categories.filter((c) => c.locale === locale);
  const paths = termPaths(categories);
  const brandsHere = data?.brands ?? [];
  const statusFilter = params.get('status');
  const page = Number(params.get('page') ?? 1);
  const perPage = Number(params.get('perPage') ?? 50);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / perPage));
  const sort = params.get('sort') ?? 'updated';
  const dir = params.get('dir');
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  const sortBy = (key: string) =>
    filter({ sort: key, dir: sort === key ? (dir === 'asc' ? 'desc' : 'asc') : null });
  const sortMark = (key: string) => (sort === key ? (dir === 'asc' ? ' ↑' : ' ↓') : '');
  const radio = (key: string, options: [string | null, string][]) => (
    <div className="sh-seg" role="group">
      {options.map(([value, label]) => (
        <button
          key={label}
          type="button"
          aria-pressed={(params.get(key) ?? null) === value}
          onClick={() => filter({ [key]: value })}
        >
          {label}
        </button>
      ))}
    </div>
  );
  const totalAll = Object.entries(data?.statuses ?? {})
    .filter(([s]) => s !== 'trashed')
    .reduce((sum, [, n]) => sum + n, 0);

  return (
    <div className="sh-stack">
      <div className="sh-row sh-between">
        <h1>{t('Products')}</h1>
        <div className="sh-row">
          {site.locales.length > 1 && (
            <label className="sh-row">
              <span className="sh-muted">{t('Language')}</span>
              <select
                value={locale}
                onChange={(e) => filter({ locale: e.target.value, category: null, brand: null })}
              >
                {site.locales.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <a className="sh-btn" href={`/api/v1/ext/shop/export.csv?${query}`} download>
            {t('Export CSV')}
          </a>
          <button
            type="button"
            className="sh-btn"
            aria-expanded={importing}
            onClick={() => setImporting(!importing)}
          >
            {t('Import CSV')}
          </button>
          <button
            type="button"
            className="sh-btn sh-btn-primary"
            onClick={() => go({ product: 'new' })}
          >
            {t('Add product')}
          </button>
        </div>
      </div>

      {importing && <ImportPanel api={api} site={site} onClose={() => setImporting(false)} />}

      <nav className="sh-tabs" aria-label={t('Status')}>
        <button type="button" aria-current={!statusFilter} onClick={() => filter({ status: null })}>
          {t('All')} ({totalAll})
        </button>
        {STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            aria-current={statusFilter === status}
            onClick={() => filter({ status })}
          >
            {t(STATUS_LABEL[status] ?? status)} ({data?.statuses[status] ?? 0})
          </button>
        ))}
      </nav>

      <div className="sh-card sh-filters">
        <label className="sh-field">
          <span>{t('Search')}</span>
          <input
            type="search"
            value={search}
            placeholder={t('Name, code or GTIN')}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="sh-field">
          <span>{t('Category')}</span>
          <select
            value={params.get('category') ?? ''}
            onChange={(e) => filter({ category: e.target.value || null, brand: null })}
          >
            <option value="">{t('All categories')}</option>
            {[...paths.entries()]
              .sort((a, b) => a[1].path.localeCompare(b[1].path))
              .map(([id, info]) => (
                <option key={id} value={id}>
                  {info.path}
                </option>
              ))}
          </select>
        </label>
        <label className="sh-field">
          <span>{t('Brand')}</span>
          <select
            value={params.get('brand') ?? ''}
            onChange={(e) => filter({ brand: e.target.value || null })}
          >
            <option value="">{t('All brands')}</option>
            {brandsHere.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name} ({brand.count})
              </option>
            ))}
          </select>
        </label>
        <div className="sh-field">
          <span>{t('Stock')}</span>
          {radio('stock', [
            [null, t('All')],
            ['instock', t('In stock')],
            ['outofstock', t('Out of stock')],
            ['low', t('Low')],
          ])}
        </div>
        <div className="sh-field">
          <span>{t('Condition')}</span>
          {radio('condition', [
            [null, t('All')],
            ['new', t('New')],
            ['used', t('Used')],
            ['refurbished', t('Refurbished')],
          ])}
        </div>
        <label className="sh-check">
          <input
            type="checkbox"
            checked={params.get('sale') === '1'}
            onChange={(e) => filter({ sale: e.target.checked ? '1' : null })}
          />
          {t('On sale')}
        </label>
        {[...params.keys()].some(
          (k) =>
            FILTER_KEYS.includes(k) && !['locale', 'sort', 'dir', 'perPage', 'page'].includes(k),
        ) && (
          <button
            type="button"
            className="sh-link"
            onClick={() => {
              setSearch('');
              filter(
                Object.fromEntries(FILTER_KEYS.filter((k) => k !== 'locale').map((k) => [k, null])),
              );
            }}
          >
            {t('Clear filters')}
          </button>
        )}
      </div>

      {list.error && <Alert>{errorMessage(list.error)}</Alert>}
      {bulk.error && <Alert>{errorMessage(bulk.error)}</Alert>}

      <div className="sh-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="sh-table" aria-busy={list.isFetching}>
          <thead>
            <tr>
              <th style={{ width: '2rem' }}>
                <input
                  type="checkbox"
                  aria-label={t('Select all')}
                  checked={
                    Boolean(data?.items.length) && data!.items.every((p) => selected.includes(p.id))
                  }
                  onChange={(e) =>
                    setSelected(e.target.checked ? (data?.items.map((p) => p.id) ?? []) : [])
                  }
                />
              </th>
              <th className="sh-hide-sm">
                <span className="sh-sr">{t('Image')}</span>
              </th>
              <th>
                <button type="button" onClick={() => sortBy('title')}>
                  {t('Name')}
                  {sortMark('title')}
                </button>
              </th>
              <th className="sh-hide-sm">
                <button type="button" onClick={() => sortBy('sku')}>
                  {t('Code')}
                  {sortMark('sku')}
                </button>
              </th>
              <th className="num">
                <button type="button" onClick={() => sortBy('price')}>
                  {t('Price')}
                  {sortMark('price')}
                </button>
              </th>
              <th className="num sh-hide-sm">{t('Cost / list')}</th>
              <th className="num sh-hide-sm">{t('Margin')}</th>
              <th className="num">
                <button type="button" onClick={() => sortBy('stock')}>
                  {t('Stock')}
                  {sortMark('stock')}
                </button>
              </th>
              <th className="num sh-hide-sm">
                <button type="button" onClick={() => sortBy('sales')}>
                  {t('Sold')}
                  {sortMark('sales')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((product) => (
              <ProductRowView
                key={product.id}
                api={api}
                product={product}
                selected={selected.includes(product.id)}
                currency={currency}
                locale={user.locale}
                category={
                  product.categoryIds[0] ? paths.get(product.categoryIds[0])?.path : undefined
                }
                onToggle={() => toggle(product.id)}
                onOpen={() => go({ product: product.id })}
                onSaved={refresh}
              />
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && (
          <p className="sh-muted" style={{ padding: '1rem' }}>
            {t('No products match these filters.')}
          </p>
        )}
      </div>

      <div className="sh-row sh-between">
        <span className="sh-muted">{productCount(t, data?.total ?? 0)}</span>
        <div className="sh-row">
          <button
            type="button"
            className="sh-btn"
            disabled={page <= 1}
            onClick={() => go({ page: String(page - 1) }, true)}
          >
            ←
          </button>
          <span>
            {page} / {pages}
          </span>
          <button
            type="button"
            className="sh-btn"
            disabled={page >= pages}
            onClick={() => go({ page: String(page + 1) }, true)}
          >
            →
          </button>
          <select
            aria-label={t('Products per page')}
            value={perPage}
            onChange={(e) => filter({ perPage: e.target.value === '50' ? null : e.target.value })}
          >
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="sh-actions" role="region" aria-label={t('Selected products')}>
          <strong>{t('{count} selected', { count: selected.length })}</strong>
          <button type="button" className="sh-btn" onClick={() => setInfo(selected[0]!)}>
            {t('Info')}
          </button>
          <button type="button" className="sh-btn" onClick={() => go({ product: selected[0]! })}>
            {t('Edit')}
          </button>
          {statusFilter === 'trashed' ? (
            <>
              <button
                type="button"
                className="sh-btn"
                disabled={bulk.isPending}
                onClick={() => bulk.mutate('restore')}
              >
                {t('Restore')}
              </button>
              <button
                type="button"
                className="sh-btn sh-btn-danger"
                disabled={bulk.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      t('Delete {count} products for good?', { count: selected.length }),
                    )
                  )
                    bulk.mutate('delete');
                }}
              >
                {t('Delete for good')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="sh-btn"
                disabled={bulk.isPending}
                onClick={() => bulk.mutate('publish')}
              >
                {t('Publish')}
              </button>
              <button
                type="button"
                className="sh-btn"
                disabled={bulk.isPending}
                onClick={() => bulk.mutate('duplicate')}
              >
                {t('Duplicate')}
              </button>
              <button
                type="button"
                className="sh-btn sh-btn-danger"
                disabled={bulk.isPending}
                onClick={() => bulk.mutate('trash')}
              >
                {t('Move to trash')}
              </button>
            </>
          )}
          <button type="button" className="sh-link" onClick={() => setSelected([])}>
            {t('Clear selection')}
          </button>
        </div>
      )}

      {info && (
        <InfoDrawer
          api={api}
          id={info}
          setup={setup.data}
          locale={user.locale}
          onClose={() => setInfo(null)}
          onEdit={() => go({ product: info })}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  published: 'Published',
  draft: 'Drafts',
  pending: 'Pending',
  private: 'Private',
  scheduled: 'Scheduled',
  trashed: 'Trash',
};

/** Clicks on controls inside a row must not toggle its selection. */
const stop = (e: MouseEvent) => e.stopPropagation();

function ProductRowView({
  api,
  product,
  selected,
  currency,
  locale,
  category,
  onToggle,
  onOpen,
  onSaved,
}: {
  api: ShopApi;
  product: ProductListItem;
  selected: boolean;
  currency: string;
  locale: string;
  category: string | undefined;
  onToggle: () => void;
  onOpen: () => void;
  onSaved: () => void;
}) {
  const { t } = useT();
  const money = (value: string | null) => formatMoney(value, currency, locale);
  return (
    <tr className={`is-${product.status}${selected ? ' is-selected' : ''}`} onClick={onToggle}>
      <td onClick={stop}>
        <input
          type="checkbox"
          aria-label={t('Select {name}', { name: product.title })}
          checked={selected}
          onChange={onToggle}
        />
      </td>
      <td className="sh-hide-sm">
        {product.imageUrl ? (
          <img className="sh-thumb" src={product.imageUrl} alt="" loading="lazy" />
        ) : (
          <span className="sh-thumb" />
        )}
      </td>
      <td>
        <button
          type="button"
          className="sh-link"
          style={{ fontWeight: 600, textDecoration: 'none' }}
          onClick={(e) => {
            stop(e);
            onOpen();
          }}
        >
          {product.title || t('(no title)')}
        </button>
        {product.featured && <span title={t('Featured')}> ★</span>}
        <div className="sh-small sh-muted">
          {[
            category,
            product.kind === 'variable' ? t('Variable') : null,
            product.condition !== 'new'
              ? t(product.condition === 'used' ? 'Used' : 'Refurbished')
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          {product.status !== 'published' &&
            ` · ${t(STATUS_LABEL[product.status] ?? product.status)}`}
        </div>
      </td>
      <td className="sh-hide-sm">{product.sku || <span className="sh-muted">—</span>}</td>
      <td className="num" onClick={stop}>
        {product.kind === 'variable' ? (
          product.price === product.priceMax ? (
            money(product.price)
          ) : (
            `${money(product.price)} – ${money(product.priceMax)}`
          )
        ) : (
          <PriceEditor api={api} product={product} money={money} onSaved={onSaved} />
        )}
      </td>
      <td className="num sh-hide-sm sh-muted">
        {money(product.cost)}
        <br />
        {money(product.listPrice)}
      </td>
      <td className="num sh-hide-sm">{product.margin === null ? '—' : `${product.margin}%`}</td>
      <td className="num" onClick={stop}>
        <StockEditor api={api} product={product} onSaved={onSaved} />
      </td>
      <td className="num sh-hide-sm">{product.totalSales}</td>
    </tr>
  );
}

/** Click on the price to change it (and the sale price) without leaving the list. */
function PriceEditor({
  api,
  product,
  money,
  onSaved,
}: {
  api: ShopApi;
  product: ProductListItem;
  money: (value: string | null) => string;
  onSaved: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [regular, setRegular] = useState('');
  const [sale, setSale] = useState('');
  const save = useMutation({
    mutationFn: () =>
      api('PATCH', `/products/${product.id}/quick`, {
        regularPrice: regular || null,
        salePrice: sale || null,
      }),
    onSuccess: () => {
      setOpen(false);
      onSaved();
    },
  });
  if (!open)
    return (
      <button
        type="button"
        className="sh-edit"
        title={t('Change the price')}
        onClick={() => {
          setRegular(moneyInput(product.regularPrice));
          setSale(moneyInput(product.salePrice));
          setOpen(true);
        }}
      >
        {product.onSale ? (
          <>
            <span className="sh-strike">{money(product.regularPrice)}</span> {money(product.price)}
          </>
        ) : (
          money(product.price)
        )}
      </button>
    );
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Enter') save.mutate();
    if (e.key === 'Escape') setOpen(false);
  };
  return (
    <span className="sh-inline">
      <input
        type="text"
        inputMode="decimal"
        aria-label={t('Price')}
        value={regular}
        autoFocus
        onChange={(e) => setRegular(e.target.value)}
        onKeyDown={keys}
      />
      <input
        type="text"
        inputMode="decimal"
        aria-label={t('Sale price')}
        placeholder={t('Sale')}
        value={sale}
        onChange={(e) => setSale(e.target.value)}
        onKeyDown={keys}
      />
      <button
        type="button"
        className="sh-btn"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {t('Save')}
      </button>
      {save.error && <span className="sh-error">{errorMessage(save.error)}</span>}
    </span>
  );
}

/** Click on the stock to type the quantity (Cleito's quick stock). */
function StockEditor({
  api,
  product,
  onSaved,
}: {
  api: ShopApi;
  product: ProductListItem;
  onSaved: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const save = useMutation({
    mutationFn: () =>
      api('PATCH', `/products/${product.id}/quick`, { stock: value === '' ? null : Number(value) }),
    onSuccess: () => {
      setOpen(false);
      onSaved();
    },
  });
  const badge =
    product.stockStatus === 'outofstock'
      ? 'sh-badge-out'
      : product.stockStatus === 'onbackorder' || product.low
        ? 'sh-badge-warn'
        : 'sh-badge-ok';
  const label = product.manageStock
    ? String(product.stock ?? 0)
    : t(
        product.stockStatus === 'instock'
          ? 'In stock'
          : product.stockStatus === 'outofstock'
            ? 'Out of stock'
            : 'Backorder',
      );
  if (product.kind === 'variable') return <span className={`sh-badge ${badge}`}>{label}</span>;
  if (!open)
    return (
      <button
        type="button"
        className="sh-edit"
        title={t('Change the stock')}
        onClick={() => {
          setValue(product.stock === null ? '' : String(product.stock));
          setOpen(true);
        }}
      >
        <span className={`sh-badge ${badge}`}>{label}</span>
      </button>
    );
  return (
    <span className="sh-inline">
      <input
        type="number"
        aria-label={t('Stock')}
        value={value}
        autoFocus
        style={{ width: '5rem' }}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save.mutate();
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      <button
        type="button"
        className="sh-btn"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {t('Save')}
      </button>
    </span>
  );
}

/** A quick look at a product without leaving the list: images, prices, stock. */
function InfoDrawer({
  api,
  id,
  setup,
  locale,
  onClose,
  onEdit,
  onChanged,
}: {
  api: ShopApi;
  id: string;
  setup: Setup;
  locale: string;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const product = useQuery({
    queryKey: ['shop', 'product', id],
    queryFn: () => api<ProductView>('GET', `/products/${id}`),
  });
  useEffect(() => {
    const close = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  /** The chosen image becomes the main one; the old main one joins the gallery. */
  const main = useMutation({
    mutationFn: async (imageId: string) => {
      const view = product.data!;
      const gallery = view.gallery.filter((g) => g.id !== imageId);
      if (view.imageId)
        gallery.unshift({ id: view.imageId, url: view.imageUrl ?? '', caption: '' });
      await core('PATCH', `/entries/${id}`, { featuredMediaId: imageId });
      await api('PUT', `/products/${id}`, {
        product: { gallery: gallery.map((g) => ({ id: g.id, caption: g.caption })) },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['shop', 'product', id] });
      onChanged();
    },
  });
  const money = (value: string | null) => formatMoney(value, setup.settings.currency, locale);
  const view = product.data;
  return (
    <>
      <div className="sh-drawer-back" onClick={onClose} />
      <aside
        className="sh-drawer sh-stack"
        role="dialog"
        aria-modal="true"
        aria-label={view?.title ?? t('Product')}
      >
        <div className="sh-row sh-between">
          <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{view?.title ?? t('Loading…')}</h2>
          <button type="button" className="sh-btn" onClick={onClose}>
            {t('Close')}
          </button>
        </div>
        {product.error && <Alert>{errorMessage(product.error)}</Alert>}
        {view && (
          <>
            <div className="sh-gallery">
              {[
                ...(view.imageId
                  ? [{ id: view.imageId, url: view.imageUrl ?? '', caption: '' }]
                  : []),
                ...view.gallery,
              ].map((image) => (
                <figure
                  key={image.id}
                  className={image.id === view.imageId ? 'is-main' : undefined}
                >
                  <a href={image.url} target="_blank" rel="noreferrer">
                    <img src={image.url} alt={image.caption} />
                  </a>
                  {image.id === view.imageId ? (
                    <span className="sh-small sh-muted">{t('Main image')}</span>
                  ) : (
                    <button
                      type="button"
                      className="sh-link sh-small"
                      disabled={main.isPending}
                      onClick={() => main.mutate(image.id)}
                    >
                      {t('Make main')}
                    </button>
                  )}
                </figure>
              ))}
            </div>
            <dl className="sh-grid">
              <div>
                <dt className="sh-muted">{t('Cost')}</dt>
                <dd>{money(view.cost)}</dd>
              </div>
              <div>
                <dt className="sh-muted">{t('List price')}</dt>
                <dd>{money(view.listPrice)}</dd>
              </div>
              <div>
                <dt className="sh-muted">{t('Selling price')}</dt>
                <dd>{money(view.regularPrice)}</dd>
              </div>
              {view.salePrice && (
                <div>
                  <dt className="sh-muted">{t('Sale price')}</dt>
                  <dd>{money(view.salePrice)}</dd>
                </div>
              )}
              <div>
                <dt className="sh-muted">{t('Stock')}</dt>
                <dd>
                  {view.manageStock
                    ? view.stock
                    : t(view.stockStatus === 'instock' ? 'In stock' : 'Out of stock')}
                </dd>
              </div>
              <div>
                <dt className="sh-muted">{t('Code')}</dt>
                <dd>{view.sku || '—'}</dd>
              </div>
              {view.gtin && (
                <div>
                  <dt className="sh-muted">GTIN</dt>
                  <dd>{view.gtin}</dd>
                </div>
              )}
              {view.weight && (
                <div>
                  <dt className="sh-muted">{t('Weight')}</dt>
                  <dd>
                    {Number(view.weight)} {setup.settings.weightUnit}
                  </dd>
                </div>
              )}
            </dl>
            {main.error && <Alert>{errorMessage(main.error)}</Alert>}
            <div className="sh-row">
              <button type="button" className="sh-btn sh-btn-primary" onClick={onEdit}>
                {t('Edit')}
              </button>
              <a className="sh-btn" href={`/admin/entries/${id}`}>
                {t('Description in the block editor')}
              </a>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
