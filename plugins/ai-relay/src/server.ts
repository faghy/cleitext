/**
 * AI Relay: Chriss base, the free AI of every Cleitext site. Installed on
 * cleitext.com, it answers the sites' chat completions (OpenAI format, with
 * tools) with cleitext.com's own AI provider (`ctx.ai.chat`), within a small
 * daily allowance per site. Sites register first: the relay reads
 * `<origin>/.well-known/cleitext-ai-relay` to be sure the site asking is the
 * one at that address, then gives it a key (kept here only as a hash).
 * No text of the requests is stored or logged.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  definePlugin,
  type PluginContext,
  type RouteRequest,
  type RouteResponse,
} from '@cleitext/plugin-sdk';
import {
  bearerOf,
  changeSettings,
  dayOf,
  MODEL,
  parseChat,
  resetOf,
  settingsOf,
  siteOriginOf,
  Window,
  type ChatRequest,
  type RelaySettings,
} from './limits';

const CAPABILITY = 'manage_ai_relay';
const SETTINGS_KEY = 'settings';
const SITES_KEY = 'sites';
const USAGE_KEY = 'usage';
/** Registrations from one address per hour. */
const REGISTER_PER_HOUR = 10;
/** The last use of a site is written at most this often. */
const TOUCH_MS = 10 * 60_000;
/** The longest wait in the queue for a turn upstream. */
const QUEUE_WAIT_MS = 90_000;
/**
 * The longest wait of a job in the queue: its site asks for it every couple
 * of seconds and gives up after five minutes, answer included.
 */
const JOB_QUEUE_WAIT_MS = 180_000;
/** A waiting job nobody asked about for this long is dropped at its turn. */
const JOB_ABANDONED_MS = 30_000;
/** An answered job is kept this long for its site to read it. */
const JOB_KEEP_MS = 10 * 60_000;
/** Polls of jobs per minute from one address: many sites can share a server, each polling every couple of seconds. */
const POLLS_PER_MINUTE = 600;

export interface SiteRecord {
  /** SHA-256 of the relay key, hex. */
  keyHash: string;
  registeredAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
}

export interface Usage {
  day: string;
  total: number;
  sites: Record<string, { questions: number; requests: number }>;
}

/** A chat request answered in the background (`/v1/chat/jobs`, AI Relay 1.1). */
interface Job {
  id: string;
  siteId: string;
  origin: string;
  status: 'queued' | 'running' | 'done' | 'error';
  /** The last time its site asked about it. */
  polledAt: number;
  finishedAt: number | null;
  result?: Record<string, unknown>;
  error?: { error: string; message: string };
}

/** The state of a job as its site reads it. */
export interface JobView {
  id: string;
  status: Job['status'];
  /** While queued: the requests ahead of it before its turn. */
  position?: number;
  /** When done: the `chat.completion` object. */
  result?: Record<string, unknown>;
  /** When failed: why (`upstream_error`, `not_configured`, `busy`). */
  error?: { error: string; message: string };
  /** The site's questions today. */
  limit: number;
  remaining: number;
  resetAt: string;
}

/** A chat request that passed the checks. */
interface Admitted {
  config: RelaySettings;
  siteId: string;
  origin: string;
  record: SiteRecord;
  parsed: ChatRequest;
  /** Gives the counted request back (once). */
  refund: () => void;
}

/** `GET /admin`: what the page shows. */
export interface AdminView {
  settings: RelaySettings;
  /** This site has an AI provider the relay can use (`ctx.ai.chat` exists). */
  chat: boolean;
  today: { day: string; total: number; resetAt: string };
  sites: {
    origin: string;
    registeredAt: string;
    lastUsedAt: string | null;
    revoked: boolean;
    questions: number;
    requests: number;
  }[];
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

const problem = (
  status: number,
  error: string,
  detail?: string,
  extra: Record<string, unknown> = {},
  headers?: Record<string, string>,
): RouteResponse => ({
  status,
  body: { error, ...(detail ? { detail } : {}), ...extra },
  ...(headers ? { headers } : {}),
});

/** Why the provider failed, without any of its text: its status, or that it was not reached. */
function failureOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const status = /answered (\d{3})/.exec(message)?.[1];
  if (status) return `answered ${status}`;
  if (/No AI provider/i.test(message)) return 'no provider';
  if (/could not be reached/i.test(message)) return 'not reached';
  return 'failed';
}

