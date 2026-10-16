import { Alert, errorMessage, useT, type AdminPageProps } from '@cleitext/admin-sdk';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Coupon } from '../coupons';
import { ProductPicker } from './product-form';
import { fieldErrors, formatMoney, termPaths, useSetup, type Term } from './shared';
import { CSS } from './styles';

type CouponView = Coupon & { enabled: boolean };
type Form = Omit<CouponView, 'id' | 'usageCount' | 'expiresAt'> & {
  /** yyyy-mm-dd in the form; the coupon works until the end of that day. */
  expires: string;
};

const EMPTY: Form = {
  code: '',
  description: '',
  kind: 'percent',
  amount: '',
  enabled: true,
  freeShipping: false,
  expires: '',
  minSpend: '',
  maxSpend: '',
  individualUse: false,
  excludeSaleItems: false,
  productIds: [],
  excludedProductIds: [],
  categoryIds: [],
  excludedCategoryIds: [],
  emails: [],
  usageLimit: null,
  usageLimitPerUser: null,
  limitItems: null,
};

const formOf = ({ id: _id, usageCount: _uses, expiresAt, ...coupon }: CouponView): Form => ({
  ...coupon,
  amount: String(Number(coupon.amount)),
  expires: expiresAt ? toDay(new Date(expiresAt)) : '',
});

