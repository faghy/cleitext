import { settings, withContext, type DatabaseClient, type SiteTransaction } from '@cleitext/db';
import type {
  AiProviderRequest,
  AiModelsRequest,
  AiProviderView,
  AssistantChatEvent,
  AssistantChatMessage,
  FreeAiQuota,
  FreeAiStatus,
} from '@cleitext/shared';
import type { AiChatInput, AiChatResult } from '@cleitext/plugin-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { seal, unseal } from '../common/secrets.js';
import { relayUserAgent } from '../common/version.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import {
  ASSISTANT_INSTRUCTIONS,
  callTool,
  siteTools,
  toolList,
  TOOLS,
  type ToolContext,
} from './tools.js';

/**
 * The chat of Admin → Chriss (RF-AI-03): the site's own AI provider
 * (any OpenAI-compatible chat completions API) with the MCP tools, run as
 * the signed-in user. The provider and its key are set by a super admin.
 */

export const AI_NAMESPACE = 'ai';
/** The pending challenge of a registration with the relay of Chriss base. */
export const RELAY_NAMESPACE = 'ai-relay';
/** A registration must finish within this time. */
const CHALLENGE_TTL_MS = 2 * 60_000;
const RELAY_TIMEOUT_MS = 30_000;
/** Rounds of tool calls in one answer, so a confused model cannot loop forever. */
const MAX_ROUNDS = 16;
/** Tool results kept in the conversation: enough for blocks, not whole sites. */
const MAX_TOOL_TEXT = 12_000;
/** The guide (rules, editor, plugins, theme, patterns) is read whole. */
const MAX_GUIDE_TEXT = 40_000;
/**
 * Chriss base (the free AI, a small model on a CPU): only the essential
 * tools and a short prompt, since reading a long prompt takes it most of
 * the time; tool results are cut shorter, and answers capped.
 */
const id = { type: 'string', description: 'Entry id.' };
const html = { type: 'string', description: 'Body as simple HTML; replaces the whole body.' };
/**
 * The tools of Chriss base, with short descriptions and arguments (about 400
 * tokens), the same names and arguments as the full ones. Fixed text: the
 * prompt's start stays the same from turn to turn, and the model's server
 * keeps it read.
 */
const FREE_TOOL_DEFS: {
  name: string;
  scope: 'read' | 'write' | 'publish';
  description: string;
  parameters: Record<string, unknown>;
}[] = [
  {
    name: 'get_site',
    scope: 'read',
    description: 'Site name, languages and content types.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_entries',
    scope: 'read',
    description: 'Find pages or posts, newest first.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: '"page" or "article" (posts).' },
        search: { type: 'string' },
        status: { type: 'string', description: 'draft or published.' },
      },
    },
  },
  {
    name: 'get_entry',
    scope: 'read',
    description: 'Read one page or post.',
    parameters: { type: 'object', properties: { id }, required: ['id'] },
  },
  {
    name: 'create_entry',
    scope: 'write',
    description: 'Create a draft page or post. Returns edit and preview links.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: '"page" or "article" (posts).' },
        title: { type: 'string' },
        content: html,
        excerpt: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_entry',
    scope: 'write',
    description: 'Change the title, excerpt or body of an entry (read it first).',
    parameters: {
      type: 'object',
      properties: { id, title: { type: 'string' }, content: html, excerpt: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'get_preview_link',
    scope: 'write',
    description: 'Preview link of an entry.',
    parameters: { type: 'object', properties: { id }, required: ['id'] },
  },
  {
    name: 'publish_entry',
    scope: 'publish',
    description: 'Publish an entry, only when asked.',
    parameters: { type: 'object', properties: { id }, required: ['id'] },
  },
];
export const FREE_TOOLS = FREE_TOOL_DEFS.map((tool) => tool.name);
const FREE_MAX_TOOL_TEXT = 4_000;
const FREE_MAX_TOKENS = 1024;
/**
 * The conversation sent to Chriss base, in characters: with the prompt and
 * the tools, about 6 000 tokens, within the relay's limit (22 000 characters).
 */
const FREE_MAX_HISTORY = 16_000;
/**
 * Chriss base may wait in the relay's queue, then read for minutes: its
 * answer is asked for as a job (`POST <relay>/v1/chat/jobs`) and read every
 * couple of seconds, so no single request lasts long (proxies such as
 * Cloudflare cut those over 100 seconds), for this long at most.
 */
const FREE_JOB_MS = 300_000;
/** The first look at a job, then the next ones. */
const FREE_FIRST_POLL_MS = 1_000;
const FREE_POLL_MS = 2_000;
/** Each request to the relay, short. */
const FREE_REQUEST_MS = 15_000;
/** The provider of a plugin's `ctx.ai.chat` (e.g. the relay's own): a small model may read for minutes. */
const ROUND_TIMEOUT_MS = 280_000;

/**
 * The conversation within the budget of Chriss base: the oldest questions
 * are left out first; within the current one, older tool results are cut.
 * Only what is sent changes, never the conversation kept.
 */
export function trimForFree(
  messages: Record<string, unknown>[],
  budget = FREE_MAX_HISTORY,
): Record<string, unknown>[] {
  const size = (list: Record<string, unknown>[]) => JSON.stringify(list).length;
  let out = [...messages];
  const current = out.map((m) => m.role).lastIndexOf('user');
  // Older questions, each with its answers, from the oldest.
  while (size(out) > budget) {
    const next = out.findIndex((m, i) => i > 0 && m.role === 'user');
    if (next <= 0 || next > out.length - (messages.length - current)) break;
    out = out.slice(next);
  }
  if (size(out) <= budget) return out;
  // The current question's tool results, but the last one, shortened.
  const start = out.length - (messages.length - Math.max(current, 0));
  out = out.map((m) => ({ ...m }));
  for (let i = start; i < out.length - 1 && size(out) > budget; i++) {
    const m = out[i]!;
    if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > 600)
      m.content = `${m.content.slice(0, 600)}\n… (cut)`;
  }
  return out;
}

