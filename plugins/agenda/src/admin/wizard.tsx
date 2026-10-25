/**
 * The first-run wizard: four short steps to a working booking page, with
 * sensible defaults and a live preview, as Calendly's onboarding does.
 * 1. What do you offer (name, duration). 2. When (weekly hours). 3. Where
 * do bookings go (email). 4. The page (made and published with the block).
 */
import { api, useT } from '@cleitext/admin-sdk';
import { useState } from 'react';
import { BLOCK_TYPE } from '../config';
import { defaultSchedule, normalizeService } from '../model/normalize';
import type { Service } from '../model/types';
import { agenda, messageOf } from './api';
import { Preview } from './preview';
import { ScheduleEditor } from './schedule';
import { Field } from './ui';

const DURATIONS = [15, 30, 45, 60, 90];

export function Wizard({
  timeZone,
  email,
  onDone,
  onSkip,
}: {
  timeZone: string;
  email: string;
  onDone: () => void;
  onSkip: () => void;
}) {
  const { t } = useT();
  const [step, setStep] = useState(0);
  const [service, setService] = useState<Service>(() =>
    normalizeService({
      name: t('Consultation'),
      duration: 30,
      schedule: defaultSchedule(),
      minNotice: 120,
      maxNotice: 60 * 24 * 60,
    }),
  );
  const [notify, setNotify] = useState(email);
  const [title, setTitle] = useState(t('Book an appointment'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState<{ id: string; url: string } | null>(null);
  const set = (patch: Partial<Service>) => setService((s) => normalizeService({ ...s, ...patch }));
  const steps = [t('Service'), t('Hours'), t('Notifications'), t('Booking page')];

  async function finish() {
    setBusy(true);
    setError('');
    try {
      const { service: created } = await agenda.setup({ service, notify });
      const entry = await api<{ id: string }>('POST', '/entries', {
        type: 'page',
        title,
        document: {
          schema: 1,
          blocks: [
            {
              id: `b_${Math.random().toString(36).slice(2, 12)}`,
              type: BLOCK_TYPE,
              v: 1,
              attrs: { service: created?.id ?? '', view: 'month' },
            },
          ],
        },
      });
      const published = await api<{ id: string; slug: string; url?: string }>(
        'POST',
        `/entries/${entry.id}/publish`,
      );
      setPage({ id: entry.id, url: published.url ?? `/${published.slug}` });
      setStep(4);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  if (step === 4 && page)
    return (
      <div className="agx-card agx-grid" style={{ maxWidth: '40rem' }}>
        <h2>{t('Your booking page is ready!')}</h2>
        <p>
          {t(
            'Customers can book now. You will get an email for every booking, and you will find them in Agenda.',
          )}
        </p>
        <div className="agx-row">
          <a
            className="agx-btn agx-primary"
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('Open the booking page')}
          </a>
          <button type="button" className="agx-btn" onClick={onDone}>
            {t('Go to Agenda')}
          </button>
        </div>
        <p className="agx-help">
          {t('Tip: link the page from your menu, or add the Booking block to any page.')}
        </p>
      </div>
    );

  return (
    <div className="agx-grid">
      <div className="agx-head">
        <div>
          <h1>{t('Welcome to Agenda')}</h1>
          <p className="agx-muted" style={{ margin: '.25rem 0 0' }}>
            {t('Four short steps and your customers can book online.')}
          </p>
        </div>
        <button type="button" className="agx-link" onClick={onSkip}>
          {t('Skip, I will set it up myself')}
        </button>
      </div>
      <ol className="agx-steps" aria-label={t('Steps')}>
        {steps.map((label, i) => (
          <li key={label} style={{ listStyle: 'none' }}>
            <span aria-current={i === step ? 'step' : undefined}>
              {i + 1}. {label}
            </span>
          </li>
        ))}
      </ol>
      <div className="agx-wizard">
        <div className="agx-card agx-grid">
          {step === 0 ? (
            <>
              <h2>{t('What do customers book?')}</h2>
              <Field
                label={t('Name of the service')}
                help={t('e.g. Consultation, Haircut, Online session.')}
              >
                <input
                  type="text"
                  value={service.name}
                  onChange={(e) => set({ name: e.target.value })}
                  autoFocus
                />
              </Field>
              <div className="agx-field">
                <span>{t('How long does it last?')}</span>
                <div className="agx-chips" role="group" aria-label={t('Duration')}>
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className="agx-chip"
                      aria-pressed={service.duration === d}
                      onClick={() => set({ duration: d })}
                    >
                      {t('{n} min', { n: d })}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={5}
                    max={600}
                    aria-label={t('Other duration in minutes')}
                    value={service.duration}
                    style={{ width: '6rem' }}
                    onChange={(e) => set({ duration: Number(e.target.value) })}
                  />
                </div>
              </div>
              <Field
                label={t('Price (optional, shown as written)')}
                help={t('e.g. € 60. Nothing is paid online.')}
              >
                <input
                  type="text"
                  value={service.price}
                  onChange={(e) => set({ price: e.target.value })}
                />
              </Field>
            </>
          ) : step === 1 ? (
            <>
              <h2>{t('When can customers book?')}</h2>
              <p className="agx-help">
                {t('Times are in {zone}. You can add holidays and closures later.', {
                  zone: timeZone,
                })}
              </p>
              <ScheduleEditor
                schedule={service.schedule}
                duration={service.duration}
                onChange={(schedule) => set({ schedule })}
              />
            </>
          ) : step === 2 ? (
            <>
              <h2>{t('Where should we tell you about bookings?')}</h2>
              <Field
                label={t('Your email')}
                help={t(
                  'Every new booking and cancellation is sent here. Customers get their own confirmation.',
                )}
              >
                <input type="email" value={notify} onChange={(e) => setNotify(e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <h2>{t('Your booking page')}</h2>
              <Field label={t('Title of the page')}>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <p className="agx-help">
                {t(
                  'We make and publish a page with the booking calendar. You can edit it like any other page.',
                )}
              </p>
            </>
          )}
          {error ? (
            <p className="agx-alert" role="alert">
              {error}
            </p>
          ) : null}
          <div className="agx-row" style={{ justifyContent: 'space-between' }}>
            <button
              type="button"
              className="agx-btn"
              disabled={step === 0 || busy}
              onClick={() => setStep(step - 1)}
            >
              {t('Back')}
            </button>
            {step < 3 ? (
              <button
                type="button"
                className="agx-btn agx-primary"
                disabled={step === 0 && !service.name.trim()}
                onClick={() => setStep(step + 1)}
              >
                {t('Continue')}
              </button>
            ) : (
              <button
                type="button"
                className="agx-btn agx-primary"
                disabled={busy || !title.trim()}
                onClick={() => void finish()}
              >
                {busy ? t('Creating…') : t('Create the booking page')}
              </button>
            )}
          </div>
        </div>
        <Preview service={service} timeZone={timeZone} />
      </div>
    </div>
  );
}
