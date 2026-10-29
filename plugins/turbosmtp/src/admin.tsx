/**
 * turboSMTP in the admin: the account (API keys, or email and password),
 * how the emails leave (API or SMTP), the sender, a test email, and the
 * statistics of turboSMTP with the list of messages. Italian texts in
 * `admin/it.ts`.
 */
import {
  addMessages,
  Alert,
  Button,
  Card,
  defineAdminPlugin,
  errorMessage,
  TextField,
  useT,
  type AdminPageProps,
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { IT } from './admin/it';
import { CAPABILITY, DASHBOARD_URL, NAME, SMTP_HOSTS, SMTP_PORTS, type SmtpHost } from './config';
import type { DaySeries, Group, MessageRow, Settings } from './model';

addMessages('it', IT);

type Api = AdminPageProps['api'];

interface View {
  settings: Settings;
  connected: boolean;
  hasSmtpPassword: boolean;
  sending: boolean;
  lastError: { at: string; message: string } | null;
}

const QUERY = ['turbosmtp', 'settings'];
const input = 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm';
/** A paper plane. */
const ICON = 'M3 11l18-8-8 18-2-8-8-2z M11 13l10-10';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-sm font-medium text-slate-800">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function Tabs<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-2 border-b border-slate-200">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          type="button"
          aria-selected={value === o.id}
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${value === o.id ? 'border-sky-700 font-semibold text-sky-800' : 'border-transparent text-slate-600'}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- Account ---------------------------------------------------------------------------

function Account({ api, view }: { api: Api; view: View }) {
  const { t } = useT();
  const client = useQueryClient();
  const [how, setHow] = useState<'keys' | 'login'>('keys');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const done = (next: View) => {
    client.setQueryData(QUERY, next);
    setConsumerSecret('');
    setPassword('');
  };
  const connect = useMutation({
    mutationFn: () =>
      api<View>(
        'PUT',
        '/connection',
        how === 'keys' ? { consumerKey, consumerSecret } : { email, password },
      ),
    onSuccess: done,
  });
  const disconnect = useMutation({
    mutationFn: () => api<View>('DELETE', '/connection'),
    onSuccess: done,
  });

  if (view.connected) {
    return (
      <Card title={t('Account')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {view.settings.account
              ? t('Connected to turboSMTP as {account}.', { account: view.settings.account })
              : t('Connected to turboSMTP.')}
          </p>
          <Button
            variant="danger"
            disabled={disconnect.isPending}
            onClick={() => {
              if (
                window.confirm(t('Disconnect turboSMTP? The site will send its emails as before.'))
              )
                disconnect.mutate();
            }}
          >
            {t('Disconnect')}
          </Button>
        </div>
        {disconnect.error ? <Alert>{errorMessage(disconnect.error)}</Alert> : null}
      </Card>
    );
  }
  return (
    <Card title={t('Connect your turboSMTP account')}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          connect.mutate();
        }}
      >
        <Tabs
          label={t('How to connect')}
          value={how}
          onChange={setHow}
          options={[
            { id: 'keys', label: t('API keys') },
            { id: 'login', label: t('Email and password') },
          ]}
        />
        {how === 'keys' ? (
          <>
            <p className="text-sm text-slate-600">
              {t('Create them in turboSMTP → Settings → API keys.')}
            </p>
            <TextField
              label="Consumer Key"
              autoComplete="off"
              value={consumerKey}
              onChange={(e) => setConsumerKey(e.target.value)}
              required
            />
            <TextField
              label="Consumer Secret"
              type="password"
              autoComplete="off"
              value={consumerSecret}
              onChange={(e) => setConsumerSecret(e.target.value)}
              required
            />
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              {t('The plugin creates API keys for this site with them; the password is not kept.')}
            </p>
            <TextField
              label={t('turboSMTP email')}
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <TextField
              label={t('Password')}
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </>
        )}
        {connect.error ? <Alert>{errorMessage(connect.error)}</Alert> : null}
        <Button type="submit" disabled={connect.isPending}>
          {connect.isPending ? t('Connecting…') : t('Connect')}
        </Button>
      </form>
    </Card>
  );
}

// ---- Sending ---------------------------------------------------------------------------

