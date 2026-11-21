import type {
  AiProviderView,
  ApiTokenView,
  AssistantsStatus,
  FreeAiStatus,
} from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
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

/** Admin → Chriss (RF-AI-01/02/03): the chat with Chriss, ready requests, your own assistant. */
export function AssistantsPage() {
  const { t } = useT();
  const me = useMe();
  const isSuperAdmin = me.capabilities.includes('manage_plugins');
  const status = useQuery({
    queryKey: ['assistants'],
    queryFn: () => api<AssistantsStatus>('GET', '/assistants'),
  });
  const [suggestion, setSuggestion] = useState<{ text: string; at: number } | null>(null);
  // Opened from an entry's editor ("Ask Chriss"): the chat is about that entry.
  const [entryId] = useState(() => {
    const id = new URLSearchParams(window.location.search).get('entry') ?? '';
    return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  });
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(text);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Chriss</h1>
        <p className="text-slate-700">{t('Chriss, the Cleitext assistant')}</p>
      </div>
      <p className="max-w-3xl text-sm text-slate-600">
        {t(
          'Ask Chriss to write pages and posts here in the chat, or connect your own AI assistant (ChatGPT, Cursor or another MCP client). Both use the blocks of the editor and the sections of the theme, act with your permissions, and create drafts unless you let them publish.',
        )}
      </p>
      {status.error && <Alert>{errorMessage(status.error)}</Alert>}

      {status.data && (
        <Card title={t('Chat with Chriss')}>
          {status.data.chat ? (
            <AssistantChat suggestion={suggestion} entryId={entryId} />
          ) : (
            <div className="space-y-4">
              {/* A site without a provider: Chriss base is proposed first. */}
              {isSuperAdmin && <FreeAiOffer />}
              <p className="text-sm text-slate-600">
                {isSuperAdmin
                  ? t('To chat with Chriss, set up an AI provider at the bottom of this page.')
                  : t('To chat with Chriss, a super admin has to set up an AI provider.')}
              </p>
            </div>
          )}
        </Card>
      )}

      <Card title={t('Ready requests')}>
        <p className="mb-3 text-sm text-slate-600">
          {t(
            'Requests that work well: change the words in brackets, then give them to Chriss or copy them into your own assistant.',
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

const FREE_QUERY = ['assistants', 'provider', 'free'];

function useFreeAi() {
  return useQuery({
    queryKey: FREE_QUERY,
    queryFn: () => api<FreeAiStatus>('GET', '/assistants/provider/free'),
  });
}

/** What Chriss base is, in plain words: where the texts go, and the limit. */
function FreeAiNotice({ host }: { host: string }) {
  const { t } = useT();
  return (
    <p className="text-xs text-slate-600">
      {t(
        'Chriss base is free, with a daily limit of requests. What you write to Chriss is processed on the Cleitext server ({host}) and is not stored. For more, connect your own AI service.',
        { host },
      )}
    </p>
  );
}

/**
 * Chriss base in one click (core 0.117): the site registers with the relay
 * and uses it as its provider. Never chosen without this click.
 */
function FreeAiOffer({ replacing = false }: { replacing?: boolean }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const free = useFreeAi();
  const activate = useMutation({
    mutationFn: () => api<AiProviderView>('POST', '/assistants/provider/free', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assistants'] }),
  });
  if (!free.data?.available || free.data.active) return null;
  return (
    <div
      className="space-y-2 rounded border border-sky-200 bg-sky-50 p-3 text-sm"
      data-testid="free-ai-offer"
    >
      <p className="font-semibold text-slate-800">{t('Chriss base (free)')}</p>
      <p className="text-slate-700">
        {t('Start right away, without accounts or keys: Chriss answers with a basic AI.')}
      </p>
      <FreeAiNotice host={free.data.host ?? 'cleitext.com'} />
      {activate.error && <Alert>{t(errorMessage(activate.error))}</Alert>}
      <Button
        disabled={activate.isPending}
        onClick={() => {
          if (
            !replacing ||
            window.confirm(
              t('Use Chriss base instead of your AI provider? Its settings are replaced.'),
            )
          )
            activate.mutate();
        }}
      >
        {activate.isPending ? t('Activating…') : t('Activate')}
      </Button>
    </div>
  );
}

/** Chriss base in use: the requests left today, and the way to an own service. */
function FreeAiActive() {
  const { t } = useT();
  const free = useFreeAi();
  if (!free.data?.active) return null;
  const quota = free.data.quota;
  return (
    <div
      className="space-y-2 rounded border border-sky-200 bg-sky-50 p-3 text-sm"
      data-testid="free-ai-active"
    >
      <p className="font-semibold text-slate-800">{t('Chriss base (free) is active.')}</p>
      {quota && (
        <p>
          {quota.limit !== null
            ? t('Free requests left today: {count} of {limit}.', {
                count: String(quota.remaining),
                limit: String(quota.limit),
              })
            : t('Free requests left today: {count}', { count: String(quota.remaining) })}
        </p>
      )}
      {free.data.error && <p className="text-amber-800">{t(free.data.error)}</p>}
      <FreeAiNotice host={free.data.host ?? 'cleitext.com'} />
      <p className="text-xs text-slate-600">
        {t('To continue without limits, enter the address and key of your AI service below.')}
      </p>
    </div>
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

/** Common providers with an OpenAI-compatible API: their address and where keys are made. */
const PROVIDERS: { name: string; url: string; keys: string | null }[] = [
  {
    name: 'Anthropic (Claude)',
    url: 'https://api.anthropic.com/v1',
    keys: 'https://console.anthropic.com/settings/keys',
  },
  {
    name: 'OpenAI',
    url: 'https://api.openai.com/v1',
    keys: 'https://platform.openai.com/api-keys',
  },
  {
    name: 'Google Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keys: 'https://aistudio.google.com/apikey',
  },
  {
    name: 'Mistral',
    url: 'https://api.mistral.ai/v1',
    keys: 'https://console.mistral.ai/api-keys',
  },
  { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', keys: 'https://openrouter.ai/keys' },
  { name: 'Ollama', url: 'http://localhost:11434/v1', keys: null },
];

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
  const test = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; model?: string; answer?: string; error?: string }>(
        'POST',
        '/assistants/provider/test',
        {},
      ),
  });
  // The provider's models, to choose one: listed once connected, or on request
  // with the address and key typed (the saved key only goes to the saved address).
  const [other, setOther] = useState(false);
  const models = useMutation({
    mutationFn: () =>
      api<{ models: string[]; error?: string }>('POST', '/assistants/provider/models', {
        ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      }),
  });
  const { mutate: listModels } = models;
  useEffect(() => {
    if (initial) listModels();
  }, [initial, listModels]);
  const choices = models.data?.models ?? [];
  const listed = choices.length > 0 && !other;
  const problem = error ?? save.error ?? remove.error ?? test.error;

  return (
    <Card title={t('AI provider for the chat')} id="ai-provider">
      <div className="mb-4 max-w-2xl">
        {initial?.free ? <FreeAiActive /> : initial && <FreeAiOffer replacing />}
      </div>
      <form
        className="max-w-2xl space-y-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <p className="text-slate-600">
          {t(
            'Any service with an OpenAI-compatible chat completions API: for example https://api.openai.com/v1 (model gpt-5), https://api.anthropic.com/v1 (model claude-sonnet-5-5), https://openrouter.ai/api/v1, or http://localhost:11434/v1 for Ollama on this server. Choose a model that can use tools (function calling). The provider bills the use to the account of the key.',
          )}
        </p>
        {problem && <Alert>{errorMessage(problem)}</Alert>}
        {save.isSuccess && <Alert kind="success">{t('Saved.')}</Alert>}
        {test.data &&
          (test.data.ok ? (
            <Alert kind="success">
              {t('The provider answers: the model {model} works.', {
                model: test.data.model ?? '',
              })}
            </Alert>
          ) : (
            <Alert>{test.data.error}</Alert>
          ))}
        <TextField
          label={t('API address')}
          placeholder="https://api.openai.com/v1"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        <details className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-700">
            {t('Where do I find the address and the key?')}
          </summary>
          <p className="mt-2">
            {t(
              'Choose your provider to fill in its address, then create a key in its console and paste it below.',
            )}
          </p>
          <ul className="mt-2 space-y-1.5">
            {PROVIDERS.map((p) => (
              <li key={p.url} className="flex flex-wrap items-center gap-x-2">
                <button
                  type="button"
                  className="font-medium text-sky-700 underline"
                  onClick={() => setBaseUrl(p.url)}
                >
                  {p.name}
                </button>
                <code className="text-slate-700">{p.url}</code>
                {p.keys ? (
                  <a
                    className="text-sky-700 underline"
                    href={p.keys}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('Create a key')}
                  </a>
                ) : (
                  <span>{t('no key needed')}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
        {listed ? (
          <div className="space-y-1">
            <label htmlFor="ai-model" className="block text-sm font-medium text-slate-800">
              {t('Model')}
            </label>
            <select
              id="ai-model"
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              value={model}
              onChange={(e) => {
                if (e.target.value === '\u0000other') setOther(true);
                else setModel(e.target.value);
              }}
            >
              {!choices.includes(model) && <option value={model}>{model || '—'}</option>}
              {choices.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={'\u0000other'}>{t('Another model…')}</option>
            </select>
            <p className="text-xs text-slate-500">
              {t('The models of your account, as the provider lists them.')}
            </p>
          </div>
        ) : (
          <TextField
            label={t('Model')}
            placeholder="gpt-5"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        )}
        {models.data?.error && <Alert>{models.data.error}</Alert>}
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
        <Button
          type="button"
          variant="secondary"
          disabled={models.isPending || !baseUrl.trim()}
          onClick={() => {
            setOther(false);
            models.mutate();
          }}
        >
          {models.isPending ? t('Loading the models…') : t('Show the available models')}
        </Button>
        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending || !baseUrl.trim() || !model.trim()}>
            {t('Save')}
          </Button>
          {initial && (
            <Button
              type="button"
              variant="secondary"
              disabled={test.isPending || save.isPending}
              onClick={() => test.mutate()}
            >
              {test.isPending ? t('Testing…') : t('Test the connection')}
            </Button>
          )}
          {initial && (
            <Button
              type="button"
              variant="danger"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(t('Remove the AI provider? Chriss stops working.')))
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