export function setupAiRelay(ctx: PluginContext, options: { now?: () => number } = {}): void {
  const now = options.now ?? Date.now;
  const perIp = new Window(60_000);
  const registrations = new Window(3600_000);
  const polls = new Window(60_000);
  const state = new Map<string, Promise<{ sites: Record<string, SiteRecord>; usage: Usage }>>();
  const writes = new Map<string, Promise<void>>();
  let inFlight = 0;
  /** Requests waiting for a turn upstream, in order; a job's carries its id. */
  const waiting: { go: (ok: boolean) => void; job?: string }[] = [];
  /** The jobs (`/v1/chat/jobs`), by id: waiting, running, or answered (kept a while). */
  const jobs = new Map<string, Job>();

  /**
   * A turn upstream: at once while fewer than `concurrency` run, else in a
   * queue of `queue` for `waitMs` at most; false when there is no room.
   */
  function turn(config: RelaySettings, waitMs = QUEUE_WAIT_MS, job?: string): Promise<boolean> {
    if (inFlight < config.concurrency) {
      inFlight++;
      return Promise.resolve(true);
    }
    if (waiting.length >= config.queue) return Promise.resolve(false);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const index = waiting.indexOf(entry);
        if (index >= 0) waiting.splice(index, 1);
        resolve(false);
      }, waitMs);
      timer.unref?.();
      const entry = {
        go: (ok: boolean) => {
          clearTimeout(timer);
          resolve(ok);
        },
        ...(job ? { job } : {}),
      };
      waiting.push(entry);
    });
  }

  /** There is a turn now or a place in the queue. */
  const room = (config: RelaySettings) =>
    inFlight < config.concurrency || waiting.length < config.queue;

  /** The turn is over: the next in the queue goes (keeping the slot), or the slot is freed. */
  function done() {
    const next = waiting.shift();
    if (next) next.go(true);
    else inFlight--;
  }

  /**
   * Requests ahead of a waiting job before its turn: those before it in the
   * queue and the one answered now; 0 when it is next.
   */
  function positionOf(job: string): number {
    const index = waiting.findIndex((entry) => entry.job === job);
    return index < 0 ? 0 : index + 1;
  }

  /** Answered jobs are kept `JOB_KEEP_MS`, then forgotten. */
  function sweep() {
    for (const [id, job] of jobs) {
      if (job.finishedAt !== null && now() - job.finishedAt > JOB_KEEP_MS) jobs.delete(id);
    }
  }

  ctx.access.defineCapability(CAPABILITY, {
    label: { en: 'Manage the AI relay', it: 'Gestire il relay dell’AI' },
    roles: ['administrator'],
  });

  const settings = async (siteId: string) =>
    settingsOf(await ctx.storage.get(siteId, SETTINGS_KEY));

  /** The sites and today's counters, read once and kept in memory (one server). */
  function load(siteId: string) {
    let loaded = state.get(siteId);
    if (!loaded) {
      loaded = (async () => {
        const sites = (await ctx.storage.get<Record<string, SiteRecord>>(siteId, SITES_KEY)) ?? {};
        const usage = (await ctx.storage.get<Usage>(siteId, USAGE_KEY)) ?? {
          day: dayOf(now()),
          total: 0,
          sites: {},
        };
        return { sites, usage };
      })();
      state.set(siteId, loaded);
      loaded.catch(() => state.delete(siteId));
    }
    return loaded;
  }

  /** Today's counters: a new day starts them again. */
  async function today(siteId: string): Promise<Usage> {
    const current = await load(siteId);
    const day = dayOf(now());
    if (current.usage.day !== day) current.usage = { day, total: 0, sites: {} };
    return current.usage;
  }

  /** Writes in order, so an older state never overwrites a newer one. */
  function persist(siteId: string, key: typeof SITES_KEY | typeof USAGE_KEY) {
    const previous = writes.get(siteId) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        const current = await load(siteId);
        await ctx.storage.set(siteId, key, key === SITES_KEY ? current.sites : current.usage);
      })
      .catch((error) => ctx.log.warn(`ai-relay: could not save ${key}: ${String(error)}`));
    writes.set(siteId, next);
    return next;
  }

  /** The site a relay key belongs to. */
  async function siteOf(siteId: string, key: string) {
    const { sites } = await load(siteId);
    const hash = Buffer.from(sha256(key), 'hex');
    for (const [origin, record] of Object.entries(sites)) {
      const stored = Buffer.from(record.keyHash, 'hex');
      if (stored.length === hash.length && timingSafeEqual(stored, hash)) return { origin, record };
    }
    return null;
  }

  async function register(request: RouteRequest): Promise<RouteResponse> {
    const config = await settings(request.siteId);
    if (!config.enabled) return problem(503, 'disabled', 'The free service is turned off.');
    if (!registrations.take(request.ip || '?', REGISTER_PER_HOUR, now()))
      return problem(
        429,
        'rate_limited',
        'Too many registrations: try again later.',
        {},
        {
          'retry-after': '3600',
        },
      );
    const body = (request.body ?? {}) as { origin?: unknown; secret?: unknown };
    const origin = siteOriginOf(body.origin);
    if (!origin)
      return problem(
        400,
        'invalid_origin',
        'The free service needs the site at a public https address.',
      );
    if (typeof body.secret !== 'string' || !/^[A-Za-z0-9_-]{32,100}$/.test(body.secret))
      return problem(400, 'invalid_request', 'secret: not valid.');
    const { sites } = await load(request.siteId);
    if (sites[origin]?.revoked)
      return problem(403, 'revoked', 'This site may not use the free service any more.');

    // The site at that address must show the hash of the secret it sent.
    let challenge: unknown = null;
    try {
      const res = await ctx.http.send({
        url: `${origin}/.well-known/cleitext-ai-relay`,
        method: 'GET',
        headers: { accept: 'application/json' },
        timeoutMs: 10_000,
      });
      if (res.status === 200)
        challenge = (JSON.parse(res.text) as { challenge?: unknown }).challenge;
    } catch {
      // Not reached: refused below.
    }
    const expected = Buffer.from(sha256(body.secret), 'hex');
    const shown =
      typeof challenge === 'string' && /^[0-9a-f]{64}$/.test(challenge)
        ? Buffer.from(challenge, 'hex')
        : null;
    if (!shown || !timingSafeEqual(shown, expected))
      return problem(
        403,
        'not_verified',
        'The site could not be verified at its address: it must be reachable from the internet over https.',
      );

    const key = `cxai_${randomBytes(32).toString('base64url')}`;
    sites[origin] = {
      keyHash: sha256(key),
      registeredAt: new Date(now()).toISOString(),
      lastUsedAt: null,
      revoked: false,
    };
    await persist(request.siteId, SITES_KEY);
    ctx.log.info(`ai-relay: registered ${origin}`);
    return { status: 200, body: { key, model: MODEL, limit: config.siteDaily } };
  }

  /** The `x-ratelimit-*` headers of a site's questions. */
  const quotaHeaders = (config: RelaySettings, used: number): Record<string, string> => ({
    'x-ratelimit-limit': String(config.siteDaily),
    'x-ratelimit-remaining': String(Math.max(0, config.siteDaily - used)),
    'x-ratelimit-reset': String(Math.floor(resetOf(now()) / 1000)),
  });

  async function authenticate(request: RouteRequest) {
    const key = bearerOf(request.headers.authorization);
    const found = key ? await siteOf(request.siteId, key) : null;
    if (!found)
      return { error: problem(401, 'invalid_key', 'The key of the free service is not valid.') };
    if (found.record.revoked)
      return { error: problem(403, 'revoked', 'This site may not use the free service any more.') };
    return found;
  }

  /**
   * The checks of a chat request (service on, address, key, format, today's
   * allowance), then the request counted: an answer to send at once, or what
   * the request needs to go upstream, with `refund` to give it back.
   * `ready` makes the last checks of the caller just before the request is
   * counted (nothing waits in between).
   */
  async function admit(
    request: RouteRequest,
    ready: (origin: string, config: RelaySettings) => RouteResponse | null = () => null,
  ): Promise<RouteResponse | Admitted> {
    const config = await settings(request.siteId);
    if (!config.enabled) return problem(503, 'disabled', 'The free service is turned off.');
    if (!perIp.take(request.ip || '?', config.ipPerMinute, now()))
      return problem(
        429,
        'rate_limited',
        'Too many requests: wait a minute.',
        {},
        {
          'retry-after': '60',
        },
      );
    const found = await authenticate(request);
    if ('error' in found) return found.error;
    const { origin, record } = found;
    const chat = ctx.ai?.chat;
    if (!chat) return problem(503, 'not_configured', 'The free service is not ready.');
    const parsed = parseChat(request.body, config);
    if ('error' in parsed)
      return problem(parsed.error === 'prompt_too_long' ? 413 : 400, parsed.error, parsed.detail);

    const usage = await today(request.siteId);
    const mine = (usage.sites[origin] ??= { questions: 0, requests: 0 });
    const resetAt = new Date(resetOf(now())).toISOString();
    const exceeded = (limit: number, scope: 'site' | 'global') =>
      problem(
        429,
        'quota_exceeded',
        'The free requests of today are used up.',
        { limit, resetAt, scope },
        {
          ...quotaHeaders(config, mine.questions),
          'retry-after': String(Math.max(1, Math.ceil((resetOf(now()) - now()) / 1000))),
        },
      );
    if (parsed.question && mine.questions >= config.siteDaily)
      return exceeded(config.siteDaily, 'site');
    if (mine.requests >= config.siteDaily * config.stepsPerQuestion)
      return exceeded(config.siteDaily, 'site');
    if (usage.total >= config.globalDaily) return exceeded(config.siteDaily, 'global');
    const refused = ready(origin, config);
    if (refused) return refused;

    // Taken now, given back if the provider fails or there is no turn.
    const question = parsed.question ? 1 : 0;
    mine.questions += question;
    mine.requests += 1;
    usage.total += 1;
    let given = false;
    const refund = () => {
      if (given) return;
      given = true;
      mine.questions -= question;
      mine.requests -= 1;
      usage.total -= 1;
    };
    return { config, origin, record, parsed, siteId: request.siteId, refund };
  }

  /** The site's questions used today. */
  async function usedBy(siteId: string, origin: string) {
    return (await today(siteId)).sites[origin]?.questions ?? 0;
  }

  const busy = () =>
    problem(
      503,
      'busy',
      'The free service is busy: try again in a moment.',
      {},
      {
        'retry-after': '30',
      },
    );

  /**
   * The request upstream, with the turn already taken (and given back here):
   * the `chat.completion` object, or the error to answer.
   */
  async function upstream(
    admitted: Admitted,
  ): Promise<
    | { ok: true; body: Record<string, unknown> }
    | { ok: false; status: number; error: string; message: string }
  > {
    const { parsed, record, origin, siteId, refund } = admitted;
    try {
      const chat = ctx.ai?.chat;
      if (!chat) throw new Error('No AI provider');
      const answer = await chat(siteId, {
        messages: parsed.messages,
        ...(parsed.tools ? { tools: parsed.tools } : {}),
        ...(parsed.toolChoice ? { toolChoice: parsed.toolChoice } : {}),
        maxTokens: parsed.maxTokens,
        ...(parsed.temperature !== undefined ? { temperature: parsed.temperature } : {}),
      });
      void persist(siteId, USAGE_KEY);
      if (!record.lastUsedAt || now() - Date.parse(record.lastUsedAt) > TOUCH_MS) {
        record.lastUsedAt = new Date(now()).toISOString();
        void persist(siteId, SITES_KEY);
      }
      return {
        ok: true,
        body: {
          id: `chatcmpl-${randomBytes(12).toString('hex')}`,
          object: 'chat.completion',
          created: Math.floor(now() / 1000),
          model: MODEL,
          choices: [
            {
              index: 0,
              message: answer.message,
              finish_reason:
                answer.finishReason ?? (answer.message.tool_calls?.length ? 'tool_calls' : 'stop'),
            },
          ],
          ...(answer.usage
            ? {
                usage: {
                  prompt_tokens: answer.usage.input,
                  completion_tokens: answer.usage.output,
                  total_tokens: answer.usage.input + answer.usage.output,
                },
              }
            : {}),
        },
      };
    } catch (error) {
      refund();
      // Only why, never the texts.
      ctx.log.warn(`ai-relay: the AI provider ${failureOf(error)} for ${origin}`);
      return failureOf(error) === 'no provider'
        ? {
            ok: false,
            status: 503,
            error: 'not_configured',
            message: 'The free service is not ready.',
          }
        : {
            ok: false,
            status: 502,
            error: 'upstream_error',
            message: 'The free service could not answer: try again later.',
          };
    } finally {
      done();
    }
  }

  /** `POST /v1/chat/completions`: the answer in the same request. */
  async function complete(request: RouteRequest): Promise<RouteResponse> {
    const admitted = await admit(request);
    if (!('parsed' in admitted)) return admitted;
    if (!(await turn(admitted.config))) {
      admitted.refund();
      return busy();
    }
    const outcome = await upstream(admitted);
    if (!outcome.ok) return problem(outcome.status, outcome.error, outcome.message);
    return {
      status: 200,
      headers: quotaHeaders(admitted.config, await usedBy(request.siteId, admitted.origin)),
      body: outcome.body,
    };
  }

  /** What a site reads of its job, with its questions left today. */
  async function jobView(job: Job, config: RelaySettings): Promise<JobView> {
    const used = await usedBy(job.siteId, job.origin);
    return {
      id: job.id,
      status: job.status,
      ...(job.status === 'queued' ? { position: positionOf(job.id) } : {}),
      ...(job.result ? { result: job.result } : {}),
      ...(job.error ? { error: job.error } : {}),
      limit: config.siteDaily,
      remaining: Math.max(0, config.siteDaily - used),
      resetAt: new Date(resetOf(now())).toISOString(),
    };
  }

  /** A job answered: kept for its site to read, for `JOB_KEEP_MS`. */
  function finish(job: Job, outcome: Pick<Job, 'result' | 'error'>) {
    job.status = outcome.error ? 'error' : 'done';
    Object.assign(job, outcome);
    job.finishedAt = now();
  }

  /** Runs a job in the background, in the same queue as the other requests. */
  async function run(job: Job, admitted: Admitted) {
    const { refund } = admitted;
    try {
      if (!(await turn(admitted.config, JOB_QUEUE_WAIT_MS, job.id))) {
        refund();
        finish(job, {
          error: { error: 'busy', message: 'The free service is busy: try again in a moment.' },
        });
        return;
      }
      // Its site stopped asking (closed the chat): the turn goes to the next one.
      if (now() - job.polledAt > JOB_ABANDONED_MS) {
        refund();
        done();
        finish(job, { error: { error: 'abandoned', message: 'Nobody waited for the answer.' } });
        return;
      }
      job.status = 'running';
      const outcome = await upstream(admitted);
      finish(
        job,
        outcome.ok
          ? { result: outcome.body }
          : { error: { error: outcome.error, message: outcome.message } },
      );
    } catch (error) {
      refund();
      ctx.log.warn(`ai-relay: a job failed for ${job.origin}: ${failureOf(error)}`);
      finish(job, {
        error: {
          error: 'upstream_error',
          message: 'The free service could not answer: try again later.',
        },
      });
    }
  }

  /**
   * `POST /v1/chat/jobs`: the same checks as a chat completion, the question
   * counted now, and at once `202 { id, status: "queued", position }`; the
   * answer is read with `GET /v1/chat/jobs/:id`. One job at a time per site.
   */
  async function submit(request: RouteRequest): Promise<RouteResponse> {
    sweep();
    const admitted = await admit(request, (origin, config) => {
      const active = [...jobs.values()].find(
        (job) =>
          job.siteId === request.siteId &&
          job.origin === origin &&
          (job.status === 'queued' || job.status === 'running'),
      );
      if (active)
        return problem(
          409,
          'job_active',
          'This site already has a request in progress: wait for its answer.',
          { id: active.id },
          { 'retry-after': '5' },
        );
      return room(config) ? null : busy();
    });
    if (!('parsed' in admitted)) return admitted;
    const job: Job = {
      id: `job_${randomBytes(16).toString('base64url')}`,
      siteId: request.siteId,
      origin: admitted.origin,
      status: 'queued',
      polledAt: now(),
      finishedAt: null,
    };
    jobs.set(job.id, job);
    const used = await usedBy(request.siteId, admitted.origin);
    const view = await jobView(job, admitted.config);
    // In the background: not tied to this request, which answers at once.
    // Its turn is taken, or its place in the queue, before this line ends.
    void run(job, admitted);
    view.position = positionOf(job.id);
    return { status: 202, headers: quotaHeaders(admitted.config, used), body: view };
  }

  /** `GET /v1/chat/jobs/:id`: the state of a job of the same site. */
  async function poll(request: RouteRequest): Promise<RouteResponse> {
    sweep();
    if (!polls.take(request.ip || '?', POLLS_PER_MINUTE, now()))
      return problem(
        429,
        'rate_limited',
        'Too many requests: wait a minute.',
        {},
        {
          'retry-after': '60',
        },
      );
    const found = await authenticate(request);
    if ('error' in found) return found.error;
    const job = jobs.get(request.params.id ?? '');
    if (!job || job.siteId !== request.siteId || job.origin !== found.origin)
      return problem(404, 'not_found', 'This request is not known, or its answer expired.');
    job.polledAt = now();
    const config = await settings(request.siteId);
    return {
      status: 200,
      headers: quotaHeaders(config, await usedBy(request.siteId, found.origin)),
      body: await jobView(job, config),
    };
  }

  // Called by the sites' servers: anonymous, no origin check; a key or a challenge.
  ctx.routes.api({
    method: 'POST',
    path: '/register',
    webhook: true,
    timeout: 'job',
    handler: register,
  });
  ctx.routes.api({
    method: 'POST',
    path: '/v1/chat/completions',
    webhook: true,
    // A small model on a CPU reads a long prompt in tens of seconds.
    timeout: 'job',
    handler: complete,
  });
  // The same answer in the background (AI Relay 1.1): each request is short,
  // so proxies that cut long requests (100 seconds at Cloudflare) are no problem.
  ctx.routes.api({ method: 'POST', path: '/v1/chat/jobs', webhook: true, handler: submit });
  ctx.routes.api({ method: 'GET', path: '/v1/chat/jobs/:id', webhook: true, handler: poll });
  ctx.routes.api({
    method: 'GET',
    path: '/v1/models',
    webhook: true,
    handler: () => ({
      body: { object: 'list', data: [{ id: MODEL, object: 'model', owned_by: 'cleitext' }] },
    }),
  });
  /** A site's questions today: `{ limit, used, remaining, resetAt }`. */
  ctx.routes.api({
    method: 'GET',
    path: '/usage',
    webhook: true,
    handler: async (request) => {
      const found = await authenticate(request);
      if ('error' in found) return found.error;
      const config = await settings(request.siteId);
      const used = (await today(request.siteId)).sites[found.origin]?.questions ?? 0;
      return {
        headers: quotaHeaders(config, used),
        body: {
          limit: config.siteDaily,
          used,
          remaining: Math.max(0, config.siteDaily - used),
          resetAt: new Date(resetOf(now())).toISOString(),
        },
      };
    },
  });

  // ---- The admin page --------------------------------------------------------------------

  async function view(siteId: string): Promise<AdminView> {
    const { sites } = await load(siteId);
    const usage = await today(siteId);
    return {
      settings: await settings(siteId),
      chat: typeof ctx.ai?.chat === 'function',
      today: {
        day: usage.day,
        total: usage.total,
        resetAt: new Date(resetOf(now())).toISOString(),
      },
      sites: Object.entries(sites)
        .map(([origin, record]) => ({
          origin,
          registeredAt: record.registeredAt,
          lastUsedAt: record.lastUsedAt,
          revoked: record.revoked,
          questions: usage.sites[origin]?.questions ?? 0,
          requests: usage.sites[origin]?.requests ?? 0,
        }))
        .sort((a, b) => b.requests - a.requests || a.origin.localeCompare(b.origin)),
    };
  }

  ctx.routes.api({
    method: 'GET',
    path: '/admin',
    capability: CAPABILITY,
    handler: async (request) => ({ body: await view(request.siteId) }),
  });

  ctx.routes.api({
    method: 'PUT',
    path: '/admin/settings',
    capability: CAPABILITY,
    handler: async (request) => {
      const next = changeSettings(await settings(request.siteId), request.body);
      if (typeof next === 'string') return { status: 400, body: { detail: next } };
      await ctx.storage.set(request.siteId, SETTINGS_KEY, next);
      return { body: await view(request.siteId) };
    },
  });

  /** `{ origin, revoked }`: a revoked site's key stops working, and it cannot register again. */
  ctx.routes.api({
    method: 'POST',
    path: '/admin/sites/revoke',
    capability: CAPABILITY,
    handler: async (request) => {
      const body = (request.body ?? {}) as { origin?: unknown; revoked?: unknown };
      const { sites } = await load(request.siteId);
      const record = typeof body.origin === 'string' ? sites[body.origin] : undefined;
      if (!record) return { status: 404, body: { detail: 'This site is not registered.' } };
      // Allowed again (`revoked: false`): its key works again.
      record.revoked = body.revoked !== false;
      await persist(request.siteId, SITES_KEY);
      return { body: await view(request.siteId) };
    },
  });

  ctx.routes.api({
    method: 'DELETE',
    path: '/admin/sites',
    capability: CAPABILITY,
    handler: async (request) => {
      const origin = request.query.origin;
      const { sites } = await load(request.siteId);
      if (!origin || !sites[origin])
        return { status: 404, body: { detail: 'This site is not registered.' } };
      delete sites[origin];
      await persist(request.siteId, SITES_KEY);
      return { body: await view(request.siteId) };
    },
  });
}

export default definePlugin({
  setup(ctx: PluginContext) {
    setupAiRelay(ctx);
  },
});
