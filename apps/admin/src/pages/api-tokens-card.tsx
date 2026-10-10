import type { ApiTokenScope, ApiTokenView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { Alert, Button, Card, TextField, useT } from '../components/ui';

const EXPIRY_OPTIONS: { days: number | null; label: string }[] = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
  { days: null, label: 'Never' },
];

/** Profile → API tokens (RF-USR-08): for scripts and integrations. */
export function ApiTokensCard() {
  const { t } = useT();
  const me = useMe();
  const queryClient = useQueryClient();
  const canSeeAll = me.capabilities.includes('manage_users');
  const [all, setAll] = useState(false);
  const tokens = useQuery({
    queryKey: ['tokens', all],
    queryFn: () => api<ApiTokenView[]>('GET', `/tokens${all ? '?all=1' : ''}`),
  });
  const [name, setName] = useState('');
  const [write, setWrite] = useState(false);
  const [expiry, setExpiry] = useState('90');
  const [created, setCreated] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tokens'] });

  const create = useMutation({
    mutationFn: () =>
      api<{ token: string; view: ApiTokenView }>('POST', '/tokens', {
        name,
        scopes: (write ? ['read', 'write'] : ['read']) satisfies ApiTokenScope[],
        expiresInDays: expiry === 'never' ? null : Number(expiry),
      }),
    onSuccess: async (result) => {
      setCreated(result.token);
      setName('');
      await refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/tokens/${id}`),
    onSuccess: refresh,
  });
  const error = create.error ?? revoke.error;
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');

  return (
    <Card title={t('API tokens')}>
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">
          {t(
            'Tokens let scripts and other services use the API as you, with the header "Authorization: Bearer <token>". They can never do more than you.',
          )}
        </p>
        {error && <Alert>{errorMessage(error)}</Alert>}
        {created && (
          <div className="space-y-2 rounded border border-amber-200 bg-amber-50 p-3">
            <p className="font-medium">{t('Copy the token now: it will not be shown again.')}</p>
            <code className="block break-all select-all" data-testid="new-token">
              {created}
            </code>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => void navigator.clipboard?.writeText(created)}
              >
                {t('Copy')}
              </Button>
              <Button variant="secondary" onClick={() => setCreated(null)}>
                {t('Done')}
              </Button>
            </div>
          </div>
        )}
        <form
          className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
          aria-label={t('New token')}
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <TextField
            label={t('Token name')}
            placeholder={t('e.g. Backup script')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="space-y-1">
            <span className="block font-medium text-slate-800">{t('Expires after')}</span>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-2"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            >
              {EXPIRY_OPTIONS.map((option) => (
                <option key={option.label} value={option.days ?? 'never'}>
                  {t(option.label)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2">
            <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} />
            {t('Can make changes')}
          </label>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {t('Create token')}
            </Button>
          </div>
        </form>

        {canSeeAll && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            {t('Show the tokens of every user')}
          </label>
        )}
        {tokens.data && tokens.data.length > 0 ? (
          <table className="w-full text-left">
            <thead className="border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2 font-medium">{t('Name')}</th>
                {all && <th className="py-2 font-medium">{t('Owner')}</th>}
                <th className="py-2 font-medium">{t('Access')}</th>
                <th className="py-2 font-medium">{t('Last used')}</th>
                <th className="py-2 font-medium">{t('Expires')}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {tokens.data.map((token) => (
                <tr key={token.id} className="border-b border-slate-100">
                  <td className="py-2">
                    {token.name}
                    <span className="block font-mono text-xs text-slate-500">{token.prefix}…</span>
                  </td>
                  {all && <td className="py-2">{token.owner?.displayName ?? '—'}</td>}
                  <td className="py-2">
                    {token.scopes.includes('write') ? t('Read and write') : t('Read only')}
                  </td>
                  <td className="py-2">{date(token.lastUsedAt)}</td>
                  <td className="py-2">{token.expiresAt ? date(token.expiresAt) : t('Never')}</td>
                  <td className="py-2 text-right">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (window.confirm(t('Revoke the token "{name}"?', { name: token.name })))
                          revoke.mutate(token.id);
                      }}
                    >
                      {t('Revoke')}
                      <span className="sr-only"> {token.name}</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          tokens.data && <p className="text-slate-600">{t('No tokens yet.')}</p>
        )}
      </div>
    </Card>
  );
}
