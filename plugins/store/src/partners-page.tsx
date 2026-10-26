import {
  Alert,
  Button,
  Card,
  errorMessage,
  TextField,
  type AdminPageProps,
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface PartnerRow {
  email: string;
  name: string;
  discountPercent: number;
  code: string | null;
  lsDiscountCode: string | null;
  note: string | null;
  licenses: number;
  activeLicenses: number;
  seatsUsed: number;
  seatsTotal: number | null;
  revenueCents: number;
}
interface PartnerLicense {
  id: string;
  keyHint: string;
  productSlug: string;
  email: string;
  ownerEmail: string | null;
  seats: number;
  used: number;
  sites: string[];
  updatesUntil: string | null;
  status: 'active' | 'revoked';
  priceCents: number | null;
  currency: string | null;
  discountPercent: number | null;
}

const T = {
  en: {
    title: 'Partners',
    intro:
      'Agencies and resellers: their discount on list prices, their licenses and the sites using them. Record keeping only: payments are not handled here. A license is the partner’s when the partner manages it (agency) or bought it.',
    email: 'Email (the partner’s account in the portal)',
    name: 'Name',
    discount: 'Discount %',
    code: 'Checkout code (custom data “partner”)',
    codeHint:
      'Lemon Squeezy checkouts that carry checkout[custom][partner]=<code> give the license to the partner as its agency.',
    lsCode: 'Lemon Squeezy discount code',
    lsHint: 'Made in Lemon Squeezy, which applies the discount; kept here for reference.',
    note: 'Note',
    save: 'Save partner',
    remove: 'Remove',
    confirmRemove: 'Remove this partner? Its licenses stay as they are.',
    none: 'No partners yet.',
    licenses: '{active} active licenses of {all}',
    seats: '{used} sites in use of {total}',
    seatsAny: '{used} sites in use (no limit)',
    revenue: 'recorded: {amount}',
    show: 'Licenses',
    managed: 'managed for {email}',
    revoked: 'revoked',
    noLicenses: 'No licenses.',
  },
  it: {
    title: 'Partner',
    intro:
      'Agenzie e rivenditori: il loro sconto sui prezzi di listino, le loro licenze e i siti che le usano. Solo per memoria: qui non si gestiscono pagamenti. Una licenza è del partner quando la gestisce (agenzia) o l’ha comprata.',
    email: 'Email (l’account del partner nel portale)',
    name: 'Nome',
    discount: 'Sconto %',
    code: 'Codice per il checkout (dato personalizzato «partner»)',
    codeHint:
      'I checkout di Lemon Squeezy con checkout[custom][partner]=<codice> danno la licenza al partner come agenzia.',
    lsCode: 'Codice sconto di Lemon Squeezy',
    lsHint: 'Creato in Lemon Squeezy, che applica lo sconto; qui solo come riferimento.',
    note: 'Nota',
    save: 'Salva il partner',
    remove: 'Rimuovi',
    confirmRemove: 'Rimuovere il partner? Le sue licenze restano come sono.',
    none: 'Ancora nessun partner.',
    licenses: '{active} licenze attive su {all}',
    seats: '{used} siti in uso su {total}',
    seatsAny: '{used} siti in uso (senza limite)',
    revenue: 'registrato: {amount}',
    show: 'Licenze',
    managed: 'gestita per {email}',
    revoked: 'revocata',
    noLicenses: 'Nessuna licenza.',
  },
};

const fill = (s: string, values: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));
const money = (cents: number, currency: string, locale: string) => {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return (cents / 100).toFixed(2);
  }
};

const empty = { email: '', name: '', discountPercent: 30, code: '', lsDiscountCode: '', note: '' };

