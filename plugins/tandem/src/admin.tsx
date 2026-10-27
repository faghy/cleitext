/**
 * Tandem in the admin: affiliates (approve, reject, suspend, their
 * rate and code), referrals with filters and CSV, payouts (what is to be
 * paid by affiliate, marked as paid, CSV) and the program's settings, with
 * the invitation to Tandem Pro for more sources.
 */
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
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { IT } from './admin/it';
import { CAPABILITY, NAME, PRO_NAME, SLUG, TAGLINE } from './config';
import { formatMoney } from './model/money';
import type { AffiliateStatus, ReferralStatus } from './model/rules';
import { CATEGORIES, SOURCE_NAMES, SOURCES, type Settings, type Source } from './model/settings';

addMessages('it', IT);

type Api = AdminPageProps['api'];
type Totals = Record<string, { pending: number; approved: number; paid: number }>;

interface Affiliate {
  id: string;
  name: string;
  email: string;
  code: string;
  status: AffiliateStatus;
  rate: string | null;
  website: string;
  promotion: string;
  paypalEmail: string;
  iban: string;
  note: string;
  createdAt: string;
  visits: number;
  conversions: number;
  totals: Totals;
  link: string;
}

interface Referral {
  referral: {
    id: string;
    kind: 'conversion' | 'adjustment';
    source: string;
    label: string;
    customerEmail: string;
    status: ReferralStatus;
    amountCents: number;
    currency: string;
    createdAt: string;
  };
  affiliate: { id: string; name: string; code: string };
}

interface PayoutLine {
  affiliateId: string;
  currency: string;
  amountCents: number;
  count: number;
  due: boolean;
  affiliate: {
    id: string;
    name: string;
    email: string;
    code: string;
    paypalEmail: string;
    iban: string;
  } | null;
}

interface Overview {
  settings: Settings;
  counts: { pending: number; active: number };
  toPay: number;
  missed: Record<string, number>;
  allSources: boolean;
  upgradeUrl: string;
}

const input = 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm';
const cell = 'border-b border-slate-100 px-2 py-2 align-top text-sm';
const head = 'border-b border-slate-200 px-2 py-2 text-left text-xs font-semibold text-slate-600';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-sm font-medium text-slate-800">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function useMoney(locale: string) {
  return (cents: number, currency: string) => formatMoney(cents, currency, locale);
}

