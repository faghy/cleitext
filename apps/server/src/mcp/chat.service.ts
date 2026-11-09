import { settings, withContext, type DatabaseClient, type SiteTransaction } from '@cleitext/db';
import type {
  AiProviderRequest,
  AiProviderView,
  AssistantChatEvent,
  AssistantChatMessage,
} from '@cleitext/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { seal, unseal } from '../common/secrets.js';
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
/** Rounds of tool calls in one answer, so a confused model cannot loop forever. */
const MAX_ROUNDS = 16;
/** Tool results kept in the conversation: enough for blocks, not whole sites. */
const MAX_TOOL_TEXT = 12_000;
/** The guide (rules, editor, plugins, theme, patterns) is read whole. */
const MAX_GUIDE_TEXT = 40_000;

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
 * An error of the provider, with its own message and, for the usual
 * mistakes, what to check: a wrong address answers 404, a wrong key 401.
 */
export function providerFailure(status: number, text: string, baseUrl: string): Error {
  let detail = text.slice(0, 500);
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string };
    detail = typeof parsed.error === 'string' ? parsed.error : (parsed.error?.message ?? detail);
  } catch {
    // Not JSON: the start of the body is shown.
  }
  const hint =
    status === 404 && !/model/i.test(detail)
      ? ` The address ${baseUrl} has no chat completions API: use the API's base address, usually ending in /v1 (e.g. https://api.openai.com/v1, https://api.anthropic.com/v1, https://openrouter.ai/api/v1).`
      : status === 401 || status === 403
        ? ' Check the API key.'
        : /model/i.test(detail)
          ? ' Check the model name: it must be one the provider lists (e.g. gpt-5, claude-sonnet-5-5).'
          : '';
  const said = detail.trim().replace(/\.$/, '') || 'no details';
  return new Error(`The AI provider answered ${status}: ${said}.${hint}`);
}

interface Provider {
  baseUrl: string;
  model: string;
  apiKey: string | null;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

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
    };
  }

  async configured(siteId: string): Promise<boolean> {
    return (await this.load(siteId)) !== null;
  }

  async view(siteId: string): Promise<AiProviderView | null> {
    const provider = await this.load(siteId);
    return provider
      ? { baseUrl: provider.baseUrl, model: provider.model, hasKey: provider.apiKey !== null }
      : null;
  }

  async save(siteId: string, userId: string, input: AiProviderRequest, ip: string): Promise<void> {
    const values: Record<string, unknown> = {
      baseUrl: input.baseUrl.replace(/\/+$/, ''),
      model: input.model,
    };
    // The key is kept when omitted, removed with an empty string.
    if (input.apiKey !== undefined) {
      values.apiKey = input.apiKey ? seal(this.config.appSecret, input.apiKey) : null;
    }
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
    const available = await siteTools(ctx).catch(() => TOOLS);
    const tools = toolList(ctx.scopes, available).map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
    }));
    const system = `You are Chriss, the assistant of Cleitext. If asked who you are, say that you are
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
        reply = await this.complete(
          provider,
          [{ role: 'system', content: system }, ...messages],
          tools,
        );
      } catch (error) {
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
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content:
            result.text.length > (name === 'get_block_guide' ? MAX_GUIDE_TEXT : MAX_TOOL_TEXT)
              ? `${result.text.slice(0, name === 'get_block_guide' ? MAX_GUIDE_TEXT : MAX_TOOL_TEXT)}\n… (cut)`
              : result.text,
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
  ): Promise<{ text: string; model: string; usage: { input: number; output: number } | null }> {
    const provider = await this.load(siteId);
    if (!provider) {
      throw new Error('No AI provider is set for this site (Admin → Chriss → Settings).');
    }
    const response = await reach(provider.baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: input.model || provider.model,
        messages: input.messages,
        ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      }),
      signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) {
      throw providerFailure(response.status, text, provider.baseUrl);
    }
    const data = JSON.parse(text) as {
      model?: string;
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('The AI provider gave no answer.');
    return {
      text: content,
      model: data.model ?? (input.model || provider.model),
      usage: data.usage
        ? { input: data.usage.prompt_tokens ?? 0, output: data.usage.completion_tokens ?? 0 }
        : null,
    };
  }

  /** A short question to the saved provider (Admin → Chriss → Test the connection). */
  async test(siteId: string): Promise<{ ok: true; model: string; answer: string }> {
    const { text, model } = await this.generate(siteId, {
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
      maxTokens: 16,
    });
    return { ok: true, model, answer: text.trim().slice(0, 100) };
  }

  private async complete(
    provider: Provider,
    messages: AssistantChatMessage[] | Record<string, unknown>[],
    tools: unknown[],
  ): Promise<{ content?: string | null; tool_calls?: ToolCall[] }> {
    const response = await reach(provider.baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: provider.model, messages, tools }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) {
      throw providerFailure(response.status, text, provider.baseUrl);
    }
    const data = JSON.parse(text) as {
      choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
    };
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error('The AI provider gave no answer.');
    return message;
  }
}
