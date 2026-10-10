import type { PasskeyView } from '@cleitext/shared';
import {
  browserSupportsWebAuthn,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
} from '@simplewebauthn/browser';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { Alert, Button, Card, TextField, useT } from '../components/ui';

const KEY = ['profile', 'passkeys'];

/** Profile → Passkeys (RF-USR-05): sign in with the device instead of a password. */
export function PasskeysCard() {
  const { t } = useT();
  const queryClient = useQueryClient();
  const passkeys = useQuery({
    queryKey: KEY,
    queryFn: () => api<PasskeyView[]>('GET', '/profile/passkeys'),
  });
  const [name, setName] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });

  const add = useMutation({
    mutationFn: async () => {
      const optionsJSON = await api<PublicKeyCredentialCreationOptionsJSON>(
        'POST',
        '/profile/passkeys/options',
      );
      const response = await startRegistration({ optionsJSON });
      return api<PasskeyView>('POST', '/profile/passkeys', { response, name });
    },
    onSuccess: async () => {
      setName('');
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/profile/passkeys/${encodeURIComponent(id)}`),
    onSuccess: refresh,
  });
  const error = add.error ?? remove.error;
  const supported = browserSupportsWebAuthn();

  return (
    <Card title={t('Passkeys')}>
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">
          {t(
            'A passkey signs you in with your fingerprint, face or device PIN instead of the password and code. It works on the domain where you create it.',
          )}
        </p>
        {error && (
          <Alert>
            {error instanceof Error && error.name === 'NotAllowedError'
              ? t('The passkey prompt was cancelled or timed out.')
              : errorMessage(error)}
          </Alert>
        )}
        {passkeys.data && passkeys.data.length > 0 && (
          <ul className="divide-y divide-slate-100" aria-label={t('Your passkeys')}>
            {passkeys.data.map((passkey) => (
              <li key={passkey.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="font-medium">{passkey.name}</p>
                  <p className="text-xs text-slate-500">
                    {passkey.domain} ·{' '}
                    {passkey.lastUsedAt
                      ? t('last used {date}', {
                          date: new Date(passkey.lastUsedAt).toLocaleDateString(),
                        })
                      : t('never used')}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (window.confirm(t('Remove the passkey "{name}"?', { name: passkey.name })))
                      remove.mutate(passkey.id);
                  }}
                >
                  {t('Remove')}
                  <span className="sr-only"> {passkey.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        {supported ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <div className="min-w-48 flex-1">
              <TextField
                label={t('Passkey name')}
                placeholder={t('e.g. Work laptop')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={add.isPending}>
              {t('Add a passkey')}
            </Button>
          </form>
        ) : (
          <p className="text-slate-600">{t('This browser does not support passkeys.')}</p>
        )}
      </div>
    </Card>
  );
}
