import type { ApiTokenView, AssistantsStatus } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { Alert, Button, Card, useT } from '../components/ui';

const PROFILE_PATH: string = '/profile';

const EXAMPLES = [
  'Create an "About us" page with an opening section, three cards on what we do and a call to action.',
  'Write a post about our new opening hours, in a friendly tone, and show me the preview.',
  'Translate the Contact page into Italian.',
];

/** Admin → AI assistants (RF-AI-01/02): connect an assistant to the site. */
export function AssistantsPage() {
  const { t } = useT();
  const me = useMe();
  const queryClient = useQueryClient();
  const canManage = me.capabilities.includes('manage_settings');
  const status = useQuery({
    queryKey: ['assistants'],
    queryFn: () => api<AssistantsStatus>('GET', '/assistants'),
  });
  const tokens = useQuery({
    queryKey: ['tokens', false],
    queryFn: () => api<ApiTokenView[]>('GET', '/tokens'),
  });
  const [copied, setCopied] = useState(false);
  const toggle = useMutation({
    mutationFn: (mcp: boolean) => api('PATCH', '/settings/core', { mcp }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['assistants'] });
      await queryClient.invalidateQueries({ queryKey: ['settings', 'core'] });
    },
  });
  const disconnect = useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/tokens/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tokens'] }),
  });
  const connected = (tokens.data ?? []).filter((token) => token.assistant);
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');
  const error = status.error ?? toggle.error ?? disconnect.error;
  const enabled = status.data?.enabled;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('AI assistants')}</h1>
      <p className="max-w-3xl text-sm text-slate-600">
        {t(
          'Connect your AI assistant (ChatGPT, Cursor or another MCP client) with your account and ask it to write pages and posts. It uses the blocks of the editor and the sections of the theme, acts with your permissions, and creates drafts unless you let it publish.',
        )}
      </p>
      {error && <Alert>{errorMessage(error)}</Alert>}

      {status.data && !enabled && (
        <Card title={t('AI assistants are off')}>
          <div className="space-y-3 text-sm">
            {canManage ? (
              <>
                <p className="text-slate-600">
                  {t('Turn them on to let the people of this site connect their assistant.')}
                </p>
                <Button disabled={toggle.isPending} onClick={() => toggle.mutate(true)}>
                  {t('Turn on AI assistants')}
                </Button>
              </>
            ) : (
              <p className="text-slate-600">
                {t('Ask an administrator of the site to turn them on.')}
              </p>
            )}
          </div>
        </Card>
      )}

      {status.data && enabled && (
        <>
          <Card title={t('Connect an assistant')}>
            <ol className="list-decimal space-y-4 pl-5 text-sm">
              <li className="space-y-2">
                <p>{t('Copy the address of this site for assistants:')}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <code
                    className="rounded border border-slate-200 bg-slate-50 px-3 py-2 break-all select-all"
                    data-testid="mcp-address"
                  >
                    {status.data.address}
                  </code>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void navigator.clipboard?.writeText(status.data.address);
                      setCopied(true);
                    }}
                  >
                    {copied ? t('Copied') : t('Copy')}
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  {t(
                    'It is not a page to open in the browser: it is where the assistant talks to the site.',
                  )}
                </p>
              </li>
              <li>
                {t(
                  'In your assistant, open the settings of connectors (or MCP servers) and add a custom connector with this address.',
                )}
              </li>
              <li>
                {t(
                  'The assistant opens this site: sign in with your account, if asked, and choose Allow. That is where your credentials are asked, never in the assistant.',
                )}
              </li>
              <li className="space-y-2">
                <p>{t('Ask it what you need, for example:')}</p>
                <ul className="space-y-1 text-slate-600">
                  {EXAMPLES.map((example) => (
                    <li key={example} className="rounded bg-slate-50 px-3 py-2 italic">
                      “{t(example)}”
                    </li>
                  ))}
                </ul>
              </li>
            </ol>
            <p className="mt-4 text-xs text-slate-500">
              {t('Tools that take a token instead of signing in: create one in')}{' '}
              <Link to={PROFILE_PATH} className="text-sky-700 hover:underline">
                {t('Profile → API tokens')}
              </Link>
              .
            </p>
          </Card>

          <Card title={t('Connected assistants')}>
            {connected.length > 0 ? (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2 font-medium">{t('Name')}</th>
                    <th className="py-2 font-medium">{t('Access')}</th>
                    <th className="py-2 font-medium">{t('Last used')}</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {connected.map((token) => (
                    <tr key={token.id} className="border-b border-slate-100">
                      <td className="py-2">{token.name.replace(/ \(MCP\)$/, '')}</td>
                      <td className="py-2">
                        {token.scopes.includes('publish')
                          ? t('Read, write and publish')
                          : token.scopes.includes('write')
                            ? t('Read and write')
                            : t('Read only')}
                      </td>
                      <td className="py-2">{date(token.lastUsedAt)}</td>
                      <td className="py-2 text-right">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            if (window.confirm(t('Disconnect "{name}"?', { name: token.name })))
                              disconnect.mutate(token.id);
                          }}
                        >
                          {t('Disconnect')}
                          <span className="sr-only"> {token.name}</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-600">
                {t('No assistant is connected to your account yet.')}
              </p>
            )}
          </Card>

          {canManage && (
            <div>
              <Button
                variant="danger"
                disabled={toggle.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      t(
                        'Turn off AI assistants? Connected assistants stop working until you turn them on again.',
                      ),
                    )
                  )
                    toggle.mutate(false);
                }}
              >
                {t('Turn off AI assistants')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
