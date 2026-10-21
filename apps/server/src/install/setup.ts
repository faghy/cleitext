import { existsSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { PRIVATE_NETWORKS } from '../config/trust-proxy.js';
import {
  canWrite,
  createDatabaseAs,
  defaultDataDir,
  prepareDatabase,
  ROLE_RE,
  SetupProblem,
  writeConfiguration,
  databaseUrl,
  type DatabaseInput,
} from './database-setup.js';
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
import {
  ensureToken,
  hasSession,
  isHttps,
  removeToken,
  sameSecret,
  startSession,
  tokenFile,
  tokenRequired,
} from './token.js';

/**
 * Setup wizard (RF-SIT-02), served when Cleitext has no configuration yet:
 * the setup token, a check of the server, then the database. It writes
 * `.env` and hands over to the web installer, which creates the site.
 */

export interface SetupOptions {
  root: string;
  /** Called once the configuration is written and the answer was sent. */
  onConfigured: () => void;
  /** Tests: where `.env` would be read from, to notice another process wrote it. */
  envFile?: string;
  logLevel?: string;
  /** Ask for the setup token; default: `tokenRequired()` (CLEITEXT_SETUP_TOKEN). */
  requireToken?: boolean;
}

/** Whether the server has no configuration: no database to talk to. */
export function needsSetup(env: NodeJS.ProcessEnv = process.env): boolean {
  return !env.DATABASE_URL;
}

interface Check {
  label: string;
  vars?: Record<string, string>;
  state: 'ok' | 'warn' | 'fail';
  detail?: string;
  detailVars?: Record<string, string>;
}

function nodeIsRecent(version = process.versions.node): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  return major > 22 || (major === 22 && minor >= 12);
}

/** pg_dump in PG_BIN, the PATH, or where Debian, Ubuntu and RHEL install it. */
function findPgDump(): boolean {
  const dirs = [process.env.PG_BIN, ...(process.env.PATH ?? '').split(delimiter)].filter(
    (d): d is string => Boolean(d),
  );
  for (const base of ['/usr/lib/postgresql', '/usr/pgsql']) {
    for (const v of ['18', '17', '16'])
      dirs.push(base === '/usr/pgsql' ? `${base}-${v}/bin` : `${base}/${v}/bin`);
  }
  return dirs.some((dir) => existsSync(join(dir, 'pg_dump')));
}

async function requirements(root: string, request: FastifyRequest): Promise<Check[]> {
  const data = defaultDataDir(root);
  return [
    {
      label: 'Node.js {version}',
      vars: { version: process.versions.node },
      state: nodeIsRecent() ? 'ok' : 'fail',
      ...(nodeIsRecent() ? {} : { detail: 'Cleitext needs Node.js 22.12 or later.' }),
    },
    (await canWrite(root))
      ? { label: 'The application folder is writable', state: 'ok' }
      : {
          label: 'The application folder is writable',
          state: 'fail',
          detail:
            'The configuration is written in {path}: give the domain’s user write access to it.',
          detailVars: { path: root },
        },
    {
      label: 'The data folder can be created',
      state: (await canWrite(data)) ? 'ok' : 'fail',
      detail: 'Uploads, plugins, themes and backups go in {path}.',
      detailVars: { path: data },
    },
    findPgDump()
      ? { label: 'pg_dump (for backups)', state: 'ok' }
      : {
          label: 'pg_dump (for backups)',
          state: 'warn',
          detail:
            'Not found: install the PostgreSQL client tools of the same version as the server, or backups will not work.',
        },
    isHttps(request)
      ? { label: 'HTTPS', state: 'ok' }
      : {
          label: 'HTTPS',
          state: 'warn',
          detail:
            'The site is not on HTTPS yet: enable a certificate (Plesk: SSL/TLS, Let’s Encrypt) before using it.',
        },
  ];
}

