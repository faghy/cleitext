import type { LicenseView, PaidInfo } from '@cleitext/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { Alert, Button, useT } from './ui';

/** "€59 per site · 12 months of updates". */
export function PaidPrice({ paid }: { paid: PaidInfo }) {
  const { t } = useT();
  const me = useMe();
  const price = new Intl.NumberFormat(me.user.locale, {
    style: 'currency',
    currency: paid.price.currency,
    maximumFractionDigits: paid.price.amount % 1 === 0 ? 0 : 2,
  }).format(paid.price.amount);
  return (
    <p className="text-sm">
      <span className="font-semibold">{t('{price} per site', { price })}</span>
      <span className="text-slate-600">
        {' · '}
        {paid.updatesMonths === 0
          ? t('updates with no end')
          : t('{months} months of updates', { months: paid.updatesMonths })}
      </span>
    </p>
  );
}

/**
 * The license of a paid theme on this site (RF-CAT-03): the key to enter,
 * or what the license includes, with a check and a way to free the seat.
 */
export function LicenseBox({
  slug,
  name,
  purchaseUrl,
  license,
}: {
  slug: string;
  name: string;
  purchaseUrl: string | null;
  license: LicenseView | null;
}) {
  const { t } = useT();
  const me = useMe();
  const queryClient = useQueryClient();
  const [key, setKey] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const done = () =>
    Promise.all(
      [['themes'], ['catalog']].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  const activate = useMutation({
    mutationFn: () => api<LicenseView>('PUT', `/licenses/${slug}`, { key }),
    onSuccess: () => {
      setKey('');
      setWarning(null);
      void done();
    },
  });
  const check = useMutation({
    mutationFn: () => api<LicenseView>('POST', `/licenses/${slug}/refresh`),
    onSettled: done,
  });
  const remove = useMutation({
    mutationFn: () => api<{ warning: string | null }>('DELETE', `/licenses/${slug}`),
    onSuccess: (result) => {
      setWarning(result.warning);
      void done();
    },
  });
  const error = activate.error ?? check.error ?? remove.error;
  const date = (iso: string) => new Date(iso).toLocaleDateString(me.user.locale);

  if (!me.capabilities.includes('manage_themes')) return null;
  if (license) {
    const ended = license.updatesUntil !== null && Date.parse(license.updatesUntil) < Date.now();
    return (
      <div className="space-y-2 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm">
        <p className="font-medium text-emerald-900">
          {t('License active on this site')} <code className="font-normal">…{license.keyHint}</code>
        </p>
        <p className="text-emerald-900">
          {license.updatesUntil === null
            ? t('Updates included with no end.')
            : ended
              ? t('Updates ended on {date}: the theme keeps working, renew to get new versions.', {
                  date: date(license.updatesUntil),
                })
              : t('Updates included until {date}.', { date: date(license.updatesUntil) })}
          {license.seats &&
            ` ${
              license.seats.total === 0
                ? t('{used} sites in use, no limit.', { used: license.seats.used })
                : t('{used} of {total} sites in use.', license.seats)
            }`}
        </p>
        {error && <Alert>{errorMessage(error)}</Alert>}
        {check.isSuccess && <Alert kind="success">{t('The license is valid.')}</Alert>}
        <div className="flex flex-wrap items-center gap-2">
          {ended && (license.renewUrl ?? purchaseUrl) && (
            <a
              href={license.renewUrl ?? purchaseUrl ?? ''}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded bg-sky-700 px-3 py-2 font-medium text-white hover:bg-sky-800"
            >
              {t('Renew')}
            </a>
          )}
          <Button variant="secondary" disabled={check.isPending} onClick={() => check.mutate()}>
            {t('Check license')}
          </Button>
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => {
              if (
                window.confirm(
                  t(
                    'Remove the license of {name} from this site? The theme keeps working, but it cannot be activated again here without a license.',
                    { name },
                  ),
                )
              )
                remove.mutate();
            }}
          >
            {t('Remove license')}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <form
      className="space-y-2 rounded border border-slate-200 bg-slate-50 p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        activate.mutate();
      }}
    >
      <label className="block space-y-1">
        <span className="font-medium">{t('License key')}</span>
        <input
          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono uppercase"
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      {warning && <Alert>{warning}</Alert>}
      {error && <Alert>{errorMessage(error)}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!key.trim() || activate.isPending}>
          {activate.isPending ? t('Activating…') : t('Activate license')}
        </Button>
        {purchaseUrl && (
          <a
            href={purchaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-700 hover:underline"
          >
            {t('Buy a license')}
          </a>
        )}
      </div>
    </form>
  );
}