/** The entry the chat was opened from, for the system prompt. */
export interface ChatEntry {
  id: string;
  title: string;
  type: string;
  locale: string;
  status: string;
  /** `blocks` or a plugin editor's id. */
  editor: string;
}
const PROVIDER_TIMEOUT_MS = 180_000;
/** Plugins' long texts (ctx.ai.complete), written in the background: a long article with a large model. */
const GENERATE_TIMEOUT_MS = 300_000;

/**
 * The system prompt of Chriss base: short, for a small model; simple HTML
 * instead of the guide of the blocks (it becomes blocks when saved).
 */
function freeSystemPrompt(
  ctx: ToolContext,
  person: { name: string; locale: string },
  entry: ChatEntry | null,
): string {
  const lines = [
    'You are Chriss, the assistant of Cleitext (a CMS like WordPress), in the admin of the site,',
    `with ${person.name}. Answer briefly, in their language (${person.locale}).`,
    'Use the tools to read and write entries. Write content as simple HTML (h2, p, ul, a, strong):',
    'it becomes blocks. Keep the editor of existing entries. New entries are drafts: give the links',
    'to edit and preview them.',
    ctx.scopes.includes('publish')
      ? 'Publish only when asked.'
      : 'This conversation may not publish: leave drafts.',
  ];
  if (entry) {
    lines.push(
      `"This page" is the ${entry.type} "${entry.title.replace(/[\r\n]+/g, ' ')}" (id ${entry.id}, ${entry.locale}, ${entry.status}, editor "${entry.editor}"): read it with get_entry. After a change, tell them to reload the editor.`,
    );
  }
  return lines.join('\n');
}

