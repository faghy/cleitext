import {
  addMessages,
  type AdminPageProps,
  Alert,
  Button,
  Card,
  defineAdminPlugin,
  errorMessage,
  TextField,
  useT,
} from '@cleitext/admin-sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { IT } from './admin-it';
import type { SettingsView } from './server';

addMessages('it', IT);

const QUERY = ['push-relay', 'settings'];

function PushRelayPage(props: AdminPageProps) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: QUERY,
    queryFn: () => props.api<SettingsView>('GET', '/settings'),
  });
  const [json, setJson] = useState('');
  const [limit, setLimit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const run = async (action: () => Promise<SettingsView>, done: string) => {
    setBusy(true);
    setNotice(null);
    try {
      queryClient.setQueryData(QUERY, await action());
      setNotice({ kind: 'success', text: done });
      return true;
    } catch (error) {
      setNotice({ kind: 'error', text: t(errorMessage(error)) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (settings.isError) return <Alert>{errorMessage(settings.error)}</Alert>;
  if (!settings.data) return <p className="text-sm text-slate-500">…</p>;
  const data = settings.data;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Push Relay</h1>
      <p className="text-sm text-slate-600">
        {t(
          'Sends the push notifications of the Cleitext app for every Cleitext site, through Firebase Cloud Messaging. Sites post them to the address below; the Firebase key stays here.',
        )}
      </p>
      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}

      <Card title={t('Firebase service account')}>
        <div className="space-y-3 text-sm">
          {data.configured ? (
            <p>
              {t('Configured: project {project}, account {email}.', {
                project: data.projectId ?? '',
                email: data.clientEmail ?? '',
              })}
            </p>
          ) : (
            <p className="text-amber-700">
              {t('Not configured: the relay answers 503 until the key is set.')}
            </p>
          )}
          <label className="block">
            <span className="font-medium">
              {data.configured ? t('Replace the key') : t('JSON key of the service account')}
            </span>
            <textarea
              className="mt-1 block h-40 w-full rounded border border-slate-300 p-2 font-mono text-xs"
              value={json}
              onChange={(e) => setJson(e.target.value)}
              placeholder='{"type": "service_account", …}'
              spellCheck={false}
              autoComplete="off"
            />
            <span className="text-xs text-slate-500">
              {t(
                'Firebase console → Project settings → Service accounts → Generate new private key. It is stored encrypted and never shown again.',
              )}
            </span>
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={busy || !json.trim()}
              onClick={async () => {
                if (
                  await run(
                    () => props.api<SettingsView>('PUT', '/settings', { serviceAccount: json }),
                    t('Key saved.'),
                  )
                )
                  setJson('');
              }}
            >
              {t('Save the key')}
            </Button>
            {data.configured && (
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(t('Remove the key? Notifications stop until a new one is set.'))
                  )
                    void run(
                      () => props.api<SettingsView>('DELETE', '/settings/service-account'),
                      t('Key removed.'),
                    );
                }}
              >
                {t('Remove the key')}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card title={t('Limits')}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                props.api<SettingsView>('PUT', '/settings', {
                  rateLimit: Number(limit ?? data.rateLimit),
                }),
              t('Limit saved.'),
            );
          }}
        >
          <TextField
            label={t('Notifications per hour for each site')}
            type="number"
            min={1}
            value={limit ?? String(data.rateLimit)}
            onChange={(e) => setLimit(e.target.value)}
            hint={t('Counted per phone, by the address the site gives. Default: 300.')}
          />
          <Button type="submit" disabled={busy}>
            {t('Save')}
          </Button>
        </form>
      </Card>

      <Card title={t('Address for the sites')}>
        <p className="text-sm">
          <code>{`${window.location.origin}/api/v1/ext/push-relay/send`}</code>
        </p>
        <p className="mt-2 text-xs text-slate-500">
          {t(
            'Sites send there by default. A site can use another relay with CLEITEXT_PUSH_RELAY, or none with an empty value.',
          )}
        </p>
      </Card>
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Push Relay', it: 'Relay notifiche push' },
      parent: '/settings',
      capability: 'manage_push_relay',
      component: PushRelayPage,
    },
  ],
});
