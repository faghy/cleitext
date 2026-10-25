/**
 * Agenda's settings: notifications and contacts, the time zone, what
 * customers may change, reminders, privacy (consent page, how long data
 * are kept) and the customers' emails, one tab per language of the site.
 */
import { useT } from '@cleitext/admin-sdk';
import { useEffect, useState } from 'react';
import { defaultEmail, PLACEHOLDERS } from '../model/emails';
import { EMAIL_KINDS, type EmailKind, type Settings } from '../model/types';
import { agenda, messageOf, type SettingsAnswer } from './api';
import { Check, Field } from './ui';

function zones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf(
      'timeZone',
    );
  } catch {
    return ['UTC', 'Europe/Rome', 'Europe/London'];
  }
}

export function SettingsTab({ onSaved }: { onSaved: () => void }) {
  const { t } = useT();
  const [data, setData] = useState<SettingsAnswer | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [locale, setLocale] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    agenda
      .settings()
      .then((d) => {
        setData(d);
        setS(d.settings);
        setLocale(d.defaultLocale);
      })
      .catch((e) => setError(messageOf(e)));
  }, []);
  if (!s || !data) return <p className="agx-muted">{error || t('Loading…')}</p>;
  const set = (patch: Partial<Settings>) => {
    setSaved(false);
    setS({ ...s, ...patch });
  };
  const kinds: Record<EmailKind, string> = {
    confirmed: t('Confirmation'),
    pending: t('Request received (to approve)'),
    cancelled: t('Cancellation'),
    rescheduled: t('Moved'),
    reminder: t('Reminder'),
  };
  const setEmail = (kind: EmailKind, patch: { subject?: string; body?: string }) => {
    const current = s.emails[locale]?.[kind] ?? { subject: '', body: '' };
    set({
      emails: { ...s.emails, [locale]: { ...s.emails[locale], [kind]: { ...current, ...patch } } },
    });
  };
  async function save() {
    setError('');
    try {
      setS(await agenda.saveSettings(s!));
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(messageOf(e));
    }
  }
  return (
    <div className="agx-grid" style={{ maxWidth: '52rem' }}>
      <div className="agx-card agx-grid">
        <h2>{t('Notifications')}</h2>
        <Field
          label={t('Send bookings and cancellations to')}
          help={t('One or more email addresses, separated by commas.')}
        >
          <input type="text" value={s.notify} onChange={(e) => set({ notify: e.target.value })} />
        </Field>
        <Field
          label={t('Your contacts')}
          help={t(
            'Shown when online booking is not possible, and on the appointment page when it is too late to change it. Empty: the address above.',
          )}
        >
          <textarea
            value={s.contact}
            onChange={(e) => set({ contact: e.target.value })}
            style={{ minHeight: '4rem' }}
            placeholder={t('e.g. Call 0123 456789 or write to info@example.com')}
          />
        </Field>
      </div>
      <div className="agx-card agx-grid">
        <h2>{t('Calendar')}</h2>
        <Field
          label={t('Time zone')}
          help={
            data.siteTimeZone
              ? t('The site’s zone is {zone}.', { zone: data.siteTimeZone })
              : undefined
          }
        >
          <select value={s.timezone} onChange={(e) => set({ timezone: e.target.value })}>
            <option value="">
              {t('The site’s zone')}
              {data.siteTimeZone ? ` (${data.siteTimeZone})` : ''}
            </option>
            {zones().map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </Field>
        <Check
          label={t('One calendar for every service')}
          help={t(
            'On: an appointment makes the same time busy for the other services too (one person or one room). Off: each service has its own calendar.',
          )}
          checked={s.shared}
          onChange={(shared) => set({ shared })}
        />
        <Field
          label={t('Phone number of new services')}
          help={t(
            'Each service can ask it differently, and its other fields too, in its booking form (Services).',
          )}
        >
          <select
            value={s.phone}
            onChange={(e) => set({ phone: e.target.value as Settings['phone'] })}
          >
            <option value="optional">{t('Asked, optional')}</option>
            <option value="required">{t('Required')}</option>
            <option value="off">{t('Not asked')}</option>
          </select>
        </Field>
      </div>
      <div className="agx-card agx-grid">
        <h2>{t('Customers’ changes')}</h2>
        <Check
          label={t('Customers may cancel from the link in their email')}
          checked={s.allowCancel}
          onChange={(allowCancel) => set({ allowCancel })}
        />
        <Check
          label={t('Customers may move to another time')}
          checked={s.allowReschedule}
          onChange={(allowReschedule) => set({ allowReschedule })}
        />
        <Field label={t('Until how many hours before?')}>
          <input
            type="number"
            min={0}
            value={s.changeNoticeHours}
            onChange={(e) => set({ changeNoticeHours: Number(e.target.value) })}
            style={{ width: '8rem' }}
          />
        </Field>
      </div>
      <div className="agx-card agx-grid" data-agx-reminder="">
        <h2>{t('Reminder')}</h2>
        <Check
          label={t('Send customers a reminder email before the appointment')}
          help={t(
            'On by default, 24 hours before. You can turn it off or change the hours at any time; its text is in “Customers’ emails” below.',
          )}
          checked={s.reminders}
          onChange={(reminders) => set({ reminders })}
        />
        <Field
          label={t('Hours before')}
          help={s.reminders ? undefined : t('Reminders are off: no reminder is sent.')}
        >
          <input
            type="number"
            min={1}
            max={168}
            value={s.reminderHours}
            disabled={!s.reminders}
            onChange={(e) => set({ reminderHours: Number(e.target.value) })}
            style={{ width: '8rem' }}
          />
        </Field>
      </div>
      <div className="agx-card agx-grid">
        <h2>{t('Privacy')}</h2>
        <Field
          label={t('Privacy policy page')}
          help={t('e.g. /privacy-policy: linked in the consent customers give.')}
        >
          <input
            type="text"
            value={s.privacyUrl}
            onChange={(e) => set({ privacyUrl: e.target.value })}
          />
        </Field>
        <Field
          label={t('Erase customers’ data after (months)')}
          help={t(
            'Name, email, phone and answers are erased this many months after the appointment; the appointment stays, without them. 0: kept.',
          )}
        >
          <input
            type="number"
            min={0}
            max={120}
            value={s.retentionMonths}
            onChange={(e) => set({ retentionMonths: Number(e.target.value) })}
            style={{ width: '8rem' }}
          />
        </Field>
      </div>
      <div className="agx-card agx-grid">
        <h2>{t('Customers’ emails')}</h2>
        <p className="agx-help">
          {t('Leave a field empty to use the default text. Placeholders:')}{' '}
          {PLACEHOLDERS.map((p) => `{${p}}`).join(' ')}
        </p>
        {data.locales.length > 1 ? (
          <div className="agx-chips" role="tablist">
            {data.locales.map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                className="agx-chip"
                aria-selected={l === locale}
                aria-pressed={l === locale}
                onClick={() => setLocale(l)}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        ) : null}
        {EMAIL_KINDS.map((kind) => {
          const own = s.emails[locale]?.[kind];
          const def = defaultEmail(kind, locale);
          return (
            <details key={`${locale}-${kind}`} className="agx-card">
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                {kinds[kind]}{' '}
                {own?.subject || own?.body ? (
                  <span className="agx-pill">{t('Changed')}</span>
                ) : null}
              </summary>
              <div className="agx-grid" style={{ marginTop: '.75rem' }}>
                <Field label={t('Subject')}>
                  <input
                    type="text"
                    value={own?.subject ?? ''}
                    placeholder={def.subject}
                    onChange={(e) => setEmail(kind, { subject: e.target.value })}
                  />
                </Field>
                <Field label={t('Text')}>
                  <textarea
                    value={own?.body ?? ''}
                    placeholder={def.body}
                    onChange={(e) => setEmail(kind, { body: e.target.value })}
                    style={{ minHeight: '12rem' }}
                  />
                </Field>
              </div>
            </details>
          );
        })}
      </div>
      {error ? (
        <p className="agx-alert" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="agx-ok" role="status">
          {t('Settings saved.')}
        </p>
      ) : null}
      <div>
        <button type="button" className="agx-btn agx-primary" onClick={() => void save()}>
          {t('Save settings')}
        </button>
      </div>
    </div>
  );
}