/** The provider's chat completions, or a clear error when its address cannot be reached. */
async function reach(baseUrl: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${baseUrl}/chat/completions`, init);
  } catch (error) {
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    const why =
      (error as Error).name === 'TimeoutError'
        ? 'it did not answer in time'
        : (cause?.code ?? cause?.message ?? (error as Error).message);
    throw new Error(
      `The AI provider could not be reached at ${baseUrl} (${why}): check the address.`,
      { cause: error },
    );
  }
}

/**
 * The free daily requests of Chriss base are used up (the relay answered
 * 429 `quota_exceeded`): the chat invites to connect an own AI service.
 */
export class QuotaExceeded extends Error {
  readonly code = 'quota_exceeded';
  constructor(
    readonly limit: number | null,
    readonly resetAt: string | null,
  ) {
    super(
      "You used today's free requests: connect your own AI service to continue without limits.",
    );
    this.name = 'QuotaExceeded';
  }
}

/** The relay's 429 `{ error: "quota_exceeded", limit, resetAt }`, or null for another answer. */
function quotaExceeded(status: number, text: string): QuotaExceeded | null {
  if (status !== 429) return null;
  try {
    const body = JSON.parse(text) as { error?: unknown; limit?: unknown; resetAt?: unknown };
    if (body.error !== 'quota_exceeded') return null;
    return new QuotaExceeded(
      typeof body.limit === 'number' ? body.limit : null,
      typeof body.resetAt === 'string' ? body.resetAt : null,
    );
  } catch {
    return null;
  }
}

/** The free requests left, from the relay's `x-ratelimit-*` headers; null without them. */
export function quotaOf(headers: Headers): FreeAiQuota | null {
  const remaining = Number(headers.get('x-ratelimit-remaining'));
  const limit = Number(headers.get('x-ratelimit-limit'));
  const reset = Number(headers.get('x-ratelimit-reset'));
  if (!headers.has('x-ratelimit-remaining') || !Number.isFinite(remaining)) return null;
  return {
    remaining: Math.max(0, Math.floor(remaining)),
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null,
    resetAt: Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : null,
  };
}

/**
 * An error of the provider, with its own message and, for the usual
 * mistakes, what to check: a wrong address answers 404, a wrong key 401.
 */
export function providerFailure(status: number, text: string, baseUrl: string): Error {
  const quota = quotaExceeded(status, text);
  if (quota) return quota;
  let detail = text.slice(0, 500);
  try {
    const parsed = JSON.parse(text) as {
      error?: { message?: string } | string;
      detail?: unknown;
    };
    // The relay's `{ error: "busy", detail: "…" }`: its sentence.
    detail =
      typeof parsed.error === 'string'
        ? typeof parsed.detail === 'string' && parsed.detail
          ? parsed.detail
          : parsed.error
        : (parsed.error?.message ?? detail);
  } catch {
    // Not JSON: the start of the body is shown.
  }
  // A model the provider does not know (not every message that names "model").
  const unknownModel =
    /(model[^.]{0,80}(not found|does not exist|not exist|unknown|invalid|not available|not supported))|((no such|unknown|invalid) model)/i.test(
      detail,
    );
  const hint =
    status === 404 && !unknownModel
      ? ` The address ${baseUrl} has no chat completions API: use the API's base address, usually ending in /v1 (e.g. https://api.openai.com/v1, https://api.anthropic.com/v1, https://openrouter.ai/api/v1).`
      : status === 413
        ? ' The request is too long for the free service: start a new conversation.'
        : status === 401 || status === 403
          ? ' Check the API key.'
          : unknownModel
            ? ' Check the model name: it must be one the provider lists (e.g. gpt-5, claude-sonnet-5-5).'
            : '';
  const said = detail.trim().replace(/\.$/, '') || 'no details';
  return new Error(`The AI provider answered ${status}: ${said}.${hint}`);
}

