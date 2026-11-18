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
import { useState, type ReactNode } from 'react';
import { IT } from './admin-it';
import type { Webhook } from './model';
import type { LogLine, StateView, TestResult } from './server';

addMessages('it', IT);

const QUERY = ['zaphook', 'state'];

interface Draft {
  id?: string;
  label: string;
  url: string;
  enabled: boolean;
  scope: 'all' | 'selected';
  forms: string[];
  otherForms: string;
  includeIp: boolean;
  includeUserAgent: boolean;
  skipMail: boolean;
  hasSecret: boolean;
  secretAction: 'keep' | 'replace' | 'clear';
  secret: string;
}

const EMPTY: Draft = {
  label: '',
  url: '',
  enabled: true,
  scope: 'all',
  forms: [],
  otherForms: '',
  includeIp: false,
  includeUserAgent: false,
  skipMail: false,
  hasSecret: false,
  secretAction: 'replace',
  secret: '',
};

const draftOf = (w: Webhook): Draft => ({
  id: w.id,
  label: w.label,
  url: w.url,
  enabled: w.enabled,
  scope: w.scope,
  forms: w.forms,
  otherForms: '',
  includeIp: w.includeIp,
  includeUserAgent: w.includeUserAgent,
  skipMail: w.skipMail,
  hasSecret: w.hasSecret,
  secretAction: 'keep',
  secret: '',
});

function Check({
  checked,
  onChange,
  children,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {children}
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

const when = (iso: string, language: string) =>
  new Date(iso).toLocaleString(language, { dateStyle: 'short', timeStyle: 'short' });

const STATUS_STYLE: Record<LogLine['status'], string> = {
  queued: 'text-slate-600',
  retrying: 'text-amber-800',
  sent: 'text-emerald-800',
  failed: 'text-red-800',
};

function Editor({
  draft,
  formNames,
  busy,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  formNames: string[];
  busy: boolean;
  onChange: (changes: Partial<Draft>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const names = [...new Set([...formNames, ...draft.forms])];
  return (
    <form
      className="space-y-3 rounded border border-slate-200 bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <h3 className="font-medium">{draft.id ? t('Edit webhook') : t('New webhook')}</h3>
      <TextField
        label={t('Name')}
        hint={t('Only for you, e.g. “Zapier – requests”.')}
        value={draft.label}
        maxLength={80}
        onChange={(e) => onChange({ label: e.target.value })}
      />
      <TextField
        label={t('Webhook address')}
        hint={t('The https:// address given by Zapier, Make, n8n or the service you use.')}
        value={draft.url}
        type="url"
        required
        placeholder="https://hooks.zapier.com/hooks/catch/…"
        onChange={(e) => onChange({ url: e.target.value })}
      />
      <Check checked={draft.enabled} onChange={(enabled) => onChange({ enabled })}>
        {t('Turned on')}
      </Check>
      <fieldset className="space-y-2 text-sm">
        <legend className="font-medium text-slate-800">{t('Which forms')}</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={draft.scope === 'all'}
            onChange={() => onChange({ scope: 'all' })}
          />
          {t('Every form of the site')}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={draft.scope === 'selected'}
            onChange={() => onChange({ scope: 'selected' })}
          />
          {t('Only these forms')}
        </label>
        {draft.scope === 'selected' && (
          <div className="space-y-2 pl-6">
            {names.map((name) => (
              <Check
                key={name}
                checked={draft.forms.includes(name)}
                onChange={(on) =>
                  onChange({
                    forms: on ? [...draft.forms, name] : draft.forms.filter((f) => f !== name),
                  })
                }
              >
                {name}
              </Check>
            ))}
            <TextField
              label={t('Other form names, separated by commas')}
              hint={t('The name of the form as set in its block (Form name).')}
              value={draft.otherForms}
              onChange={(e) => onChange({ otherForms: e.target.value })}
            />
          </div>
        )}
      </fieldset>
      <div className="space-y-2">
        {draft.hasSecret && draft.secretAction === 'keep' ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>{t('A secret is set.')}</span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onChange({ secretAction: 'replace', secret: '' })}
            >
              {t('Replace')}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => onChange({ secretAction: 'clear', secret: '' })}
            >
              {t('Remove')}
            </Button>
          </div>
        ) : draft.secretAction === 'clear' ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>{t('The secret will be removed when you save.')}</span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onChange({ secretAction: 'keep' })}
            >
              {t('Keep it')}
            </Button>
          </div>
        ) : (
          <TextField
            label={t('Signing secret (optional)')}
            hint={t(
              'With a secret, each request carries a signature the receiving side can check (see the guide).',
            )}
            type="password"
            autoComplete="new-password"
            value={draft.secret}
            maxLength={200}
            onChange={(e) => onChange({ secret: e.target.value })}
          />
        )}
      </div>
      <Check
        checked={draft.includeIp}
        onChange={(includeIp) => onChange({ includeIp })}
        hint={t('Off by default: send them only if the receiving side needs them.')}
      >
        {t('Send the visitor’s IP address')}
      </Check>
      <Check
        checked={draft.includeUserAgent}
        onChange={(includeUserAgent) => onChange({ includeUserAgent })}
      >
        {t('Send the visitor’s browser (user agent)')}
      </Check>
      <Check
        checked={draft.skipMail}
        onChange={(skipMail) => onChange({ skipMail })}
        hint={t('The messages this webhook gets are not emailed to you; they stay in Messages.')}
      >
        {t('Do not send the email')}
      </Check>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {t('Save')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('Cancel')}
        </Button>
      </div>
    </form>
  );
}

