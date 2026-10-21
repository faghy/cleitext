import { ADMIN_PATH } from '@cleitext/shared';
import { createHmac } from 'node:crypto';
import { createDatabase, isInstalled } from '@cleitext/db';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/config.js';
import { fastifyTrustProxy } from '../config/trust-proxy.js';
import { runCli } from '../plugins/package-upload.js';
import {
  errorList,
  escape,
  langOf,
  rememberLang,
  sendPage,
  STEPS,
  translate,
  type Lang,
} from './page.js';
import { appRoot, hasSession, readToken, removeToken, sameSecret, tokenRequired } from './token.js';

/**
 * Guided web installation on first start (RF-SIT-02). While the database has
 * no site, the server answers only /install, protected by a setup token
 * printed in the logs. The installation itself runs `cleitext install` in a
 * short-lived child, so the owner connection never stays in the web process.
 */

export type InstallRunner = (args: string[], env: Record<string, string>) => Promise<string>;

export interface InstallerOptions {
  config: AppConfig;
  /** Defaults to the CLI shipped with the server. */
  run?: InstallRunner;
  /** Called once the installation succeeded and the answer was sent. */
  onInstalled: () => void;
  /** The application root, where `tmp/setup-token` is. */
  root?: string;
  /** Ask for the setup token; default: `tokenRequired()` (CLEITEXT_SETUP_TOKEN). */
  requireToken?: boolean;
}

const LOCALE_RE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

export async function needsInstall(config: AppConfig): Promise<boolean> {
  const client = createDatabase(config.database.url, { max: 1 });
  try {
    return !(await isInstalled(client.db));
  } finally {
    await client.close();
  }
}

/**
 * The setup token: the one of the setup wizard (`tmp/setup-token`) when it
 * ran, so it is entered once; otherwise derived from APP_SECRET, so every
 * process of the server shows and accepts the same one, and nobody can guess
 * it without the secret.
 */
export function setupToken(config: AppConfig, root = appRoot()): string {
  return (
    readToken(root) ??
    createHmac('sha256', config.appSecret)
      .update(`cleitext-install:${config.database.url}`)
      .digest('base64url')
      .slice(0, 32)
  );
}

