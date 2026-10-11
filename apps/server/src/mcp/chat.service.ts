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
import { ASSISTANT_INSTRUCTIONS, callTool, toolList, type ToolContext } from './tools.js';

/**
 * The chat of Admin → AI assistants (RF-AI-03): the site's own AI provider
 * (any OpenAI-compatible chat completions API) with the MCP tools, run as
 * the signed-in user. The provider and its key are set by a super admin.
 */

export const AI_NAMESPACE = 'ai';
/** Rounds of tool calls in one answer, so a confused model cannot loop forever. */
const MAX_ROUNDS = 16;
/** Tool results kept in the conversation: enough for blocks, not whole sites. */
const MAX_TOOL_TEXT = 12_000;
const PROVIDER_TIMEOUT_MS = 180_000;

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
  ): Promise<void> {
    const provider = await this.load(siteId);
    if (!provider) {
      emit({ type: 'error', message: 'No AI provider is set up for the chat.' });
      return;
    }
    const tools = toolList(ctx.scopes).map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
    }));
    const system = `${ASSISTANT_INSTRUCTIONS}

You are working inside the admin of the site, with ${person.name}. Answer in their language
(${person.locale}) unless they write in another one, briefly. When you create or change
something, give the links to edit it and to preview it.${
      ctx.scopes.includes('publish')
        ? ''
        : '\nThis conversation may not publish: say so if asked, and leave drafts.'
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
            result.text.length > MAX_TOOL_TEXT
              ? `${result.text.slice(0, MAX_TOOL_TEXT)}\n… (cut)`
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

  private async complete(
    provider: Provider,
    messages: AssistantChatMessage[] | Record<string, unknown>[],
    tools: unknown[],
  ): Promise<{ content?: string | null; tool_calls?: ToolCall[] }> {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
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
      let detail = text.slice(0, 500);
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string } | string };
        detail =
          typeof parsed.error === 'string' ? parsed.error : (parsed.error?.message ?? detail);
      } catch {
        // Not JSON: the start of the body is shown.
      }
      throw new Error(`The AI provider answered ${response.status}: ${detail}`);
    }
    const data = JSON.parse(text) as {
      choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
    };
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error('The AI provider gave no answer.');
    return message;
  }
}
