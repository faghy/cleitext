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
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IT } from './admin-it';
import { GuideSteps } from './guide';
import type { Channel, ChannelView, FeedConfig, SettingsView } from './types';

addMessages('it', IT);

const select = 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm';
const QUERY = ['social-feed', 'settings'];
const NAMES: Record<Channel, string> = { instagram: 'Instagram', facebook: 'Facebook' };

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-sm font-medium text-slate-800">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

function when(iso: string | null | undefined, language: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short' });
}

function daysLeft(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.round((Date.parse(iso) - Date.now()) / 86_400_000);
}

/** The address Meta sends the person back to: this page. */
function redirectUri(path: string): string {
  return `${window.location.origin}${path}`;
}

function ChannelCard({
  channel,
  view,
  config,
  busy,
  onConnect,
  onToken,
  onRefresh,
  onDisconnect,
}: {
  channel: Channel;
  view: ChannelView;
  config: FeedConfig;
  busy: boolean;
  onConnect: () => void;
  onToken: (token: string) => void;
  onRefresh: () => void;
  onDisconnect: () => void;
}) {
  const { t, language } = useT();
  const [manual, setManual] = useState(false);
  const [token, setToken] = useState('');
  const viaPage = channel === 'instagram' && config.instagram.via === 'facebook';
  const left = daysLeft(view.tokenExpiresAt);
  const tone =
    view.tokenStatus === 'expired' || view.lastError
      ? 'border-red-200 bg-red-50 text-red-900'
      : view.tokenStatus === 'expiring'
        ? 'border-amber-300 bg-amber-50 text-amber-900'
        : view.connected
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : 'border-slate-200 bg-slate-50 text-slate-700';
  const expiry =
    view.tokenStatus === 'never'
      ? t('The token does not expire.')
      : view.tokenExpiresAt
        ? `${t('The token expires on {date}', { date: when(view.tokenExpiresAt, language) })}${
            left !== null && left >= 0 ? ` (${t('in {n} days', { n: left })})` : ''
          }${view.expiresEstimated ? ` — ${t('estimated, confirmed at the first refresh')}` : ''}.`
        : '';
  return (
    <Card title={NAMES[channel]}>
      <div className="space-y-3 text-sm">
        <div className={`rounded border px-3 py-2 ${tone}`} role="status">
          {view.connected ? (
            <>
              <p className="font-medium">
                {t('Connected: {name}', {
                  name:
                    view.account?.username && channel === 'instagram'
                      ? `@${view.account.username}`
                      : (view.account?.name ?? ''),
                })}
                {view.method === 'manual' && ` (${t('pasted token')})`}
                {view.method === 'page' && ` (${t('through the Facebook Page')})`}
              </p>
              {expiry && <p>{expiry}</p>}
              {view.dataAccessExpiresAt && (
                <p>
                  {t('Meta asks to sign in again by {date}.', {
                    date: when(view.dataAccessExpiresAt, language),
                  })}
                </p>
              )}
              {view.tokenStatus === 'expired' && (
                <p className="font-medium">{t('Connect the account again.')}</p>
              )}
            </>
          ) : (
            <p>{t('Not connected.')}</p>
          )}
        </div>
        {view.connected && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-slate-500">{t('Posts in the cache')}</dt>
            <dd>{view.posts}</dd>
            <dt className="text-slate-500">{t('Last refresh')}</dt>
            <dd>{when(view.lastFetchAt, language)}</dd>
            <dt className="text-slate-500">{t('Last good refresh')}</dt>
            <dd>{when(view.lastSuccessAt, language)}</dd>
            <dt className="text-slate-500">{t('Next refresh')}</dt>
            <dd>{when(view.nextFetchAt, language)}</dd>
          </dl>
        )}
        {view.lastError && (
          <Alert>
            {t('Error: {message}', { message: view.lastError.message })}{' '}
            {view.lastError.kind === 'rate' &&
              t(
                'Meta limits the requests: the site keeps showing the last posts and tries again later.',
              )}
            {view.lastError.kind === 'token' && t('The token no longer works: connect again.')}
            {view.lastError.kind === 'permission' &&
              t('The app lacks a permission: check it in the Meta app and connect again.')}
          </Alert>
        )}
        {view.preview.length > 0 && (
          <ul className="grid grid-cols-6 gap-1">
            {view.preview.map((p) => (
              <li key={p.id}>
                <a href={p.permalink} target="_blank" rel="noopener noreferrer" title={p.text}>
                  {p.image ? (
                    <img
                      src={p.image}
                      alt=""
                      className="aspect-square w-full rounded object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex aspect-square w-full items-center justify-center rounded bg-slate-100 text-xs">
                      Aa
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          {!viaPage && (
            <Button type="button" onClick={onConnect} disabled={busy}>
              {view.connected
                ? t('Connect again')
                : t('Connect with {network}', { network: NAMES[channel] })}
            </Button>
          )}
          {!viaPage && (
            <Button type="button" variant="secondary" onClick={() => setManual(!manual)}>
              {t('Paste a token')}
            </Button>
          )}
          {view.connected && (
            <Button type="button" variant="secondary" onClick={onRefresh} disabled={busy}>
              {t('Refresh now')}
            </Button>
          )}
          {view.connected && (
            <Button type="button" variant="danger" onClick={onDisconnect} disabled={busy}>
              {t('Disconnect')}
            </Button>
          )}
        </div>
        {viaPage && (
          <p className="text-xs text-slate-500">
            {t(
              'Instagram is read through the Facebook Page: connect Facebook, with the Instagram account linked to the Page.',
            )}
          </p>
        )}
        {manual && !viaPage && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              onToken(token.trim());
              setToken('');
              setManual(false);
            }}
          >
            <TextField
              label={
                channel === 'instagram'
                  ? t('Instagram user access token (long-lived)')
                  : t('Facebook Page access token (or a user token)')
              }
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              hint={t('It is stored encrypted on the server and never shown again.')}
            />
            <Button type="submit" disabled={busy || token.trim().length < 20}>
              {t('Connect with this token')}
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}

function SocialFeedPage(props: AdminPageProps) {
  const { t, language } = useT();
  const queryClient = useQueryClient();
  const saved = useQuery({
    queryKey: QUERY,
    queryFn: () => props.api<SettingsView>('GET', '/settings'),
  });
  const [draft, setDraft] = useState<FeedConfig | null>(null);
  const [igSecret, setIgSecret] = useState('');
  const [fbSecret, setFbSecret] = useState('');
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const returned = useRef(false);

  useEffect(() => {
    if (saved.data && !draft) setDraft(saved.data.config);
  }, [saved.data, draft]);

  const update = (next: SettingsView) => {
    queryClient.setQueryData(QUERY, next);
    setDraft(next.config);
  };
  const run = async (action: () => Promise<SettingsView | void>, done?: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const next = await action();
      if (next) update(next);
      else await queryClient.invalidateQueries({ queryKey: QUERY });
      if (done) setNotice({ kind: 'success', text: done });
    } catch (error) {
      setNotice({ kind: 'error', text: t(errorMessage(error)) });
    } finally {
      setBusy(false);
    }
  };

  // Back from Meta's sign-in: `?code=…&state=…` (or `?error=…`) in the address.
  useEffect(() => {
    if (returned.current) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error_description') ?? params.get('error');
    if (!code && !error) return;
    returned.current = true;
    window.history.replaceState(null, '', window.location.pathname);
    if (error || !code || !state) {
      setNotice({
        kind: 'error',
        text: t('The sign-in was cancelled or refused: {reason}', { reason: error ?? '' }),
      });
      return;
    }
    void run(async () => {
      await props.api('POST', '/oauth/callback', { code, state });
    }, t('Connected.'));
    // Runs once, on the way back.
  }, []);

  if (saved.isError) return <Alert>{errorMessage(saved.error)}</Alert>;
  if (!draft || !saved.data) return <p className="text-sm text-slate-500">…</p>;
  const data = saved.data;
  const set = (changes: Partial<FeedConfig>) => setDraft({ ...draft, ...changes });
  const uri = redirectUri(data.redirectPath);

  const save = () =>
    run(
      () =>
        props
          .api<SettingsView>('PUT', '/settings', {
            config: draft,
            secrets: {
              ...(igSecret.trim() ? { instagramAppSecret: igSecret.trim() } : {}),
              ...(fbSecret.trim() ? { facebookAppSecret: fbSecret.trim() } : {}),
            },
          })
          .then((next) => {
            setIgSecret('');
            setFbSecret('');
            return next;
          }),
      t('Saved.'),
    );
  const connect = (channel: Channel) =>
    run(async () => {
      const { url } = await props.api<{ url: string }>('POST', '/oauth/start', {
        channel,
        redirectUri: uri,
      });
      window.location.assign(url);
    });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('Social feed')}</h1>
      <p className="text-sm text-slate-600">
        {t(
          'The latest posts of your Instagram account and Facebook Page on the site, with the Social feed block. Connect them here with your own Meta app.',
        )}
      </p>
      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}

      {data.pages.length > 0 && (
        <Card title={t('Choose the Facebook Page')}>
          <ul className="space-y-2">
            {data.pages.map((page) => (
              <li key={page.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium">{page.name}</span>
                {page.instagram && (
                  <span className="text-slate-500">Instagram: @{page.instagram.username}</span>
                )}
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => props.api<SettingsView>('POST', '/facebook/page', { pageId: page.id }),
                      t('Connected.'),
                    )
                  }
                >
                  {t('Use this Page')}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(['instagram', 'facebook'] as const).map((channel) => (
          <ChannelCard
            key={channel}
            channel={channel}
            view={data.channels[channel]}
            config={data.config}
            busy={busy}
            onConnect={() => connect(channel)}
            onToken={(token) =>
              run(
                () => props.api<SettingsView>('POST', '/token', { channel, token }),
                t('Connected.'),
              )
            }
            onRefresh={() =>
              run(() => props.api<SettingsView>('POST', '/refresh', { channel }), t('Refreshed.'))
            }
            onDisconnect={() => {
              if (
                window.confirm(
                  t('Disconnect {network}? Its posts leave the site.', { network: NAMES[channel] }),
                )
              )
                void run(() => props.api<SettingsView>('POST', '/disconnect', { channel }));
            }}
          />
        ))}
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('Channels')}>
            <div className="space-y-3">
              <Check
                checked={draft.instagram.enabled}
                onChange={(v) => set({ instagram: { ...draft.instagram, enabled: v } })}
              >
                {t('Show Instagram posts')}
              </Check>
              <Check
                checked={draft.facebook.enabled}
                onChange={(v) => set({ facebook: { ...draft.facebook, enabled: v } })}
              >
                {t('Show Facebook Page posts')}
              </Check>
              <Field
                label={t('Connect Instagram with')}
                hint={t(
                  'Instagram Login needs only an Instagram professional account. Through the Facebook Page, the account must be linked to the Page.',
                )}
              >
                <select
                  className={select}
                  value={draft.instagram.via}
                  onChange={(e) =>
                    set({
                      instagram: {
                        ...draft.instagram,
                        via: e.target.value === 'facebook' ? 'facebook' : 'instagram',
                      },
                    })
                  }
                >
                  <option value="instagram">{t('Instagram Login (recommended)')}</option>
                  <option value="facebook">{t('The Facebook Page (Facebook Login)')}</option>
                </select>
              </Field>
              <Field
                label={t('Posts fetched per channel')}
                hint={t('From 6 to 50. The block chooses how many it shows.')}
              >
                <input
                  className={select}
                  type="number"
                  min={6}
                  max={50}
                  value={draft.count}
                  onChange={(e) => set({ count: Number(e.target.value) })}
                />
              </Field>
              <Field label={t('Look for new posts every')}>
                <select
                  className={select}
                  value={draft.refreshMinutes}
                  onChange={(e) => set({ refreshMinutes: Number(e.target.value) })}
                >
                  {[30, 60, 180, 360, 720, 1440].map((m) => (
                    <option key={m} value={m}>
                      {m < 60
                        ? t('{n} minutes', { n: m })
                        : m === 60
                          ? t('hour')
                          : t('{n} hours', { n: m / 60 })}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>

          <Card title={t('Pictures and privacy')}>
            <div className="space-y-3">
              <Field label={t('Pictures')}>
                <select
                  className={select}
                  value={draft.media}
                  onChange={(e) =>
                    set({ media: e.target.value === 'hotlink' ? 'hotlink' : 'local' })
                  }
                >
                  <option value="local">{t('Copied to the site (recommended)')}</option>
                  <option value="hotlink">{t('Loaded from Meta’s servers')}</option>
                </select>
              </Field>
              <p className="text-xs text-slate-500">
                {draft.media === 'local'
                  ? t(
                      'Visitors load nothing from Meta: no cookies, no consent needed, and pictures never break when Meta’s addresses expire. Up to 120 pictures are kept; those no post uses are deleted after a day.',
                    )
                  : t(
                      'Meta receives the address of every visitor, and its picture addresses expire after some days. With the Privacy & GDPR plugin the pictures wait for consent.',
                    )}
              </p>
              {draft.media === 'hotlink' && (
                <Field label={t('Consent category')}>
                  <select
                    className={select}
                    value={draft.consentCategory}
                    onChange={(e) =>
                      set({
                        consentCategory:
                          e.target.value === 'preferences' ? 'preferences' : 'marketing',
                      })
                    }
                  >
                    <option value="marketing">{t('Marketing')}</option>
                    <option value="preferences">{t('Preferences')}</option>
                  </select>
                </Field>
              )}
            </div>
          </Card>

          <Card title={t('Meta app')}>
            <div className="space-y-4">
              <Field
                label={t('Redirect address')}
                hint={t('Copy it into the Meta app, as the guide shows.')}
              >
                <div className="flex gap-2">
                  <input
                    className={select}
                    readOnly
                    value={uri}
                    onFocus={(e) => e.target.select()}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void navigator.clipboard?.writeText(uri)}
                  >
                    {t('Copy')}
                  </Button>
                </div>
              </Field>
              {!uri.startsWith('https://') && (
                <Alert>{t('Meta accepts only https addresses: open the admin over https.')}</Alert>
              )}
              <TextField
                label={t('Instagram app ID')}
                value={draft.instagram.appId}
                onChange={(e) =>
                  set({ instagram: { ...draft.instagram, appId: e.target.value.trim() } })
                }
                inputMode="numeric"
                autoComplete="off"
                hint={t('Instagram → API setup with Instagram login → Business login settings.')}
              />
              <TextField
                label={t('Instagram app secret')}
                type="password"
                value={igSecret}
                onChange={(e) => setIgSecret(e.target.value)}
                placeholder={
                  data.secrets.instagramAppSecret ? t('Saved: leave empty to keep it') : ''
                }
                autoComplete="new-password"
              />
              <TextField
                label={t('Facebook App ID')}
                value={draft.facebook.appId}
                onChange={(e) =>
                  set({ facebook: { ...draft.facebook, appId: e.target.value.trim() } })
                }
                inputMode="numeric"
                autoComplete="off"
                hint={t('App settings → Basic.')}
              />
              <TextField
                label={t('Facebook App secret')}
                type="password"
                value={fbSecret}
                onChange={(e) => setFbSecret(e.target.value)}
                placeholder={
                  data.secrets.facebookAppSecret ? t('Saved: leave empty to keep it') : ''
                }
                autoComplete="new-password"
                hint={t('Stored encrypted on the server and never shown again.')}
              />
            </div>
          </Card>

          <Card title={t('How to create the Meta app')}>
            <GuideSteps language={language} redirectUri={uri} />
          </Card>
        </div>
        <Button type="submit" disabled={busy}>
          {t('Save')}
        </Button>
      </form>
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Social feed', it: 'Feed social' },
      parent: '/settings',
      capability: 'manage_settings',
      component: SocialFeedPage,
    },
  ],
});
