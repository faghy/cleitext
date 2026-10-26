/**
 * The signup form's markup, drawn on the server. It works without
 * JavaScript (a POST, then back to the page with the outcome in the
 * address's fragment, shown by `:target`), and the script in
 * `public/newletter.ts` sends it in place when JavaScript runs. Colors,
 * fonts and fields come from the theme; a few CSS variables
 * (`--cx-nl-gap`, `--cx-nl-max-width`, `--cx-nl-accent`…) adjust the rest.
 */
import { CSS, MARKER, SUBMIT_PATH } from './config';
import type { Strings } from './model/strings';
import type { FieldSet } from './model/types';

/** The outcomes a visitor can read, each an element shown by `:target`. */
export const OUTCOMES = [
  'success',
  'pending',
  'already',
  'error',
  'invalid',
  'check',
  'busy',
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface FormView {
  /** The form's id on the page (from the block's id). */
  uid: string;
  ready: boolean;
  preview: boolean;
  heading: string;
  text: string;
  fields: FieldSet;
  custom: { key: string; label: string; required: boolean }[];
  layout: 'stacked' | 'inline';
  /** The signed spec of the form. */
  spec: string;
  locale: string;
  privacyUrl: string;
  challenge: string;
  /** Texts: the built-in ones with the owner's and the block's. */
  s: Strings;
  buttonLabel: string;
  messages: Record<Outcome, string>;
}

export function messagesOf(
  s: Strings,
  overrides: { success?: string; error?: string },
): Record<Outcome, string> {
  return {
    success: overrides.success || s.success,
    pending: s.pending,
    already: s.already,
    error: overrides.error || s.error,
    invalid: s.invalid,
    check: s.check,
    busy: s.busy,
  };
}

function Field({
  id,
  name,
  label,
  type = 'text',
  required,
  autoComplete,
  s,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  required: boolean;
  autoComplete?: string;
  s: Strings;
}) {
  return (
    <p className={`${CSS}__field ${CSS}__field--${name.replace(/[^\w-]/g, '')}`}>
      <label htmlFor={id}>
        {label}
        {required ? (
          <>
            <span aria-hidden="true"> *</span>
            <span className={`${CSS}__sr`}> ({s.requiredMark})</span>
          </>
        ) : null}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        maxLength={type === 'email' ? 254 : 100}
        {...(autoComplete ? { autoComplete } : {})}
      />
    </p>
  );
}

/** The stylesheet of the form: layout only, the theme draws the fields. */
export const FORM_CSS =
  `.${CSS}{--cx-nl-gap:.75rem;--cx-nl-max-width:36rem;display:grid;gap:var(--cx-nl-gap);max-width:var(--cx-nl-max-width)}` +
  `.${CSS} form{display:grid;gap:var(--cx-nl-gap)}` +
  `.${CSS}__field{display:grid;gap:.25rem;margin:0}` +
  `.${CSS}__field input{width:100%;box-sizing:border-box}` +
  `.${CSS}--inline .${CSS}__row{display:flex;flex-wrap:wrap;gap:var(--cx-nl-gap);align-items:flex-end}` +
  `.${CSS}--inline .${CSS}__row .${CSS}__field{flex:1 1 12rem}` +
  `.${CSS}__row{display:grid;gap:var(--cx-nl-gap)}` +
  `.${CSS}__consent{display:flex;gap:.5rem;align-items:flex-start;margin:0;font-size:var(--cx-nl-small,.9em)}` +
  `.${CSS}__consent input{margin-top:.25em}` +
  `.${CSS}__heading{margin:0}.${CSS}__text{margin:0}` +
  `.${CSS}__hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}` +
  `.${CSS}__sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}` +
  `.${CSS}__msg{margin:0;padding:.75rem 1rem;border-left:4px solid var(--cx-nl-accent,currentColor)}` +
  `.${CSS}__msg:not(:target):not(.is-shown){display:none}` +
  `.${CSS}__msg--bad{border-left-color:var(--cx-nl-error,#b42318)}` +
  `.${CSS}[data-sent] form{display:none}`;

export function SignupForm({ view }: { view: FormView }) {
  const { uid, s } = view;
  if (!view.ready)
    return view.preview ? (
      <div className={CSS}>
        <p className={`${CSS}__msg is-shown`}>{s.notConnected}</p>
      </div>
    ) : null;
  const [before, after = ''] = s.consent.split('{privacy}');
  const name = view.fields !== 'email';
  const surname = view.fields === 'name-surname' || view.fields === 'all';
  const button = (
    <p className={`${CSS}__submit`}>
      <button type="submit">{view.buttonLabel}</button>
    </p>
  );
  const bad: Outcome[] = ['error', 'invalid', 'check', 'busy'];
  // A challenge goes before the button: with one, the button leaves the row.
  const inlineButton = view.layout === 'inline' && !view.challenge;
  return (
    <div
      className={`${CSS} ${CSS}--${view.layout}`}
      id={uid}
      {...{ [MARKER]: JSON.stringify({ messages: view.messages, sending: s.sending }) }}
    >
      <style>{FORM_CSS}</style>
      {view.heading ? <h2 className={`${CSS}__heading`}>{view.heading}</h2> : null}
      {view.text ? <p className={`${CSS}__text`}>{view.text}</p> : null}
      {OUTCOMES.map((outcome) => (
        <p
          key={outcome}
          id={`${uid}-${outcome}`}
          className={`${CSS}__msg${bad.includes(outcome) ? ` ${CSS}__msg--bad` : ''}`}
          role={bad.includes(outcome) ? 'alert' : 'status'}
          tabIndex={-1}
        >
          {view.messages[outcome]}
        </p>
      ))}
      <p className={`${CSS}__live ${CSS}__sr`} role="status" aria-live="polite" />
      <form method="post" action={SUBMIT_PATH}>
        <input type="hidden" name="_uid" value={uid} />
        <input type="hidden" name="_spec" value={view.spec} />
        <input type="hidden" name="_locale" value={view.locale} />
        {/* Left empty by people; bots fill it in. */}
        <p className={`${CSS}__hp`} aria-hidden="true">
          <label>
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </p>
        <div className={`${CSS}__row`}>
          {name ? (
            <Field
              id={`${uid}-first`}
              name="first_name"
              label={s.firstName}
              required={false}
              autoComplete="given-name"
              s={s}
            />
          ) : null}
          {surname ? (
            <Field
              id={`${uid}-last`}
              name="last_name"
              label={s.lastName}
              required={false}
              autoComplete="family-name"
              s={s}
            />
          ) : null}
          {view.custom.map((f) => (
            <Field
              key={f.key}
              id={`${uid}-f-${f.key.replace(/[^\w-]/g, '')}`}
              name={`f_${f.key}`}
              label={f.label}
              required={f.required}
              s={s}
            />
          ))}
          <Field
            id={`${uid}-email`}
            name="email"
            label={s.email}
            type="email"
            required
            autoComplete="email"
            s={s}
          />
          {inlineButton ? button : null}
        </div>
        <p className={`${CSS}__consent`}>
          <input id={`${uid}-consent`} type="checkbox" name="consent" value="1" required />
          <label htmlFor={`${uid}-consent`}>
            {view.privacyUrl ? (
              <>
                {before}
                <a href={view.privacyUrl} target="_blank" rel="noopener">
                  {s.privacy}
                </a>
                {after}
              </>
            ) : (
              s.consentPlain
            )}
          </label>
        </p>
        {view.challenge ? (
          <div
            className={`${CSS}__challenge`}
            dangerouslySetInnerHTML={{ __html: view.challenge }}
          />
        ) : null}
        {inlineButton ? null : button}
      </form>
    </div>
  );
}