/** The local day of a date, as an input wants it. */
function toDay(date: Date): string {
  // The coupon ends at 23:59:59 of its day: one second back keeps it on that day.
  const shown = new Date(date.getTime() - 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${shown.getFullYear()}-${pad(shown.getMonth() + 1)}-${pad(shown.getDate())}`;
}

/** Shop → Coupons: codes for discounts and free shipping, with their rules. */
export function CouponsPage({ api, user }: AdminPageProps) {
  const { t } = useT();
  const setup = useSetup(api);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<CouponView | 'new' | null>(null);
  const list = useQuery({
    queryKey: ['shop', 'coupons', q],
    queryFn: () => api<{ items: CouponView[] }>('GET', `/coupons?q=${encodeURIComponent(q)}`),
    placeholderData: keepPreviousData,
  });
  const currency = setup.data?.settings.currency ?? 'EUR';
  const money = (value: string | number) => formatMoney(value, currency, user.locale);
  const amountOf = (c: CouponView) =>
    c.kind === 'percent'
      ? `${Number(c.amount)}%`
      : `${money(c.amount)}${c.kind === 'fixed_product' ? ` ${t('per item')}` : ''}`;

  return (
    <div className="sh sh-stack">
      <style>{CSS}</style>
      <div className="sh-row sh-between">
        <h1>{t('Coupons')}</h1>
        <button type="button" className="sh-btn sh-btn-primary" onClick={() => setEditing('new')}>
          + {t('Add coupon')}
        </button>
      </div>
      <p className="sh-muted">
        {t(
          'Customers type the code in the cart. A coupon takes a percentage or an amount off, and can give free shipping (with a “Free shipping” method that asks for a coupon).',
        )}
      </p>
      <input
        type="search"
        value={q}
        placeholder={t('Search codes')}
        aria-label={t('Search codes')}
        onChange={(e) => setQ(e.target.value)}
        style={{ maxWidth: '20rem' }}
      />
      {list.error && <Alert>{errorMessage(list.error)}</Alert>}
      <div className="sh-card" style={{ overflowX: 'auto' }}>
        <table className="sh-table">
          <thead>
            <tr>
              <th>{t('Code')}</th>
              <th>{t('Discount')}</th>
              <th className="sh-hide-sm">{t('Description')}</th>
              <th className="num">{t('Used')}</th>
              <th>{t('Expires')}</th>
              <th>{t('Status')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((c) => {
              const expired = c.expiresAt !== null && new Date(c.expiresAt) <= new Date();
              return (
                <tr key={c.id} onClick={() => setEditing(c)}>
                  <td>
                    <button type="button" className="sh-link" onClick={() => setEditing(c)}>
                      <strong>{c.code}</strong>
                    </button>
                  </td>
                  <td>
                    {amountOf(c)}
                    {c.freeShipping && (
                      <span className="sh-badge sh-badge-info" style={{ marginLeft: '.35rem' }}>
                        {t('Free shipping')}
                      </span>
                    )}
                  </td>
                  <td className="sh-hide-sm sh-muted">{c.description}</td>
                  <td className="num">
                    {c.usageCount}
                    {c.usageLimit !== null ? ` / ${c.usageLimit}` : ''}
                  </td>
                  <td>
                    {c.expiresAt
                      ? new Date(new Date(c.expiresAt).getTime() - 1000).toLocaleDateString(
                          user.locale,
                        )
                      : '—'}
                  </td>
                  <td>
                    {!c.enabled ? (
                      <span className="sh-badge sh-badge-warn">{t('Turned off')}</span>
                    ) : expired ? (
                      <span className="sh-badge sh-badge-out">{t('Expired')}</span>
                    ) : c.usageLimit !== null && c.usageCount >= c.usageLimit ? (
                      <span className="sh-badge sh-badge-out">{t('Used up')}</span>
                    ) : (
                      <span className="sh-badge sh-badge-ok">{t('Active')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {list.data?.items.length === 0 && (
              <tr style={{ cursor: 'default' }}>
                <td colSpan={6} className="sh-muted">
                  {q ? t('No coupons match.') : t('No coupons yet.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <CouponEditor
          key={editing === 'new' ? 'new' : editing.id}
          api={api}
          coupon={editing === 'new' ? null : editing}
          categories={setup.data?.categories ?? []}
          currency={currency}
          locale={user.locale}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CouponEditor({
  api,
  coupon,
  categories,
  currency,
  locale,
  onClose,
}: {
  api: AdminPageProps['api'];
  coupon: CouponView | null;
  categories: Term[];
  currency: string;
  locale: string;
  onClose: () => void;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(coupon ? formOf(coupon) : EMPTY);
  const [emails, setEmails] = useState(form.emails.join(', '));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['shop', 'coupons'] });
  const save = useMutation({
    mutationFn: () => {
      const { expires, ...rest } = form;
      const body = {
        ...rest,
        amount: rest.amount.replace(',', '.'),
        minSpend: rest.minSpend.replace(',', '.'),
        maxSpend: rest.maxSpend.replace(',', '.'),
        emails: emails
          .split(/[\s,;]+/)
          .map((e) => e.trim())
          .filter(Boolean),
        expiresAt: expires ? new Date(`${expires}T23:59:59.999`).toISOString() : null,
      };
      return coupon
        ? api<CouponView>('PUT', `/coupons/${coupon.id}`, body)
        : api<CouponView>('POST', '/coupons', body);
    },
    onSuccess: () => {
      void refresh();
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => api('DELETE', `/coupons/${coupon!.id}`),
    onSuccess: () => {
      void refresh();
      onClose();
    },
  });
  const uses = useQuery({
    queryKey: ['shop', 'coupon-uses', coupon?.id],
    queryFn: () =>
      api<{ items: { orderId: string; number: number; email: string; createdAt: string }[] }>(
        'GET',
        `/coupons/${coupon!.id}/uses`,
      ),
    enabled: !!coupon && coupon.usageCount > 0,
  });
  const errors = fieldErrors(save.error);
  const set = (changes: Partial<Form>) => {
    save.reset();
    setForm({ ...form, ...changes });
  };
  const limit = (value: string) =>
    value.trim() === '' ? null : Math.max(1, Math.floor(Number(value)) || 1);
  const paths = termPaths(categories.filter((c) => c.locale === categories[0]?.locale));
  const categoryOptions = [...paths.entries()].sort((a, b) => a[1].path.localeCompare(b[1].path));
  const error = (name: string) =>
    errors[name] ? <small className="sh-error">{errors[name]}</small> : null;

  const categoryChooser = (label: string, ids: string[], onChange: (ids: string[]) => void) => (
    <div className="sh-field">
      <span>{label}</span>
      <div className="sh-chips">
        {ids.map((id) => (
          <span key={id} className="sh-chip">
            {paths.get(id)?.path ?? '…'}
            <button
              type="button"
              aria-label={t('Remove')}
              onClick={() => onChange(ids.filter((x) => x !== id))}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <select
        value=""
        aria-label={label}
        onChange={(e) => e.target.value && onChange([...ids, e.target.value])}
      >
        <option value="">{t('Add a category…')}</option>
        {categoryOptions
          .filter(([id]) => !ids.includes(id))
          .map(([id, info]) => (
            <option key={id} value={id}>
              {info.path}
            </option>
          ))}
      </select>
    </div>
  );

  return (
    <>
      <div className="sh-drawer-back" onClick={onClose} />
      <aside className="sh-drawer sh-stack" role="dialog" aria-label={t('Coupon')}>
        <div className="sh-row sh-between">
          <h2 style={{ margin: 0 }}>{coupon ? coupon.code : t('New coupon')}</h2>
          <button type="button" className="sh-btn" onClick={onClose}>
            {t('Close')}
          </button>
        </div>
        <section className="sh-stack">
          <div className="sh-grid-2">
            <label className="sh-field">
              <span>{t('Code')}</span>
              <input
                type="text"
                value={form.code}
                maxLength={60}
                autoFocus={!coupon}
                onChange={(e) => set({ code: e.target.value.replace(/[\s,]/g, '') })}
              />
              <small>{t('Customers can type it in capitals or not.')}</small>
              {error('code')}
            </label>
            <label className="sh-check" style={{ alignSelf: 'center' }}>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => set({ enabled: e.target.checked })}
              />
              {t('Active')}
            </label>
          </div>
          <label className="sh-field">
            <span>{t('Description (for you)')}</span>
            <input
              type="text"
              value={form.description}
              maxLength={500}
              onChange={(e) => set({ description: e.target.value })}
            />
          </label>
          <div className="sh-grid-2">
            <label className="sh-field">
              <span>{t('Discount type')}</span>
              <select
                value={form.kind}
                onChange={(e) => set({ kind: e.target.value as Form['kind'] })}
              >
                <option value="percent">{t('Percentage')}</option>
                <option value="fixed_cart">{t('Amount off the cart')}</option>
                <option value="fixed_product">{t('Amount off each item')}</option>
              </select>
            </label>
            <label className="sh-field">
              <span>{t('Amount')}</span>
              <div className="sh-affix">
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => set({ amount: e.target.value })}
                />
                <span>{form.kind === 'percent' ? '%' : currency}</span>
              </div>
              {error('amount')}
            </label>
          </div>
          <label className="sh-check">
            <input
              type="checkbox"
              checked={form.freeShipping}
              onChange={(e) => set({ freeShipping: e.target.checked })}
            />
            {t('Gives free shipping')}
          </label>
          <label className="sh-field" style={{ maxWidth: '14rem' }}>
            <span>{t('Valid until')}</span>
            <input
              type="date"
              value={form.expires}
              onChange={(e) => set({ expires: e.target.value })}
            />
          </label>
        </section>

        <details open={!!coupon && hasRestrictions(form)}>
          <summary>
            <strong>{t('Restrictions')}</strong>
          </summary>
          <div className="sh-stack" style={{ marginTop: '.75rem' }}>
            <div className="sh-grid-2">
              <label className="sh-field">
                <span>{t('Minimum spend')}</span>
                <div className="sh-affix">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.minSpend}
                    onChange={(e) => set({ minSpend: e.target.value })}
                  />
                  <span>{currency}</span>
                </div>
                {error('minSpend')}
              </label>
              <label className="sh-field">
                <span>{t('Maximum spend')}</span>
                <div className="sh-affix">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.maxSpend}
                    onChange={(e) => set({ maxSpend: e.target.value })}
                  />
                  <span>{currency}</span>
                </div>
                {error('maxSpend')}
              </label>
            </div>
            <label className="sh-check">
              <input
                type="checkbox"
                checked={form.individualUse}
                onChange={(e) => set({ individualUse: e.target.checked })}
              />
              {t('Not together with other coupons')}
            </label>
            <label className="sh-check">
              <input
                type="checkbox"
                checked={form.excludeSaleItems}
                onChange={(e) => set({ excludeSaleItems: e.target.checked })}
              />
              {t('Not on products on sale')}
            </label>
            <ProductPicker
              api={api}
              label={t('Only these products')}
              ids={form.productIds}
              self={null}
              onChange={(productIds) => set({ productIds })}
            />
            <ProductPicker
              api={api}
              label={t('Not these products')}
              ids={form.excludedProductIds}
              self={null}
              onChange={(excludedProductIds) => set({ excludedProductIds })}
            />
            {categoryChooser(t('Only these categories'), form.categoryIds, (categoryIds) =>
              set({ categoryIds }),
            )}
            {categoryChooser(
              t('Not these categories'),
              form.excludedCategoryIds,
              (excludedCategoryIds) => set({ excludedCategoryIds }),
            )}
            <label className="sh-field">
              <span>{t('Only for these emails')}</span>
              <textarea
                rows={2}
                value={emails}
                placeholder="anna@example.com, *@company.com"
                onChange={(e) => {
                  save.reset();
                  setEmails(e.target.value);
                }}
              />
              <small>{t('Separated by commas; * for any part. Empty: anybody.')}</small>
              {Object.entries(errors)
                .filter(([path]) => path.startsWith('emails'))
                .map(([path, message]) => (
                  <small key={path} className="sh-error">
                    {message}
                  </small>
                ))}
            </label>
          </div>
        </details>

        <details open={!!coupon && (form.usageLimit !== null || form.usageLimitPerUser !== null)}>
          <summary>
            <strong>{t('Usage limits')}</strong>
          </summary>
          <div className="sh-grid" style={{ marginTop: '.75rem' }}>
            <label className="sh-field">
              <span>{t('Uses in all')}</span>
              <input
                type="number"
                min={1}
                value={form.usageLimit ?? ''}
                placeholder={t('No limit')}
                onChange={(e) => set({ usageLimit: limit(e.target.value) })}
              />
            </label>
            <label className="sh-field">
              <span>{t('Uses per customer')}</span>
              <input
                type="number"
                min={1}
                value={form.usageLimitPerUser ?? ''}
                placeholder={t('No limit')}
                onChange={(e) => set({ usageLimitPerUser: limit(e.target.value) })}
              />
            </label>
            {form.kind !== 'fixed_cart' && (
              <label className="sh-field">
                <span>{t('On this many items at most')}</span>
                <input
                  type="number"
                  min={1}
                  value={form.limitItems ?? ''}
                  placeholder={t('No limit')}
                  onChange={(e) => set({ limitItems: limit(e.target.value) })}
                />
              </label>
            )}
          </div>
        </details>

        {coupon && coupon.usageCount > 0 && (
          <section className="sh-stack">
            <strong>{t('Used in {n} orders', { n: coupon.usageCount })}</strong>
            <ul className="sh-small" style={{ margin: 0 }}>
              {uses.data?.items.map((u) => (
                <li key={u.orderId}>
                  #{u.number} · {u.email} · {new Date(u.createdAt).toLocaleDateString(locale)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {(save.error ?? remove.error) && <Alert>{errorMessage(save.error ?? remove.error)}</Alert>}
        <div className="sh-row sh-between">
          <button
            type="button"
            className="sh-btn sh-btn-primary"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {t('Save')}
          </button>
          {coupon && (
            <button
              type="button"
              className="sh-btn sh-btn-danger"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(t('Delete coupon {code}?', { code: coupon.code })))
                  remove.mutate();
              }}
            >
              {t('Delete')}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

const hasRestrictions = (form: Form) =>
  !!(
    form.minSpend ||
    form.maxSpend ||
    form.individualUse ||
    form.excludeSaleItems ||
    form.productIds.length ||
    form.excludedProductIds.length ||
    form.categoryIds.length ||
    form.excludedCategoryIds.length ||
    form.emails.length
  );
