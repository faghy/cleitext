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
import type { RelaySettings } from './limits';
import type { AdminView } from './server';

addMessages('it', IT);

const QUERY = ['ai-relay', 'admin'];

type NumberKey = Exclude<keyof RelaySettings, 'enabled'>;

const FIELDS: { key: NumberKey; label: string; hint: string }[] = [
  {
    key: 'siteDaily',
    label: 'Questions per site per day',
    hint: 'A question is a request ending with the person’s message. Default: 20.',
  },
  {
    key: 'stepsPerQuestion',
    label: 'Requests per question',
    hint: 'Each tool Chriss uses is one more request. Default: 8.',
  },
  {
    key: 'ipPerMinute',
    label: 'Requests per minute from one address',
    hint: 'Default: 10.',
  },
  {
    key: 'globalDaily',
    label: 'Requests per day from all sites',
    hint: 'Protects this server. Default: 2000.',
  },
  {
    key: 'maxOutputTokens',
    label: 'Tokens of an answer at most',
    hint: 'Default: 1024.',
  },
  {
    key: 'maxPromptChars',
    label: 'Characters of a request at most',
    hint: 'Messages and tools together, about 6000 tokens. Default: 22000.',
  },
  {
    key: 'concurrency',
    label: 'Requests answered at the same time',
    hint: 'The others wait their turn. A CPU answers best one at a time. Default: 1.',
  },
  {
    key: 'queue',
    label: 'Requests waiting for their turn',
    hint: 'For a minute and a half at most; more are asked to try again. Default: 5.',
  },
];

function AiRelayPage(props: AdminPageProps) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const data = useQuery({ queryKey: QUERY, queryFn: () => props.api<AdminView>('GET', '/admin') });
  const [form, setForm] = useState<Partial<Record<NumberKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const run = async (action: () => Promise<AdminView>, done: string) => {
    setBusy(true);
    setNotice(null);
    try {
      queryClient.setQueryData(QUERY, await action());
      setNotice({ kind: 'success', text: done });
      setForm({});
    } catch (error) {
      setNotice({ kind: 'error', text: t(errorMessage(error)) });
    } finally {
      setBusy(false);
    }
  };

  if (data.isError) return <Alert>{errorMessage(data.error)}</Alert>;
  if (!data.data) return <p className="text-sm text-slate-500">…</p>;
  const view = data.data;
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">AI Relay</h1>
      <p className="text-sm text-slate-600">
        {t(
          'Chriss base, the free AI of Cleitext sites: they send their requests here, and this site answers with its own AI provider (Admin → Chriss), within the limits below. The texts are not stored or logged.',
        )}
      </p>
      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}
      {!view.chat && (
        <Alert>
          {t('This server cannot use its AI provider for other sites: update Cleitext.')}
        </Alert>
      )}

      <Card title={t('Service')}>
        <div className="space-y-3 text-sm">
          <p>
            {view.settings.enabled
              ? t('On: sites can register and ask.')
              : t('Off: every request is refused.')}
          </p>
          <p>
            {t('Requests today: {total} of {limit}.', {
              total: String(view.today.total),
              limit: String(view.settings.globalDaily),
            })}
          </p>
          <Button
            type="button"
            variant={view.settings.enabled ? 'danger' : 'primary'}
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  props.api<AdminView>('PUT', '/admin/settings', {
                    enabled: !view.settings.enabled,
                  }),
                t('Saved.'),
              )
            }
          >
            {view.settings.enabled ? t('Turn off') : t('Turn on')}
          </Button>
        </div>
      </Card>

      <Card title={t('Limits')}>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const change = Object.fromEntries(
              Object.entries(form).map(([key, value]) => [key, Number(value)]),
            );
            void run(() => props.api<AdminView>('PUT', '/admin/settings', change), t('Saved.'));
          }}
        >
          {FIELDS.map((field) => (
            <TextField
              key={field.key}
              label={t(field.label)}
              type="number"
              min={1}
              value={form[field.key] ?? String(view.settings[field.key])}
              onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              hint={t(field.hint)}
            />
          ))}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy || Object.keys(form).length === 0}>
              {t('Save')}
            </Button>
          </div>
        </form>
      </Card>

      <Card title={t('Registered sites')}>
        {view.sites.length === 0 ? (
          <p className="text-sm text-slate-600">{t('No site has registered yet.')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2 font-medium">{t('Site')}</th>
                <th className="py-2 font-medium">{t('Questions today')}</th>
                <th className="py-2 font-medium">{t('Requests today')}</th>
                <th className="py-2 font-medium">{t('Last used')}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {view.sites.map((site) => (
                <tr key={site.origin} className="border-b border-slate-100">
                  <td className="py-2 break-all">
                    {site.origin}
                    {site.revoked && (
                      <span className="ml-2 rounded bg-red-100 px-1.5 text-xs text-red-800">
                        {t('revoked')}
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    {site.questions} / {view.settings.siteDaily}
                  </td>
                  <td className="py-2">{site.requests}</td>
                  <td className="py-2">{date(site.lastUsedAt)}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <Button
                      type="button"
                      variant={site.revoked ? 'secondary' : 'danger'}
                      disabled={busy}
                      onClick={() => {
                        if (
                          site.revoked ||
                          window.confirm(
                            t('Revoke {site}? It can no longer use the free service.', {
                              site: site.origin,
                            }),
                          )
                        )
                          void run(
                            () =>
                              props.api<AdminView>('POST', '/admin/sites/revoke', {
                                origin: site.origin,
                                revoked: !site.revoked,
                              }),
                            t('Saved.'),
                          );
                      }}
                    >
                      {site.revoked ? t('Allow again') : t('Revoke')}
                      <span className="sr-only"> {site.origin}</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title={t('Address for the sites')}>
        <p className="text-sm">
          <code>{`${window.location.origin}/api/v1/ext/ai-relay`}</code>
        </p>
        <p className="mt-2 text-xs text-slate-500">
          {t(
            'Sites use it by default for Chriss base. A site can use another relay with CLEITEXT_AI_RELAY, or none with an empty value.',
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
      title: { en: 'AI Relay', it: 'Relay AI' },
      parent: '/settings',
      capability: 'manage_ai_relay',
      component: AiRelayPage,
    },
  ],
});