function PartnerLicenses({
  email,
  api,
  locale,
  t,
}: {
  email: string;
  api: AdminPageProps['api'];
  locale: string;
  t: (typeof T)['en'];
}) {
  const list = useQuery({
    queryKey: ['store', 'partner-licenses', email],
    queryFn: () =>
      api<PartnerLicense[]>('GET', `/admin/partners/${encodeURIComponent(email)}/licenses`),
  });
  if (list.error) return <Alert>{errorMessage(list.error)}</Alert>;
  if (list.data?.length === 0) return <p className="text-sm text-slate-600">{t.noLicenses}</p>;
  return (
    <ul className="space-y-2 text-sm">
      {list.data?.map((l) => (
        <li key={l.id} className="rounded border border-slate-200 p-2">
          <div className="flex flex-wrap gap-x-3">
            <code>…{l.keyHint}</code>
            <strong>{l.productSlug}</strong>
            <span>
              {l.ownerEmail === email && l.email !== email
                ? fill(t.managed, { email: l.email })
                : l.email}
            </span>
            <span>
              {l.seats === 0
                ? fill(t.seatsAny, { used: l.used })
                : fill(t.seats, { used: l.used, total: l.seats })}
            </span>
            {l.updatesUntil && <span>→ {new Date(l.updatesUntil).toLocaleDateString(locale)}</span>}
            {l.priceCents !== null && (
              <span>
                {money(l.priceCents, l.currency ?? 'EUR', locale)}
                {l.discountPercent ? ` (−${l.discountPercent}%)` : ''}
              </span>
            )}
            {l.status === 'revoked' && <span className="text-red-700">{t.revoked}</span>}
          </div>
          {l.sites.length > 0 && (
            <div className="text-xs text-slate-600">{l.sites.join(' · ')}</div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function PartnersPage({ api, user }: AdminPageProps) {
  const t = user.locale.startsWith('it') ? T.it : T.en;
  const locale = user.locale;
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ['store'] });
  const list = useQuery({
    queryKey: ['store', 'partners'],
    queryFn: () => api<PartnerRow[]>('GET', '/admin/partners'),
  });
  const [draft, setDraft] = useState(empty);
  const [open, setOpen] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api('PUT', '/admin/partners', draft),
    onSuccess: () => {
      setDraft(empty);
      return refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (email: string) => api('DELETE', `/admin/partners/${encodeURIComponent(email)}`),
    onSuccess: refresh,
  });

  return (
    <div className="max-w-5xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="text-sm text-slate-600">{t.intro}</p>
      </div>
      {(list.error ?? remove.error) && <Alert>{errorMessage(list.error ?? remove.error)}</Alert>}
      <Card title={t.title}>
        {list.data?.length === 0 && <p className="text-sm text-slate-600">{t.none}</p>}
        <ul className="divide-y divide-slate-100">
          {list.data?.map((p) => (
            <li key={p.email} className="space-y-2 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  type="button"
                  className="font-semibold text-sky-700 underline"
                  onClick={() =>
                    setDraft({
                      email: p.email,
                      name: p.name,
                      discountPercent: p.discountPercent,
                      code: p.code ?? '',
                      lsDiscountCode: p.lsDiscountCode ?? '',
                      note: p.note ?? '',
                    })
                  }
                >
                  {p.name}
                </button>
                <span>{p.email}</span>
                <span>−{p.discountPercent}%</span>
                {p.code && <code>{p.code}</code>}
                {p.lsDiscountCode && <code>{p.lsDiscountCode}</code>}
              </div>
              <div className="flex flex-wrap gap-x-3 text-slate-700">
                <span>{fill(t.licenses, { active: p.activeLicenses, all: p.licenses })}</span>
                <span>
                  {p.seatsTotal === null
                    ? fill(t.seatsAny, { used: p.seatsUsed })
                    : fill(t.seats, { used: p.seatsUsed, total: p.seatsTotal })}
                </span>
                {p.revenueCents > 0 && (
                  <span>{fill(t.revenue, { amount: money(p.revenueCents, 'EUR', locale) })}</span>
                )}
                {p.note && <span className="text-slate-500">{p.note}</span>}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  aria-expanded={open === p.email}
                  onClick={() => setOpen(open === p.email ? null : p.email)}
                >
                  {t.show}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (window.confirm(t.confirmRemove)) remove.mutate(p.email);
                  }}
                >
                  {t.remove}
                </Button>
              </div>
              {open === p.email && (
                <PartnerLicenses email={p.email} api={api} locale={locale} t={t} />
              )}
            </li>
          ))}
        </ul>
        <form
          className="mt-4 grid gap-3 md:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <TextField
            label={t.email}
            type="email"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          />
          <TextField
            label={t.name}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <TextField
            label={t.discount}
            type="number"
            min={0}
            max={100}
            value={draft.discountPercent}
            onChange={(e) => setDraft({ ...draft, discountPercent: Number(e.target.value) })}
          />
          <TextField
            label={t.code}
            hint={t.codeHint}
            value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
          />
          <TextField
            label={t.lsCode}
            hint={t.lsHint}
            value={draft.lsDiscountCode}
            onChange={(e) => setDraft({ ...draft, lsDiscountCode: e.target.value })}
          />
          <TextField
            label={t.note}
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />
          {save.error && (
            <div className="md:col-span-3">
              <Alert>{errorMessage(save.error)}</Alert>
            </div>
          )}
          <div>
            <Button type="submit" disabled={save.isPending}>
              {t.save}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
