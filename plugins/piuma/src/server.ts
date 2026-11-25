import { definePlugin, type PluginContext } from '@cleitext/plugin-sdk';
import { lighter, normalizeConfig, type Pictures, type PiumaConfig } from './optimize';

/**
 * Piuma (official plugin): lighter pictures. New uploads are made smaller
 * and compressed again before they are stored (`media.upload`); the pictures
 * already in the library are done in the background, a few each minute,
 * their addresses unchanged (`ctx.media.replace`).
 */

const KEY = { config: 'config', job: 'library', done: (id: string) => `done:${id}` };

/** Pictures done per scheduled run, and the time a run may take. */
const BATCH = 20;
const RUN_MS = 40_000;
/** A run that stopped (a restart) frees the job after this. */
const LEASE_MS = 3 * 60_000;

export interface LibraryJob {
  state: 'idle' | 'running' | 'done';
  cursor: string | null;
  /** Pictures looked at, made lighter, left as they were, failed. */
  seen: number;
  optimized: number;
  skipped: number;
  failed: number;
  bytesBefore: number;
  bytesAfter: number;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  leaseUntil: number;
}

const IDLE: LibraryJob = {
  state: 'idle',
  cursor: null,
  seen: 0,
  optimized: 0,
  skipped: 0,
  failed: 0,
  bytesBefore: 0,
  bytesAfter: 0,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  leaseUntil: 0,
};

async function configOf(ctx: PluginContext, siteId: string): Promise<PiumaConfig> {
  return normalizeConfig(await ctx.storage.get(siteId, KEY.config));
}

async function jobOf(ctx: PluginContext, siteId: string): Promise<LibraryJob> {
  return { ...IDLE, ...((await ctx.storage.get<LibraryJob>(siteId, KEY.job)) ?? {}) };
}

function pictures(ctx: PluginContext): Pictures | null {
  const media = ctx.media;
  if (!media.inspect || !media.encode) return null;
  return { inspect: (d) => media.inspect!(d), encode: (d, o) => media.encode!(d, o) };
}

/** Some pictures of the library, from where the last run stopped. */
export async function runLibrary(ctx: PluginContext, siteId: string, now = Date.now()) {
  let job = await jobOf(ctx, siteId);
  if (job.state !== 'running' || job.leaseUntil > now) return job;
  const lib = pictures(ctx);
  const media = ctx.media;
  if (!lib || !media.find || !media.read || !media.replace) return job;
  job = { ...job, leaseUntil: now + LEASE_MS };
  await ctx.storage.set(siteId, KEY.job, job);
  const config = await configOf(ctx, siteId);
  const started = Date.now();
  let done = 0;
  while (done < BATCH && Date.now() - started < RUN_MS) {
    const page = await media.find(siteId, { kind: 'image', limit: 10, cursor: job.cursor });
    for (const item of page.items) {
      job.seen++;
      done++;
      try {
        if (await ctx.storage.get(siteId, KEY.done(item.id))) {
          job.skipped++;
          continue;
        }
        const data = await media.read(siteId, item.id);
        if (!data) {
          job.skipped++;
          continue;
        }
        const result = await lighter(lib, data, config, { changeType: false });
        if (result && result.mime === item.mime) {
          await media.replace(siteId, item.id, result.data);
          job.optimized++;
          job.bytesBefore += data.length;
          job.bytesAfter += result.data.length;
        } else {
          job.skipped++;
        }
        await ctx.storage.set(siteId, KEY.done(item.id), true);
      } catch (error) {
        job.failed++;
        job.lastError = `${item.filename ?? item.id}: ${error instanceof Error ? error.message : String(error)}`;
        ctx.log.warn('A picture could not be made lighter', {
          siteId,
          id: item.id,
          error: String(error),
        });
      }
    }
    job.cursor = page.nextCursor;
    if (!page.nextCursor) {
      job = { ...job, state: 'done', finishedAt: new Date().toISOString() };
      break;
    }
    // Stopped from the admin meanwhile.
    if ((await jobOf(ctx, siteId)).state !== 'running') {
      job.state = 'idle';
      break;
    }
  }
  job.leaseUntil = 0;
  await ctx.storage.set(siteId, KEY.job, job);
  return job;
}

export default definePlugin({
  setup(ctx) {
    ctx.hooks.filter('media.upload', async (file, context) => {
      const config = await configOf(ctx, context.siteId);
      const lib = pictures(ctx);
      if (!config.onUpload || !lib) return file;
      const result = await lighter(lib, file.data, config, { changeType: true });
      return result ? { ...file, data: result.data, mime: result.mime } : file;
    });

    ctx.schedule.every('library', 1, async (siteId) => {
      await runLibrary(ctx, siteId);
    });

    ctx.routes.api({
      method: 'GET',
      path: '/status',
      capability: 'manage_settings',
      handler: async (request) => ({
        body: {
          config: await configOf(ctx, request.siteId),
          job: await jobOf(ctx, request.siteId),
          supported: Boolean(pictures(ctx) && ctx.media.replace),
        },
      }),
    });

    ctx.routes.api({
      method: 'PUT',
      path: '/config',
      capability: 'manage_settings',
      async handler(request) {
        const config = normalizeConfig(request.body);
        await ctx.storage.set(request.siteId, KEY.config, config);
        return { body: config };
      },
    });

    // Starts the library (again from the newest picture), or goes on after a stop.
    ctx.routes.api({
      method: 'POST',
      path: '/library/start',
      capability: 'manage_settings',
      async handler(request) {
        const job = await jobOf(ctx, request.siteId);
        const fresh = job.state !== 'idle' || !job.cursor;
        const next: LibraryJob = fresh
          ? { ...IDLE, state: 'running', startedAt: new Date().toISOString() }
          : { ...job, state: 'running', leaseUntil: 0 };
        await ctx.storage.set(request.siteId, KEY.job, next);
        return { body: next };
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/library/stop',
      capability: 'manage_settings',
      async handler(request) {
        const job = await jobOf(ctx, request.siteId);
        const next: LibraryJob = { ...job, state: 'idle', leaseUntil: 0 };
        await ctx.storage.set(request.siteId, KEY.job, next);
        return { body: next };
      },
    });
  },
});
