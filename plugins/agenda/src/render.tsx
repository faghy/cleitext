/**
 * The booking block's markup. The page is cached and shared by visitors, so
 * it holds no free times: the runtime (`public/agenda.ts`) asks for them.
 * What does not change between visitors is drawn here: the services, the
 * details form (the fields of every service, as its form sets them, and the bot
 * protection's widget, whose scripts must be in the page) and the message
 * shown when online booking is not possible.
 */
import type { ReactNode } from 'react';
import { MARKER } from './config';
import { fieldText, formOf, visibleFields } from './model/form';
import { isStandardField, serviceText } from './model/normalize';
import type { Strings } from './model/strings';
import type { CustomField, Service, Settings } from './model/types';

export interface WidgetConfig {
  api: string;
  /** The page of an appointment (cancel, reschedule, calendar file). */
  manage: string;
  locale: string;
  timeZone: string;
  view: 'week' | 'month';
  /** A single service: its step is skipped. */
  fixed: string | null;
  /** Moving an appointment (its page): the link's token. */
  token?: string;
  services: {
    id: string;
    name: string;
    duration: number;
    price: string;
    color: string;
    capacity: number;
  }[];
  strings: Strings;
}

export interface BlockView {
  config: WidgetConfig;
  services: Service[];
  settings: Pick<Settings, 'phone' | 'privacyUrl' | 'contact'>;
  /** The bot protection's widget. */
  challenge: string;
  limitReached: boolean;
  heading: string;
  preview: boolean;
  uid: string;
}

function json(value: unknown): string {
  // Safe inside an attribute: React escapes quotes and ampersands.
  return JSON.stringify(value);
}