interface DatabaseForm {
  /** Create the database now as the PostgreSQL administrator, or use an existing one. */
  mode: 'create' | 'existing';
  host: string;
  port: string;
  database: string;
  owner: string;
  adminUser: string;
  newOwner: string;
  appRole: string;
  dataDir: string;
  trustProxy: boolean;
  trustCloudflare: boolean;
}

export async function createSetup(options: SetupOptions): Promise<FastifyInstance> {
  const root = options.root;
  const requireToken = options.requireToken ?? tokenRequired();
  // Without the check there is no token: an old one would only confuse.
  if (!requireToken) removeToken(root);
  const token = requireToken ? ensureToken(root) : '';
  const allowed = (request: FastifyRequest) => !requireToken || hasSession(request, token);
  const envFile = options.envFile ?? join(root, '.env');
  let configured = false;
  let busy = false;

  const app = Fastify({
    // No configuration yet: the proxies of a typical installation (nginx, Plesk).
    trustProxy: [...PRIVATE_NETWORKS],
    bodyLimit: 16 * 1024,
    logger: { level: options.logLevel ?? 'info' },
  });
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => done(null, Object.fromEntries(new URLSearchParams(body as string))),
  );

  // Another process of the server wrote the configuration: this one restarts.
  const configuredElsewhere = () => !configured && existsSync(envFile);
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/health')) return;
    if (configured || configuredElsewhere()) {
      if (!configured) reply.raw.once('finish', () => options.onConfigured());
      configured = true;
      return reply.redirect('/install', 303);
    }
  });

  const tFor = (lang: Lang) => (text: string, vars?: Record<string, string>) =>
    escape(translate(lang, text, vars));

  const welcome = (lang: Lang, errors: string[] = []) => {
    const t = tFor(lang);
    return `<h1>${t('Welcome')}</h1>
<p>${t('Welcome to Cleitext. This guide checks the server, connects the database, writes the configuration and creates your site, in four steps.')}</p>
${
  requireToken
    ? ''
    : `<p>${t('Have the database details at hand: name, user and password, created in your panel (Plesk: Databases → Add Database, PostgreSQL).')}</p>
<a class="button" href="/install?step=requirements">${t('Start')}</a>`
}
${
  requireToken
    ? `<p>${translate(
        lang,
        'To prove that the server is yours, enter the setup token. It is printed in the server log (Plesk: the domain’s Logs) and in the file {file}; with SSH: {command}.',
        {
          file: `<code>${escape(tokenFile(root))}</code>`,
          command: `<code>cat ${escape(tokenFile(root))}</code>`,
        },
      )}</p>
${errorList(errors.map((e) => t(e)))}
<form method="post" action="/install/token">
<label for="token">${t('Setup token')}</label>
<input id="token" name="token" type="password" autocomplete="off" required autofocus>
<button type="submit">${t('Continue')}</button>
</form>`
    : ''
}`;
  };

  const requirementsPage = async (lang: Lang, request: FastifyRequest) => {
    const t = tFor(lang);
    const checks = await requirements(root, request);
    const blocked = checks.some((c) => c.state === 'fail');
    const mark = { ok: '✓', warn: '⚠', fail: '✗' };
    return `<h1>${t('Requirements')}</h1>
<table><thead><tr><th></th><th>${t('Check')}</th></tr></thead><tbody>
${checks
  .map(
    (c) =>
      `<tr><td class="mark ${c.state}">${mark[c.state]}</td><td>${t(c.label, c.vars)}${
        c.detail && c.state !== 'ok'
          ? `<p class="hint">${t(c.detail, c.detailVars)}</p>`
          : c.detail
            ? `<p class="hint">${t(c.detail, c.detailVars)}</p>`
            : ''
      }</td></tr>`,
  )
  .join('\n')}
</tbody></table>
<p class="hint">${blocked ? t('Fix the problems marked with ✗, then reload this page.') : t('Warnings (⚠) do not block the installation.')}</p>
${blocked ? `<a class="button" href="/install?step=requirements">${t('Check')}</a>` : `<a class="button" href="/install?step=database">${t('Continue')}</a>`}`;
  };

  const databasePage = (lang: Lang, values: DatabaseForm, errors: string[] = []) => {
    const t = tFor(lang);
    const field = (name: keyof DatabaseForm, label: string, extra = '', hint = '') =>
      `<label for="${name}">${t(label)}</label>
<input id="${name}" name="${name}" value="${escape(String(values[name]))}" ${extra}>${hint ? `<p class="hint">${hint}</p>` : ''}`;
    const radio = (mode: DatabaseForm['mode'], label: string) =>
      `<label class="check"><input type="radio" name="mode" value="${mode}" id="mode-${mode}" ${values.mode === mode ? 'checked' : ''}> ${t(label)}</label>`;
    return `<h1>${t('Database')}</h1>
<p>${t('Cleitext uses an owner user only for installations and updates, and creates by itself a second user, with fewer rights, for the running site.')}</p>
${errorList(errors)}
<form method="post" action="/install/database" class="database">
<fieldset><legend>${t('The database')}</legend>
${radio('create', 'Create it now, with the PostgreSQL administrator')}
${radio('existing', 'It already exists (created in the panel)')}
</fieldset>
<fieldset><legend>PostgreSQL</legend>
<div class="row"><div>${field('host', 'Host', 'required')}</div><div class="small">${field('port', 'Port', 'required inputmode="numeric"')}</div></div>
${field('database', 'Database name', 'required autocomplete="off"')}
${field('appRole', 'Application user', 'autocomplete="off"', t('Created by the installer. Leave it empty for {example}.', { example: '<database>_app' }))}
</fieldset>
<fieldset class="only-create"><legend>${t('PostgreSQL administrator')}</legend>
<p class="hint">${t('Used only now, to create the database and its owner; it is not saved anywhere. Plesk: Tools & Settings → Database Servers → PostgreSQL.')}</p>
${field('adminUser', 'Administrator user', 'autocomplete="off"')}
<label for="adminPassword">${t('Administrator password')}</label>
<input id="adminPassword" name="adminPassword" type="password" autocomplete="off">
${field('newOwner', 'Owner user', 'autocomplete="off"', t('Created by the installer. Leave it empty for {example}.', { example: '<database>_owner' }))}
</fieldset>
<fieldset class="only-existing"><legend>${t('Owner of the database')}</legend>
<p class="hint">${t('The user created with the database in the panel (Plesk: Databases → Add Database, PostgreSQL).')}</p>
${field('owner', 'Owner user', 'autocomplete="off"')}
<label for="ownerPassword">${t('Owner password')}</label>
<input id="ownerPassword" name="ownerPassword" type="password" autocomplete="off">
</fieldset>
<fieldset><legend>${t('Data folder')}</legend>
${field('dataDir', 'Data folder', 'required', t('Outside the web root, kept across updates.'))}
<label class="check"><input name="trustProxy" type="checkbox" ${values.trustProxy ? 'checked' : ''}> ${t('Behind a proxy (Plesk, nginx, Apache)')}</label>
<label class="check"><input name="trustCloudflare" type="checkbox" ${values.trustCloudflare ? 'checked' : ''}> ${t('Behind Cloudflare')}</label>
<p class="hint">${t('Only when the domain’s traffic goes through Cloudflare’s proxy (orange cloud): visitors’ addresses are then read through Cloudflare’s servers.')}</p>
</fieldset>
<a class="button secondary" href="/install?step=requirements">${t('Back')}</a>
<button type="submit">${t('Save the configuration')}</button>
</form>`;
  };

  const databaseDefaults = (): DatabaseForm => ({
    mode: 'create',
    host: 'localhost',
    port: '5432',
    database: '',
    owner: '',
    adminUser: 'postgres',
    newOwner: '',
    appRole: '',
    dataDir: defaultDataDir(root),
    trustProxy: true,
    trustCloudflare: false,
  });

  const show = (
    request: FastifyRequest,
    reply: FastifyReply,
    status: number,
    step: number,
    body: string,
  ) => sendPage(reply, status, langOf(request), body, { current: step, labels: STEPS });

  app.get('/health/live', () => ({ status: 'ok' }));

  app.get('/install', async (request, reply) => {
    rememberLang(request, reply);
    const lang = langOf(request);
    const step = (request.query as Record<string, string | undefined>).step;
    if (!allowed(request) || (!requireToken && !step))
      return show(request, reply, 200, 1, welcome(lang));
    if (step === 'database')
      return show(request, reply, 200, 3, databasePage(lang, databaseDefaults()));
    return show(request, reply, 200, 2, await requirementsPage(lang, request));
  });

  app.post('/install/token', async (request, reply) => {
    const lang = langOf(request);
    const given = String((request.body as Record<string, unknown> | undefined)?.token ?? '').trim();
    if (!requireToken) return reply.redirect('/install?step=requirements', 303);
    if (!sameSecret(given, token)) {
      request.log.warn('Setup wizard: wrong setup token.');
      return show(request, reply, 403, 1, welcome(lang, ['The setup token is not correct.']));
    }
    startSession(request, reply, token);
    return reply.redirect('/install?step=requirements', 303);
  });

  app.post('/install/database', async (request, reply) => {
    const lang = langOf(request);
    const t = tFor(lang);
    if (!allowed(request)) {
      return show(
        request,
        reply,
        403,
        1,
        welcome(lang, ['The session of the setup has expired: enter the setup token again.']),
      );
    }
    const body = (request.body ?? {}) as Record<string, string | undefined>;
    const values: DatabaseForm = {
      mode: body.mode === 'existing' ? 'existing' : 'create',
      host: (body.host ?? '').trim(),
      port: (body.port ?? '').trim(),
      database: (body.database ?? '').trim(),
      owner: (body.owner ?? '').trim(),
      adminUser: (body.adminUser ?? '').trim(),
      newOwner: (body.newOwner ?? '').trim(),
      appRole: (body.appRole ?? '').trim(),
      dataDir: (body.dataDir ?? '').trim(),
      trustProxy: body.trustProxy === 'on',
      trustCloudflare: body.trustCloudflare === 'on',
    };
    const creating = values.mode === 'create';
    const appRole = values.appRole || `${values.database}_app`.slice(0, 63);
    const owner = creating
      ? values.newOwner || `${values.database}_owner`.slice(0, 63)
      : values.owner;
    const errors: string[] = [];
    for (const [key, label] of [
      ['host', 'Host'],
      ['database', 'Database name'],
      creating
        ? (['adminUser', 'Administrator user'] as const)
        : (['owner', 'Owner user'] as const),
      ['dataDir', 'Data folder'],
    ] as const) {
      if (!values[key])
        errors.push(t('Enter the {field}.', { field: translate(lang, label).toLowerCase() }));
    }
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      errors.push(t('Enter the {field}.', { field: translate(lang, 'Port').toLowerCase() }));
    }
    if (values.database && !ROLE_RE.test(values.database)) {
      errors.push(
        t('Use letters, digits and underscores for the database name, starting with a letter.'),
      );
    }
    if (owner && (!ROLE_RE.test(owner) || !ROLE_RE.test(appRole))) {
      errors.push(
        t('Use letters, digits and underscores for the user names, starting with a letter.'),
      );
    }
    if (owner && appRole.toLowerCase() === owner.toLowerCase()) {
      errors.push(t('The application user must be different from the owner.'));
    }
    if (errors.length > 0) return show(request, reply, 400, 3, databasePage(lang, values, errors));
    if (busy)
      return show(
        request,
        reply,
        409,
        3,
        databasePage(lang, values, [t('An installation is already running.')]),
      );

    const input: DatabaseInput = {
      host: values.host,
      port,
      database: values.database,
      owner,
      ownerPassword: body.ownerPassword ?? '',
      appRole,
    };
    busy = true;
    let file: string;
    try {
      if (creating) {
        // The administrator's password is used here only, and never stored.
        input.ownerPassword = await createDatabaseAs({
          host: values.host,
          port,
          user: values.adminUser,
          password: body.adminPassword ?? '',
          database: values.database,
          owner,
        });
      }
      const appPassword = await prepareDatabase(input);
      try {
        file = await writeConfiguration({
          root,
          dataDir: resolve(values.dataDir),
          databaseUrl: databaseUrl(input, appRole, appPassword),
          adminUrl: databaseUrl(input, input.owner, input.ownerPassword),
          trustProxy: values.trustProxy,
          trustCloudflare: values.trustCloudflare,
        });
      } catch (error) {
        return show(
          request,
          reply,
          500,
          3,
          databasePage(lang, values, [
            t('Could not write the configuration: {error}', { error: (error as Error).message }),
          ]),
        );
      }
    } catch (error) {
      if (!(error instanceof SetupProblem)) throw error;
      return show(
        request,
        reply,
        400,
        3,
        databasePage(lang, values, [problemText(lang, error, input)]),
      );
    } finally {
      busy = false;
    }

    configured = true;
    request.log.info(`Setup wizard: configuration written to ${file}.`);
    reply.raw.once('finish', () => options.onConfigured());
    return show(
      request,
      reply,
      200,
      3,
      `<h1>${t('Configuration saved')}</h1>
<p>${t('The database is ready and the configuration is in {path} (readable only by the domain’s user). Continue to create the site.', { path: file })}</p>
<a class="button" href="/install">${t('Create the site')}</a>`,
    );
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' || request.method === 'HEAD') return reply.redirect('/install');
    return reply.code(503).send({ message: 'Cleitext is not configured yet.' });
  });

  await app.ready();
  return app;
}