export async function createInstaller(options: InstallerOptions): Promise<FastifyInstance> {
  const { config } = options;
  const root = options.root ?? appRoot();
  const token = setupToken(config, root);
  const requireToken = options.requireToken ?? tokenRequired();
  const run: InstallRunner = options.run ?? ((args, env) => runCli(args, config, env));
  let installing = false;
  let installed = false;

  const app = Fastify({
    trustProxy: fastifyTrustProxy(config.trustProxy),
    bodyLimit: 16 * 1024,
    logger: { level: config.logLevel },
  });
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => done(null, Object.fromEntries(new URLSearchParams(body as string))),
  );

  const page = (request: FastifyRequest, reply: FastifyReply, status: number, body: string) =>
    sendPage(reply, status, langOf(request), body, { current: 4, labels: STEPS });
  /** The token was already entered in the setup wizard. */
  const known = (request: FastifyRequest) => !requireToken || hasSession(request, token);

  const defaults = (request: FastifyRequest): FormValues => ({
    token: '',
    siteName: translate(langOf(request), 'My site'),
    domain: request.hostname.replace(/:\d+$/, ''),
    locale: langOf(request),
    adminEmail: '',
    https: request.protocol === 'https',
  });

  app.get('/health/live', () => ({ status: 'ok' }));
  app.get('/install', (request, reply) => {
    if (installed) return reply.redirect(`${ADMIN_PATH}/`);
    rememberLang(request, reply);
    return page(request, reply, 200, form(langOf(request), defaults(request), [], known(request)));
  });

  app.post('/install', async (request, reply) => {
    if (installed) return reply.redirect(`${ADMIN_PATH}/`, 303);
    const body = (request.body ?? {}) as Record<string, string | undefined>;
    const values: FormValues = {
      token: (body.token ?? '').trim(),
      siteName: (body.siteName ?? '').trim(),
      domain: (body.domain ?? '').trim().toLowerCase(),
      locale: (body.locale ?? '').trim(),
      adminEmail: (body.adminEmail ?? '').trim(),
      https: body.https === 'on',
    };
    const password = body.adminPassword ?? '';
    // The token is never echoed back.
    const again = { ...values, token: '' };

    const lang = langOf(request);
    const session = known(request);
    if (!session && !sameSecret(values.token, token)) {
      request.log.warn('Web installer: wrong setup token.');
      return page(
        request,
        reply,
        403,
        form(lang, again, ['The setup token is not correct.'], session),
      );
    }
    const errors: string[] = [];
    if (!values.siteName) errors.push('Enter the site name.');
    if (!values.domain) errors.push('Enter the domain.');
    if (!LOCALE_RE.test(values.locale)) errors.push('Enter a language code such as en or it.');
    if (!values.adminEmail) errors.push('Enter the administrator email.');
    if (password.length < 12) errors.push('The password needs at least 12 characters.');
    if (password !== (body.adminPasswordConfirm ?? '')) errors.push('The passwords do not match.');
    if (!config.database.adminUrl) {
      errors.push(
        'Set DATABASE_ADMIN_URL (the database owner) in the server configuration, or install with `cleitext install`.',
      );
    }
    if (errors.length > 0) return page(request, reply, 400, form(lang, again, errors, session));
    if (installing)
      return page(
        request,
        reply,
        409,
        form(lang, again, ['An installation is already running.'], session),
      );

    installing = true;
    try {
      await run(
        [
          'install',
          '--site-slug',
          'main',
          '--site-name',
          values.siteName,
          '--domain',
          values.domain,
          '--locale',
          values.locale,
          '--admin-email',
          values.adminEmail,
          '--official-plugins',
          ...(values.https ? [] : ['--no-https']),
        ],
        { CLEITEXT_ADMIN_PASSWORD: password },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return page(request, reply, 400, form(lang, again, [message], session));
    } finally {
      installing = false;
    }

    installed = true;
    removeToken(root);
    request.log.info(`Web installer: installed ${values.domain}.`);
    reply.raw.once('finish', () => options.onInstalled());
    const t = (text: string, vars?: Record<string, string>) => escape(translate(lang, text, vars));
    return page(
      request,
      reply,
      200,
      `<h1>${t('Cleitext is installed')}</h1>
<p>${translate(lang, 'Sign in as {email} once the server has restarted.', { email: `<strong>${escape(values.adminEmail)}</strong>` })}</p>
<p>${t('The official plugins SEO and Forms are installed: turn them on in Plugins when you need them. Hi John is already active: look at the dashboard.')}</p>
<p><a class="button" href="${ADMIN_PATH}/">${t('Go to the admin')}</a></p>`,
    );
  });

  // Everything else leads to the installer.
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' || request.method === 'HEAD') return reply.redirect('/install');
    return reply.code(503).send({ message: 'Cleitext is not installed yet.' });
  });

  await app.ready();
  return app;
}

interface FormValues {
  token: string;
  siteName: string;
  domain: string;
  locale: string;
  adminEmail: string;
  https: boolean;
}

function form(lang: Lang, values: FormValues, errors: string[], session: boolean): string {
  const t = (text: string) => escape(translate(lang, text));
  const field = (name: keyof FormValues, label: string, type = 'text', extra = '') =>
    `<label for="${name}">${t(label)}</label>
<input id="${name}" name="${name}" type="${type}" value="${escape(String(values[name]))}" required ${extra}>`;
  return `<h1>${t('Site and administrator')}</h1>
<p>${t('Create the first site and its administrator.')}</p>
${errorList(errors.map((e) => t(e)))}
<form method="post" action="/install">
${session ? '' : field('token', 'Setup token', 'password', 'autocomplete="off"')}
<fieldset><legend>${t('Site')}</legend>
${field('siteName', 'Site name')}
${field('domain', 'Domain', 'text', 'placeholder="example.com"')}
${field('locale', 'Language', 'text', 'maxlength="6"')}
<label class="check"><input name="https" type="checkbox" ${values.https ? 'checked' : ''}> ${t('Always use HTTPS')}</label>
</fieldset>
<fieldset><legend>${t('Administrator')}</legend>
${field('adminEmail', 'Email', 'email', 'autocomplete="username"')}
<label for="adminPassword">${t('Password (at least 12 characters)')}</label>
<input id="adminPassword" name="adminPassword" type="password" minlength="12" required autocomplete="new-password">
<label for="adminPasswordConfirm">${t('Repeat the password')}</label>
<input id="adminPasswordConfirm" name="adminPasswordConfirm" type="password" minlength="12" required autocomplete="new-password">
</fieldset>
<button type="submit">${t('Install')}</button>
</form>`;
}
