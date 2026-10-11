import type { TwoFactorSetupView, TwoFactorStatusView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { renderSVG } from 'uqr';
import { api, errorMessage } from '../api';
import { ME_QUERY_KEY } from '../auth';
import { Alert, Button, Card, TextField, useT } from '../components/ui';

const STATUS_KEY = ['profile', '2fa'];

/** Profile → Two-factor authentication (RF-USR-04). */
export function TwoFactorCard() {
  const { t } = useT();
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => api<TwoFactorStatusView>('GET', '/profile/2fa'),
  });
  const [setup, setSetup] = useState<TwoFactorSetupView | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState<'disable' | 'codes' | null>(null);

  const refresh = () =>
    Promise.all(
      [STATUS_KEY, ME_QUERY_KEY].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  const start = useMutation({
    mutationFn: () => api<TwoFactorSetupView>('POST', '/profile/2fa/setup'),
    onSuccess: (data) => {
      setSetup(data);
      setCode('');
    },
  });
  const enable = useMutation({
    mutationFn: () => api<{ recoveryCodes: string[] }>('POST', '/profile/2fa/enable', { code }),
    onSuccess: async (data) => {
      setSetup(null);
      setCodes(data.recoveryCodes);
      await refresh();
    },
  });
  const confirm = useMutation({
    mutationFn: async () => {
      if (confirming === 'disable') {
        await api<void>('POST', '/profile/2fa/disable', { password });
        return null;
      }
      return (
        await api<{ recoveryCodes: string[] }>('POST', '/profile/2fa/recovery-codes', { password })
      ).recoveryCodes;
    },
    onSuccess: async (newCodes) => {
      setConfirming(null);
      setPassword('');
      if (newCodes) setCodes(newCodes);
      await refresh();
    },
  });
  const error = start.error ?? enable.error ?? confirm.error;

  return (
    <Card title={t('Two-factor authentication')}>
      <div className="space-y-3 text-sm">
        {error && <Alert>{errorMessage(error)}</Alert>}

        {codes && (
          <div className="space-y-2 rounded border border-amber-200 bg-amber-50 p-3">
            <p className="font-medium">{t('Save your recovery codes')}</p>
            <p className="text-slate-600">
              {t(
                'Each code signs you in once if you lose your phone. They are shown only now: keep them somewhere safe.',
              )}
            </p>
            <ul className="grid grid-cols-2 gap-1 font-mono" aria-label={t('Recovery codes')}>
              {codes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => void navigator.clipboard?.writeText(codes.join('\n'))}
              >
                {t('Copy')}
              </Button>
              <Button variant="secondary" onClick={() => setCodes(null)}>
                {t('I saved them')}
              </Button>
            </div>
          </div>
        )}

        {status.data && !status.data.enabled && !setup && (
          <>
            <p className="text-slate-600">
              {t(
                'Besides the password, ask for a code from an authenticator app (such as Google Authenticator, Aegis or 1Password) when signing in.',
              )}
            </p>
            <Button onClick={() => start.mutate()} disabled={start.isPending}>
              {t('Set up two-factor authentication')}
            </Button>
          </>
        )}

        {setup && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              enable.mutate();
            }}
          >
            <p>{t('1. Scan this QR code with your authenticator app:')}</p>
            <div
              className="w-44 rounded bg-white p-2"
              role="img"
              aria-label={t('QR code for the authenticator app')}
              // uqr renders a self-contained SVG from the otpauth address.
              dangerouslySetInnerHTML={{
                __html: renderSVG(setup.otpauthUrl, { whiteColor: '#fff', blackColor: '#000' }),
              }}
            />
            <p className="text-slate-600">
              {t('Or type this key:')}{' '}
              <code className="break-all select-all" data-testid="totp-secret">
                {setup.secret}
              </code>
            </p>
            <TextField
              label={t('2. Enter the 6-digit code it shows')}
              autoComplete="one-time-code"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={enable.isPending || code.trim().length < 6}>
                {t('Turn on')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setSetup(null)}>
                {t('Cancel')}
              </Button>
            </div>
          </form>
        )}

        {status.data?.enabled && (
          <>
            <p>
              <span className="font-medium text-emerald-700">{t('On.')}</span>{' '}
              {t('{count} recovery codes left.', { count: status.data.recoveryCodesLeft })}
            </p>
            {confirming ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  confirm.mutate();
                }}
              >
                <TextField
                  label={t('Your password')}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    variant={confirming === 'disable' ? 'danger' : 'primary'}
                    disabled={confirm.isPending || !password}
                  >
                    {confirming === 'disable' ? t('Turn off') : t('Make new codes')}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setConfirming(null)}>
                    {t('Cancel')}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setConfirming('codes')}>
                  {t('New recovery codes')}
                </Button>
                <Button variant="danger" onClick={() => setConfirming('disable')}>
                  {t('Turn off')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