function StatusPill({ status }: { status: string }) {
  const { t } = useT();
  const colors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    active: 'bg-emerald-100 text-emerald-800',
    approved: 'bg-emerald-100 text-emerald-800',
    paid: 'bg-sky-100 text-sky-800',
    rejected: 'bg-slate-200 text-slate-700',
    suspended: 'bg-red-100 text-red-800',
  };
  const labels: Record<string, string> = {
    pending: t('Pending'),
    active: t('Active'),
    approved: t('Approved'),
    paid: t('Paid'),
    rejected: t('Rejected'),
    suspended: t('Suspended'),
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${colors[status] ?? ''}`}>
      {labels[status] ?? status}
    </span>
  );
}

/** The invitation to Tandem Pro, where the free version stops. */
function ProInvite({ url, children }: { url: string; children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {children}{' '}
      <a className="font-semibold underline" href={url} target="_blank" rel="noopener noreferrer">
        {t('Discover {pro}', { pro: PRO_NAME })}
      </a>
    </div>
  );
}

// ---- Affiliates ------------------------------------------------------------------------------

function Affiliates({ api, locale, settings }: { api: Api; locale: string; settings: Settings }) {
  const { t } = useT();
  const money = useMoney(locale);
  const client = useQueryClient();
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Affiliate | null>(null);
  const query = useQuery({
    queryKey: [SLUG, 'affiliates', status, search],
    queryFn: () =>
      api<{ total: number; affiliates: Affiliate[] }>(
        'GET',
        `/affiliates?${new URLSearchParams({ status, search })}`,
      ),
  });
  const refresh = () => client.invalidateQueries({ queryKey: [SLUG] });
  const setAffiliateStatus = useMutation({
    mutationFn: (v: { id: string; status: AffiliateStatus }) =>
      api('POST', `/affiliates/${v.id}/status`, { status: v.status }),
    onSuccess: refresh,
  });
  return (
    <Card title={t('Affiliates')}>
      <div className="mb-3 flex flex-wrap gap-2">
        <select
          className="rounded border border-slate-300 px-2 py-2 text-sm"
          aria-label={t('Status')}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{t('All')}</option>
          <option value="pending">{t('Pending')}</option>
          <option value="active">{t('Active')}</option>
          <option value="suspended">{t('Suspended')}</option>
          <option value="rejected">{t('Rejected')}</option>
        </select>
        <input
          className="rounded border border-slate-300 px-3 py-2 text-sm"
          type="search"
          placeholder={t('Search by name, email or code')}
          aria-label={t('Search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {query.error ? <Alert>{errorMessage(query.error)}</Alert> : null}
      {setAffiliateStatus.error ? <Alert>{errorMessage(setAffiliateStatus.error)}</Alert> : null}
      {query.data && query.data.affiliates.length === 0 ? (
        <p className="text-sm text-slate-600">
          {t(
            'No affiliates yet. Put the application block on a page, or share the affiliate area of the account.',
          )}
        </p>
      ) : null}
      {query.data && query.data.affiliates.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={head}>{t('Affiliate')}</th>
                <th className={head}>{t('Code')}</th>
                <th className={head}>{t('Status')}</th>
                <th className={head}>{t('Visits')}</th>
                <th className={head}>{t('Conversions')}</th>
                <th className={head}>{t('Earnings')}</th>
                <th className={head}>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {query.data.affiliates.map((a) => (
                <tr key={a.id}>
                  <td className={cell}>
                    <strong>{a.name || '—'}</strong>
                    <div className="text-xs text-slate-500">{a.email}</div>
                    {a.website ? (
                      <a
                        className="text-xs text-sky-700 underline"
                        href={a.website}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {a.website}
                      </a>
                    ) : null}
                    {a.promotion ? (
                      <div className="mt-1 text-xs text-slate-600">{a.promotion}</div>
                    ) : null}
                  </td>
                  <td className={cell}>
                    <code>{a.code}</code>
                    {a.rate !== null ? (
                      <div className="text-xs text-slate-500">
                        {t('Own rate: {rate}', {
                          rate:
                            settings.commissionType === 'percent'
                              ? `${Number(a.rate)}%`
                              : money(Math.round(Number(a.rate) * 100), settings.currency),
                        })}
                      </div>
                    ) : null}
                  </td>
                  <td className={cell}>
                    <StatusPill status={a.status} />
                  </td>
                  <td className={cell}>{a.visits}</td>
                  <td className={cell}>{a.conversions}</td>
                  <td className={cell}>
                    {Object.entries(a.totals).map(([currency, v]) => (
                      <div key={currency} className="text-xs">
                        {t('Waiting')}: {money(v.pending, currency)} · {t('To pay')}:{' '}
                        {money(v.approved, currency)} · {t('Paid')}: {money(v.paid, currency)}
                      </div>
                    ))}
                  </td>
                  <td className={cell}>
                    <div className="flex flex-wrap gap-1">
                      {a.status !== 'active' ? (
                        <Button
                          onClick={() => setAffiliateStatus.mutate({ id: a.id, status: 'active' })}
                        >
                          {a.status === 'pending' ? t('Approve') : t('Reactivate')}
                        </Button>
                      ) : null}
                      {a.status === 'pending' ? (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setAffiliateStatus.mutate({ id: a.id, status: 'rejected' })
                          }
                        >
                          {t('Reject')}
                        </Button>
                      ) : null}
                      {a.status === 'active' ? (
                        <Button
                          variant="danger"
                          onClick={() =>
                            setAffiliateStatus.mutate({ id: a.id, status: 'suspended' })
                          }
                        >
                          {t('Suspend')}
                        </Button>
                      ) : null}
                      <Button variant="secondary" onClick={() => setEditing(a)}>
                        {t('Edit')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {editing ? (
        <EditAffiliate
          api={api}
          affiliate={editing}
          settings={settings}
          onDone={() => {
            setEditing(null);
            void refresh();
          }}
        />
      ) : null}
    </Card>
  );
}

function EditAffiliate({
  api,
  affiliate,
  settings,
  onDone,
}: {
  api: Api;
  affiliate: Affiliate;
  settings: Settings;
  onDone: () => void;
}) {
  const { t } = useT();
  const [code, setCode] = useState(affiliate.code);
  const [rate, setRate] = useState(affiliate.rate === null ? '' : String(Number(affiliate.rate)));
  const [note, setNote] = useState(affiliate.note);
  const save = useMutation({
    mutationFn: () => api('PATCH', `/affiliates/${affiliate.id}`, { code, rate, note }),
    onSuccess: onDone,
  });
  return (
    <div className="mt-4 space-y-3 rounded border border-slate-200 p-3">
      <h3 className="font-semibold">
        {t('Edit {name}', { name: affiliate.name || affiliate.code })}
      </h3>
      <p className="text-xs text-slate-600">
        {t('Link')}: <code>{affiliate.link}</code>
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <TextField
          label={t('Code')}
          hint={t('Changing it changes the link: links shared before stop counting.')}
          value={code}
          onChange={(e) => setCode(e.target.value.toLowerCase())}
        />
        <TextField
          label={
            settings.commissionType === 'percent'
              ? t('Own rate (%)')
              : t('Own amount ({currency})', { currency: settings.currency })
          }
          hint={t('Empty: the program’s commission.')}
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
      </div>
      <Field label={t('Private note')}>
        <textarea
          className={input}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {affiliate.paypalEmail || affiliate.iban ? (
        <p className="text-xs text-slate-600">
          {t('Payment details')}: {affiliate.paypalEmail || affiliate.iban}
        </p>
      ) : null}
      {save.error ? <Alert>{errorMessage(save.error)}</Alert> : null}
      <div className="flex gap-2">
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {t('Save')}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          {t('Cancel')}
        </Button>
      </div>
    </div>
  );
}

// ---- Referrals -------------------------------------------------------------------------------

function Referrals({ api, locale }: { api: Api; locale: string }) {
  const { t, language } = useT();
  const money = useMoney(locale);
  const client = useQueryClient();
  const [filters, setFilters] = useState({ status: '', source: '', from: '', to: '' });
  const params = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v) as [string, string][],
  ).toString();
  const query = useQuery({
    queryKey: [SLUG, 'referrals', params],
    queryFn: () => api<{ total: number; rows: Referral[] }>('GET', `/referrals?${params}`),
  });
  const change = useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      api('POST', `/referrals/${v.id}/status`, { status: v.status }),
    onSuccess: () => client.invalidateQueries({ queryKey: [SLUG] }),
  });
  const set = (key: keyof typeof filters) => (value: string) =>
    setFilters({ ...filters, [key]: value });
  return (
    <Card title={t('Referrals')}>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <select
          className="rounded border border-slate-300 px-2 py-2 text-sm"
          aria-label={t('Status')}
          value={filters.status}
          onChange={(e) => set('status')(e.target.value)}
        >
          <option value="">{t('All')}</option>
          <option value="pending">{t('Pending')}</option>
          <option value="approved">{t('Approved')}</option>
          <option value="paid">{t('Paid')}</option>
          <option value="rejected">{t('Rejected')}</option>
        </select>
        <select
          className="rounded border border-slate-300 px-2 py-2 text-sm"
          aria-label={t('Source')}
          value={filters.source}
          onChange={(e) => set('source')(e.target.value)}
        >
          <option value="">{t('Every source')}</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_NAMES[s][language === 'it' ? 'it' : 'en']}
            </option>
          ))}
        </select>
        <label className="text-xs text-slate-600">
          {t('From')}
          <input
            className="ml-1 rounded border border-slate-300 px-2 py-1 text-sm"
            type="date"
            value={filters.from}
            onChange={(e) => set('from')(e.target.value)}
          />
        </label>
        <label className="text-xs text-slate-600">
          {t('To')}
          <input
            className="ml-1 rounded border border-slate-300 px-2 py-1 text-sm"
            type="date"
            value={filters.to}
            onChange={(e) => set('to')(e.target.value)}
          />
        </label>
        <a
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          href={`/api/v1/ext/${SLUG}/referrals.csv?${params}`}
        >
          {t('Export CSV')}
        </a>
      </div>
      {query.error ? <Alert>{errorMessage(query.error)}</Alert> : null}
      {query.data && query.data.rows.length === 0 ? (
        <p className="text-sm text-slate-600">{t('No referrals.')}</p>
      ) : null}
      {query.data && query.data.rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={head}>{t('Date')}</th>
                <th className={head}>{t('Affiliate')}</th>
                <th className={head}>{t('What')}</th>
                <th className={head}>{t('Customer')}</th>
                <th className={head}>{t('Status')}</th>
                <th className={head}>{t('Commission')}</th>
                <th className={head}>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {query.data.rows.map(({ referral: r, affiliate: a }) => (
                <tr key={r.id}>
                  <td className={cell}>{new Date(r.createdAt).toLocaleDateString(locale)}</td>
                  <td className={cell}>
                    {a.name} <code className="text-xs">{a.code}</code>
                  </td>
                  <td className={cell}>
                    {r.kind === 'adjustment' ? `${t('Refund adjustment')}: ` : ''}
                    {r.label}{' '}
                    <span className="text-xs text-slate-500">
                      (
                      {SOURCE_NAMES[r.source as Source]?.[language === 'it' ? 'it' : 'en'] ??
                        r.source}
                      )
                    </span>
                  </td>
                  <td className={cell}>{r.customerEmail}</td>
                  <td className={cell}>
                    <StatusPill status={r.status} />
                  </td>
                  <td className={cell}>{money(Number(r.amountCents), r.currency)}</td>
                  <td className={cell}>
                    {r.kind === 'conversion' && r.status === 'pending' ? (
                      <div className="flex gap-1">
                        <Button
                          variant="secondary"
                          onClick={() => change.mutate({ id: r.id, status: 'approved' })}
                        >
                          {t('Approve')}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => change.mutate({ id: r.id, status: 'rejected' })}
                        >
                          {t('Reject')}
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">
            {t('{n} referrals', { n: query.data.total })}
          </p>
        </div>
      ) : null}
    </Card>
  );
}

// ---- Payouts ---------------------------------------------------------------------------------

function Payouts({ api, locale }: { api: Api; locale: string }) {
  const { t } = useT();
  const money = useMoney(locale);
  const client = useQueryClient();
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const query = useQuery({
    queryKey: [SLUG, 'payouts'],
    queryFn: () =>
      api<{
        lines: PayoutLine[];
        history: {
          payout: {
            id: string;
            amountCents: number;
            currency: string;
            paidAt: string;
            note: string;
            details: string;
          };
          affiliate: { name: string; code: string };
        }[];
        settings: Settings;
      }>('GET', '/payouts'),
  });
  const pay = useMutation({
    mutationFn: (line: PayoutLine) =>
      api('POST', '/payouts', {
        affiliateId: line.affiliateId,
        currency: line.currency,
        note,
        paidAt: date,
      }),
    onSuccess: () => {
      setNote('');
      void client.invalidateQueries({ queryKey: [SLUG] });
    },
  });
  const data = query.data;
  return (
    <div className="space-y-4">
      <Card title={t('To pay')}>
        {query.error ? <Alert>{errorMessage(query.error)}</Alert> : null}
        {data ? (
          <p className="mb-3 text-sm text-slate-600">
            {data.settings.minPayout > 0
              ? t('Approved commissions, by affiliate. Payouts start from {amount}.', {
                  amount: money(Math.round(data.settings.minPayout * 100), data.settings.currency),
                })
              : t('Approved commissions, by affiliate.')}{' '}
            {t('Pay them by PayPal or bank transfer, then mark them as paid.')}
          </p>
        ) : null}
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <TextField
            label={t('Payment date')}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <TextField
            label={t('Note for the affiliate (optional)')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <a
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            href={`/api/v1/ext/${SLUG}/payouts.csv`}
          >
            {t('Export CSV')}
          </a>
        </div>
        {pay.error ? <Alert>{errorMessage(pay.error)}</Alert> : null}
        {data && data.lines.length === 0 ? (
          <p className="text-sm text-slate-600">{t('Nothing to pay.')}</p>
        ) : null}
        {data && data.lines.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr>
                <th className={head}>{t('Affiliate')}</th>
                <th className={head}>{t('Payment details')}</th>
                <th className={head}>{t('Commissions')}</th>
                <th className={head}>{t('Amount')}</th>
                <th className={head}>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => (
                <tr key={`${line.affiliateId}-${line.currency}`}>
                  <td className={cell}>
                    {line.affiliate?.name} <code className="text-xs">{line.affiliate?.code}</code>
                  </td>
                  <td className={cell}>
                    {line.affiliate?.paypalEmail ? `PayPal: ${line.affiliate.paypalEmail}` : null}
                    {line.affiliate?.iban ? (
                      <div>
                        IBAN: <code>{line.affiliate.iban}</code>
                      </div>
                    ) : null}
                    {!line.affiliate?.paypalEmail && !line.affiliate?.iban ? (
                      <span className="text-xs text-amber-700">{t('No payment details yet')}</span>
                    ) : null}
                  </td>
                  <td className={cell}>{line.count}</td>
                  <td className={cell}>
                    <strong>{money(line.amountCents, line.currency)}</strong>
                    {!line.due ? (
                      <div className="text-xs text-slate-500">{t('Below the threshold')}</div>
                    ) : null}
                  </td>
                  <td className={cell}>
                    <Button
                      disabled={pay.isPending || line.amountCents <= 0}
                      onClick={() => {
                        if (
                          window.confirm(
                            t('Mark {amount} as paid to {name}?', {
                              amount: money(line.amountCents, line.currency),
                              name: line.affiliate?.name ?? '',
                            }),
                          )
                        )
                          pay.mutate(line);
                      }}
                    >
                      {t('Mark as paid')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Card>
      <Card title={t('Payouts made')}>
        {data && data.history.length === 0 ? (
          <p className="text-sm text-slate-600">{t('No payouts yet.')}</p>
        ) : null}
        {data && data.history.length > 0 ? (
          <table className="w-full">
            <tbody>
              {data.history.map(({ payout: p, affiliate: a }) => (
                <tr key={p.id}>
                  <td className={cell}>{new Date(p.paidAt).toLocaleDateString(locale)}</td>
                  <td className={cell}>
                    {a.name} <code className="text-xs">{a.code}</code>
                  </td>
                  <td className={cell}>{p.details}</td>
                  <td className={cell}>{p.note}</td>
                  <td className={cell}>{money(Number(p.amountCents), p.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Card>
    </div>
  );
}

// ---- Settings --------------------------------------------------------------------------------

function SettingsForm({ api, overview }: { api: Api; overview: Overview }) {
  const { t, language } = useT();
  const client = useQueryClient();
  const [draft, setDraft] = useState<Settings>(overview.settings);
  useEffect(() => setDraft(overview.settings), [overview.settings]);
  const save = useMutation({
    mutationFn: () => api<{ settings: Settings }>('PUT', '/settings', draft),
    onSuccess: () => client.invalidateQueries({ queryKey: [SLUG] }),
  });
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft({ ...draft, [key]: value });
  const lang = language === 'it' ? 'it' : 'en';
  return (
    <Card title={t('Settings')}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label={t('Source of the conversions')}
          hint={
            overview.allSources
              ? t('With {pro} every source counts.', { pro: PRO_NAME })
              : t('The free version counts one source.')
          }
        >
          <select
            className={input}
            value={draft.source}
            onChange={(e) => set('source', e.target.value as Source)}
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_NAMES[s][lang]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('Applications')}>
          <select
            className={input}
            value={draft.approval}
            onChange={(e) => set('approval', e.target.value as Settings['approval'])}
          >
            <option value="manual">{t('Approved by hand')}</option>
            <option value="auto">{t('Approved at once')}</option>
          </select>
        </Field>
        <Field label={t('Commission')}>
          <select
            className={input}
            value={draft.commissionType}
            onChange={(e) => set('commissionType', e.target.value as Settings['commissionType'])}
          >
            <option value="percent">{t('Percent of the sale')}</option>
            <option value="fixed">{t('Fixed amount per conversion')}</option>
          </select>
        </Field>
        <TextField
          label={draft.commissionType === 'percent' ? t('Percent') : t('Amount')}
          inputMode="decimal"
          value={String(draft.commissionValue)}
          onChange={(e) => set('commissionValue', Number(e.target.value.replace(',', '.')) || 0)}
          hint={
            draft.commissionType === 'percent'
              ? t('On Cleishop orders: of the products, without shipping and taxes.')
              : t('Also for contacts and bookings, which have no amount.')
          }
        />
        <TextField
          label={t('Currency')}
          maxLength={3}
          value={draft.currency}
          onChange={(e) => set('currency', e.target.value.toUpperCase())}
          hint={t('Of fixed commissions and of the payout threshold.')}
        />
        <TextField
          label={t('Refund window (days)')}
          type="number"
          min={0}
          max={365}
          value={draft.refundDays}
          onChange={(e) => set('refundDays', Number(e.target.value))}
          hint={t('Commissions are approved after these days.')}
        />
        <TextField
          label={t('Payout threshold')}
          inputMode="decimal"
          value={String(draft.minPayout)}
          onChange={(e) => set('minPayout', Number(e.target.value.replace(',', '.')) || 0)}
        />
        <TextField
          label={t('Program terms page')}
          value={draft.termsUrl}
          placeholder="/affiliate-terms"
          onChange={(e) => set('termsUrl', e.target.value)}
          hint={t('Its address: applicants accept the terms.')}
        />
      </div>
      <h3 className="mt-6 mb-2 font-semibold">{t('Link tracking')}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label={t('Link parameter')}
          value={draft.param}
          onChange={(e) => set('param', e.target.value.toLowerCase())}
          hint={t('The links look like https://your-site/?{param}=code', { param: draft.param })}
        />
        <TextField
          label={t('Cookie duration (days)')}
          type="number"
          min={1}
          max={365}
          value={draft.cookieDays}
          onChange={(e) => set('cookieDays', Number(e.target.value))}
        />
        <Field label={t('When two links were used')}>
          <select
            className={input}
            value={draft.model}
            onChange={(e) => set('model', e.target.value as Settings['model'])}
          >
            <option value="last">{t('The last one wins')}</option>
            <option value="first">{t('The first one wins')}</option>
          </select>
        </Field>
        <Field
          label={t('Consent category')}
          hint={t(
            'The cookie is set only with this consent (Privacy & GDPR banner). Without consent, nothing is stored.',
          )}
        >
          <select
            className={input}
            value={draft.category}
            onChange={(e) => set('category', e.target.value as Settings['category'])}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === 'marketing'
                  ? t('Marketing')
                  : c === 'statistics'
                    ? t('Statistics')
                    : t('Preferences')}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <h3 className="mt-6 mb-2 font-semibold">{t('Emails')}</h3>
      <div className="space-y-2">
        {(
          [
            ['application', t('New application (to the administrators)')],
            ['approved', t('Application approved (to the affiliate)')],
            ['referral', t('New commission (to the affiliate)')],
            ['payout', t('Payout made (to the affiliate)')],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.emails[key]}
              onChange={(e) => set('emails', { ...draft.emails, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
        <TextField
          label={t('Send applications to')}
          value={draft.notifyEmail}
          onChange={(e) => set('notifyEmail', e.target.value)}
          hint={t('Empty: the site’s administrators.')}
        />
      </div>
      {save.error ? <Alert>{errorMessage(save.error)}</Alert> : null}
      {save.isSuccess ? <Alert kind="success">{t('Saved.')}</Alert> : null}
      <div className="mt-4">
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {t('Save')}
        </Button>
      </div>
    </Card>
  );
}

// ---- The page --------------------------------------------------------------------------------

type Tab = 'affiliates' | 'referrals' | 'payouts' | 'settings';

function TandemPage({ api, user }: AdminPageProps) {
  const { t, language } = useT();
  const [tab, setTab] = useState<Tab>(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    return wanted && ['affiliates', 'referrals', 'payouts', 'settings'].includes(wanted)
      ? wanted
      : 'affiliates';
  });
  const overview = useQuery({
    queryKey: [SLUG, 'overview'],
    queryFn: () => api<Overview>('GET', '/overview'),
  });
  const data = overview.data;
  const missed = data ? Object.entries(data.missed).reduce((sum, [, n]) => sum + n, 0) : 0;
  const labels: Record<Tab, string> = {
    affiliates: data?.counts.pending
      ? t('Affiliates ({n} to review)', { n: data.counts.pending })
      : t('Affiliates'),
    referrals: t('Referrals'),
    payouts: data?.toPay ? t('Payouts ({n})', { n: data.toPay }) : t('Payouts'),
    settings: t('Settings'),
  };
  return (
    <div className="max-w-6xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{NAME.en}</h1>
        <p className="text-slate-600 italic">{language === 'it' ? TAGLINE.it : TAGLINE.en}</p>
      </header>
      {overview.error ? <Alert>{errorMessage(overview.error)}</Alert> : null}
      {data && !data.allSources ? (
        missed > 0 ? (
          <ProInvite url={data.upgradeUrl}>
            {t(
              'In the last months affiliates brought {n} conversions from other sources, not counted: the free version counts {source} only.',
              {
                n: missed,
                source: SOURCE_NAMES[data.settings.source][language === 'it' ? 'it' : 'en'],
              },
            )}
          </ProInvite>
        ) : (
          <p className="text-xs text-slate-500">
            {t(
              'Conversions counted from {source}. Every source together, rules per product and recurring commissions come with {pro}.',
              {
                source: SOURCE_NAMES[data.settings.source][language === 'it' ? 'it' : 'en'],
                pro: PRO_NAME,
              },
            )}{' '}
            <a
              className="underline"
              href={data.upgradeUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('Discover {pro}', { pro: PRO_NAME })}
            </a>
          </p>
        )
      ) : null}
      <div
        role="tablist"
        aria-label={NAME.en}
        className="flex flex-wrap gap-2 border-b border-slate-200"
      >
        {(['affiliates', 'referrals', 'payouts', 'settings'] as Tab[]).map((id) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === id ? 'border-sky-700 font-semibold text-sky-800' : 'border-transparent text-slate-600'}`}
            onClick={() => setTab(id)}
          >
            {labels[id]}
          </button>
        ))}
      </div>
      {data && tab === 'affiliates' ? (
        <Affiliates api={api} locale={user.locale} settings={data.settings} />
      ) : null}
      {tab === 'referrals' ? <Referrals api={api} locale={user.locale} /> : null}
      {tab === 'payouts' ? <Payouts api={api} locale={user.locale} /> : null}
      {data && tab === 'settings' ? <SettingsForm api={api} overview={data} /> : null}
    </div>
  );
}

/** Two people passing the word (an SVG path, as the admin's menu icons). */
const ICON =
  'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6 M17 11a2.5 2.5 0 1 0 0-5 M16 14c2.8.3 5 2.7 5 6';

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: NAME.en, it: NAME.it },
      capability: CAPABILITY,
      component: TandemPage,
      icon: ICON,
    },
  ],
});