interface Provider {
  baseUrl: string;
  model: string;
  apiKey: string | null;
  /** Chriss base, the free AI through the relay of cleitext.com. */
  free: boolean;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** A chat completions answer, as far as it is read. */
interface ChatAnswer {
  model?: string;
  choices?: {
    message?: { content?: string | null; tool_calls?: ToolCall[] };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** The text of a chat completions answer, for `ctx.ai.complete`. */
function generated(
  data: ChatAnswer,
  model: string,
): {
  text: string;
  model: string;
  usage: { input: number; output: number } | null;
  finishReason?: string;
} {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('The AI provider gave no answer.');
  const finish = data.choices?.[0]?.finish_reason;
  return {
    text: content,
    // `length`: the answer was cut at maxTokens (plugin API 1.68).
    ...(typeof finish === 'string' && finish ? { finishReason: finish } : {}),
    model: data.model ?? model,
    usage: data.usage
      ? { input: data.usage.prompt_tokens ?? 0, output: data.usage.completion_tokens ?? 0 }
      : null,
  };
}

/** The free requests left, from a job of the relay (`limit`, `remaining`, `resetAt`). */
function jobQuota(body: { limit?: unknown; remaining?: unknown; resetAt?: unknown }) {
  if (typeof body.remaining !== 'number' || !Number.isFinite(body.remaining)) return null;
  return {
    remaining: Math.max(0, Math.floor(body.remaining)),
    limit: typeof body.limit === 'number' && body.limit > 0 ? Math.floor(body.limit) : null,
    resetAt: typeof body.resetAt === 'string' ? body.resetAt : null,
  } satisfies FreeAiQuota;
}

/** A job of the relay, as far as it is read. */
interface JobAnswer {
  id?: unknown;
  status?: unknown;
  position?: unknown;
  result?: ChatAnswer;
  error?: { error?: unknown; message?: unknown };
  limit?: unknown;
  remaining?: unknown;
  resetAt?: unknown;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class ChatService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  private async load(siteId: string): Promise<Provider | null> {
    const rows = await withContext(this.database.db, { siteId }, (tx) =>
      tx.select().from(settings).where(eq(settings.namespace, AI_NAMESPACE)),
    );
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    if (typeof values.baseUrl !== 'string' || typeof values.model !== 'string') return null;
    return {
      baseUrl: values.baseUrl,
      model: values.model,
      apiKey: values.apiKey ? unseal(this.config.appSecret, values.apiKey) : null,
      free: values.free === true,
    };
  }

  async configured(siteId: string): Promise<boolean> {
    return (await this.load(siteId)) !== null;
  }

  async view(siteId: string): Promise<AiProviderView | null> {
    const provider = await this.load(siteId);
    return provider
      ? {
          baseUrl: provider.baseUrl,
          model: provider.model,
          hasKey: provider.apiKey !== null,
          ...(provider.free ? { free: true } : {}),
        }
      : null;
  }

  async save(siteId: string, userId: string, input: AiProviderRequest, ip: string): Promise<void> {
    const baseUrl = input.baseUrl.replace(/\/+$/, '');
    const saved = await this.load(siteId);
    const values: Record<string, unknown> = {
      baseUrl,
      model: input.model,
      // Still Chriss base only when saved again with the same address and key.
      free: saved?.free && saved.baseUrl === baseUrl && input.apiKey === undefined ? true : null,
    };
    // The key is kept when omitted, removed with an empty string.
    if (input.apiKey !== undefined) {
      values.apiKey = input.apiKey ? seal(this.config.appSecret, input.apiKey) : null;
    }
    await this.store(siteId, userId, values, ip);
  }

  private async store(
    siteId: string,
    userId: string,
    values: Record<string, unknown>,
    ip: string,
  ): Promise<void> {
    await withContext(this.database.db, { siteId, userId }, async (tx) => {
      for (const [key, value] of Object.entries(values)) {
        await tx
          .delete(settings)
          .where(and(eq(settings.namespace, AI_NAMESPACE), eq(settings.key, key)));
        if (value !== null) {
          await tx.insert(settings).values({ siteId, namespace: AI_NAMESPACE, key, value });
        }
      }
      await this.recordChange(tx, siteId, userId, Object.keys(values), ip);
    });
  }

  async remove(siteId: string, userId: string, ip: string): Promise<void> {
    await withContext(this.database.db, { siteId, userId }, async (tx) => {
      await tx.delete(settings).where(eq(settings.namespace, AI_NAMESPACE));
      await this.recordChange(tx, siteId, userId, ['removed'], ip);
    });
  }

  // ---- Chriss base, the free AI of Cleitext sites ----------------------------------------

  /** The relay's address (CLEITEXT_AI_RELAY), '' when the preset is off. */
  private get relay(): string {
    return this.config.ai.relayUrl;
  }

  /**
   * What `/.well-known/cleitext-ai-relay` shows while the site registers with
   * the relay: the SHA-256 of the secret sent to the relay, which can then
   * check that the site asking is the one at that address. Null otherwise.
   */
  async pendingChallenge(siteId: string): Promise<string | null> {
    const rows = await withContext(this.database.db, { siteId }, (tx) =>
      tx
        .select()
        .from(settings)
        .where(and(eq(settings.namespace, RELAY_NAMESPACE), eq(settings.key, 'challenge'))),
    );
    const value = rows[0]?.value as { hash?: unknown; until?: unknown } | undefined;
    if (!value || typeof value.hash !== 'string' || typeof value.until !== 'number') return null;
    return value.until > Date.now() ? value.hash : null;
  }

  private async setChallenge(siteId: string, value: { hash: string; until: number } | null) {
    await withContext(this.database.db, { siteId }, async (tx) => {
      await tx
        .delete(settings)
        .where(and(eq(settings.namespace, RELAY_NAMESPACE), eq(settings.key, 'challenge')));
      if (value) {
        await tx
          .insert(settings)
          .values({ siteId, namespace: RELAY_NAMESPACE, key: 'challenge', value });
      }
    });
  }

  /** Admin → Chriss: whether Chriss base can be chosen, is in use, and today's requests left. */
  async freeStatus(siteId: string): Promise<FreeAiStatus> {
    if (!this.relay) return { available: false, active: false };
    const host = new URL(this.relay).host;
    const provider = await this.load(siteId);
    if (!provider?.free || !provider.apiKey) return { available: true, host, active: false };
    try {
      const response = await fetch(`${this.relay}/usage`, {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${provider.apiKey}`,
          'user-agent': relayUserAgent(),
        },
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });
      const text = await response.text();
      if (!response.ok) {
        return {
          available: true,
          host,
          active: true,
          error: providerFailure(response.status, text, this.relay).message,
        };
      }
      const data = JSON.parse(text) as { limit?: unknown; remaining?: unknown; resetAt?: unknown };
      return {
        available: true,
        host,
        active: true,
        quota: {
          remaining: typeof data.remaining === 'number' ? data.remaining : 0,
          limit: typeof data.limit === 'number' ? data.limit : null,
          resetAt: typeof data.resetAt === 'string' ? data.resetAt : null,
        },
      };
    } catch {
      return {
        available: true,
        host,
        active: true,
        error: 'The free service could not be reached.',
      };
    }
  }

  /**
   * Chriss base with today's questions used up, as the relay says (null
   * otherwise, also when it cannot be asked): the chat answers 429 at once.
   */
  async freeQuotaExceeded(
    siteId: string,
  ): Promise<{ limit: number | null; resetAt: string | null; retryAfter: number } | null> {
    const status = await this.freeStatus(siteId);
    if (!status.active || !status.quota || status.quota.remaining > 0) return null;
    const reset = status.quota.resetAt ? Date.parse(status.quota.resetAt) : NaN;
    return {
      limit: status.quota.limit,
      resetAt: status.quota.resetAt,
      retryAfter: Number.isFinite(reset)
        ? Math.max(1, Math.ceil((reset - Date.now()) / 1000))
        : 3600,
    };
  }

  /**
   * Chriss base in one click: the site registers with the relay (which
   * reads the challenge at `origin/.well-known/cleitext-ai-relay` to be sure
   * the site is the one at that address), then keeps the key it gets as the
   * provider's key. The relay chooses the model.
   */
  async activateFree(siteId: string, userId: string, origin: string, ip: string): Promise<void> {
    if (!this.relay) throw new Error('Chriss base is not available on this server.');
    const secret = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(secret).digest('hex');
    await this.setChallenge(siteId, { hash, until: Date.now() + CHALLENGE_TTL_MS });
    let answer: { key?: unknown; model?: unknown; error?: unknown; detail?: unknown };
    let status: number;
    try {
      const response = await fetch(`${this.relay}/register`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'user-agent': relayUserAgent(),
        },
        body: JSON.stringify({ origin, secret }),
        signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
        redirect: 'error',
      });
      status = response.status;
      answer = (await response.json().catch(() => ({}))) as typeof answer;
    } catch (error) {
      throw new Error('The free service could not be reached: try again later.', {
        cause: error,
      });
    } finally {
      await this.setChallenge(siteId, null);
    }
    if (status !== 200 || typeof answer.key !== 'string' || !answer.key) {
      throw new Error(
        typeof answer.detail === 'string' && answer.detail
          ? answer.detail.slice(0, 300)
          : `The free service refused the site (${status}).`,
      );
    }
    await this.store(
      siteId,
      userId,
      {
        baseUrl: `${this.relay}/v1`,
        model:
          typeof answer.model === 'string' && /^[\w.:/@-]{1,100}$/.test(answer.model)
            ? answer.model
            : 'chriss-base',
        apiKey: seal(this.config.appSecret, answer.key),
        free: true,
      },
      ip,
    );
  }

  private recordChange(
    tx: SiteTransaction,
    siteId: string,
    userId: string,
    keys: string[],
    ip: string,
  ) {
    return this.audit.record(tx, {
      siteId,
      userId,
      action: 'settings.updated',
      targetType: 'settings',
      targetId: AI_NAMESPACE,
      meta: { keys },
      ip,
    });
  }

  /**
   * One answer: asks the provider, runs the tools it calls, and repeats until
   * it answers with text. Progress goes to `emit`; the conversation, with the
   * tool calls, comes back in the `done` event for the next question.
   */
  async answer(
    siteId: string,
    ctx: ToolContext,
    person: { name: string; locale: string },
    history: AssistantChatMessage[],
    emit: (event: AssistantChatEvent) => void,
    entry: ChatEntry | null = null,
  ): Promise<void> {
    const provider = await this.load(siteId);
    if (!provider) {
      emit({ type: 'error', message: 'No AI provider is set up for the chat.' });
      return;
    }
    const tools = provider.free
      ? FREE_TOOL_DEFS.filter((tool) => tool.scope !== 'publish' || ctx.scopes.includes('publish'))
          .filter((tool) => tool.scope === 'read' || ctx.scopes.includes('write'))
          .map((tool) => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          }))
      : toolList(ctx.scopes, await siteTools(ctx).catch(() => TOOLS)).map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        }));
    const system = provider.free
      ? freeSystemPrompt(ctx, person, entry)
      : `You are Chriss, the assistant of Cleitext. If asked who you are, say that you are
Chriss, the Cleitext assistant (in their language), without explaining the name.

${ASSISTANT_INSTRUCTIONS}

You are working inside the admin of the site, with ${person.name}. Answer in their language
(${person.locale}) unless they write in another one, briefly. When you create or change
something, give the links to edit it and to preview it.${
          ctx.scopes.includes('publish')
            ? ''
            : '\nThis conversation may not publish: say so if asked, and leave drafts.'
        }${
          entry
            ? `

${person.name} opened the chat from the editor of the ${entry.type} "${entry.title.replace(/[\r\n]+/g, ' ')}"
(id ${entry.id}, language ${entry.locale}, ${entry.status}), made with the "${entry.editor}" editor.
"This page" means that entry: read it with get_entry, and read get_block_guide with
editor "${entry.editor}" before changing it. Keep its editor. They have it open: after a change,
tell them to reload the editor to see it.`
            : ''
        }`;
    const messages: AssistantChatMessage[] = [...history];

    for (let round = 0; round < MAX_ROUNDS; round++) {
      let reply: { content?: string | null; tool_calls?: ToolCall[] };
      try {
        // Chriss base reads slowly: the chat says so while it waits.
        if (provider.free) emit({ type: 'reading' });
        const answer = await this.complete(
          provider,
          [
            { role: 'system', content: system },
            ...(provider.free ? trimForFree(messages) : messages),
          ],
          tools,
          // Its place in the relay's queue, when it changes.
          (position) => emit({ type: 'queue', position }),
        );
        reply = answer.message;
        // Chriss base: the free requests left today.
        if (provider.free && answer.quota) emit({ type: 'quota', ...answer.quota });
      } catch (error) {
        if (error instanceof QuotaExceeded) {
          emit({
            type: 'error',
            message: error.message,
            error: 'quota_exceeded',
            limit: error.limit,
            resetAt: error.resetAt,
          });
          return;
        }
        emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
        return;
      }
      const calls = reply.tool_calls ?? [];
      messages.push({
        role: 'assistant',
        content: reply.content ?? null,
        ...(calls.length > 0 ? { tool_calls: calls } : {}),
      });
      if (reply.content && calls.length > 0) emit({ type: 'text', text: reply.content });
      if (calls.length === 0) {
        emit({ type: 'text', text: reply.content ?? '' });
        emit({ type: 'done', messages });
        return;
      }
      for (const call of calls) {
        const name = call.function?.name ?? '';
        emit({ type: 'tool', name });
        let args: Record<string, unknown> | null = null;
        try {
          args = call.function?.arguments
            ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
            : {};
        } catch {
          // Reported to the model below, so it can try again.
        }
        const result = args
          ? await callTool(ctx, name, args)
          : { text: 'The arguments are not valid JSON.', isError: true };
        emit({ type: 'tool-done', name, ok: !result.isError });
        const max = provider.free
          ? FREE_MAX_TOOL_TEXT
          : name === 'get_block_guide'
            ? MAX_GUIDE_TEXT
            : MAX_TOOL_TEXT;
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result.text.length > max ? `${result.text.slice(0, max)}\n… (cut)` : result.text,
        });
      }
    }
    emit({
      type: 'text',
      text: 'I stopped here: the request needed too many steps. Ask me to continue, or split it.',
    });
    emit({ type: 'done', messages });
  }

  /**
   * One answer of the site's AI provider for a plugin (`ctx.ai.complete`,
   * plugin API 1.64): messages in, text out, without tools. The provider and
   * its key stay the core's; the plugin never sees them.
   */
  async generate(
    siteId: string,
    input: {
      messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
      maxTokens?: number;
      temperature?: number;
      /** Another model of the provider (plugin API 1.67); the site's when left out. */
      model?: string;
    },
  ): Promise<{
    text: string;
    model: string;
    usage: { input: number; output: number } | null;
    finishReason?: string;
  }> {
    const provider = await this.load(siteId);
    if (!provider) {
      throw new Error('No AI provider is set for this site (Admin → Chriss → Settings).');
    }
    if (provider.free) {
      // Chriss base: as a job of the relay, like the chat.
      const { data } = await this.request(provider, {
        messages: input.messages,
        ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      });
      return generated(data, provider.model);
    }
    const send = (temperature: number | undefined) =>
      reach(provider.baseUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: input.model || provider.model,
          messages: input.messages,
          ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
          ...(temperature !== undefined ? { temperature } : {}),
        }),
        signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
      });
    let response = await send(input.temperature);
    let text = await response.text();
    // Some models refuse a temperature (e.g. the latest Claude models): asked again without it.
    if (response.status === 400 && input.temperature !== undefined && /temperature/i.test(text)) {
      response = await send(undefined);
      text = await response.text();
    }
    if (!response.ok) {
      throw providerFailure(response.status, text, provider.baseUrl);
    }
    return generated(JSON.parse(text) as ChatAnswer, input.model || provider.model);
  }

  /** A short question to the saved provider (Admin → Chriss → Test the connection). */
  /**
   * The models the provider lists (`GET <address>/models`, as OpenAI,
   * Anthropic, OpenRouter and Ollama answer it). The saved key is sent only
   * to the saved address, never to another one typed in the form.
   */
  async models(siteId: string, input: AiModelsRequest): Promise<string[]> {
    const saved = await this.load(siteId);
    const baseUrl = (input.baseUrl ?? saved?.baseUrl ?? '').replace(/\/+$/, '');
    if (!baseUrl) throw new Error('Enter the API address first.');
    const apiKey = input.apiKey || (saved && saved.baseUrl === baseUrl ? saved.apiKey : null);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/models`, {
        headers: {
          accept: 'application/json',
          ...(apiKey
            ? {
                authorization: `Bearer ${apiKey}`,
                // Anthropic's own header, ignored by the others.
                ...(/(^|\.)anthropic\.com$/i.test(new URL(baseUrl).hostname)
                  ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
                  : {}),
              }
            : {}),
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      const why =
        (error as Error).name === 'TimeoutError'
          ? 'it did not answer in time'
          : (error as Error).message;
      throw new Error(
        `The AI provider could not be reached at ${baseUrl} (${why}): check the address.`,
        {
          cause: error,
        },
      );
    }
    const text = await response.text();
    if (!response.ok) throw providerFailure(response.status, text, baseUrl);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('The AI provider did not list its models.');
    }
    const list =
      (data as { data?: unknown; models?: unknown }).data ?? (data as { models?: unknown }).models;
    const ids = Array.isArray(list)
      ? list
          .map((m) =>
            m && typeof m === 'object'
              ? ((m as { id?: unknown; name?: unknown }).id ?? (m as { name?: unknown }).name)
              : m,
          )
          .filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200)
      : [];
    if (ids.length === 0) throw new Error('The AI provider did not list its models.');
    return [...new Set(ids)].sort((a, b) => a.localeCompare(b)).slice(0, 1000);
  }

  async test(siteId: string): Promise<{ ok: true; model: string; answer: string }> {
    const { text, model } = await this.generate(siteId, {
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
      maxTokens: 16,
    });
    return { ok: true, model, answer: text.trim().slice(0, 100) };
  }

  /**
   * One round with tools for a plugin (`ctx.ai.chat`, plugin API 1.79): the
   * messages and tools, checked by the plugin context, to the site's
   * provider; its answer message back.
   */
  async round(siteId: string, input: AiChatInput): Promise<AiChatResult> {
    const provider = await this.load(siteId);
    if (!provider) {
      throw new Error('No AI provider is set for this site (Admin → Chriss → Settings).');
    }
    const { data } = await this.request(
      provider,
      {
        messages: input.messages,
        ...(input.tools?.length ? { tools: input.tools } : {}),
        ...(input.tools?.length && input.toolChoice ? { tool_choice: input.toolChoice } : {}),
        ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      },
      { timeoutMs: ROUND_TIMEOUT_MS },
    );
    const choice = data.choices?.[0];
    const message = choice?.message;
    if (!message) throw new Error('The AI provider gave no answer.');
    const calls = (Array.isArray(message.tool_calls) ? message.tool_calls : []).filter(
      (c) => c && typeof c.id === 'string' && typeof c.function?.name === 'string',
    );
    return {
      message: {
        role: 'assistant',
        content: typeof message.content === 'string' ? message.content : null,
        ...(calls.length > 0
          ? {
              tool_calls: calls.map((c) => ({
                id: c.id,
                type: 'function' as const,
                function: {
                  name: c.function.name,
                  arguments:
                    typeof c.function.arguments === 'string'
                      ? c.function.arguments
                      : JSON.stringify(c.function.arguments ?? {}),
                },
              })),
            }
          : {}),
      },
      ...(typeof choice.finish_reason === 'string' && choice.finish_reason
        ? { finishReason: choice.finish_reason }
        : {}),
      model: data.model ?? provider.model,
      usage: data.usage
        ? { input: data.usage.prompt_tokens ?? 0, output: data.usage.completion_tokens ?? 0 }
        : null,
    };
  }

  private async request(
    provider: Provider,
    body: Record<string, unknown>,
    options: { timeoutMs?: number; onQueue?: (position: number) => void } = {},
  ): Promise<{ data: ChatAnswer; quota: FreeAiQuota | null }> {
    if (provider.free) return this.requestJob(provider, body, options.onQueue);
    const response = await reach(provider.baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: provider.model, ...body }),
      signal: AbortSignal.timeout(options.timeoutMs ?? PROVIDER_TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) {
      throw providerFailure(response.status, text, provider.baseUrl);
    }
    let data: ChatAnswer;
    try {
      data = JSON.parse(text) as ChatAnswer;
    } catch {
      throw new Error('The AI provider gave no answer.');
    }
    return { data, quota: quotaOf(response.headers) };
  }

  /**
   * Chriss base: the request as a job of the relay (`POST …/chat/jobs`,
   * answered at once), then its state every couple of seconds
   * (`GET …/chat/jobs/:id`) until the answer, for five minutes at most.
   * No request lasts long, whatever proxy stands in front of the relay.
   */
  private async requestJob(
    provider: Provider,
    body: Record<string, unknown>,
    onQueue?: (position: number) => void,
  ): Promise<{ data: ChatAnswer; quota: FreeAiQuota | null }> {
    const deadline = Date.now() + FREE_JOB_MS;
    const headers = {
      accept: 'application/json',
      'user-agent': relayUserAgent(),
      ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
    };
    const late = () => new Error('The free service did not answer in time: try again in a moment.');
    let lastPosition: number | null = null;
    /** The place in the queue, said when it changes. */
    const place = (job: JobAnswer) => {
      // 0: its turn now, nobody ahead.
      if (job.status !== 'queued' || typeof job.position !== 'number' || job.position < 1) return;
      if (job.position === lastPosition) return;
      lastPosition = job.position;
      onQueue?.(job.position);
    };

    // The submission; while another request of this site is answered, again in a moment.
    let job: JobAnswer;
    for (;;) {
      let response: Response;
      try {
        response = await fetch(`${provider.baseUrl}/chat/jobs`, {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({ model: provider.model, ...body }),
          signal: AbortSignal.timeout(FREE_REQUEST_MS),
          redirect: 'error',
        });
      } catch (error) {
        throw new Error('The free service could not be reached: try again in a moment.', {
          cause: error,
        });
      }
      const text = await response.text();
      if (response.status === 409 && Date.now() + FREE_POLL_MS < deadline) {
        await pause(FREE_POLL_MS);
        continue;
      }
      if (!response.ok) throw providerFailure(response.status, text, provider.baseUrl);
      try {
        job = JSON.parse(text) as JobAnswer;
      } catch {
        throw new Error('The AI provider gave no answer.');
      }
      if (typeof job.id !== 'string' || !job.id) throw new Error('The AI provider gave no answer.');
      break;
    }
    const id = job.id as string;
    let quota = jobQuota(job);
    place(job);

    let wait = FREE_FIRST_POLL_MS;
    while (job.status !== 'done' && job.status !== 'error') {
      if (Date.now() + wait > deadline) throw late();
      await pause(wait);
      wait = FREE_POLL_MS;
      let response: Response;
      try {
        response = await fetch(`${provider.baseUrl}/chat/jobs/${encodeURIComponent(id)}`, {
          headers,
          signal: AbortSignal.timeout(FREE_REQUEST_MS),
          redirect: 'error',
        });
      } catch {
        // A poll lost on the way: the next one asks again.
        continue;
      }
      const text = await response.text();
      // Busy for a moment (a proxy, a restart): asked again.
      if (response.status >= 500 || response.status === 429) continue;
      if (response.status === 404) throw new Error('The free service lost the answer: ask again.');
      if (!response.ok) throw providerFailure(response.status, text, provider.baseUrl);
      try {
        job = JSON.parse(text) as JobAnswer;
      } catch {
        continue;
      }
      quota = jobQuota(job) ?? quota;
      place(job);
    }
    if (job.status === 'error') {
      const why = typeof job.error?.error === 'string' ? job.error.error : 'upstream_error';
      const message =
        typeof job.error?.message === 'string' && job.error.message
          ? job.error.message
          : 'The free service could not answer: try again later.';
      throw providerFailure(
        why === 'busy' || why === 'not_configured' ? 503 : 502,
        JSON.stringify({ error: why, detail: message }),
        provider.baseUrl,
      );
    }
    if (!job.result || typeof job.result !== 'object')
      throw new Error('The AI provider gave no answer.');
    return { data: job.result, quota };
  }

  private async complete(
    provider: Provider,
    messages: AssistantChatMessage[] | Record<string, unknown>[],
    tools: unknown[],
    onQueue?: (position: number) => void,
  ): Promise<{
    message: { content?: string | null; tool_calls?: ToolCall[] };
    quota: FreeAiQuota | null;
  }> {
    const { data, quota } = await this.request(
      provider,
      {
        messages,
        tools,
        ...(provider.free ? { max_tokens: FREE_MAX_TOKENS } : {}),
      },
      { onQueue },
    );
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error('The AI provider gave no answer.');
    return { message, quota };
  }
}
