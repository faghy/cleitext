import { Alert, errorMessage, useT, type AdminPageProps } from '@cleitext/admin-sdk';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { EmailId } from '../emails';
import { CSS } from './styles';

interface Texts {
  subject: string;
  heading: string;
  intro: string;
}
interface EmailView {
  id: EmailId;
  to: 'shop' | 'customer';
  title: { en: string; it: string };
  defaults: { en: Texts; it: Texts };
  custom: Texts & { enabled: boolean };
}

/** Shop → Emails: what the shop sends, with its texts and a preview. */
export function EmailsPage({ api, user }: AdminPageProps) {
  const { t } = useT();
  const list = useQuery({
    queryKey: ['shop', 'emails'],
    queryFn: () => api<{ notifyEmails: string[]; emails: EmailView[] }>('GET', '/emails'),
  });
  const [values, setValues] = useState<Record<string, Texts & { enabled: boolean }>>({});
  const [open, setOpen] = useState<EmailId | null>(null);
  useEffect(() => {
    if (list.data) setValues(Object.fromEntries(list.data.emails.map((e) => [e.id, e.custom])));
  }, [list.data]);
  const save = useMutation({ mutationFn: () => api('PUT', '/emails', values) });
  const preview = useMutation({
    mutationFn: (id: EmailId) =>
      api<{ subject: string; html: string }>('POST', `/emails/${id}/preview`, values[id]),
  });
  const lang = user.locale.startsWith('it') ? 'it' : 'en';
  if (list.isPending) return <p className="sh-muted">{t('Loading…')}</p>;
  if (list.error) return <Alert>{errorMessage(list.error)}</Alert>;
  const set = (id: EmailId, changes: Partial<Texts & { enabled: boolean }>) => {
    save.reset();
    setValues({ ...values, [id]: { ...values[id]!, ...changes } });
  };
  return (
    <div className="sh sh-stack">
      <style>{CSS}</style>
      <h1>{t('Emails')}</h1>
      <p className="sh-muted">
        {t(
          'The emails the shop sends. Leave a text empty to use the default one, in the language of the order. You can use {number}, {name}, {site} and, in refunds, {amount}.',
        )}
      </p>
      <p className="sh-small">
        {list.data.notifyEmails.length
          ? t('The shop’s emails go to {emails}.', { emails: list.data.notifyEmails.join(', ') })
          : t('The shop’s emails go nowhere yet: add an address in Settings → Cleishop.')}
      </p>
      {list.data.emails.map((email) => {
        const value = values[email.id];
        if (!value) return null;
        const defaults = email.defaults[lang];
        return (
          <section key={email.id} className="sh-card sh-stack">
            <div className="sh-row sh-between">
              <div>
                <strong>{email.title[lang]}</strong>{' '}
                <span className="sh-badge sh-badge-info">
                  {email.to === 'shop' ? t('to the shop') : t('to the customer')}
                </span>
              </div>
              <div className="sh-row">
                <label className="sh-check">
                  <input
                    type="checkbox"
                    checked={value.enabled}
                    onChange={(e) => set(email.id, { enabled: e.target.checked })}
                  />
                  {t('Send it')}
                </label>
                <button
                  type="button"
                  className="sh-btn"
                  aria-expanded={open === email.id}
                  onClick={() => setOpen(open === email.id ? null : email.id)}
                >
                  {open === email.id ? t('Close') : t('Edit')}
                </button>
              </div>
            </div>
            {open === email.id && (
              <>
                <label className="sh-field">
                  <span>{t('Subject')}</span>
                  <input
                    type="text"
                    value={value.subject}
                    placeholder={defaults.subject}
                    onChange={(e) => set(email.id, { subject: e.target.value })}
                  />
                </label>
                <label className="sh-field">
                  <span>{t('Heading')}</span>
                  <input
                    type="text"
                    value={value.heading}
                    placeholder={defaults.heading}
                    onChange={(e) => set(email.id, { heading: e.target.value })}
                  />
                </label>
                <label className="sh-field">
                  <span>{t('Introduction')}</span>
                  <textarea
                    rows={3}
                    value={value.intro}
                    placeholder={defaults.intro}
                    onChange={(e) => set(email.id, { intro: e.target.value })}
                  />
                </label>
                <div className="sh-row">
                  <button
                    type="button"
                    className="sh-btn"
                    disabled={preview.isPending}
                    onClick={() => preview.mutate(email.id)}
                  >
                    {t('Preview with the latest order')}
                  </button>
                </div>
                {preview.error && preview.variables === email.id && (
                  <Alert>{errorMessage(preview.error)}</Alert>
                )}
                {preview.data && preview.variables === email.id && (
                  <div className="sh-stack">
                    <p className="sh-small">
                      <strong>{t('Subject')}:</strong> {preview.data.subject}
                    </p>
                    <iframe
                      title={t('Preview')}
                      sandbox=""
                      srcDoc={preview.data.html}
                      style={{
                        width: '100%',
                        height: '32rem',
                        border: '1px solid var(--color-slate-200)',
                        borderRadius: '.5rem',
                        background: '#fff',
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </section>
        );
      })}
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      {save.isSuccess && <Alert kind="success">{t('Saved.')}</Alert>}
      <div className="sh-actions">
        <button
          type="button"
          className="sh-btn sh-btn-primary"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {t('Save')}
        </button>
      </div>
    </div>
  );
}
