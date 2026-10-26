import { randomUUID } from 'node:crypto';
import {
  definePlugin,
  type ImportProgress,
  type ImportReport,
  type PluginContext,
  type RouteRequest,
  type RouteResponse,
} from '@cleitext/plugin-sdk';
import { diviOptions } from '@cleitext/blocks/divi';
import { wxrToDocument } from './wxr';

/**
 * WordPress Importer: the export of a WordPress site (Tools → Export, a WXR
 * file) uploaded from the admin, converted here into a transfer document and
 * imported by the core (`ctx.transfer`, plugin API 1.8), in the background,
 * with its progress and report kept per site.
 *
 * The upload is answered at once (202, with the job and its id); reading
 * the file and importing it go on as a background job, one per site, whose
 * hooks have the core's longer time limit for jobs (core 0.82). The job
 * beats every few seconds: one that stops beating (the server restarted)
 * is shown as failed, never as running forever. It can be cancelled.
 */

export const CAPABILITY = 'import_wordpress';
const JOB = 'job';
/** Divi's theme options uploaded for the next import (`et_divi.json`). */
const DIVI_OPTIONS = 'divi-options';
/** A running job saves itself this often, even while a hook or a download takes long. */
const HEARTBEAT_MS = 10_000;
/** A running import that has not beaten for this long was stopped by a restart. */
const STALE_MS = 2 * 60_000;
/** The imports running in this server, by site: to cancel them. */
const running = new Map<string, AbortController>();
/** Sites whose import is being started (between the check and the save). */
const starting = new Set<string>();
const ROLES = ['author', 'editor', 'contributor', 'subscriber'];
/** Which comments come along (`?comments=`): approved ones by default. */
const COMMENTS = ['approved', 'all', 'skip'] as const;
/**
 * Spam protection given to the imported forms (`?formCaptcha=`): none by
 * default; `site` uses the site's captcha (the Captcha plugin), `turnstile`
 * Fresco Pro's own Turnstile keys.
 */
const FORM_CAPTCHAS = ['site', 'turnstile'] as const;
/**
 * Where Elementor widgets without their own colors and fonts take them from
 * (`?elementorDefaults=`): guessed by default (`auto`), the kit's or the theme's.
 */
const ELEMENTOR_DEFAULTS = ['auto', 'kit', 'theme'] as const;

const TITLES: Record<number, string> = { 400: 'Bad Request', 404: 'Not Found', 409: 'Conflict' };
const problem = (status: 400 | 404 | 409, detail: string) => ({
  status,
  body: { title: TITLES[status], status, detail },
});

/** Where a job is: reading the file, then the core's import steps (plugin API 1.52). */
export interface JobCounts {
  phase: 'parsing' | ImportProgress['phase'];
  /** What the file holds, once read. */
  parsed?: { entries: number; media: number; terms: number };
  media: { done: number; total: number };
  entries: { done: number; total: number };
}

export interface Job {
  /** Since 1.27.0. */
  id: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  file: string;
  locale: string;
  user: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  /** The latest progress messages. */
  progress: string[];
  /** The counts so far (cores before 0.82 give only the messages). */
  counts?: JobCounts;
  report?: ImportReport;
  error?: string;
}

const STOPPED =
  'The import stopped: the server restarted while it ran. Start it again with the same file: what was imported is kept and only the rest is added.';

/** Why another import cannot start now. */
function busy(job: Job): string {
  const counts = job.counts;
  const where =
    counts?.phase === 'media'
      ? `, media ${counts.media.done}/${counts.media.total}`
      : counts?.phase === 'entries'
        ? `, entries ${counts.entries.done}/${counts.entries.total}`
        : '';
  return `An import is already running on this site (${job.file}, started by ${job.user}${where}). Wait for it to end or cancel it.`;
}

