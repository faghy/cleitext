import { useT } from '@cleitext/admin-sdk';
import type { MailSettingsView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, ApiError, errorMessage } from '../api';
import { useMe } from '../auth';
import { Alert, Button, Card, TextField } from '../components/ui';

const selectClass = 'w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm';
const KEY = ['settings', 'mail'];

/** Settings → Email: the site's own SMTP server, with a test (RF-SET-02). */
export function MailCard() {
  const { t } = useT();
  const me = useMe();
  const queryClient = useQueryClient();
  const current = useQuery({
    queryKey: KEY,
    queryFn: () => api<MailSettingsView>('GET', '/settings/mail'),
  });
  const [form, setForm] = useState({
    host: '',
    port: 587,
    security: 'starttls',
    user: '',
    password: '',
    from: '',
  });
  const [testTo, setTestTo] = useState(me.user.email);

  useEffect(() => {
    const view = current.data;
    if (!view) return;
    setForm({
      host: view.host ?? '',
      port: view.port ?? 587,
      security: view.security ?? 'starttls',
      user: view.user ?? '',
      password: '',
      from: view.from ?? '',
    });
  }, [current.data]);

  const save = useMutation({
    mutationFn: () =>
      api<MailSettingsView>('PUT', '/settings/mail', {
        host: form.host,
        port: form.port,
        security: form.security,
        ...(form.user ? { user: form.user } : {}),
        ...(form.password ? { password: form.password } : {}),
        from: form.from,
      }),
    onSuccess: (view) => queryClient.setQueryData(KEY, view),
  });
  const reset = useMutation({
    mutationFn: () => api<MailSettingsView>('DELETE', '/settings/mail'),
    onSuccess: (view) => queryClient.setQueryData(KEY, view),
  });
  const test = useMutation({
    mutationFn: () => api<{ sent: true }>('POST', '/settings/mail/test', { to: testTo }),
  });
  const fieldError = (field: string) =>
    save.error instanceof ApiError ? save.error.fieldError(field) : undefined;
  const set = (key: keyof typeof form, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <section aria-label={t('Email')}>
      <Card title={t('Email')}>
        <p className="mb-4 text-sm text-slate-600">
          {current.data?.configured
            ? t('This site sends email through its own SMTP server.')
            : t(
                'This site uses the server email settings. Enter an SMTP server to send from this site’s address.',
              )}
        </p>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <TextField
            label={t('SMTP server')}
            placeholder="smtp.example.com"
            value={form.host}
            onChange={(e) => set('host', e.target.value)}
            {...(fieldError('host') ? { error: fieldError('host')! } : {})}
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label={t('Port')}
              type="number"
              value={form.port}
              onChange={(e) => set('port', Number(e.target.value))}
              {...(fieldError('port') ? { error: fieldError('port')! } : {})}
            />
            <label className="block space-y-1 text-sm">
              <span className="block font-medium text-slate-800">{t('Security')}</span>
              <select
                className={selectClass}
                value={form.security}
                onChange={(e) => set('security', e.target.value)}
              >
                <option value="starttls">STARTTLS (587)</option>
                <option value="tls">SSL/TLS (465)</option>
                <option value="none">{t('None (local server only)')}</option>
              </select>
            </label>
          </div>
          <TextField
            label={t('User name')}
            autoComplete="off"
            value={form.user}
            onChange={(e) => set('user', e.target.value)}
          />
          <TextField
            label={t('Password')}
            type="password"
            autoComplete="new-password"
            value={form.password}
            placeholder={current.data?.hasPassword ? t('Unchanged') : ''}
            onChange={(e) => set('password', e.target.value)}
            hint={t('Stored encrypted. Leave empty to keep the current one.')}
          />
          <TextField
            label={t('Sender')}
            placeholder="Example <no-reply@example.com>"
            value={form.from}
            onChange={(e) => set('from', e.target.value)}
            {...(fieldError('from') ? { error: fieldError('from')! } : {})}
          />
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={save.isPending || !form.host || !form.from}>
              {t('Save email settings')}
            </Button>
            {current.data?.configured && (
              <Button
                type="button"
                variant="secondary"
                disabled={reset.isPending}
                onClick={() => reset.mutate()}
              >
                {t('Use the server settings')}
              </Button>
            )}
          </div>
        </form>
        {save.isSuccess && (
          <div className="mt-3">
            <Alert kind="success">{t('Email settings saved.')}</Alert>
          </div>
        )}
        {save.error && !fieldError('host') && !fieldError('port') && !fieldError('from') && (
          <div className="mt-3">
            <Alert>{errorMessage(save.error)}</Alert>
          </div>
        )}
        <form
          className="mt-6 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            test.mutate();
          }}
        >
          <div className="min-w-64 flex-1">
            <TextField
              label={t('Send a test email to')}
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={test.isPending || !testTo}>
            {test.isPending ? t('Sending…') : t('Send test email')}
          </Button>
        </form>
        {test.isSuccess && (
          <div className="mt-3">
            <Alert kind="success">{t('Test email sent to {email}.', { email: testTo })}</Alert>
          </div>
        )}
        {test.error && (
          <div className="mt-3">
            <Alert>{errorMessage(test.error)}</Alert>
          </div>
        )}
      </Card>
    </section>
  );
}
