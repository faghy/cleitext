import { type AdminPageProps, adminUrl, Alert, errorMessage, useT } from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { marginOf, parseMoney, pricesFromCost } from '../pricing';
import { ImagesEditor, type ImageItem } from './images';
import {
  core,
  fieldErrors,
  formatMoney,
  moneyInput,
  termPaths,
  useSetup,
  type ProductList,
  type ProductView,
  type Setup,
  type Term,
  TAX_CLASS_OPTIONS,
} from './shared';
import {
  AttributesEditor,
  VariationsEditor,
  type AttributeRow,
  type VariationRow,
} from './variations';

/** The entry of a product, as the core API returns it. */
interface EntryView {
  id: string;
  locale: string;
  slug: string;
  title: string;
  status: string;
  terms: Record<string, { id: string }[]>;
  revision: {
    title: string;
    excerpt: string | null;
    document: { schema: number; blocks: Block[] } | null;
    featuredMediaId: string | null;
  } | null;
}
interface Block {
  id: string;
  type: string;
  v: number;
  attrs: Record<string, unknown>;
  content?: { text?: string }[];
  children?: Block[];
}

/** What the form edits; amounts as typed. */
interface Form {
  title: string;
  excerpt: string;
  /** The description as plain paragraphs, or null when made in the block editor. */
  description: string | null;
  categories: string[];
  brand: string;
  images: ImageItem[];
  kind: 'simple' | 'variable';
  sku: string;
  gtin: string;
  condition: 'new' | 'used' | 'refurbished';
  cost: string;
  listPrice: string;
  regularPrice: string;
  salePrice: string;
  saleFrom: string;
  saleTo: string;
  taxStatus: 'taxable' | 'shipping' | 'none';
  taxClass: string;
  manageStock: boolean;
  stock: string;
  stockStatus: 'instock' | 'outofstock' | 'onbackorder';
  backorders: 'no' | 'notify' | 'yes';
  lowStock: string;
  soldIndividually: boolean;
  weight: string;
  length: string;
  width: string;
  height: string;
  shippingClass: string;
  virtual: boolean;
  downloadable: boolean;
  purchaseNote: string;
  featured: boolean;
  visibility: 'visible' | 'catalog' | 'search' | 'hidden';
  upsellIds: string[];
  crossSellIds: string[];
  attributes: AttributeRow[];
  variations: VariationRow[];
}

const EMPTY: Form = {
  title: '',
  excerpt: '',
  description: '',
  categories: [],
  brand: '',
  images: [],
  kind: 'simple',
  sku: '',
  gtin: '',
  condition: 'new',
  cost: '',
  listPrice: '',
  regularPrice: '',
  salePrice: '',
  saleFrom: '',
  saleTo: '',
  taxStatus: 'taxable',
  taxClass: '',
  manageStock: true,
  stock: '1',
  stockStatus: 'instock',
  backorders: 'no',
  lowStock: '',
  soldIndividually: false,
  weight: '',
  length: '',
  width: '',
  height: '',
  shippingClass: '',
  virtual: false,
  downloadable: false,
  purchaseNote: '',
  featured: false,
  visibility: 'visible',
  upsellIds: [],
  crossSellIds: [],
  attributes: [],
  variations: [],
};

/** Paragraphs only (or nothing): the form can edit the description as text. */
function plainText(document: NonNullable<EntryView['revision']>['document']): string | null {
  const blocks = document?.blocks ?? [];
  if (!blocks.every((b) => b.type === 'core/paragraph' && !b.children?.length)) return null;
  return blocks.map((b) => (b.content ?? []).map((c) => c.text ?? '').join('')).join('\n\n');
}

function paragraphs(text: string) {
  return {
    schema: 1,
    blocks: text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean)
      .map((p) => ({
        id: crypto.randomUUID(),
        type: 'core/paragraph',
        v: 1,
        attrs: {},
        content: [{ text: p }],
      })),
  };
}