/** Whether the core implements at least this plugin API (`1.55.0` ≥ 1.55). */
export function apiAtLeast(version: string | undefined, major: number, minor: number): boolean {
  const [a = 0, b = 0] = (version ?? '').split('.').map(Number);
  return a > major || (a === major && b >= minor);
}

/** Whether a file looks like a WordPress export (WXR) and not anything else. */
export function isWxr(xml: string): boolean {
  const head = xml.slice(0, 20_000);
  return /<rss[\s>]/.test(head) && /xmlns:wp="http:\/\/wordpress\.org\/export\//.test(head);
}

async function current(ctx: PluginContext, siteId: string): Promise<Job | null> {
  const job = await ctx.storage.get<Job>(siteId, JOB);
  if (
    job?.status === 'running' &&
    !running.has(siteId) &&
    Date.now() - Date.parse(job.updatedAt) > STALE_MS
  ) {
    const stopped: Job = {
      ...job,
      status: 'failed',
      error: STOPPED,
      finishedAt: new Date().toISOString(),
    };
    await ctx.storage.set(siteId, JOB, stopped);
    return stopped;
  }
  return job;
}

/** Runs an import, saving its progress now and then and its report at the end. */
async function run(
  ctx: PluginContext,
  siteId: string,
  job: Job,
  signal: AbortSignal,
  options: {
    /** Emptied once read: a large export is not kept in memory during the import. */
    xml: string;
    userId: string;
    authorRole: string;
    /** The languages to import; null for all the site's. */
    locales: string[] | null;
    comments: (typeof COMMENTS)[number];
    formCaptcha?: (typeof FORM_CAPTCHAS)[number];
    elementorDefaults?: (typeof ELEMENTOR_DEFAULTS)[number];
    diviOptions?: Record<string, unknown> | null;
    /** The addresses of the export replace those of a site that has content (1.31.0). */
    replacePermalinks?: boolean;
  },
): Promise<void> {
  let saved = 0;
  const save = async (force = false) => {
    if (!force && Date.now() - saved < 1_000) return;
    saved = Date.now();
    job.updatedAt = new Date().toISOString();
    await ctx.storage.set(siteId, JOB, job);
  };
  // The job beats while a hook or a download takes long: a job that stops
  // beating was stopped by a restart (`current`).
  const heartbeat = setInterval(() => void save(true).catch(() => {}), HEARTBEAT_MS);
  heartbeat.unref?.();
  const counts: JobCounts = job.counts ?? {
    phase: 'parsing',
    media: { done: 0, total: 0 },
    entries: { done: 0, total: 0 },
  };
  job.counts = counts;
  try {
    // Parsing a large export takes seconds: only after the upload has been answered.
    await new Promise((resolve) => setImmediate(resolve));
    const site = await ctx.site(siteId);
    signal.throwIfAborted();
    const xml = options.xml;
    options.xml = '';
    const { document, warnings, meta } = wxrToDocument(xml, {
      locale: job.locale,
      authorRole: options.authorRole,
      // Only languages the site has: the others' pages are left out and reported.
      locales: (options.locales ?? site.locales ?? []).filter(
        (l) => !site.locales?.length || site.locales.includes(l),
      ),
      comments: options.comments,
      ...(options.formCaptcha ? { formCaptcha: options.formCaptcha } : {}),
      ...(options.elementorDefaults ? { elementorDefaults: options.elementorDefaults } : {}),
      ...(options.diviOptions ? { diviOptions: options.diviOptions } : {}),
      trailingSlash: site.trailingSlash === true,
      // The core keeps the export's addresses (plugin API 1.55); older ones get a hint.
      corePermalinks: apiAtLeast(ctx.apiVersion, 1, 55),
      ...(options.replacePermalinks ? { replacePermalinks: true } : {}),
    });
    const parsed = {
      entries: document.entries?.length ?? 0,
      media: document.media?.length ?? 0,
      terms: document.terms?.length ?? 0,
    };
    counts.parsed = parsed;
    counts.phase = 'structure';
    counts.media = { done: 0, total: parsed.media };
    counts.entries = { done: 0, total: parsed.entries };
    job.progress = [
      ...job.progress,
      `Read: ${parsed.entries} entries, ${parsed.media} media files, ${parsed.terms} terms`,
    ].slice(-20);
    await save(true);
    signal.throwIfAborted();
    const report = await ctx.transfer.importDocument(siteId, document, {
      userId: options.userId,
      // Post and term meta for plugins (`import.wxrMeta`, plugin API 1.48).
      wxrMeta: meta,
      onProgress(message) {
        job.progress = [...job.progress, message].slice(-20);
        void save().catch(() => {});
      },
      // Counts after every record, and cancelling (plugin API 1.52; older cores ignore them).
      onCounts(progress) {
        counts.phase = progress.phase;
        counts.media = progress.media;
        counts.entries = progress.entries;
        void save().catch(() => {});
      },
      signal,
    });
    report.warnings.unshift(...warnings);
    job.report = report;
    if (signal.aborted) {
      job.status = 'cancelled';
      job.error = 'The import was cancelled: what was imported so far is kept.';
    } else {
      job.status = 'done';
    }
  } catch (error) {
    if (signal.aborted) {
      job.status = 'cancelled';
      job.error = 'The import was cancelled: what was imported so far is kept.';
    } else {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      ctx.log.error('WordPress import failed', { error: job.error });
    }
  } finally {
    clearInterval(heartbeat);
    running.delete(siteId);
  }
  job.finishedAt = new Date().toISOString();
  await save(true);
}

