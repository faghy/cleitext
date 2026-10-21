/**
 * Visitors' account pages (RF-USR-11): sign in, sign up, lost password,
 * two-factor code and profile. Cleitext shows them as an entry whose content
 * is one `cleitext/account` block, so every theme lays them out like a page.
 * The forms post to `/account/<action>` and work without JavaScript.
 */
import { registerBlockRenderer } from '@cleitext/renderer';

export type AccountView =
  'login' | 'twofactor' | 'register' | 'lost' | 'reset' | 'profile' | 'sent' | 'verified';

export interface AccountAttrs {
  view: AccountView;
  locale: string;
  /** Base of the actions, e.g. `/account` or `/it/account`. */
  base: string;
  notice?: { kind: 'ok' | 'error'; text: string };
  email?: string;
  name?: string;
  redirect?: string;
  token?: string;
  challenge?: string;
  registration?: boolean;
  termsUrl?: string | null;
  /**
   * Bot protection of the form shown, from a plugin (`form.challenge`, plugin
   * API 1.38): markup placed before its submit button.
   */
  protection?: string;
  /** Pages of plugins for the signed-in visitor, e.g. a shop's orders (the `account.links` filter). */
  links?: { label: string; url: string }[];
  profile?: {
    displayName: string;
    email: string;
    bio: string;
    website: string;
    authorUrl: string | null;
    canDelete: boolean;
  };
}

const EN = {
  email: 'Email',
  password: 'Password',
  remember: 'Remember me',
  signIn: 'Sign in',
  noAccount: 'No account yet?',
  signUp: 'Create an account',
  lost: 'Lost your password?',
  name: 'Name',
  newPassword: 'Password (at least 8 characters)',
  terms: 'I accept the <a href="{url}">terms</a>',
  haveAccount: 'Already have an account?',
  sendLink: 'Send the link',
  lostIntro: 'Write your email address: we send you a link to choose a new password.',
  choose: 'Choose a new password',
  save: 'Save',
  code: 'Code from your authenticator app (or a recovery code)',
  check: 'Check',
  sent: 'Check your email: we sent you a link. It may take a minute; look in the spam folder too.',
  verified: 'Your email address is confirmed: welcome!',
  profile: 'Your profile',
  bio: 'About you',
  website: 'Website',
  authorPage: 'Your author page',
  changePassword: 'Change password',
  current: 'Current password',
  signOut: 'Sign out',
  deleteTitle: 'Delete your account',
  deleteText:
    'Your account is removed from this site. Your comments stay, with your name. This cannot be undone.',
  deleteButton: 'Delete my account',
  admin: 'Site administration',
  yourAccount: 'Your account',
};
const IT: typeof EN = {
  email: 'Email',
  password: 'Password',
  remember: 'Ricordami',
  signIn: 'Accedi',
  noAccount: 'Non hai un account?',
  signUp: 'Crea un account',
  lost: 'Password dimenticata?',
  name: 'Nome',
  newPassword: 'Password (almeno 8 caratteri)',
  terms: 'Accetto le <a href="{url}">condizioni</a>',
  haveAccount: 'Hai già un account?',
  sendLink: 'Invia il link',
  lostIntro: 'Scrivi il tuo indirizzo email: ti mandiamo un link per scegliere una nuova password.',
  choose: 'Scegli una nuova password',
  save: 'Salva',
  code: 'Codice dell’app di autenticazione (o un codice di recupero)',
  check: 'Verifica',
  sent: 'Controlla la tua email: ti abbiamo mandato un link. Può volerci un minuto; guarda anche nello spam.',
  verified: 'Il tuo indirizzo email è confermato: benvenuto!',
  profile: 'Il tuo profilo',
  bio: 'Qualcosa su di te',
  website: 'Sito web',
  authorPage: 'La tua pagina autore',
  changePassword: 'Cambia la password',
  current: 'Password attuale',
  signOut: 'Esci',
  deleteTitle: 'Elimina il tuo account',
  deleteText:
    'Il tuo account viene rimosso da questo sito. I tuoi commenti restano, con il tuo nome. Non si può annullare.',
  deleteButton: 'Elimina il mio account',
  admin: 'Amministrazione del sito',
  yourAccount: 'Il tuo account',
};