function Sending({ api, view }: { api: Api; view: View }) {
  const { t, language } = useT();
  const client = useQueryClient();
  const [form, setForm] = useState<Settings>(view.settings);
  const [smtpPassword, setSmtpPassword] = useState('');
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const save = useMutation({
    mutationFn: () =>
      api<View>('PUT', '/settings', {
        enabled: form.enabled,
        mode: form.mode,
        fromEmail: form.fromEmail,
        fromName: form.fromName,
        host: form.host,
        port: form.port,
        security: form.security,
        smtpUser: form.smtpUser,
        ...(smtpPassword ? { smtpPassword } : {}),
      }),
    onSuccess: (next) => {
      client.setQueryData(QUERY, next);
      setForm(next.settings);
      setSmtpPassword('');
    },
  });

  return (
    <Card title={t('Sending')}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.enabled}
            onChange={(e) => set('enabled', e.target.checked)}
          />
          <span>{t('Send the site’s emails through turboSMTP')}</span>
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-800">{t('Send by')}</legend>
          {(['api', 'smtp'] as const).map((mode) => (
            <label key={mode} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="mode"
                className="mt-1"
                checked={form.mode === mode}
                onChange={() => set('mode', mode)}
              />
              <span>
                {mode === 'api'
                  ? t('turboSMTP’s API (recommended: fast, and works where SMTP ports are closed)')
                  : t('turboSMTP’s SMTP servers')}
              </span>
            </label>
          ))}
        </fieldset>
        {form.mode === 'smtp' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Server')}>
              <select
                className={input}
                value={form.host}
                onChange={(e) => set('host', e.target.value as SmtpHost)}
              >
                {(Object.keys(SMTP_HOSTS) as SmtpHost[]).map((host) => (
                  <option key={host} value={host}>
                    {`${SMTP_HOSTS[host][language === 'it' ? 'it' : 'en']} — ${host}`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('Port')}>
              <select
                className={input}
                value={form.port}
                onChange={(e) => {
                  const port = Number(e.target.value);
                  setForm((f) => ({ ...f, port, security: port === 465 ? 'tls' : 'starttls' }));
                }}
              >
                {SMTP_PORTS.map((port) => (
                  <option key={port} value={port}>
                    {port === 465 ? `465 (SSL/TLS)` : `${port} (STARTTLS)`}
                  </option>
                ))}
              </select>
            </Field>
            <TextField
              label={t('SMTP user')}
              hint={t('Usually the email of your turboSMTP account.')}
              autoComplete="off"
              value={form.smtpUser}
              onChange={(e) => set('smtpUser', e.target.value)}
            />
            <TextField
              label={t('SMTP password')}
              type="password"
              autoComplete="new-password"
              placeholder={view.hasSmtpPassword ? t('Saved: leave empty to keep it') : ''}
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
            />
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={t('Sender address')}
            type="email"
            hint={t('Empty: the site’s address. Use an address of a domain verified in turboSMTP.')}
            value={form.fromEmail}
            onChange={(e) => set('fromEmail', e.target.value)}
          />
          <TextField
            label={t('Sender name')}
            hint={t('Empty: the site’s name.')}
            value={form.fromName}
            onChange={(e) => set('fromName', e.target.value)}
          />
        </div>
        <p className="text-xs text-slate-500">
          {t(
            'A sender chosen by a form or another plugin stays. If turboSMTP does not take an email, the site sends it the usual way.',
          )}
        </p>
        {save.error ? <Alert>{errorMessage(save.error)}</Alert> : null}
        {save.isSuccess ? <Alert kind="success">{t('Saved.')}</Alert> : null}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? t('Saving…') : t('Save')}
        </Button>
      </form>
    </Card>
  );
}

function TestEmail({ api }: { api: Api }) {
  const { t } = useT();
  const client = useQueryClient();
  const [to, setTo] = useState('');
  const test = useMutation({
    mutationFn: () => api<{ ok: true }>('POST', '/test', { to }),
    onSettled: () => client.invalidateQueries({ queryKey: QUERY }),
  });
  return (
    <Card title={t('Test email')}>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          test.mutate();
        }}
      >
        <div className="min-w-64 flex-1">
          <TextField
            label={t('Send a test to')}
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </div>
        <Button type="submit" variant="secondary" disabled={test.isPending}>
          {test.isPending ? t('Sending…') : t('Send test')}
        </Button>
      </form>
      {test.error ? <Alert>{errorMessage(test.error)}</Alert> : null}
      {test.isSuccess ? (
        <Alert kind="success">{t('Sent through turboSMTP: check the inbox.')}</Alert>
      ) : null}
    </Card>
  );
}