/** "2026-07-01T10:00:00.000Z" ↔ the value of a datetime-local input, in local time. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);
const num = (value: string) => (value.trim() === '' ? null : Number(value.replace(',', '.')));

function formOf(entry: EntryView, product: ProductView): Form {
  const revision = entry.revision;
  return {
    title: revision?.title ?? entry.title,
    excerpt: revision?.excerpt ?? '',
    description: plainText(revision?.document ?? null),
    categories: (entry.terms['product-category'] ?? []).map((t) => t.id),
    brand: entry.terms.brand?.[0]?.id ?? '',
    images: [
      ...(product.imageId
        ? [{ id: product.imageId, url: product.imageUrl ?? '', caption: '' }]
        : []),
      ...product.gallery,
    ],
    kind: product.kind,
    sku: product.sku,
    gtin: product.gtin,
    condition: product.condition,
    cost: moneyInput(product.cost),
    listPrice: moneyInput(product.listPrice),
    regularPrice: moneyInput(product.regularPrice),
    salePrice: moneyInput(product.salePrice),
    saleFrom: toLocalInput(product.saleFrom),
    saleTo: toLocalInput(product.saleTo),
    taxStatus: product.taxStatus,
    taxClass: product.taxClass,
    manageStock: product.manageStock,
    stock: product.stock === null ? '' : String(product.stock),
    stockStatus: product.stockStatus,
    backorders: product.backorders,
    lowStock: product.lowStock === null ? '' : String(product.lowStock),
    soldIndividually: product.soldIndividually,
    weight: product.weight === null ? '' : String(Number(product.weight)),
    length: product.length === null ? '' : String(Number(product.length)),
    width: product.width === null ? '' : String(Number(product.width)),
    height: product.height === null ? '' : String(Number(product.height)),
    shippingClass: product.shippingClass,
    virtual: product.virtual,
    downloadable: product.downloadable,
    purchaseNote: product.purchaseNote,
    featured: product.featured,
    visibility: product.visibility,
    upsellIds: product.upsellIds,
    crossSellIds: product.crossSellIds,
    attributes: product.attributes,
    variations: product.variations.map(
      ({ id, attributes, enabled, sku, regularPrice, salePrice, stock, imageId, ...rest }) => ({
        id,
        attributes,
        enabled,
        sku,
        regularPrice: moneyInput(regularPrice),
        salePrice: moneyInput(salePrice),
        stock: stock === null ? '' : String(stock),
        imageId,
        rest,
      }),
    ),
  };
}

type Section = 'belongs' | 'description' | 'prices' | 'images' | 'shipping' | 'variations' | 'more';

export function ProductForm({
  api,
  site,
  user,
  id,
  onClose,
  onCreated,
}: AdminPageProps & { id: string | null; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const setup = useSetup(api);
  const locale = new URLSearchParams(window.location.search).get('locale') ?? site.defaultLocale;
  const loaded = useQuery({
    queryKey: ['shop', 'form', id],
    queryFn: async () => {
      const [entry, product] = await Promise.all([
        core<EntryView>('GET', `/entries/${id}`),
        api<ProductView>('GET', `/products/${id}`),
      ]);
      return { entry, product };
    },
    enabled: id !== null,
    staleTime: Infinity,
    gcTime: 0,
  });
  const [form, setForm] = useState<Form | null>(id === null ? EMPTY : null);
  useEffect(() => {
    if (loaded.data && !form) setForm(formOf(loaded.data.entry, loaded.data.product));
  }, [loaded.data]);
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const entryLocale = loaded.data?.entry.locale ?? locale;
  const status = loaded.data?.entry.status ?? 'draft';

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const f = form!;
      let entryId = id;
      if (!entryId) {
        const created = await core<{ id: string }>('POST', '/entries', {
          type: 'product',
          title: f.title,
          locale: entryLocale,
        });
        entryId = created.id;
      }
      await core('PATCH', `/entries/${entryId}`, {
        title: f.title,
        excerpt: f.excerpt.trim() || null,
        ...(f.description !== null ? { document: paragraphs(f.description) } : {}),
        terms: { 'product-category': f.categories, brand: f.brand ? [f.brand] : [] },
        featuredMediaId: f.images[0]?.id ?? null,
      });
      await api('PUT', `/products/${entryId}`, {
        product: {
          kind: f.kind,
          sku: f.sku,
          gtin: f.gtin,
          condition: f.condition,
          cost: f.cost,
          listPrice: f.listPrice,
          regularPrice: f.regularPrice,
          salePrice: f.salePrice,
          saleFrom: fromLocalInput(f.saleFrom),
          saleTo: fromLocalInput(f.saleTo),
          taxStatus: f.taxStatus,
          taxClass: f.taxClass,
          // Variations count their own stock.
          manageStock: f.kind === 'simple' && f.manageStock,
          stock: f.kind === 'simple' && f.manageStock ? (num(f.stock) ?? 0) : null,
          stockStatus: f.stockStatus,
          backorders: f.backorders,
          lowStock: num(f.lowStock),
          soldIndividually: f.soldIndividually,
          weight: num(f.weight),
          length: num(f.length),
          width: num(f.width),
          height: num(f.height),
          shippingClass: f.shippingClass,
          virtual: f.virtual,
          downloadable: f.downloadable,
          purchaseNote: f.purchaseNote,
          gallery: f.images.slice(1).map((i) => ({ id: i.id, caption: i.caption })),
          featured: f.featured,
          visibility: f.visibility,
          upsellIds: f.upsellIds,
          crossSellIds: f.crossSellIds,
        },
        attributes: f.attributes,
        variations:
          f.kind === 'variable'
            ? f.variations.map((v) => ({
                ...v.rest,
                ...(v.id ? { id: v.id } : {}),
                attributes: v.attributes,
                enabled: v.enabled,
                sku: v.sku,
                regularPrice: v.regularPrice || null,
                salePrice: v.salePrice || null,
                manageStock: v.stock !== '',
                stock: v.stock === '' ? null : Number(v.stock),
                imageId: v.imageId,
              }))
            : [],
      });
      if (publish) await core('POST', `/entries/${entryId}/publish`);
      return entryId;
    },
    onSuccess: async (entryId, publish) => {
      await queryClient.invalidateQueries({ queryKey: ['shop', 'products'] });
      setSaved(publish ? t('Published.') : t('Saved.'));
      if (!id) onCreated(entryId);
      else await queryClient.invalidateQueries({ queryKey: ['shop', 'form', id] });
    },
  });
  const errors = fieldErrors(save.error);
  const err = (name: string) => errors[`product.${name}`];

  if (setup.isPending || (id && !form)) {
    if (loaded.error) return <Alert>{errorMessage(loaded.error)}</Alert>;
    return <p className="sh-muted">{t('Loading…')}</p>;
  }
  if (setup.error) return <Alert>{errorMessage(setup.error)}</Alert>;
  const f = form!;
  const set = (changes: Partial<Form>) => {
    setSaved(null);
    setForm((current) => ({ ...current!, ...changes }));
  };
  const data = setup.data;

  const sections: { key: Section; title: string; body: ReactNode; check?: () => string | null }[] =
    [
      {
        key: 'belongs',
        title: t('Category and brand'),
        body: <Belongs form={f} set={set} setup={data} locale={entryLocale} api={api} />,
        check: () => (f.categories.length === 0 ? t('Choose a category.') : null),
      },
      {
        key: 'description',
        title: t('Description'),
        body: <Description form={f} set={set} id={id} />,
        check: () => (f.title.trim() ? null : t('Give the product a name.')),
      },
      {
        key: 'prices',
        title: t('Prices and stock'),
        body: <Prices form={f} set={set} setup={data} err={err} locale={user.locale} />,
      },
      {
        key: 'images',
        title: t('Images'),
        body: <ImagesEditor images={f.images} onChange={(images) => set({ images })} />,
      },
      {
        key: 'shipping',
        title: t('Shipping'),
        body: <Shipping form={f} set={set} setup={data} err={err} />,
      },
      {
        key: 'variations',
        title: f.kind === 'variable' ? t('Attributes and variations') : t('Attributes'),
        body: (
          <div className="sh-stack">
            <AttributesEditor
              site={site}
              rows={f.attributes}
              shared={data.attributes}
              variable={f.kind === 'variable'}
              onChange={(attributes) => set({ attributes })}
            />
            {f.kind === 'variable' && (
              <VariationsEditor
                rows={f.variations}
                attributes={f.attributes}
                shared={data.attributes}
                images={f.images}
                onChange={(variations) => set({ variations })}
              />
            )}
          </div>
        ),
      },
      {
        key: 'more',
        title: t('Visibility and related products'),
        body: <More form={f} set={set} api={api} id={id} />,
      },
    ];

  const wizard = id === null && data.settings.wizard;
  const visible = wizard ? [sections[step]!] : sections;
  const last = !wizard || step === sections.length - 1;
  const next = () => {
    const problem = sections[step]!.check?.() ?? null;
    setStepError(problem);
    if (!problem) setStep(step + 1);
  };
  const submit = (publish: boolean) => {
    const problem = sections.map((s) => s.check?.() ?? null).find(Boolean) ?? null;
    setStepError(problem);
    if (!problem) save.mutate(publish);
  };

  return (
    <div className="sh-stack">
      <div className="sh-row sh-between">
        <div className="sh-row">
          <button type="button" className="sh-btn" onClick={onClose}>
            ← {t('Products')}
          </button>
          <h1>{id ? f.title || t('(no title)') : t('New product')}</h1>
          {id && (
            <span className="sh-badge sh-badge-info">
              {t(status === 'published' ? 'Published' : status === 'trashed' ? 'Trash' : 'Draft')}
            </span>
          )}
        </div>
        {id && (
          <a className="sh-link" href={adminUrl(`/entries/${id}`)}>
            {t('Open in the block editor (description, SEO, translations)')}
          </a>
        )}
      </div>

      {wizard && (
        <ol className="sh-steps" aria-label={t('Steps')}>
          {sections.map((s, i) => (
            <li
              key={s.key}
              aria-current={i === step ? 'step' : undefined}
              className={i < step ? 'is-done' : undefined}
            >
              {s.title}
            </li>
          ))}
        </ol>
      )}

      {visible.map((s) => (
        <section key={s.key} className="sh-card" aria-labelledby={`sh-${s.key}`}>
          <h2 id={`sh-${s.key}`}>{s.title}</h2>
          {s.body}
        </section>
      ))}

      {stepError && <Alert>{stepError}</Alert>}
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      {saved && <Alert kind="success">{saved}</Alert>}

      <div className="sh-actions">
        {wizard && step > 0 && (
          <button type="button" className="sh-btn" onClick={() => setStep(step - 1)}>
            ← {t('Back')}
          </button>
        )}
        {!last && (
          <button type="button" className="sh-btn sh-btn-primary" onClick={next}>
            {t('Next')} →
          </button>
        )}
        {last && (
          <>
            {status !== 'published' && (
              <button
                type="button"
                className="sh-btn"
                disabled={save.isPending}
                onClick={() => submit(false)}
              >
                {t('Save draft')}
              </button>
            )}
            <button
              type="button"
              className="sh-btn sh-btn-primary"
              disabled={save.isPending}
              onClick={() => submit(true)}
            >
              {status === 'published' ? t('Update') : t('Publish')}
            </button>
          </>
        )}
        {save.isPending && <span className="sh-muted">{t('Saving…')}</span>}
      </div>
    </div>
  );
}

type Setter = (changes: Partial<Form>) => void;

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="sh-field">
      <label className="sh-field">
        <span>{label}</span>
        {children}
      </label>
      {hint && <small>{hint}</small>}
      {error && (
        <span className="sh-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function Money({
  value,
  onChange,
  currency,
  label,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  currency: string;
  label: string;
  error?: string | undefined;
}) {
  return (
    <Field label={label} error={error}>
      <span className="sh-affix">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span>{currency}</span>
      </span>
    </Field>
  );
}

/** Main category (leaves by default, as in Cleito), more categories, brand. */
function Belongs({
  form,
  set,
  setup,
  locale,
  api: _api,
}: {
  form: Form;
  set: Setter;
  setup: Setup;
  locale: string;
  api: AdminPageProps['api'];
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [all, setAll] = useState(false);
  const [newBrand, setNewBrand] = useState('');
  const categories = setup.categories.filter((c) => c.locale === locale);
  const brands = setup.brands.filter((b) => b.locale === locale);
  const paths = termPaths(categories);
  const options = [...paths.entries()]
    .filter(([, info]) => all || info.leaf)
    .sort((a, b) => a[1].path.localeCompare(b[1].path));
  const [main, ...extra] = form.categories;
  const addBrand = useMutation({
    mutationFn: () =>
      core<Term>('POST', '/taxonomies/brand/terms', { name: newBrand.trim(), locale }),
    onSuccess: async (brand) => {
      await queryClient.invalidateQueries({ queryKey: ['shop', 'setup'] });
      set({ brand: brand.id });
      setNewBrand('');
    },
  });
  return (
    <div className="sh-stack">
      {categories.length === 0 && (
        <Alert>
          {t('There are no product categories yet.')}{' '}
          <a href={adminUrl('/ext/shop/categories')}>{t('Add them in Shop → Categories.')}</a>
        </Alert>
      )}
      <div className="sh-grid-2">
        <Field label={t('Category')}>
          <select
            value={main ?? ''}
            onChange={(e) =>
              set({
                categories: e.target.value
                  ? [e.target.value, ...extra.filter((c) => c !== e.target.value)]
                  : extra,
              })
            }
          >
            <option value="">{t('Choose…')}</option>
            {options.map(([termId, info]) => (
              <option key={termId} value={termId}>
                {info.path}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('Brand')}>
          <select value={form.brand} onChange={(e) => set({ brand: e.target.value })}>
            <option value="">{t('No brand')}</option>
            {brands
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <label className="sh-check">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        {t('Also show categories that contain other categories')}
      </label>
      <div className="sh-field">
        <span>{t('Also in')}</span>
        <div className="sh-chips">
          {extra.map((termId) => (
            <span key={termId} className="sh-chip">
              {paths.get(termId)?.path ?? termId}
              <button
                type="button"
                aria-label={t('Remove')}
                onClick={() => set({ categories: form.categories.filter((c) => c !== termId) })}
              >
                ✕
              </button>
            </span>
          ))}
          <select
            aria-label={t('Add another category')}
            value=""
            disabled={!main}
            onChange={(e) =>
              e.target.value && set({ categories: [...form.categories, e.target.value] })
            }
          >
            <option value="">{t('Add another category…')}</option>
            {options
              .filter(([termId]) => !form.categories.includes(termId))
              .map(([termId, info]) => (
                <option key={termId} value={termId}>
                  {info.path}
                </option>
              ))}
          </select>
        </div>
      </div>
      <div className="sh-row">
        <input
          type="text"
          aria-label={t('New brand')}
          placeholder={t('New brand')}
          value={newBrand}
          onChange={(e) => setNewBrand(e.target.value)}
        />
        <button
          type="button"
          className="sh-btn"
          disabled={!newBrand.trim() || addBrand.isPending}
          onClick={() => addBrand.mutate()}
        >
          {t('Add brand')}
        </button>
        {addBrand.error && <span className="sh-error">{errorMessage(addBrand.error)}</span>}
      </div>
    </div>
  );
}

function Description({ form, set, id }: { form: Form; set: Setter; id: string | null }) {
  const { t } = useT();
  return (
    <div className="sh-stack">
      <Field label={t('Name')}>
        <input
          type="text"
          value={form.title}
          maxLength={300}
          onChange={(e) => set({ title: e.target.value })}
        />
      </Field>
      <Field label={t('Short description')} hint={t('Shown next to the price and in lists.')}>
        <textarea
          rows={3}
          value={form.excerpt}
          maxLength={1000}
          onChange={(e) => set({ excerpt: e.target.value })}
        />
      </Field>
      {form.description !== null ? (
        <Field
          label={t('Description')}
          hint={t(
            'Leave an empty line between paragraphs. For headings, images and more, use the block editor.',
          )}
        >
          <textarea
            rows={8}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </Field>
      ) : (
        <p>
          {t('The description was made in the block editor.')}{' '}
          {id && (
            <a className="sh-link" href={adminUrl(`/entries/${id}`)}>
              {t('Edit it there')}
            </a>
          )}
        </p>
      )}
    </div>
  );
}

function Prices({
  form,
  set,
  setup,
  err,
  locale,
}: {
  form: Form;
  set: Setter;
  setup: Setup;
  err: (name: string) => string | undefined;
  locale: string;
}) {
  const { t } = useT();
  const [supplier, setSupplier] = useState('');
  const currency = setup.settings.currency;
  const rules = setup.pricing;
  const safe = (value: string) => {
    try {
      return parseMoney(value);
    } catch {
      return null;
    }
  };
  const margin = marginOf(safe(form.cost), safe(form.regularPrice));
  const preview = useMemo(() => {
    const cost = safe(supplier);
    return cost !== null && rules.tiers.length > 0 ? pricesFromCost(Number(cost), rules) : null;
  }, [supplier, rules]);
  return (
    <div className="sh-stack">
      <div className="sh-row">
        <div className="sh-seg" role="group" aria-label={t('Product type')}>
          <button
            type="button"
            aria-pressed={form.kind === 'simple'}
            onClick={() => set({ kind: 'simple' })}
          >
            {t('Simple')}
          </button>
          <button
            type="button"
            aria-pressed={form.kind === 'variable'}
            onClick={() => set({ kind: 'variable' })}
          >
            {t('With variations')}
          </button>
        </div>
      </div>
      <div className="sh-grid">
        <Field label={t('Code (SKU)')} error={err('sku')}>
          <input type="text" value={form.sku} onChange={(e) => set({ sku: e.target.value })} />
        </Field>
        <Field label={t('GTIN / EAN')} error={err('gtin')}>
          <input
            type="text"
            inputMode="numeric"
            value={form.gtin}
            onChange={(e) => set({ gtin: e.target.value })}
          />
        </Field>
        <Field label={t('Condition')}>
          <select
            value={form.condition}
            onChange={(e) => set({ condition: e.target.value as Form['condition'] })}
          >
            <option value="new">{t('New')}</option>
            <option value="used">{t('Used')}</option>
            <option value="refurbished">{t('Refurbished')}</option>
          </select>
        </Field>
      </div>

      {form.kind === 'simple' && (
        <>
          <div className="sh-grid">
            <Money
              label={t('Cost')}
              currency={currency}
              value={form.cost}
              error={err('cost')}
              onChange={(cost) => set({ cost })}
            />
            <Money
              label={t('List price')}
              currency={currency}
              value={form.listPrice}
              error={err('listPrice')}
              onChange={(listPrice) => set({ listPrice })}
            />
            <Money
              label={t('Selling price')}
              currency={currency}
              value={form.regularPrice}
              error={err('regularPrice')}
              onChange={(regularPrice) => set({ regularPrice })}
            />
            <div className="sh-field">
              <span>{t('Margin')}</span>
              <strong style={{ padding: '.4rem 0' }}>{margin === null ? '—' : `${margin}%`}</strong>
            </div>
          </div>
          {rules.tiers.length > 0 && (
            <div className="sh-row">
              <label className="sh-row">
                <span>{t('From the supplier’s price')}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={supplier}
                  style={{ width: '7rem' }}
                  onChange={(e) => setSupplier(e.target.value)}
                />
              </label>
              {preview && (
                <>
                  <span className="sh-muted">
                    {formatMoney(preview.cost, currency, locale)} →{' '}
                    {formatMoney(preview.listPrice, currency, locale)} →{' '}
                    {formatMoney(preview.regularPrice, currency, locale)}
                  </span>
                  <button type="button" className="sh-btn" onClick={() => set({ ...preview })}>
                    {t('Use these prices')}
                  </button>
                </>
              )}
            </div>
          )}
          <div className="sh-grid">
            <Money
              label={t('Sale price')}
              currency={currency}
              value={form.salePrice}
              error={err('salePrice')}
              onChange={(salePrice) => set({ salePrice })}
            />
            <Field label={t('Sale from')}>
              <input
                type="datetime-local"
                value={form.saleFrom}
                onChange={(e) => set({ saleFrom: e.target.value })}
              />
            </Field>
            <Field label={t('Sale until')} error={err('saleTo')}>
              <input
                type="datetime-local"
                value={form.saleTo}
                onChange={(e) => set({ saleTo: e.target.value })}
              />
            </Field>
          </div>
        </>
      )}

      <div className="sh-grid">
        <Field label={t('Taxes')}>
          <select
            value={form.taxStatus}
            onChange={(e) => set({ taxStatus: e.target.value as Form['taxStatus'] })}
          >
            <option value="taxable">{t('Taxable')}</option>
            <option value="shipping">{t('Shipping only')}</option>
            <option value="none">{t('None')}</option>
          </select>
        </Field>
        <Field label={t('Tax rate')}>
          <select value={form.taxClass} onChange={(e) => set({ taxClass: e.target.value })}>
            {TAX_CLASS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {form.kind === 'simple' && (
        <div className="sh-stack">
          <label className="sh-check">
            <input
              type="checkbox"
              checked={form.manageStock}
              onChange={(e) => set({ manageStock: e.target.checked })}
            />
            {t('Count the pieces in stock')}
          </label>
          <div className="sh-grid">
            {form.manageStock ? (
              <>
                <Field label={t('Pieces in stock')} error={err('stock')}>
                  <input
                    type="number"
                    value={form.stock}
                    onChange={(e) => set({ stock: e.target.value })}
                  />
                </Field>
                <Field label={t('When it runs out')}>
                  <select
                    value={form.backorders}
                    onChange={(e) => set({ backorders: e.target.value as Form['backorders'] })}
                  >
                    <option value="no">{t('Stop selling')}</option>
                    <option value="notify">{t('Keep selling, tell the customer')}</option>
                    <option value="yes">{t('Keep selling')}</option>
                  </select>
                </Field>
                <Field
                  label={t('Low stock below')}
                  hint={t('Empty: {n}, from the settings', { n: setup.settings.lowStock })}
                >
                  <input
                    type="number"
                    min={0}
                    value={form.lowStock}
                    onChange={(e) => set({ lowStock: e.target.value })}
                  />
                </Field>
              </>
            ) : (
              <Field label={t('Availability')}>
                <select
                  value={form.stockStatus}
                  onChange={(e) => set({ stockStatus: e.target.value as Form['stockStatus'] })}
                >
                  <option value="instock">{t('In stock')}</option>
                  <option value="outofstock">{t('Out of stock')}</option>
                  <option value="onbackorder">{t('On backorder')}</option>
                </select>
              </Field>
            )}
          </div>
          <label className="sh-check">
            <input
              type="checkbox"
              checked={form.soldIndividually}
              onChange={(e) => set({ soldIndividually: e.target.checked })}
            />
            {t('One per order')}
          </label>
        </div>
      )}
    </div>
  );
}

function Shipping({
  form,
  set,
  setup,
  err,
}: {
  form: Form;
  set: Setter;
  setup: Setup;
  err: (name: string) => string | undefined;
}) {
  const { t } = useT();
  const unit = setup.settings.dimensionUnit;
  return (
    <div className="sh-stack">
      <div className="sh-row">
        <label className="sh-check">
          <input
            type="checkbox"
            checked={form.virtual}
            onChange={(e) => set({ virtual: e.target.checked })}
          />
          {t('Not shipped (a service, a ticket…)')}
        </label>
        <label className="sh-check">
          <input
            type="checkbox"
            checked={form.downloadable}
            onChange={(e) => set({ downloadable: e.target.checked })}
          />
          {t('Downloadable')}
        </label>
      </div>
      {!form.virtual && (
        <div className="sh-grid">
          <Field label={`${t('Weight')} (${setup.settings.weightUnit})`} error={err('weight')}>
            <input
              type="text"
              inputMode="decimal"
              value={form.weight}
              onChange={(e) => set({ weight: e.target.value })}
            />
          </Field>
          <Field label={`${t('Length')} (${unit})`}>
            <input
              type="text"
              inputMode="decimal"
              value={form.length}
              onChange={(e) => set({ length: e.target.value })}
            />
          </Field>
          <Field label={`${t('Width')} (${unit})`}>
            <input
              type="text"
              inputMode="decimal"
              value={form.width}
              onChange={(e) => set({ width: e.target.value })}
            />
          </Field>
          <Field label={`${t('Height')} (${unit})`}>
            <input
              type="text"
              inputMode="decimal"
              value={form.height}
              onChange={(e) => set({ height: e.target.value })}
            />
          </Field>
          <Field
            label={t('Shipping class')}
            hint={t('e.g. bulky: shipping methods can charge it differently.')}
          >
            <input
              type="text"
              value={form.shippingClass}
              onChange={(e) => set({ shippingClass: e.target.value })}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

/** Featured, visibility, note after purchase, up-sells and cross-sells. */
function More({
  form,
  set,
  api,
  id,
}: {
  form: Form;
  set: Setter;
  api: AdminPageProps['api'];
  id: string | null;
}) {
  const { t } = useT();
  return (
    <div className="sh-stack">
      <div className="sh-grid">
        <Field label={t('Shown in')}>
          <select
            value={form.visibility}
            onChange={(e) => set({ visibility: e.target.value as Form['visibility'] })}
          >
            <option value="visible">{t('Shop and search results')}</option>
            <option value="catalog">{t('Shop only')}</option>
            <option value="search">{t('Search results only')}</option>
            <option value="hidden">{t('Nowhere (only its own address)')}</option>
          </select>
        </Field>
        <label className="sh-check" style={{ alignSelf: 'end' }}>
          <input
            type="checkbox"
            checked={form.featured}
            onChange={(e) => set({ featured: e.target.checked })}
          />
          {t('Featured product')}
        </label>
      </div>
      <Field label={t('Note after purchase')} hint={t('Sent to the customer with the order.')}>
        <textarea
          rows={2}
          value={form.purchaseNote}
          onChange={(e) => set({ purchaseNote: e.target.value })}
        />
      </Field>
      <ProductPicker
        api={api}
        label={t('Also suggest (up-sells)')}
        ids={form.upsellIds}
        self={id}
        onChange={(upsellIds) => set({ upsellIds })}
      />
      <ProductPicker
        api={api}
        label={t('In the cart, suggest (cross-sells)')}
        ids={form.crossSellIds}
        self={id}
        onChange={(crossSellIds) => set({ crossSellIds })}
      />
    </div>
  );
}

/** Products chosen by name or code. */
export function ProductPicker({
  api,
  label,
  ids,
  self,
  onChange,
}: {
  api: AdminPageProps['api'];
  label: string;
  ids: string[];
  self: string | null;
  onChange: (ids: string[]) => void;
}) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const results = useQuery({
    queryKey: ['shop', 'pick', q],
    queryFn: () => api<ProductList>('GET', `/products?q=${encodeURIComponent(q)}&perPage=10`),
    enabled: q.trim().length > 1,
  });
  const chosen = useQuery({
    queryKey: ['shop', 'picked', ids.join(',')],
    queryFn: async () => {
      const found: Record<string, string> = {};
      for (const pid of ids) {
        if (names[pid]) continue;
        const view = await api<ProductView>('GET', `/products/${pid}`).catch(() => null);
        if (view) found[pid] = view.title;
      }
      return found;
    },
    enabled: ids.some((pid) => !names[pid]),
  });
  const title = (pid: string) => names[pid] ?? chosen.data?.[pid] ?? '…';
  return (
    <div className="sh-field">
      <span>{label}</span>
      <div className="sh-chips">
        {ids.map((pid) => (
          <span key={pid} className="sh-chip">
            {title(pid)}
            <button
              type="button"
              aria-label={t('Remove')}
              onClick={() => onChange(ids.filter((x) => x !== pid))}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <input
        type="search"
        placeholder={t('Search by name or code')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label={label}
      />
      {results.data && q.trim().length > 1 && (
        <div className="sh-chips">
          {results.data.items
            .filter((p) => p.id !== self && !ids.includes(p.id))
            .map((p) => (
              <button
                key={p.id}
                type="button"
                className="sh-chip"
                onClick={() => {
                  setNames({ ...names, [p.id]: p.title });
                  onChange([...ids, p.id]);
                  setQ('');
                }}
              >
                + {p.title}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