function problemText(lang: Lang, error: SetupProblem, input: DatabaseInput): string {
  const t = (text: string, vars?: Record<string, string>) => escape(translate(lang, text, vars));
  const p = error.problem;
  switch (p.kind) {
    case 'connect':
      return t('Could not connect to the database: {error}', { error: p.error });
    case 'version':
      return t('PostgreSQL {version} is too old: Cleitext needs version 16 or later.', {
        version: p.version,
      });
    case 'createrole':
      return `${t('The user {user} cannot create other users (CREATEROLE). Cleitext needs it: each plugin gets its own database user, which can only reach the plugin’s tables. Run this command as root on the database server, then try again:', { user: input.owner })}<pre>${escape(p.command)}</pre>`;
    case 'owner':
      return `${t('The user {user} does not own the database {database}. Run this command as root on the database server, then try again:', { user: input.owner, database: input.database })}<pre>${escape(p.command)}</pre>`;
    case 'role-taken':
      return t(
        'A database user named {user} already exists and cannot be changed by the owner: choose another application user.',
        { user: input.appRole },
      );
    case 'admin-connect':
      return t('Could not connect as the PostgreSQL administrator: {error}', { error: p.error });
    case 'admin-rights':
      return t(
        'This PostgreSQL user cannot create databases and users: enter the administrator (superuser) of the server.',
      );
    case 'owner-exists':
      return t(
        'A database user named {user} already exists: choose another owner user, or choose “It already exists” and enter its password.',
        { user: input.owner },
      );
    case 'database-taken':
      return t(
        'The database {database} already exists and belongs to {owner}: choose another name, or choose “It already exists”.',
        { database: input.database, owner: p.owner },
      );
    case 'create':
      return t('Could not create the database: {error}', { error: p.error });
    case 'app-connect':
      return t('The application user {user} was created, but cannot connect: {error}', {
        user: input.appRole,
        error: p.error,
      });
  }
}
