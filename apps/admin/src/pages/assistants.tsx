import type { AiProviderView, ApiTokenView, AssistantsStatus } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { Alert, Button, Card, TextField, useT } from '../components/ui';
import { AssistantChat } from './assistant-chat';

const PROFILE_PATH: string = '/profile';

/** Requests that work well, to copy into an assistant or to use in the chat. */
const READY_REQUESTS = [
  'Create a page "About us" with an opening section, three cards about what we do and a final call to action, in the style of the theme.',
  'Write a post of about 500 words on [topic], with headings, and show me the preview.',
  'Translate the page [title] into [language], keeping the same blocks and images.',
  'Rewrite the texts of the page [title] in a clearer, friendlier tone, without changing its structure.',
  'Add a section of frequently asked questions, with five questions and answers, at the end of the page [title].',
  'Read the home page and suggest three improvements to texts and layout, without changing anything yet.',
  'Write a short excerpt for every page that has none.',
  'Set the main menu with Home, About us, Blog and Contact.',
  'List my drafts and tell me which ones look ready to publish.',
];

/** Admin → AI assistants (RF-AI-01/02/03): the chat, ready requests, your own assistant. */
export function AssistantsPage() {
  const { t } = useT();
  const me = useMe();
  const isSuperAdmin = me.capabilities.includes('manage_plugins');
  const status = useQuery({
    queryKey: ['assistants'],
    queryFn: () => api<AssistantsStatus>('GET', '/assistants'),
  });
  const [suggestion, setSuggestion] = useState<{ text: string; at: number } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(text);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('AI assistants')}</h1>
      <p className="max-w-3xl text-sm text-slate-600">
        {t(
          'Ask an AI assistant to write pages and posts: here in the chat, or from your own assistant (ChatGPT, Cursor or another MCP client). It uses the blocks of the editor and the sections of the theme, acts with your permissions, and creates drafts unless you let it publish.',
        )}
      </p>
      {status.error && <Alert>{errorMessage(status.error)}</Alert>}

      {status.data && (
        <Card title={t('Chat')}>
          {status.data.chat ? (
            <AssistantChat suggestion={suggestion} />
          ) : (
            <p className="text-sm text-slate-600">
              {isSuperAdmin
                ? t('To chat here, set up an AI provider at the bottom of this page.')
                : t('To chat here, a super admin has to set up an AI provider.')}
            </p>
          )}
        </Card>
      )}

      <Card title={t('Ready requests')}>
        <p className="mb-3 text-sm text-slate-600">
          {t(
            'Requests that work well: change the words in brackets, then use them here or copy them into your assistant.',
          )}
        </p>
        <ul className="space-y-2 text-sm">
          {READY_REQUESTS.map((request) => {
            const text = t(request);
            return (
              <li
                key={request}
                className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <span className="min-w-60 flex-1">{text}</span>
                {status.data?.chat && (
                  <Button
                    variant="secondary"
                    onClick={() => setSuggestion({ text, at: Date.now() })}
                  >
                    {t('Use in the chat')}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => copy(text)}>
                  {copied === text ? t('Copied') : t('Copy')}
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>

      {status.data && <OwnAssistantCard status={status.data} copy={copy} copied={copied} />}
      {isSuperAdmin && <ProviderCard />}
    </div>
  );
}

/** Your own assistant through MCP: the address, the steps, the connected ones. */
function OwnAssistantCard({
  status,
  copy,
  copied,
}: {
  status: AssistantsStatus;
  copy: (text: string) => void;
  copied: string | null;
}) {
  const { t } = useT();
  const me = useMe();
  const queryClient = useQueryClient();
  const canManage = me.capabilities.includes('manage_settings');
  const tokens = useQuery({
    queryKey: ['tokens', false],
    queryFn: () => api<ApiTokenView[]>('GET', '/tokens'),
    enabled: status.enabled,
  });
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
  const error = toggle.error ?? disconnect.error;

  return (
    <Card title={t('Your own assistant (MCP)')}>
      <div className="space-y-4 text-sm">
        {error && <Alert>{errorMessage(error)}</Alert>}
        {!status.enabled ? (
          <>
            <p className="text-slate-600">
              {t('Connections from assistants such as ChatGPT or Cursor are off on this site.')}
            </p>
            {canManage ? (
              <Button disabled={toggle.isPending} onClick={() => toggle.mutate(true)}>
                {t('Allow connections')}
              </Button>
            ) : (
              <p className="text-slate-600">
                {t('Ask an administrator of the site to turn them on.')}
              </p>
            )}
          </>
        ) : (
          <>
            <ol className="list-decimal space-y-3 pl-5">
              <li className="space-y-2">
                <p>{t('Copy the address of this site for assistants:')}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <code
                    className="rounded border border-slate-200 bg-slate-50 px-3 py-2 break-all select-all"
                    data-testid="mcp-address"
                  >
                    {status.address}
                  </code>
                  <Button variant="secondary" onClick={() => copy(status.address)}>
                    {copied === status.address ? t('Copied') : t('Copy')}
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
              <li>
                {t(
                  'In the chat of your assistant, ask what you need: the ready requests above are a good start.',
                )}
              </li>
            </ol>
            <p className="text-xs text-slate-500">
              {t('Tools that take a token instead of signing in: create one in')}{' '}
              <Link to={PROFILE_PATH} className="text-sky-700 hover:underline">
                {t('Profile → API tokens')}
              </Link>
              .
            </p>

            <div>
              <h3 className="mb-2 font-semibold">{t('Connected assistants')}</h3>
              {connected.length > 0 ? (
                <table className="w-full text-left">
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
                <p className="text-slate-600">
                  {t('No assistant is connected to your account yet.')}
                </p>
              )}
            </div>

            {canManage && (
              <Button
                variant="danger"
                disabled={toggle.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      t(
                        'Turn off connections? Connected assistants stop working until you turn them on again.',
                      ),
                    )
                  )
                    toggle.mutate(false);
                }}
              >
                {t('Turn off connections')}
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

/** The AI provider of the chat: super admins only, as the server calls its address. */
function ProviderCard() {
  const { t } = useT();
  const queryClient = useQueryClient();
  const provider = useQuery({
    queryKey: ['assistants', 'provider'],
    queryFn: () => api<AiProviderView | null>('GET', '/assistants/provider'),
  });
  if (provider.isPending) return null;
  return (
    <ProviderForm
      key={JSON.stringify(provider.data)}
      initial={provider.data ?? null}
      onSaved={() => queryClient.invalidateQueries({ queryKey: ['assistants'] })}
      error={provider.error}
      t={t}
    />
  );
}

function ProviderForm({
  initial,
  onSaved,
  error,
  t,
}: {
  initial: AiProviderView | null;
  onSaved: () => Promise<void>;
  error: unknown;
  t: ReturnType<typeof useT>['t'];
}) {
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [apiKey, setApiKey] = useState('');
  const save = useMutation({
    mutationFn: () =>
      api<AiProviderView>('PUT', '/assistants/provider', {
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      }),
    onSuccess: onSaved,
  });
  const remove = useMutation({
    mutationFn: () => api<void>('DELETE', '/assistants/provider'),
    onSuccess: onSaved,
  });
  const problem = error ?? save.error ?? remove.error;

  return (
    <Card title={t('AI provider for the chat')}>
      <form
        className="max-w-2xl space-y-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <p className="text-slate-600">
          {t(
            'Any service with an OpenAI-compatible chat completions API: for example https://api.openai.com/v1, https://openrouter.ai/api/v1, or http://localhost:11434/v1 for Ollama on this server. Choose a model that can use tools (function calling). The provider bills the use to the account of the key.',
          )}
        </p>
        {problem && <Alert>{errorMessage(problem)}</Alert>}
        {save.isSuccess && <Alert kind="success">{t('Saved.')}</Alert>}
        <TextField
          label={t('API address')}
          placeholder="https://api.openai.com/v1"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        <TextField
          label={t('Model')}
          placeholder="gpt-5"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
        <TextField
          label={t('API key')}
          type="password"
          autoComplete="off"
          placeholder={initial?.hasKey ? t('Saved: leave empty to keep it') : ''}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <p className="text-xs text-slate-500">
          {t('The key is stored encrypted and never shown again.')}
        </p>
        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending || !baseUrl.trim() || !model.trim()}>
            {t('Save')}
          </Button>
          {initial && (
            <Button
              type="button"
              variant="danger"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(t('Remove the AI provider? The chat stops working.')))
                  remove.mutate();
              }}
            >
              {t('Remove')}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