export default definePlugin({
  setup(ctx) {
    ctx.access.defineCapability(CAPABILITY, {
      label: { en: 'Import from WordPress', it: 'Importare da WordPress' },
      roles: ['administrator'],
    });

    ctx.routes.api({
      method: 'GET',
      path: '/status',
      capability: CAPABILITY,
      async handler(request) {
        return { body: { job: await current(ctx, request.siteId) } };
      },
    });

    // One job by its id (the one given when it started).
    ctx.routes.api({
      method: 'GET',
      path: '/imports/:id',
      capability: CAPABILITY,
      async handler(request) {
        const job = await current(ctx, request.siteId);
        if (!job || job.id !== request.params.id) return problem(404, 'No such import.');
        return { body: { job } };
      },
    });

    // Cancels the running import: it stops between two records, what was imported is kept.
    ctx.routes.api({
      method: 'POST',
      path: '/cancel',
      capability: CAPABILITY,
      async handler(request) {
        const job = await current(ctx, request.siteId);
        if (job?.status !== 'running') return problem(409, 'No import is running.');
        const controller = running.get(request.siteId);
        if (controller) {
          controller.abort();
          return { status: 202, body: { job } };
        }
        // Not running in this server any more (it restarted): it is over.
        const stopped: Job = {
          ...job,
          status: 'cancelled',
          error: 'The import was cancelled: what was imported so far is kept.',
          finishedAt: new Date().toISOString(),
        };
        await ctx.storage.set(request.siteId, JOB, stopped);
        return { body: { job: stopped } };
      },
    });

    // Upload: multipart `file`; options in the query (?locale=it&authorRole=author&comments=all&formCaptcha=turnstile&elementorDefaults=theme&permalinks=replace).
    ctx.routes.api({
      method: 'POST',
      path: '/imports',
      capability: CAPABILITY,
      async handler(request) {
        // One import per site at a time.
        if (starting.has(request.siteId)) {
          return problem(409, 'An import is already starting on this site.');
        }
        starting.add(request.siteId);
        try {
          return await start(request);
        } finally {
          starting.delete(request.siteId);
        }
      },
    });

    /** Checks the upload and starts its import as a background job. */
    async function start(request: RouteRequest): Promise<RouteResponse> {
      const active = await current(ctx, request.siteId);
      if (active?.status === 'running') return problem(409, busy(active));
      const file = await request.file();
      if (!file) {
        return problem(400, 'Choose the export file (.xml).');
      }
      const xml = file.data.toString('utf8');
      if (!isWxr(xml)) {
        return problem(
          400,
          'This is not a WordPress export. In WordPress use Tools → Export → All content.',
        );
      }
      const locale = request.query.locale?.trim() ?? '';
      if (!/^[a-z]{2,3}(-[A-Z]{2})?$/.test(locale)) {
        return problem(400, 'Choose the language of the content.');
      }
      // The languages to import (`?languages=it,en`), as confirmed in the preview;
      // without it, all the site's languages (1.28.0): pages translated with
      // WPML or Polylang go into theirs.
      const locales =
        request.query.languages === undefined
          ? null
          : request.query.languages
              .split(',')
              .map((l) => l.trim())
              .filter((l) => /^[a-z]{2,3}(-[A-Z]{2})?$/.test(l))
              .slice(0, 8);
      const comments = COMMENTS.find((c) => c === request.query.comments) ?? 'approved';
      const formCaptcha = FORM_CAPTCHAS.find((c) => c === request.query.formCaptcha);
      const elementorDefaults = ELEMENTOR_DEFAULTS.find(
        (c) => c === request.query.elementorDefaults,
      );
      const authorRole = ROLES.includes(request.query.authorRole ?? '')
        ? request.query.authorRole!
        : 'author';
      // Divi's theme options uploaded just before, for this import only.
      const divi =
        request.query.diviOptions === '1'
          ? await ctx.storage.get<Record<string, unknown>>(request.siteId, DIVI_OPTIONS)
          : null;
      await ctx.storage.delete(request.siteId, DIVI_OPTIONS);
      const now = new Date().toISOString();
      const job: Job = {
        id: randomUUID(),
        status: 'running',
        file: file.filename.slice(0, 200),
        locale,
        user: request.user!.displayName,
        startedAt: now,
        updatedAt: now,
        progress: [],
        counts: { phase: 'parsing', media: { done: 0, total: 0 }, entries: { done: 0, total: 0 } },
      };
      await ctx.storage.set(request.siteId, JOB, job);
      const controller = new AbortController();
      running.set(request.siteId, controller);
      const input = {
        xml,
        userId: request.user!.id,
        authorRole,
        locales,
        comments,
        ...(formCaptcha ? { formCaptcha } : {}),
        ...(elementorDefaults ? { elementorDefaults } : {}),
        ...(divi ? { diviOptions: divi } : {}),
        ...(request.query.permalinks === 'replace' ? { replacePermalinks: true } : {}),
      };
      // Not awaited: the import goes on after the answer, as a background job.
      void run(ctx, request.siteId, job, controller.signal, input);
      return { status: 202, body: { job } };
    }

    // Divi's theme options (`et_divi.json`), uploaded before the export they go with.
    ctx.routes.api({
      method: 'POST',
      path: '/divi-options',
      capability: CAPABILITY,
      async handler(request) {
        const file = await request.file();
        if (!file) return problem(400, 'Choose the theme options file (.json).');
        let options: Record<string, unknown> | null;
        try {
          options = diviOptions(JSON.parse(file.data.toString('utf8')));
        } catch {
          options = null;
        }
        if (!options) {
          return problem(400, 'This is not a file of Divi theme options (et_divi.json).');
        }
        await ctx.storage.set(request.siteId, DIVI_OPTIONS, options);
        return { status: 201, body: { ok: true } };
      },
    });

    // Clears a finished import, to start a new one from a clean page.
    ctx.routes.api({
      method: 'DELETE',
      path: '/status',
      capability: CAPABILITY,
      async handler(request) {
        const job = await current(ctx, request.siteId);
        if (job?.status === 'running') {
          return problem(409, 'An import is running.');
        }
        await ctx.storage.delete(request.siteId, JOB);
        return { status: 204 };
      },
    });
  },
});
