import {
  addMessages,
  type AdminPageProps,
  Alert,
  Button,
  Card,
  defineAdminPlugin,
  errorMessage,
  useT,
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { IT } from './admin-it';
import {
  FORM_GROUPS,
  SCRIPTS,
  type AntispamConfig,
  type FormGroup,
  type QueueItem,
  type ScriptName,
  type Stats,
} from './options';

addMessages('it', IT);

const input = 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm';
const QUEUE = ['antispam', 'queue'];

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

/** Names of the rules, as people read them. */
function useReasons() {
  const { t } = useT();
  return (reason: string): string =>
    ({
      honeypot: t('Hidden field filled in'),
      token: t('Forged time check'),
      'too-fast': t('Sent too fast'),
      links: t('Too many links'),
      bbcode: t('Forum link tags'),
      blocklist: t('Blocked word or address'),
      script: t('Foreign alphabet'),
      'author-link': t('Name is a web address'),
      'no-mx': t('Email domain without mail server'),
      repeated: t('Same text again and again'),
      'known-spam': t('Text marked as spam before'),
      'known-good': t('Text marked as not spam before'),
      sender: t('Sender of past spam'),
      'no-js': t('No JavaScript'),
    })[reason] ?? reason;
}

function formName(form: string, t: (text: string) => string): string {
  if (form === 'core/comment') return t('Comment');
  if (form === 'core/register') return t('Sign-up');
  if (form === 'shop/review') return t('Review');
  if (form === 'prisma/form') return 'Prisma';
  if (form === 'fresco-pro/form') return 'Fresco Pro';
  if (form.startsWith('forms/')) return t('Contact form');
  return form;
}

function QueuePage({ api, user }: AdminPageProps) {
  const { t } = useT();
  const reasonLabel = useReasons();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: QUEUE,
    queryFn: () => api<{ items: QueueItem[] }>('GET', '/queue'),
  });
  const act = useMutation({
    mutationFn: (input: { action: 'not-spam' | 'spam' | 'empty'; ids?: string[] }) =>
      api<{ done?: number; failed?: string[] }>('POST', `/queue/${input.action}`, {
        ids: input.ids ?? [],
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUEUE }),
  });
  const items = list.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t('Spam')}</h1>
        {items.length > 0 && (
          <Button
            variant="danger"
            disabled={act.isPending}
            onClick={() => {
              if (window.confirm(t('Delete everything in the spam queue for good?')))
                act.mutate({ action: 'empty' });
            }}
          >
            {t('Empty the queue')}
          </Button>
        )}
      </div>
      <p className="text-sm text-slate-600">
        {t(
          'Comments and form messages held as spam. “Not spam” publishes the comment or delivers the message, and both buttons teach the filter. The queue empties itself after the days set in the settings.',
        )}
      </p>
      {list.error && <Alert>{errorMessage(list.error)}</Alert>}
      {act.error && <Alert>{errorMessage(act.error)}</Alert>}
      {act.data?.failed && act.data.failed.length > 0 && (
        <Alert>{t('Some messages could not be delivered: is their plugin still active?')}</Alert>
      )}
      {list.data && items.length === 0 && (
        <p className="text-sm text-slate-600">{t('No spam. Nice and quiet.')}</p>
      )}
      <ul className="space-y-3" aria-label={t('Spam')}>
        {items.map((item) => (
          <li key={item.id}>
            <Card
              title={`${item.author || item.email || t('Anonymous')} · ${formName(item.form, t)}`}
            >
              <p className="text-xs text-slate-500">
                {new Date(item.createdAt).toLocaleString(user.locale)}
                {item.email && ` · ${item.email}`}
                {item.score !== null && ` · ${t('Score {n}', { n: item.score })}`}
                {item.kind === 'refused' && ` · ${t('refused: the sender was told')}`}
              </p>
              {item.reasons.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-1">
                  {item.reasons.map((r) => (
                    <span
                      key={r}
                      className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900"
                    >
                      {reasonLabel(r)}
                    </span>
                  ))}
                </p>
              )}
              {item.text && (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.text}</p>
              )}
              {item.fields.length > 0 && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-slate-600">{t('All fields')}</summary>
                  <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-[minmax(8rem,auto)_1fr]">
                    {item.fields.map((f) => (
                      <div key={f.name} className="contents">
                        <dt className="font-medium text-slate-700">{f.name}</dt>
                        <dd className="whitespace-pre-wrap break-words">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  disabled={act.isPending}
                  onClick={() => act.mutate({ action: 'not-spam', ids: [item.id] })}
                >
                  {item.deliverable
                    ? item.kind === 'comment'
                      ? t('Not spam: publish')
                      : t('Not spam: deliver')
                    : t('Not spam')}
                </Button>
                <Button
                  variant="danger"
                  disabled={act.isPending}
                  onClick={() => act.mutate({ action: 'spam', ids: [item.id] })}
                >
                  {t('Spam: delete')}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatsPage({ api, user }: AdminPageProps) {
  const { t } = useT();
  const reasonLabel = useReasons();
  const stats = useQuery({
    queryKey: ['antispam', 'stats'],
    queryFn: () => api<Stats>('GET', '/stats?days=30'),
  });
  if (stats.error) return <Alert>{errorMessage(stats.error)}</Alert>;
  if (!stats.data) return <p className="text-sm text-slate-500">…</p>;
  const total = (d: Stats['days'][number]) => d.held + d.refused + d.rejected + d.challenged;
  const max = Math.max(1, ...stats.data.days.map(total));
  const sum = stats.data.days.reduce((n, d) => n + total(d), 0);
  const parts: [keyof Omit<Stats['days'][number], 'day'>, string, string][] = [
    ['rejected', t('Dropped (bots)'), 'bg-slate-700'],
    ['held', t('Held as spam'), 'bg-amber-500'],
    ['refused', t('Refused'), 'bg-rose-500'],
    ['challenged', t('Asked for the captcha'), 'bg-sky-500'],
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('Antispam statistics')}</h1>
      <p className="text-sm text-slate-600">
        {t('{n} submissions stopped or held in the last 30 days.', { n: sum })}
      </p>
      <Card title={t('Per day')}>
        <div className="flex h-40 items-end gap-0.5" role="img" aria-label={t('Per day')}>
          {stats.data.days.map((d) => (
            <div
              key={d.day}
              className="flex flex-1 flex-col-reverse"
              style={{ height: `${(total(d) / max) * 100}%` }}
              title={`${new Date(d.day).toLocaleDateString(user.locale)}: ${total(d)}`}
            >
              {parts.map(([key, , color]) =>
                d[key] ? (
                  <div
                    key={key}
                    className={color}
                    style={{ height: `${(d[key] / total(d)) * 100}%` }}
                  />
                ) : null,
              )}
            </div>
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
          {parts.map(([key, label, color]) => (
            <li key={key} className="flex items-center gap-1">
              <span className={`inline-block h-3 w-3 rounded-sm ${color}`} />
              {label}: {stats.data.days.reduce((n, d) => n + d[key], 0)}
            </li>
          ))}
        </ul>
      </Card>
      <Card title={t('Per reason')}>
        {stats.data.reasons.length === 0 ? (
          <p className="text-sm text-slate-600">{t('Nothing yet.')}</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {stats.data.reasons.map((r) => (
                <tr key={r.reason} className="border-t border-slate-100">
                  <td className="py-1">{reasonLabel(r.reason)}</td>
                  <td className="py-1 text-right tabular-nums">{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

interface SettingsView {
  config: AntispamConfig;
  locales: string[];
}

function SettingsPage({ api }: AdminPageProps) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const saved = useQuery({
    queryKey: ['antispam', 'settings'],
    queryFn: () => api<SettingsView>('GET', '/settings'),
  });
  const [draft, setDraft] = useState<AntispamConfig | null>(null);
  const [blocklist, setBlocklist] = useState('');
  const [allowlist, setAllowlist] = useState('');
  useEffect(() => {
    if (saved.data && !draft) {
      setDraft(saved.data.config);
      setBlocklist(saved.data.config.blocklist.join('\n'));
      setAllowlist(saved.data.config.allowlist.join('\n'));
    }
  }, [saved.data, draft]);
  const save = useMutation({
    mutationFn: (config: AntispamConfig) => api<SettingsView>('PUT', '/settings', { config }),
    onSuccess: (next) => {
      queryClient.setQueryData(['antispam', 'settings'], next);
      setDraft(next.config);
      setBlocklist(next.config.blocklist.join('\n'));
      setAllowlist(next.config.allowlist.join('\n'));
    },
  });
  if (saved.isError) return <Alert>{errorMessage(saved.error)}</Alert>;
  if (!draft) return <p className="text-sm text-slate-500">…</p>;

  const set = (changes: Partial<AntispamConfig>) => setDraft({ ...draft, ...changes });
  const groups: Record<FormGroup, string> = {
    comments: t('Comments and reviews'),
    register: t('Create an account'),
    forms: t('Forms plugin'),
    builders: t('Page builder forms (Prisma, Fresco Pro)'),
    other: t('Forms of other plugins'),
  };
  const scriptNames: Record<ScriptName, string> = {
    latin: t('Latin'),
    cyrillic: t('Cyrillic'),
    greek: t('Greek'),
    cjk: t('Chinese, Japanese, Korean'),
    arabic: t('Arabic'),
    hebrew: t('Hebrew'),
    devanagari: t('Devanagari'),
    thai: t('Thai'),
    armenian: t('Armenian'),
    georgian: t('Georgian'),
  };
  const number = (value: number, min: number, max: number, onChange: (n: number) => void) => (
    <input
      className={input}
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          ...draft,
          blocklist: blocklist.split('\n'),
          allowlist: allowlist.split('\n'),
        });
      }}
    >
      <h1 className="text-2xl font-semibold">Antispam</h1>
      <p className="text-sm text-slate-600">
        {t(
          'Every check runs on this site: nothing is sent to other services, and visitors’ addresses are kept only as salted hashes. The defaults suit most sites.',
        )}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('Forms to protect')}>
          <div className="space-y-2">
            {FORM_GROUPS.map((group) => (
              <Check
                key={group}
                checked={draft.forms[group]}
                onChange={(v) => set({ forms: { ...draft.forms, [group]: v } })}
              >
                {groups[group]}
              </Check>
            ))}
            <hr className="my-3 border-slate-200" />
            <Check checked={draft.skipSignedIn} onChange={(v) => set({ skipSignedIn: v })}>
              {t('Do not check people who are signed in')}
            </Check>
          </div>
        </Card>

        <Card title={t('Checks')}>
          <div className="space-y-3">
            <Field
              label={t('Minimum time to fill a form (seconds)')}
              hint={t('Bots send at once; people take a few seconds. 0 turns it off.')}
            >
              {number(draft.minSeconds, 0, 60, (n) => set({ minSeconds: n }))}
            </Field>
            <Field
              label={t('Links allowed in a message')}
              hint={t('More links than this add to the score.')}
            >
              {number(draft.maxLinks, 0, 50, (n) => set({ maxLinks: n }))}
            </Field>
            <Check checked={draft.bbcode} onChange={(v) => set({ bbcode: v })}>
              {t('Forum link tags such as [url]')}
            </Check>
            <Check checked={draft.authorLink} onChange={(v) => set({ authorLink: v })}>
              {t('A name that is a web address')}
            </Check>
            <Check checked={draft.fingerprints} onChange={(v) => set({ fingerprints: v })}>
              {t('The same text sent again and again, and texts you marked before')}
            </Check>
            <Check checked={draft.senders} onChange={(v) => set({ senders: v })}>
              {t('Addresses that sent spam before (kept as salted hashes)')}
            </Check>
            <Check checked={draft.checkMx} onChange={(v) => set({ checkMx: v })}>
              {t(
                'Email domains without a mail server (asks the server’s DNS resolver, which may be outside the site)',
              )}
            </Check>
          </div>
        </Card>

        <Card title={t('Alphabets')}>
          <div className="space-y-3">
            <Field
              label={t('Letters allowed in messages')}
              hint={t(
                'Messages mostly written in other alphabets add to the score. Latin is always allowed.',
              )}
            >
              <select
                className={input}
                value={draft.scripts}
                onChange={(e) => set({ scripts: e.target.value as AntispamConfig['scripts'] })}
              >
                <option value="auto">
                  {t('Those of the site’s languages ({list})', {
                    list: (saved.data?.locales ?? []).join(', '),
                  })}
                </option>
                <option value="custom">{t('Those ticked below')}</option>
                <option value="off">{t('Any alphabet')}</option>
              </select>
            </Field>
            {draft.scripts === 'custom' && (
              <div className="grid grid-cols-2 gap-1">
                {SCRIPTS.map((s) => (
                  <Check
                    key={s}
                    checked={s === 'latin' || draft.allowedScripts.includes(s)}
                    onChange={(v) =>
                      s !== 'latin' &&
                      set({
                        allowedScripts: v
                          ? [...draft.allowedScripts, s]
                          : draft.allowedScripts.filter((x) => x !== s),
                      })
                    }
                  >
                    {scriptNames[s]}
                  </Check>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card title={t('Lists')}>
          <div className="space-y-3">
            <Field
              label={t('Block list')}
              hint={t(
                'One per line: words, web addresses or domains, emails or @domain, IP addresses or ranges such as 203.0.113.0/24.',
              )}
            >
              <textarea
                className={input}
                rows={5}
                value={blocklist}
                onChange={(e) => setBlocklist(e.target.value)}
                spellCheck={false}
              />
            </Field>
            <Field
              label={t('Never check')}
              hint={t('One per line: emails or @domain, IP addresses or ranges.')}
            >
              <textarea
                className={input}
                rows={3}
                value={allowlist}
                onChange={(e) => setAllowlist(e.target.value)}
                spellCheck={false}
              />
            </Field>
          </div>
        </Card>

        <Card title={t('Score')}>
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              {t(
                'Each check adds points. From the first threshold a message is doubtful: the Captcha plugin asks the visitor to confirm, when it is active, otherwise it goes to the queue. From the second it is spam and goes to the queue. From the third it is dropped, while the sender is told it went through.',
              )}
            </p>
            <Field label={t('Doubtful from')}>
              {number(draft.thresholds.challenge, 1, 50, (n) =>
                set({ thresholds: { ...draft.thresholds, challenge: n } }),
              )}
            </Field>
            <Field label={t('Spam from')}>
              {number(draft.thresholds.spam, 1, 50, (n) =>
                set({ thresholds: { ...draft.thresholds, spam: n } }),
              )}
            </Field>
            <Field label={t('Dropped from')}>
              {number(draft.thresholds.reject, 1, 100, (n) =>
                set({ thresholds: { ...draft.thresholds, reject: n } }),
              )}
            </Field>
          </div>
        </Card>

        <Card title={t('Spam queue')}>
          <div className="space-y-3">
            <Field
              label={t('Delete spam after (days)')}
              hint={t('The hashed addresses of spam senders are forgotten after the same days.')}
            >
              {number(draft.retentionDays, 1, 365, (n) => set({ retentionDays: n }))}
            </Field>
            <Check checked={draft.purgeComments} onChange={(v) => set({ purgeComments: v })}>
              {t('Also delete the comments in Comments → Spam')}
            </Check>
          </div>
        </Card>
      </div>
      {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
      {save.isSuccess && <Alert kind="success">{t('Saved.')}</Alert>}
      <Button type="submit" disabled={save.isPending}>
        {t('Save')}
      </Button>
    </form>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Spam', it: 'Spam' },
      capability: 'moderate_comments',
      component: QueuePage,
      // A shield.
      icon: 'M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z M9 12l2 2 4-4',
    },
    {
      path: 'stats',
      title: { en: 'Statistics', it: 'Statistiche' },
      parent: '',
      capability: 'moderate_comments',
      component: StatsPage,
    },
    {
      path: 'settings',
      title: { en: 'Antispam', it: 'Antispam' },
      parent: '/settings',
      capability: 'manage_settings',
      component: SettingsPage,
    },
  ],
});
