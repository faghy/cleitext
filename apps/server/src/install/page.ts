import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * What the setup wizard and the web installer share (RF-SIT-02): the page
 * frame, the language (English or Italian) and escaping. The pages work
 * without JavaScript and with a strict Content Security Policy.
 */

export type Lang = 'en' | 'it';

const LANG_COOKIE = 'cleitext_setup_lang';

/** `?lang=`, then the cookie set by it, then the browser's languages. */
export function langOf(request: FastifyRequest): Lang {
  const query = (request.query as Record<string, string | undefined> | undefined)?.lang;
  if (query === 'it' || query === 'en') return query;
  const cookie = cookieValue(request, LANG_COOKIE);
  if (cookie === 'it' || cookie === 'en') return cookie;
  return /^\s*it\b/i.test(request.headers['accept-language'] ?? '') ? 'it' : 'en';
}

/** Remembers a language chosen with `?lang=`. */
export function rememberLang(request: FastifyRequest, reply: FastifyReply): void {
  const query = (request.query as Record<string, string | undefined> | undefined)?.lang;
  if (query === 'it' || query === 'en') {
    reply.header('set-cookie', `${LANG_COOKIE}=${query}; Path=/; SameSite=Lax; Max-Age=86400`);
  }
}

export function cookieValue(request: FastifyRequest, name: string): string | undefined {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

const IT: Record<string, string> = {
  'Install Cleitext': 'Installa Cleitext',
  'Setup token': 'Codice di setup',
  Continue: 'Continua',
  Start: 'Inizia',
  'Have the database details at hand: name, user and password, created in your panel (Plesk: Databases → Add Database, PostgreSQL).':
    'Tieni a portata di mano i dati del database: nome, utente e password, creati dal pannello (Plesk: Database → Aggiungi database, PostgreSQL).',
  Back: 'Indietro',
  Install: 'Installa',
  'Step {n} of {total}': 'Passo {n} di {total}',
  Welcome: 'Benvenuto',
  Requirements: 'Requisiti',
  Database: 'Database',
  'Site and administrator': 'Sito e amministratore',
  'Welcome to Cleitext. This guide checks the server, connects the database, writes the configuration and creates your site, in four steps.':
    'Benvenuto in Cleitext. Questa guida controlla il server, collega il database, scrive la configurazione e crea il tuo sito, in quattro passi.',
  'To prove that the server is yours, enter the setup token. It is printed in the server log (Plesk: the domain’s Logs) and in the file {file}; with SSH: {command}.':
    'Per dimostrare che il server è tuo, inserisci il codice di setup. È scritto nel log del server (Plesk: Log del dominio) e nel file {file}; da SSH: {command}.',
  'The setup token is not correct.': 'Il codice di setup non è corretto.',
  'The session of the setup has expired: enter the setup token again.':
    'La sessione di installazione è scaduta: inserisci di nuovo il codice di setup.',
  Check: 'Controllo',
  Result: 'Esito',
  'Node.js {version}': 'Node.js {version}',
  'Cleitext needs Node.js 22.12 or later.': 'Cleitext richiede Node.js 22.12 o successivo.',
  'The application folder is writable': 'La cartella dell’applicazione è scrivibile',
  'The configuration is written in {path}: give the domain’s user write access to it.':
    'La configurazione viene scritta in {path}: dai all’utente del dominio il permesso di scrittura.',
  'The data folder can be created': 'La cartella dei dati si può creare',
  'Uploads, plugins, themes and backups go in {path}.':
    'Caricamenti, plugin, temi e backup vanno in {path}.',
  'pg_dump (for backups)': 'pg_dump (per i backup)',
  'Not found: install the PostgreSQL client tools of the same version as the server, or backups will not work.':
    'Non trovato: installa gli strumenti client di PostgreSQL della stessa versione del server, altrimenti i backup non funzioneranno.',
  HTTPS: 'HTTPS',
  'The site is not on HTTPS yet: enable a certificate (Plesk: SSL/TLS, Let’s Encrypt) before using it.':
    'Il sito non è ancora in HTTPS: attiva un certificato (Plesk: SSL/TLS, Let’s Encrypt) prima di usarlo.',
  'Fix the problems marked with ✗, then reload this page.':
    'Correggi i problemi segnati con ✗, poi ricarica questa pagina.',
  'Warnings (⚠) do not block the installation.': 'Gli avvisi (⚠) non bloccano l’installazione.',
  'Create the database in your panel (Plesk: Databases → Add Database, PostgreSQL) with one user, and enter its details. That user becomes the owner: Cleitext uses it only for installations and updates, and creates by itself a second user, with fewer rights, for the running site.':
    'Crea il database dal pannello (Plesk: Database → Aggiungi database, PostgreSQL) con un utente e inserisci qui i suoi dati. Quell’utente diventa il proprietario: Cleitext lo usa solo per installazioni e aggiornamenti, e crea da solo un secondo utente, con meno permessi, per il sito in funzione.',
  Host: 'Host',
  Port: 'Porta',
  'Database name': 'Nome del database',
  'Owner user': 'Utente proprietario',
  'Owner password': 'Password del proprietario',
  'The database': 'Il database',
  'Create it now, with the PostgreSQL administrator':
    'Crealo ora, con l’amministratore di PostgreSQL',
  'It already exists (created in the panel)': 'Esiste già (creato dal pannello)',
  'Cleitext uses an owner user only for installations and updates, and creates by itself a second user, with fewer rights, for the running site.':
    'Cleitext usa un utente proprietario solo per installazioni e aggiornamenti, e crea da solo un secondo utente, con meno permessi, per il sito in funzione.',
  'PostgreSQL administrator': 'Amministratore di PostgreSQL',
  'Used only now, to create the database and its owner; it is not saved anywhere. Plesk: Tools & Settings → Database Servers → PostgreSQL.':
    'Serve solo ora, per creare il database e il suo proprietario; non viene salvato da nessuna parte. Plesk: Strumenti e impostazioni → Server di database → PostgreSQL.',
  'Administrator user': 'Utente amministratore',
  'Administrator password': 'Password dell’amministratore',
  'Owner of the database': 'Proprietario del database',
  'The user created with the database in the panel (Plesk: Databases → Add Database, PostgreSQL).':
    'L’utente creato insieme al database dal pannello (Plesk: Database → Aggiungi database, PostgreSQL).',
  'Use letters, digits and underscores for the database name, starting with a letter.':
    'Per il nome del database usa lettere, cifre e trattini bassi, iniziando con una lettera.',
  'Could not connect as the PostgreSQL administrator: {error}':
    'Connessione come amministratore di PostgreSQL non riuscita: {error}',
  'This PostgreSQL user cannot create databases and users: enter the administrator (superuser) of the server.':
    'Questo utente di PostgreSQL non può creare database e utenti: inserisci l’amministratore (superuser) del server.',
  'A database user named {user} already exists: choose another owner user, or choose “It already exists” and enter its password.':
    'Esiste già un utente del database {user}: scegli un altro utente proprietario, oppure scegli «Esiste già» e inserisci la sua password.',
  'The database {database} already exists and belongs to {owner}: choose another name, or choose “It already exists”.':
    'Il database {database} esiste già e appartiene a {owner}: scegli un altro nome, oppure scegli «Esiste già».',
  'Could not create the database: {error}': 'Creazione del database non riuscita: {error}',
  'Application user': 'Utente dell’applicazione',
  'Created by the installer. Leave it empty for {example}.':
    'Lo crea l’installer. Lascia vuoto per {example}.',
  'Data folder': 'Cartella dei dati',
  'Outside the web root, kept across updates.':
    'Fuori dalla cartella pubblica, resta tra un aggiornamento e l’altro.',
  'Behind a proxy (Plesk, nginx, Apache)': 'Dietro un proxy (Plesk, nginx, Apache)',
  'Save the configuration': 'Salva la configurazione',
  'Enter the {field}.': 'Inserisci {field}.',
  'Use letters, digits and underscores for the user names, starting with a letter.':
    'Per i nomi utente usa lettere, cifre e trattini bassi, iniziando con una lettera.',
  'The application user must be different from the owner.':
    'L’utente dell’applicazione deve essere diverso dal proprietario.',
  'Could not connect to the database: {error}': 'Connessione al database non riuscita: {error}',
  'PostgreSQL {version} is too old: Cleitext needs version 16 or later.':
    'PostgreSQL {version} è troppo vecchio: Cleitext richiede la versione 16 o successiva.',
  'The user {user} cannot create other users (CREATEROLE). Cleitext needs it: each plugin gets its own database user, which can only reach the plugin’s tables. Run this command as root on the database server, then try again:':
    'L’utente {user} non può creare altri utenti (CREATEROLE). A Cleitext serve: ogni plugin ha il suo utente del database, che vede solo le tabelle del plugin. Esegui questo comando come root sul server del database, poi riprova:',
  'The user {user} does not own the database {database}. Run this command as root on the database server, then try again:':
    'L’utente {user} non è il proprietario del database {database}. Esegui questo comando come root sul server del database, poi riprova:',
  'A database user named {user} already exists and cannot be changed by the owner: choose another application user.':
    'Esiste già un utente del database {user} che il proprietario non può modificare: scegli un altro utente dell’applicazione.',
  'The application user {user} was created, but cannot connect: {error}':
    'L’utente dell’applicazione {user} è stato creato, ma non riesce a collegarsi: {error}',
  'Could not write the configuration: {error}': 'Impossibile scrivere la configurazione: {error}',
  'Configuration saved': 'Configurazione salvata',
  'The database is ready and the configuration is in {path} (readable only by the domain’s user). Continue to create the site.':
    'Il database è pronto e la configurazione è in {path} (leggibile solo dall’utente del dominio). Continua per creare il sito.',
  'Create the site': 'Crea il sito',
  'Create the first site and its administrator.': 'Crea il primo sito e il suo amministratore.',
  Site: 'Sito',
  'Site name': 'Nome del sito',
  'My site': 'Il mio sito',
  Domain: 'Dominio',
  Language: 'Lingua',
  'Always use HTTPS': 'Usa sempre HTTPS',
  Administrator: 'Amministratore',
  Email: 'Email',
  'Password (at least 12 characters)': 'Password (almeno 12 caratteri)',
  'Repeat the password': 'Ripeti la password',
  'Enter the site name.': 'Inserisci il nome del sito.',
  'Enter the domain.': 'Inserisci il dominio.',
  'Enter a language code such as en or it.': 'Inserisci un codice di lingua come en o it.',
  'Enter the administrator email.': 'Inserisci l’email dell’amministratore.',
  'The password needs at least 12 characters.': 'La password deve avere almeno 12 caratteri.',
  'The passwords do not match.': 'Le password non coincidono.',
  'An installation is already running.': 'C’è già un’installazione in corso.',
  'Cleitext is installed': 'Cleitext è installato',
  'Sign in as {email} once the server has restarted.':
    'Accedi come {email} appena il server si è riavviato.',
  'The official plugins SEO and Forms are installed: turn them on in Plugins when you need them. Hi John is already active: look at the dashboard.':
    'I plugin ufficiali SEO e Moduli sono installati: attivali in Plugin quando ti servono. Hi John è già attivo: guarda la bacheca.',
  'Go to the admin': 'Vai all’amministrazione',
};

export function translate(lang: Lang, text: string, vars: Record<string, string> = {}): string {
  const template = lang === 'it' ? (IT[text] ?? text) : text;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

export const INSTALL_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

export function sendPage(
  reply: FastifyReply,
  status: number,
  lang: Lang,
  body: string,
  steps?: { current: number; labels: string[] },
): FastifyReply {
  return reply
    .code(status)
    .header('content-security-policy', INSTALL_CSP)
    .header('cache-control', 'no-store')
    .header('x-content-type-options', 'nosniff')
    .header('x-frame-options', 'DENY')
    .header('referrer-policy', 'no-referrer')
    .type('text/html; charset=utf-8')
    .send(layout(lang, body, steps));
}

function layout(lang: Lang, body: string, steps?: { current: number; labels: string[] }): string {
  const t = (text: string, vars?: Record<string, string>) => translate(lang, text, vars);
  const progress = steps
    ? `<ol class="steps" aria-label="${escape(
        t('Step {n} of {total}', { n: String(steps.current), total: String(steps.labels.length) }),
      )}">${steps.labels
        .map(
          (label, i) =>
            `<li${i + 1 === steps.current ? ' aria-current="step"' : ''}${i + 1 < steps.current ? ' class="done"' : ''}>${escape(t(label))}</li>`,
        )
        .join('')}</ol>`
    : '';
  const other = lang === 'it' ? 'en' : 'it';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escape(t('Install Cleitext'))}</title>
<style>
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 0; background: Canvas; color: CanvasText; }
main { max-width: 34rem; margin: 3rem auto; padding: 0 1rem; }
h1 { font-size: 1.5rem; }
fieldset { border: 1px solid #8884; border-radius: .5rem; margin: 1rem 0; padding: .5rem 1rem 1rem; }
label { display: block; margin-top: .75rem; font-size: .9rem; }
label.check { display: flex; gap: .5rem; align-items: center; }
input:not([type=checkbox]):not([type=radio]) { box-sizing: border-box; width: 100%; padding: .5rem; margin-top: .25rem; font: inherit; }
.hint { font-size: .8rem; opacity: .75; margin: .25rem 0 0; }
.row { display: flex; gap: .75rem; } .row > * { flex: 1; } .row > .small { flex: 0 0 6rem; }
button, .button { display: inline-block; padding: .6rem 1.2rem; border: 0; border-radius: .4rem; background: #0369a1; color: #fff; font: inherit; text-decoration: none; cursor: pointer; margin-top: 1rem; }
.button.secondary { background: transparent; color: inherit; border: 1px solid #8886; }
.logo { display: flex; align-items: center; gap: .5rem; font-size: 1.25rem; font-weight: 700; margin: 0 0 1rem; }
.top { display: flex; justify-content: space-between; align-items: center; }
.top a { font-size: .85rem; color: inherit; }
.errors { border: 1px solid #dc2626; border-radius: .5rem; padding: .25rem 1rem; color: #dc2626; }
.errors pre, pre { white-space: pre-wrap; word-break: break-all; background: #8882; color: CanvasText; padding: .6rem .8rem; border-radius: .4rem; font-size: .85rem; }
.steps { display: flex; gap: .4rem; list-style: none; padding: 0; margin: 0 0 1.5rem; font-size: .75rem; counter-reset: s; }
.steps li { flex: 1; border-top: 3px solid #8884; padding-top: .35rem; opacity: .7; counter-increment: s; }
.steps li::before { content: counter(s) ". "; }
.steps li.done { border-color: #0369a1; }
.steps li[aria-current] { border-color: #0369a1; opacity: 1; font-weight: 600; }
table { width: 100%; border-collapse: collapse; font-size: .9rem; }
td, th { text-align: left; padding: .45rem .3rem; border-bottom: 1px solid #8883; vertical-align: top; }
td.mark { width: 1.5rem; font-weight: 700; }
.ok { color: #16a34a; } .warn { color: #d97706; } .fail { color: #dc2626; }
code { font-size: .9em; }
form.database:has(#mode-create:checked) .only-existing, form.database:has(#mode-existing:checked) .only-create { display: none; }
</style>
</head>
<body><main><div class="top">${LOGO}<a href="?lang=${other}" lang="${other}">${other === 'it' ? 'Italiano' : 'English'}</a></div>${progress}${body}</main></body>
</html>`;
}

/** The Cleitext logo (apps/admin/public/brand/logo-mark.svg) above the pages. */
const LOGO = `<p class="logo"><svg width="40" height="40" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#0369a1"/><path d="M38.5 22.5 A13.5 13.5 0 1 0 38.5 41.5" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/><rect x="43" y="19" width="5" height="26" rx="2.5" fill="#7dd3fc"/></svg> Cleitext</p>`;

export function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function errorList(errors: string[]): string {
  return errors.length > 0
    ? `<div class="errors" role="alert"><ul>${errors.map((e) => `<li>${e}</li>`).join('')}</ul></div>`
    : '';
}

export const STEPS = ['Welcome', 'Requirements', 'Database', 'Site and administrator'];