function SettingsPage({ api }: AdminPageProps) {
  const { t } = useT();
  const view = useQuery({ queryKey: QUERY, queryFn: () => api<View>('GET', '/settings') });
  const data = view.data;
  return (
    <div className="max-w-4xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{NAME}</h1>
        <p className="text-slate-600">
          {t(
            'The site’s emails, delivered by turboSMTP: password resets, orders, bookings and forms.',
          )}
        </p>
      </header>
      {view.error ? <Alert>{errorMessage(view.error)}</Alert> : null}
      {data ? (
        <>
          {data.connected && !data.sending ? (
            <Alert>{t('turboSMTP is connected but not sending: check the settings below.')}</Alert>
          ) : null}
          {data.lastError ? (
            <Alert>
              {t(
                'The last email turboSMTP did not take ({date}): {message}. It was sent the usual way.',
                {
                  date: new Date(data.lastError.at).toLocaleString(),
                  message: data.lastError.message,
                },
              )}
            </Alert>
          ) : null}
          <Account api={api} view={data} />
          {data.connected ? (
            <>
              <Sending key={JSON.stringify(data.settings)} api={api} view={data} />
              <TestEmail api={api} />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// ---- Statistics ------------------------------------------------------------------------

const GROUP_LABELS: Record<Group | 'all', string> = {
  all: 'Sent',
  delivered: 'Delivered',
  opens: 'Opened',
  clicks: 'Clicked',
  queued: 'Queued',
  bounce: 'Bounced',
  unsubscribes: 'Unsubscribed',
  spam: 'Reported as spam',
  drop: 'Dropped',
};
/** The groups with a card, in turboSMTP's order. */
const CARDS: (Group | 'all')[] = ['all', 'delivered', 'opens', 'clicks', 'bounce'];
const COLORS: Record<string, string> = {
  all: '#334155',
  delivered: '#047857',
  opens: '#0369a1',
  clicks: '#7c3aed',
  bounce: '#b91c1c',
};

const day = (offset: number) =>
  new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);

/** A line per series over the days of the period, in plain SVG. */
function Chart({ series, from, to }: { series: DaySeries; from: string; to: string }) {
  const { t } = useT();
  const days: string[] = [];
  for (let d = Date.parse(from); d <= Date.parse(to) && days.length < 400; d += 86_400_000)
    days.push(new Date(d).toISOString().slice(0, 10));
  const byDay = new Map(series.days.map((d) => [d.day, d.counts]));
  const keys = series.keys.filter((k) => k in COLORS);
  const max = Math.max(1, ...days.flatMap((d) => keys.map((k) => byDay.get(d)?.[k] ?? 0)));
  const W = 720;
  const H = 200;
  const x = (i: number) => (days.length < 2 ? W / 2 : (i / (days.length - 1)) * W);
  const y = (v: number) => H - (v / max) * (H - 10);
  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-52 w-full"
        role="img"
        aria-label={t('Emails per day')}
      >
        <line x1="0" y1={H} x2={W} y2={H} stroke="#cbd5e1" />
        {keys.map((k) => (
          <polyline
            key={k}
            fill="none"
            stroke={COLORS[k]}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            points={days.map((d, i) => `${x(i)},${y(byDay.get(d)?.[k] ?? 0)}`).join(' ')}
          />
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-4 text-xs text-slate-600">
        {keys.map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded" style={{ background: COLORS[k] }} />
            {t(GROUP_LABELS[k as Group | 'all'] ?? k)}
          </span>
        ))}
        <span>
          {t('Most in a day: {max}', { max })} · {days[0]} → {days.at(-1)}
        </span>
      </figcaption>
    </figure>
  );
}

function StatsPage({ api }: AdminPageProps) {
  const { t } = useT();
  const [from, setFrom] = useState(day(29));
  const [to, setTo] = useState(day(0));
  const [group, setGroup] = useState<Group | 'all'>('all');
  const [page, setPage] = useState(1);
  const range = `from=${from}&to=${to}`;
  const stats = useQuery({
    queryKey: ['turbosmtp', 'stats', range],
    queryFn: () =>
      api<{ count: number; series: DaySeries; from: string; to: string }>('GET', `/stats?${range}`),
  });
  const messages = useQuery({
    queryKey: ['turbosmtp', 'messages', range, group, page],
    queryFn: () =>
      api<{ count: number; page: number; pages: number; rows: MessageRow[] }>(
        'GET',
        `/messages?${range}&page=${page}${group === 'all' ? '' : `&group=${group}`}`,
      ),
  });
  const totals = stats.data?.series.totals ?? {};
  const count = stats.data?.count ?? 0;
  const percent = (n: number) => (count ? `${((n / count) * 100).toFixed(1)}%` : '—');

  return (
    <div className="max-w-5xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{t('{name} statistics', { name: NAME })}</h1>
          <p className="text-sm text-slate-600">
            <a
              className="text-sky-700 underline"
              href={DASHBOARD_URL}
              target="_blank"
              rel="noreferrer"
            >
              {t('More in the turboSMTP dashboard')}
            </a>
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t('From')}>
            <input
              type="date"
              className={input}
              value={from}
              max={to}
              onChange={(e) => {
                setFrom(e.target.value || day(29));
                setPage(1);
              }}
            />
          </Field>
          <Field label={t('To')}>
            <input
              type="date"
              className={input}
              value={to}
              min={from}
              onChange={(e) => {
                setTo(e.target.value || day(0));
                setPage(1);
              }}
            />
          </Field>
        </div>
      </header>
      {stats.error ? <Alert>{errorMessage(stats.error)}</Alert> : null}
      {stats.data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {CARDS.map((k) => {
              const n = k === 'all' ? count : (totals[k] ?? 0);
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={group === k}
                  onClick={() => {
                    setGroup(k);
                    setPage(1);
                  }}
                  className={`rounded border p-3 text-left ${group === k ? 'border-sky-700 bg-sky-50' : 'border-slate-200 bg-white'}`}
                >
                  <span className="block text-xs text-slate-600 uppercase">
                    {t(GROUP_LABELS[k])}
                  </span>
                  <span className="block text-2xl font-semibold">{n}</span>
                  {k !== 'all' ? (
                    <span className="block text-xs text-slate-500">{percent(n)}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {count === 0 ? (
            <Alert>{t('No emails in this period.')}</Alert>
          ) : (
            <Card>
              <Chart series={stats.data.series} from={stats.data.from} to={stats.data.to} />
            </Card>
          )}
        </>
      ) : null}
      <Card title={t('Messages')}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="text-sm">
            {t('Show')}{' '}
            <select
              className="rounded border border-slate-300 px-2 py-1 text-sm"
              value={group}
              onChange={(e) => {
                setGroup(e.target.value as Group | 'all');
                setPage(1);
              }}
            >
              {(Object.keys(GROUP_LABELS) as (Group | 'all')[]).map((k) => (
                <option key={k} value={k}>
                  {t(GROUP_LABELS[k])}
                </option>
              ))}
            </select>
          </label>
        </div>
        {messages.error ? <Alert>{errorMessage(messages.error)}</Alert> : null}
        {messages.data ? (
          messages.data.rows.length === 0 ? (
            <p className="text-sm text-slate-600">{t('No messages.')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-600 uppercase">
                  <tr>
                    <th className="py-2 pr-4">{t('Date')}</th>
                    <th className="py-2 pr-4">{t('Status')}</th>
                    <th className="py-2 pr-4">{t('To')}</th>
                    <th className="py-2 pr-4">{t('Subject')}</th>
                    <th className="py-2 pr-4">{t('From')}</th>
                    <th className="py-2">{t('Error')}</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.data.rows.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100 align-top">
                      <td className="py-2 pr-4 whitespace-nowrap">{row.sentAt ? new Date(row.sentAt).toLocaleString() : ""}</td>
                      <td className="py-2 pr-4" title={row.status}>
                        {row.group ? t(GROUP_LABELS[row.group]) : row.status}
                      </td>
                      <td className="py-2 pr-4">{row.to}</td>
                      <td className="py-2 pr-4">{row.subject}</td>
                      <td className="py-2 pr-4">{row.from}</td>
                      <td className="py-2 text-red-700">{row.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
        {messages.data && messages.data.pages > 1 ? (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t('Previous')}
            </Button>
            <span>{t('Page {page} of {pages}', { page, pages: messages.data.pages })}</span>
            <Button
              variant="secondary"
              disabled={page >= messages.data.pages}
              onClick={() => setPage(page + 1)}
            >
              {t('Next')}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: NAME, it: NAME },
      capability: CAPABILITY,
      component: SettingsPage,
      icon: ICON,
      after: '/settings',
    },
    {
      path: 'stats',
      parent: '',
      title: { en: 'Statistics', it: 'Statistiche' },
      capability: CAPABILITY,
      component: StatsPage,
    },
  ],
});
