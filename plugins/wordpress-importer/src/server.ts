import { definePlugin, type ImportReport, type PluginContext } from '@cleitext/plugin-sdk';
import { wxrToDocument } from './wxr';

/**
 * WordPress Importer: the export of a WordPress site (Tools → Export, a WXR
 * file) uploaded from the admin, converted here into a transfer document and
 * imported by the core (`ctx.transfer`, plugin API 1.8), in the background,
 * with its progress and report kept per site.
 */

export const CAPABILITY = 'import_wordpress';
const JOB = 'job';
/** A running import that has not moved for this long was stopped by a restart. */
const STALE_MS = 15 * 60_000;
const ROLES = ['author', 'editor', 'contributor', 'subscriber'];
/** Which comments come along (`?comments=`): approved ones by default. */
const COMMENTS = ['approved', 'all', 'skip'] as const;

const TITLES: Record<number, string> = { 400: 'Bad Request', 409: 'Conflict' };
const problem = (status: 400 | 409, detail: string) => ({
  status,
  body: { title: TITLES[status], status, detail },
});

export interface Job {
  status: 'running' | 'done' | 'failed';
  file: string;
  locale: string;
  user: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  /** The latest progress messages. */
  progress: string[];
  report?: ImportReport;
  error?: string;
}

/** Whether a file looks like a WordPress export (WXR) and not anything else. */
export function isWxr(xml: string): boolean {
  const head = xml.slice(0, 20_000);
  return /<rss[\s>]/.test(head) && /xmlns:wp="http:\/\/wordpress\.org\/export\//.test(head);
}

async function current(ctx: PluginContext, siteId: string): Promise<Job | null> {
  const job = await ctx.storage.get<Job>(siteId, JOB);
  if (job?.status === 'running' && Date.now() - Date.parse(job.updatedAt) > STALE_MS) {
    const stopped: Job = {
      ...job,
      status: 'failed',
      error:
        'The import stopped (the server restarted). Start it again: what was imported is kept.',
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
  options: {
    xml: string;
    userId: string;
    authorRole: string;
    locales: string[];
    comments: (typeof COMMENTS)[number];
  },
): Promise<void> {
  let saved = 0;
  const save = async (force = false) => {
    if (!force && Date.now() - saved < 1_000) return;
    saved = Date.now();
    job.updatedAt = new Date().toISOString();
    await ctx.storage.set(siteId, JOB, job);
  };
  try {
    // Parsing a large export takes seconds: only after the upload has been answered.
    await new Promise((resolve) => setImmediate(resolve));
    const site = await ctx.site(siteId);
    const { document, warnings } = wxrToDocument(options.xml, {
      locale: job.locale,
      authorRole: options.authorRole,
      locales: options.locales,
      comments: options.comments,
      trailingSlash: site.trailingSlash === true,
    });
    const report = await ctx.transfer.importDocument(siteId, document, {
      userId: options.userId,
      onProgress(message) {
        job.progress = [...job.progress, message].slice(-20);
        void save().catch(() => {});
      },
    });
    report.warnings.unshift(...warnings);
    job.status = 'done';
    job.report = report;
  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : String(error);
    ctx.log.error('WordPress import failed', { error: job.error });
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

    // Upload: multipart `file`; options in the query (?locale=it&authorRole=author&comments=all).
    ctx.routes.api({
      method: 'POST',
      path: '/imports',
      capability: CAPABILITY,
      async handler(request) {
        const running = await current(ctx, request.siteId);
        if (running?.status === 'running') {
          return problem(409, 'An import is already running.');
        }
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
        // The site's other languages, to recognise pages translated with WPML.
        const locales = (request.query.languages ?? '')
          .split(',')
          .map((l) => l.trim())
          .filter((l) => /^[a-z]{2,3}(-[A-Z]{2})?$/.test(l))
          .slice(0, 8);
        const comments = COMMENTS.find((c) => c === request.query.comments) ?? 'approved';
        const authorRole = ROLES.includes(request.query.authorRole ?? '')
          ? request.query.authorRole!
          : 'author';
        const now = new Date().toISOString();
        const job: Job = {
          status: 'running',
          file: file.filename.slice(0, 200),
          locale,
          user: request.user!.displayName,
          startedAt: now,
          updatedAt: now,
          progress: [],
        };
        await ctx.storage.set(request.siteId, JOB, job);
        // Not awaited: the import goes on after the answer.
        void run(ctx, request.siteId, job, {
          xml,
          userId: request.user!.id,
          authorRole,
          locales,
          comments,
        });
        return { status: 202, body: { job } };
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
