import { createHmac, timingSafeEqual } from 'node:crypto';
import { createDatabase, isInstalled } from '@cleitext/db';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/config.js';
import { runCli } from '../plugins/package-upload.js';

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
}

const INSTALL_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

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
 * The setup token: derived from APP_SECRET, so every process of the server
 * shows and accepts the same one, and nobody can guess it without the secret.
 */
export function setupToken(config: AppConfig): string {
  return createHmac('sha256', config.appSecret)
    .update(`cleitext-install:${config.database.url}`)
    .digest('base64url')
    .slice(0, 32);
}

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createInstaller(options: InstallerOptions): Promise<FastifyInstance> {
  const { config } = options;
  const token = setupToken(config);
  const run: InstallRunner = options.run ?? ((args, env) => runCli(args, config, env));
  let installing = false;
  let installed = false;

  const app = Fastify({
    trustProxy: config.trustProxy,
    bodyLimit: 16 * 1024,
    logger: { level: config.logLevel },
  });
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => done(null, Object.fromEntries(new URLSearchParams(body as string))),
  );

  const page = (reply: FastifyReply, status: number, body: string) =>
    reply
      .code(status)
      .header('content-security-policy', INSTALL_CSP)
      .header('cache-control', 'no-store')
      .header('x-content-type-options', 'nosniff')
      .header('x-frame-options', 'DENY')
      .header('referrer-policy', 'no-referrer')
      .type('text/html; charset=utf-8')
      .send(layout(body));

  const defaults = (request: FastifyRequest): FormValues => ({
    token: '',
    siteName: 'My site',
    domain: request.hostname.replace(/:\d+$/, ''),
    locale: 'en',
    adminEmail: '',
    https: request.protocol === 'https',
  });

  app.get('/health/live', () => ({ status: 'ok' }));
  app.get('/install', (request, reply) => {
    if (installed) return reply.redirect('/admin/');
    return page(reply, 200, form(defaults(request), []));
  });

  app.post('/install', async (request, reply) => {
    if (installed) return reply.redirect('/admin/', 303);
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

    if (!sameToken(values.token, token)) {
      request.log.warn('Web installer: wrong setup token.');
      return page(reply, 403, form(again, ['The setup token is not correct.']));
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
    if (errors.length > 0) return page(reply, 400, form(again, errors));
    if (installing) return page(reply, 409, form(again, ['An installation is already running.']));

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
          ...(values.https ? [] : ['--no-https']),
        ],
        { CLEITEXT_ADMIN_PASSWORD: password },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return page(reply, 400, form(again, [message]));
    } finally {
      installing = false;
    }

    installed = true;
    request.log.info(`Web installer: installed ${values.domain}.`);
    reply.raw.once('finish', () => options.onInstalled());
    return page(
      reply,
      200,
      `<h1>Cleitext is installed</h1>
<p>Sign in as <strong>${escape(values.adminEmail)}</strong> once the server has restarted.</p>
<p><a class="button" href="/admin/">Go to the admin</a></p>`,
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

function form(values: FormValues, errors: string[]): string {
  const field = (name: keyof FormValues, label: string, type = 'text', extra = '') =>
    `<label for="${name}">${label}</label>
<input id="${name}" name="${name}" type="${type}" value="${escape(String(values[name]))}" required ${extra}>`;
  return `<h1>Install Cleitext</h1>
<p>Create the first site and its administrator. The setup token is printed in the server log.</p>
${
  errors.length > 0
    ? `<div class="errors" role="alert"><ul>${errors.map((e) => `<li>${escape(e)}</li>`).join('')}</ul></div>`
    : ''
}
<form method="post" action="/install">
${field('token', 'Setup token', 'password', 'autocomplete="off"')}
<fieldset><legend>Site</legend>
${field('siteName', 'Site name')}
${field('domain', 'Domain', 'text', 'placeholder="example.com"')}
${field('locale', 'Language', 'text', 'maxlength="6"')}
<label class="check"><input name="https" type="checkbox" ${values.https ? 'checked' : ''}> Always use HTTPS</label>
</fieldset>
<fieldset><legend>Administrator</legend>
${field('adminEmail', 'Email', 'email', 'autocomplete="username"')}
<label for="adminPassword">Password (at least 12 characters)</label>
<input id="adminPassword" name="adminPassword" type="password" minlength="12" required autocomplete="new-password">
<label for="adminPasswordConfirm">Repeat the password</label>
<input id="adminPasswordConfirm" name="adminPasswordConfirm" type="password" minlength="12" required autocomplete="new-password">
</fieldset>
<button type="submit">Install</button>
</form>`;
}

function layout(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Install Cleitext</title>
<style>
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 0; background: Canvas; color: CanvasText; }
main { max-width: 28rem; margin: 3rem auto; padding: 0 1rem; }
h1 { font-size: 1.5rem; }
fieldset { border: 1px solid #8884; border-radius: .5rem; margin: 1rem 0; padding: .5rem 1rem 1rem; }
label { display: block; margin-top: .75rem; font-size: .9rem; }
label.check { display: flex; gap: .5rem; align-items: center; }
input:not([type=checkbox]) { box-sizing: border-box; width: 100%; padding: .5rem; margin-top: .25rem; font: inherit; }
button, .button { display: inline-block; padding: .6rem 1.2rem; border: 0; border-radius: .4rem; background: #0369a1; color: #fff; font: inherit; text-decoration: none; cursor: pointer; }
.errors { border: 1px solid #dc2626; border-radius: .5rem; padding: 0 1rem; color: #dc2626; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