function ZaphookPage(props: AdminPageProps) {
  const { t, language } = useT();
  const queryClient = useQueryClient();
  const state = useQuery({
    queryKey: QUERY,
    queryFn: () => props.api<StateView>('GET', '/state'),
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<StateView | string>, done?: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const next = await action();
      if (typeof next === 'string') setNotice({ kind: 'success', text: next });
      else {
        queryClient.setQueryData(QUERY, next);
        if (done) setNotice({ kind: 'success', text: done });
      }
      return true;
    } catch (error) {
      setNotice({ kind: 'error', text: t(errorMessage(error)) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (state.isError) return <Alert>{errorMessage(state.error)}</Alert>;
  if (!state.data) return <p className="text-sm text-slate-500">…</p>;
  const data = state.data;

  const save = async (d: Draft) => {
    const forms = [
      ...d.forms,
      ...d.otherForms
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean),
    ];
    const body = {
      label: d.label,
      url: d.url,
      enabled: d.enabled,
      scope: d.scope,
      forms: [...new Set(forms)],
      includeIp: d.includeIp,
      includeUserAgent: d.includeUserAgent,
      skipMail: d.skipMail,
      ...(d.secretAction === 'clear'
        ? { secret: null }
        : d.secretAction === 'replace' && d.secret.trim()
          ? { secret: d.secret }
          : {}),
    };
    const ok = await run(
      () =>
        d.id
          ? props.api<StateView>('PUT', `/webhooks/${d.id}`, body)
          : props.api<StateView>('POST', '/webhooks', body),
      t('Saved.'),
    );
    if (ok) setDraft(null);
  };
  const remove = (w: Webhook) => {
    if (!window.confirm(t('Delete this webhook?'))) return;
    void run(() => props.api<StateView>('DELETE', `/webhooks/${w.id}`), t('Deleted.'));
  };
  const test = (w: Webhook) =>
    void run(async () => {
      const result = await props.api<TestResult>('POST', `/webhooks/${w.id}/test`, {
        locale: language,
      });
      if (!result.ok)
        throw new Error(
          t('The test was not delivered: {error}', {
            error: t(result.error ?? `HTTP ${result.httpStatus}`),
          }),
        );
      return t('Test sent: the webhook answered {status}.', {
        status: String(result.httpStatus),
      });
    });
  const retry = (line: LogLine) =>
    void run(() => props.api<StateView>('POST', `/deliveries/${line.id}/retry`));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Zaphook</h1>
      <p className="text-sm text-slate-600">
        {t(
          'Every message of your contact forms, sent also to the services you use: a Zapier “Catch Hook”, Make, n8n or any https address. The fields go with their names, as in the form.',
        )}
      </p>
      {!data.formsActive && (
        <Alert>
          {t(
            'The Forms plugin is not active on this site: activate it (version 1.9.0 or later) to send its messages.',
          )}
        </Alert>
      )}
      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}

      <Card title={t('Webhooks')}>
        <div className="space-y-3">
          {data.webhooks.length === 0 && (
            <p className="text-sm text-slate-500">{t('No webhook yet.')}</p>
          )}
          {data.webhooks.map((w) =>
            draft?.id === w.id ? (
              <Editor
                key={w.id}
                draft={draft}
                formNames={data.formNames}
                busy={busy}
                onChange={(changes) => setDraft({ ...draft, ...changes })}
                onSave={() => void save(draft)}
                onCancel={() => setDraft(null)}
              />
            ) : (
              <div
                key={w.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 p-3 text-sm"
              >
                <div className="space-y-1">
                  <p className="font-medium">
                    {w.label}{' '}
                    <span
                      className={`ml-1 rounded px-1.5 py-0.5 text-xs ${
                        w.enabled
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {w.enabled ? t('On') : t('Off')}
                    </span>
                  </p>
                  <p className="break-all text-xs text-slate-500">{new URL(w.url).host}</p>
                  <p className="text-xs text-slate-600">
                    {w.scope === 'all'
                      ? t('Every form')
                      : t('Forms: {names}', { names: w.forms.join(', ') })}
                    {w.hasSecret && ` · ${t('Signed')}`}
                    {w.skipMail && ` · ${t('No email')}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => test(w)}>
                    {t('Send a test')}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setDraft(draftOf(w))}>
                    {t('Edit')}
                  </Button>
                  <Button type="button" variant="danger" disabled={busy} onClick={() => remove(w)}>
                    {t('Delete')}
                  </Button>
                </div>
              </div>
            ),
          )}
          {draft && !draft.id ? (
            <Editor
              draft={draft}
              formNames={data.formNames}
              busy={busy}
              onChange={(changes) => setDraft({ ...draft, ...changes })}
              onSave={() => void save(draft)}
              onCancel={() => setDraft(null)}
            />
          ) : (
            !draft && (
              <Button type="button" onClick={() => setDraft({ ...EMPTY })}>
                {t('Add a webhook')}
              </Button>
            )
          )}
        </div>
      </Card>

      <Card title={t('Latest deliveries')}>
        <p className="mb-2 text-xs text-slate-500">
          {t(
            'Deliveries are sent within a minute, and tried again by themselves for a few hours when the other side does not answer.',
          )}
        </p>
        {data.log.length === 0 ? (
          <p className="text-sm text-slate-500">{t('No delivery yet.')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="py-1 pr-3">{t('When')}</th>
                  <th className="py-1 pr-3">{t('Webhook')}</th>
                  <th className="py-1 pr-3">{t('Form')}</th>
                  <th className="py-1 pr-3">{t('Status')}</th>
                  <th className="py-1 pr-3">{t('Attempts')}</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {data.log.map((line) => (
                  <tr key={line.id} className="border-t border-slate-100 align-top">
                    <td className="py-1 pr-3 whitespace-nowrap">
                      {when(line.createdAt, language)}
                    </td>
                    <td className="py-1 pr-3">{line.webhook}</td>
                    <td className="py-1 pr-3">
                      {line.form}
                      {line.fields.length > 0 && (
                        <span className="block text-xs text-slate-500">
                          {t('Fields: {names}', { names: line.fields.join(', ') })}
                        </span>
                      )}
                    </td>
                    <td className={`py-1 pr-3 ${STATUS_STYLE[line.status]}`}>
                      {t(line.status)}
                      {line.httpStatus !== null && ` (${line.httpStatus})`}
                      {line.error && <span className="block text-xs">{t(line.error)}</span>}
                    </td>
                    <td className="py-1 pr-3">{line.attempts}</td>
                    <td className="py-1">
                      {line.canRetry && (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => retry(line)}
                        >
                          {t('Try again')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Zaphook', it: 'Zaphook' },
      parent: '/settings',
      capability: 'manage_zaphook',
      component: ZaphookPage,
    },
  ],
});
