/**
 * The booking block's markup. The page is cached and shared by visitors, so
 * it holds no free times: the runtime (`public/agenda.ts`) asks for them.
 * What does not change between visitors is drawn here: the services, the
 * details form (with the custom fields of every service and the bot
 * protection's widget, whose scripts must be in the page) and the message
 * shown when online booking is not possible.
 */
import { MARKER } from './config';
import { serviceText } from './model/normalize';
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
  /** The phone is asked by a service imported with it as required. */
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

function Field({ field, uid }: { field: CustomField; uid: string }) {
  const id = `${uid}-f-${field.name}`;
  const label = (
    <span className="ag-label">
      {field.label}
      {field.required ? <span aria-hidden="true"> *</span> : null}
    </span>
  );
  if (field.type === 'checkbox')
    return (
      <label className="ag-check" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          name={`f_${field.name}`}
          value="1"
          required={field.required}
        />
        <span>{field.label}</span>
      </label>
    );
  return (
    <label className="ag-field" htmlFor={id}>
      {label}
      {field.type === 'textarea' ? (
        <textarea
          id={id}
          name={`f_${field.name}`}
          rows={3}
          maxLength={2000}
          required={field.required}
        />
      ) : field.type === 'select' ? (
        <select id={id} name={`f_${field.name}`} required={field.required} defaultValue="">
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          name={`f_${field.name}`}
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          maxLength={field.type === 'text' ? 300 : undefined}
          required={field.required}
        />
      )}
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
  const phoneRequired =
    settings.phone === 'required' || view.services.some((x) => x.data.askPhone === true);
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
              <label className="ag-field" htmlFor={`${uid}-name`}>
                <span className="ag-label">{s.name} *</span>
                <input
                  id={`${uid}-name`}
                  name="name"
                  required
                  maxLength={200}
                  autoComplete="name"
                />
              </label>
              <label className="ag-field" htmlFor={`${uid}-email`}>
                <span className="ag-label">{s.email} *</span>
                <input
                  id={`${uid}-email`}
                  name="email"
                  type="email"
                  inputMode="email"
                  required
                  maxLength={200}
                  autoComplete="email"
                />
              </label>
              {settings.phone !== 'off' || phoneRequired ? (
                <label className="ag-field" htmlFor={`${uid}-phone`}>
                  <span className="ag-label">
                    {s.phone}
                    {phoneRequired ? ' *' : <span className="ag-optional"> ({s.optional})</span>}
                  </span>
                  <input
                    id={`${uid}-phone`}
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    required={phoneRequired}
                    maxLength={40}
                    autoComplete="tel"
                  />
                </label>
              ) : null}
              {view.services
                .filter((service) => service.fields.length > 0)
                .map((service) => (
                  <fieldset
                    key={service.id}
                    className="ag-fields"
                    data-ag-fields={service.id}
                    hidden
                    disabled
                  >
                    {service.fields.map((field) => (
                      <Field
                        key={field.name}
                        field={field}
                        uid={`${uid}-${service.id.slice(0, 8)}`}
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