/** One field of the form, with the label and help of the page's language. */
export function FormField({
  field,
  uid,
  strings,
  locale,
}: {
  field: CustomField;
  uid: string;
  strings: Strings;
  locale: string;
}) {
  const id = `${uid}-f-${field.name}`;
  const { label, help } = fieldText(field, locale, strings);
  const required = field.state === 'required';
  const helpId = help ? `${id}-help` : undefined;
  const helpText = help ? (
    <span className="ag-help" id={helpId}>
      {help}
    </span>
  ) : null;
  if (field.type === 'checkbox' && !isStandardField(field.name))
    return (
      <div className="ag-checkfield">
        <label className="ag-check" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            name={`f_${field.name}`}
            value="1"
            required={required}
            aria-describedby={helpId}
          />
          <span>
            {label}
            {required ? <span aria-hidden="true"> *</span> : null}
          </span>
        </label>
        {helpText}
      </div>
    );
  const common = { id, required, 'aria-describedby': helpId };
  let input: ReactNode;
  if (field.name === 'name')
    input = <input {...common} name="name" maxLength={200} autoComplete="name" />;
  else if (field.name === 'email')
    input = (
      <input
        {...common}
        name="email"
        type="email"
        inputMode="email"
        maxLength={200}
        autoComplete="email"
      />
    );
  else if (field.name === 'phone')
    input = (
      <input
        {...common}
        name="phone"
        type="tel"
        inputMode="tel"
        maxLength={40}
        autoComplete="tel"
      />
    );
  else if (field.type === 'textarea')
    input = <textarea {...common} name={`f_${field.name}`} rows={3} maxLength={2000} />;
  else if (field.type === 'select')
    input = (
      <select {...common} name={`f_${field.name}`} defaultValue="">
        <option value="">—</option>
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  else
    input = (
      <input
        {...common}
        name={`f_${field.name}`}
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        maxLength={field.type === 'text' ? 300 : undefined}
      />
    );
  return (
    <label className="ag-field" htmlFor={id}>
      <span className="ag-label">
        {label}
        {required ? (
          <span aria-hidden="true"> *</span>
        ) : (
          <span className="ag-optional"> ({strings.optional})</span>
        )}
      </span>
      {input}
      {helpText}
    </label>
  );
}

function Consent({ s, privacyUrl, uid }: { s: Strings; privacyUrl: string; uid: string }) {
  const [before, after = ''] = s.consent.split('{privacy}');
  return (
    <label className="ag-check ag-consent" htmlFor={`${uid}-consent`}>
      <input id={`${uid}-consent`} type="checkbox" name="consent" value="1" required />
      <span>
        {privacyUrl ? (
          <>
            {before}
            <a href={privacyUrl} target="_blank" rel="noopener">
              {s.privacy}
            </a>
            {after}
          </>
        ) : (
          s.consentPlain
        )}
      </span>
    </label>
  );
}

export function LimitMessage({ s, contact }: { s: Strings; contact: string }) {
  return (
    <div className="ag-limit" role="status">
      <p className="ag-limit-title">{s.limit}</p>
      {contact ? (
        <>
          <p>{s.limitContact}</p>
          <p className="ag-contact">
            {contact.split(/\r?\n/).map((line, i) => (
              <span key={i}>
                {line.replace(/\s+/g, ' ')}
                <br />
              </span>
            ))}
          </p>
        </>
      ) : null}
    </div>
  );
}

export function BookingWidget({ view }: { view: BlockView }) {
  const { config, settings, uid } = view;
  const s = config.strings;
  return (
    <div className="ag" id={uid} {...{ [MARKER]: json(config) }} lang={config.locale}>
      {view.heading ? <h2 className="ag-heading">{view.heading}</h2> : null}
      {view.limitReached ? (
        <LimitMessage s={s} contact={settings.contact} />
      ) : view.services.length === 0 ? (
        view.preview ? (
          <p className="ag-note">{s.unavailable}</p>
        ) : null
      ) : (
        <>
          <p className="ag-sr" aria-live="polite" data-ag-live="" />
          <section className="ag-step" data-ag-step="service" hidden={!!config.fixed}>
            <h3 className="ag-step-title" tabIndex={-1}>
              {s.chooseService}
            </h3>
            <ul className="ag-services">
              {view.services.map((service) => {
                const t = serviceText(service, config.locale);
                return (
                  <li key={service.id}>
                    <button type="button" className="ag-service" data-ag-service={service.id}>
                      <span
                        className="ag-dot"
                        style={{ background: service.color }}
                        aria-hidden="true"
                      />
                      <span className="ag-service-text">
                        <span className="ag-service-name">{t.name}</span>
                        <span className="ag-meta">
                          {s.minutes.replace('{n}', String(service.duration))}
                          {t.price ? ` · ${t.price}` : ''}
                        </span>
                        {t.description ? <span className="ag-desc">{t.description}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="ag-step" data-ag-step="time" hidden={!config.fixed}>
            <div className="ag-summary" data-ag-summary="" />
            <h3 className="ag-step-title" tabIndex={-1}>
              {s.chooseDay}
            </h3>
            <div className="ag-calendar" data-ag-calendar="">
              {view.preview ? null : <p className="ag-note">{s.loading}</p>}
            </div>
            <noscript>
              <p className="ag-note">{s.noscript}</p>
            </noscript>
          </section>
          <section className="ag-step" data-ag-step="details" hidden>
            <div className="ag-summary" data-ag-summary="" />
            <h3 className="ag-step-title" tabIndex={-1}>
              {s.details}
            </h3>
            <form className="ag-form" noValidate>
              <p className="ag-error" role="alert" data-ag-error="" hidden />
              {view.services.map((service) => (
                <fieldset
                  key={service.id}
                  className="ag-fields"
                  data-ag-fields={service.id}
                  hidden
                  disabled
                >
                  {visibleFields(formOf(service, settings.phone)).map((field) => (
                    <FormField
                      key={field.name}
                      field={field}
                      uid={`${uid}-${service.id.slice(0, 8)}`}
                      strings={s}
                      locale={config.locale}
                    />
                  ))}
                </fieldset>
              ))}
              {/* Left empty by people; bots fill it in. */}
              <label className="ag-hp" aria-hidden="true">
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
              <Consent s={s} privacyUrl={settings.privacyUrl} uid={uid} />
              {view.challenge ? (
                <div
                  className="ag-challenge"
                  dangerouslySetInnerHTML={{ __html: view.challenge }}
                />
              ) : null}
              <button type="submit" className="ag-primary">
                {s.book}
              </button>
            </form>
          </section>
          <section className="ag-step" data-ag-step="done" hidden tabIndex={-1} />
        </>
      )}
    </div>
  );
}