export function accountStrings(locale: string) {
  return locale.startsWith('it') ? IT : EN;
}

function Field({
  id,
  label,
  ...input
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <p className="cx-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} {...input} />
    </p>
  );
}

/** A protection plugin's widget (`form.challenge`), before the submit button. */
export function Challenge({ html }: { html: string | undefined }) {
  return html ? <div className="cx-challenge" dangerouslySetInnerHTML={{ __html: html }} /> : null;
}

function Hidden({ name, value }: { name: string; value: string | undefined }) {
  return value ? <input type="hidden" name={name} value={value} /> : null;
}

/** Bots fill in fields people never see. */
function Trap() {
  return (
    <div className="cx-hp" aria-hidden="true">
      <label>
        Website
        <input type="text" name="homepage" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

export function AccountForms({ attrs }: { attrs: AccountAttrs }) {
  const t = accountStrings(attrs.locale);
  const a = (action: string) => `${attrs.base}/${action}`;
  const notice = attrs.notice && (
    <p
      className={`cx-notice${attrs.notice.kind === 'error' ? ' cx-notice--error' : ''}`}
      role={attrs.notice.kind === 'error' ? 'alert' : 'status'}
    >
      {attrs.notice.text}
    </p>
  );
  switch (attrs.view) {
    case 'login':
      return (
        <div className="cx-account cx-account--login">
          {notice}
          <form className="cx-form" method="post" action={a('login')}>
            <Hidden name="redirect" value={attrs.redirect} />
            <Field
              id="cx-email"
              label={t.email}
              name="email"
              type="email"
              autoComplete="username"
              required
              defaultValue={attrs.email}
            />
            <Field
              id="cx-password"
              label={t.password}
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
            <p className="cx-check">
              <label>
                <input type="checkbox" name="remember" value="1" /> {t.remember}
              </label>
            </p>
            <Challenge html={attrs.protection} />
            <p>
              <button type="submit" className="cx-button">
                {t.signIn}
              </button>
            </p>
          </form>
          <p className="cx-account__links">
            <a href={`${attrs.base}/lost-password`}>{t.lost}</a>
            {attrs.registration && (
              <>
                {' · '}
                {t.noAccount} <a href={`${attrs.base}/register`}>{t.signUp}</a>
              </>
            )}
          </p>
        </div>
      );
    case 'twofactor':
      return (
        <div className="cx-account">
          {notice}
          <form className="cx-form" method="post" action={a('twofactor')}>
            <Hidden name="challenge" value={attrs.challenge} />
            <Hidden name="redirect" value={attrs.redirect} />
            <Field
              id="cx-code"
              label={t.code}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
            <p>
              <button type="submit" className="cx-button">
                {t.check}
              </button>
            </p>
          </form>
        </div>
      );
    case 'register':
      return (
        <div className="cx-account cx-account--register">
          {notice}
          <form className="cx-form" method="post" action={a('register')}>
            <Trap />
            <input type="hidden" name="ts" value="" data-cx-ts="" />
            <Field
              id="cx-name"
              label={t.name}
              name="name"
              type="text"
              autoComplete="name"
              required
              maxLength={80}
              defaultValue={attrs.name}
            />
            <Field
              id="cx-email"
              label={t.email}
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={200}
              defaultValue={attrs.email}
            />
            <Field
              id="cx-password"
              label={t.newPassword}
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
            {attrs.termsUrl && (
              <p className="cx-check">
                <label>
                  <input type="checkbox" name="terms" value="1" required />{' '}
                  <span
                    dangerouslySetInnerHTML={{
                      __html: t.terms.replace('{url}', encodeURI(attrs.termsUrl)),
                    }}
                  />
                </label>
              </p>
            )}
            <Challenge html={attrs.protection} />
            <p>
              <button type="submit" className="cx-button">
                {t.signUp}
              </button>
            </p>
          </form>
          <p className="cx-account__links">
            {t.haveAccount} <a href={`${attrs.base}/login`}>{t.signIn}</a>
          </p>
        </div>
      );
    case 'lost':
      return (
        <div className="cx-account">
          {notice}
          <p>{t.lostIntro}</p>
          <form className="cx-form" method="post" action={a('lost-password')}>
            <Field
              id="cx-email"
              label={t.email}
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={attrs.email}
            />
            <Challenge html={attrs.protection} />
            <p>
              <button type="submit" className="cx-button">
                {t.sendLink}
              </button>
            </p>
          </form>
        </div>
      );
    case 'reset':
      return (
        <div className="cx-account">
          {notice}
          <form className="cx-form" method="post" action={a('reset-password')}>
            <Hidden name="token" value={attrs.token} />
            <Field
              id="cx-password"
              label={t.choose}
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
            <Challenge html={attrs.protection} />
            <p>
              <button type="submit" className="cx-button">
                {t.save}
              </button>
            </p>
          </form>
        </div>
      );
    case 'sent':
    case 'verified':
      return (
        <div className="cx-account">
          <p className="cx-notice" role="status">
            {attrs.view === 'sent' ? t.sent : t.verified}
          </p>
        </div>
      );
    case 'profile': {
      const p = attrs.profile;
      if (!p) return null;
      return (
        <div className="cx-account cx-account--profile">
          {notice}
          {attrs.links && attrs.links.length > 0 && (
            <nav className="cx-account-links" aria-label={t.yourAccount}>
              <ul>
                {attrs.links.map((link) => (
                  <li key={link.url}>
                    <a href={link.url}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <form className="cx-form" method="post" action={a('profile')}>
            <Field
              id="cx-name"
              label={t.name}
              name="name"
              type="text"
              required
              maxLength={80}
              defaultValue={p.displayName}
            />
            <Field id="cx-email" label={t.email} type="email" value={p.email} readOnly disabled />
            <p className="cx-field">
              <label htmlFor="cx-bio">{t.bio}</label>
              <textarea id="cx-bio" name="bio" rows={4} maxLength={2000} defaultValue={p.bio} />
            </p>
            <Field
              id="cx-website"
              label={t.website}
              name="website"
              type="url"
              maxLength={300}
              defaultValue={p.website}
            />
            <p>
              <button type="submit" className="cx-button">
                {t.save}
              </button>
            </p>
          </form>
          {p.authorUrl && (
            <p>
              <a href={p.authorUrl}>{t.authorPage}</a>
            </p>
          )}
          <h2>{t.changePassword}</h2>
          <form className="cx-form" method="post" action={a('password')}>
            <Field
              id="cx-current"
              label={t.current}
              name="current"
              type="password"
              autoComplete="current-password"
              required
            />
            <Field
              id="cx-new"
              label={t.newPassword}
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
            <p>
              <button type="submit" className="cx-button">
                {t.save}
              </button>
            </p>
          </form>
          <form method="post" action={a('logout')}>
            <button type="submit" className="cx-button cx-button--quiet">
              {t.signOut}
            </button>
          </form>
          {p.canDelete && (
            <details className="cx-danger">
              <summary>{t.deleteTitle}</summary>
              <p>{t.deleteText}</p>
              <form className="cx-form" method="post" action={a('delete')}>
                <Field
                  id="cx-delete-password"
                  label={t.password}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
                <p>
                  <button type="submit" className="cx-button cx-button--danger">
                    {t.deleteButton}
                  </button>
                </p>
              </form>
            </details>
          )}
        </div>
      );
    }
  }
}

registerBlockRenderer('cleitext/account', ({ block }) => (
  <AccountForms attrs={block.attrs as unknown as AccountAttrs} />
));
