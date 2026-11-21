/**
 * The rules of AI Relay without the plugin context: settings, the checks of
 * the requests, the day the counters belong to.
 */
import type { AiChatInput, AiChatMessage, AiChatTool } from '@cleitext/plugin-sdk';

/** The only model the relay offers, whatever the site asks for. */
export const MODEL = 'chriss-base';

export interface RelaySettings {
  /** Off: every request is answered 503 `disabled`. */
  enabled: boolean;
  /** Questions per site per day (a request whose last message is the person's). */
  siteDaily: number;
  /** Requests per question: the rounds with tool results after a question. */
  stepsPerQuestion: number;
  /** Requests per minute from one address. */
  ipPerMinute: number;
  /** Requests per day from every site together. */
  globalDaily: number;
  /** Tokens of an answer at most. */
  maxOutputTokens: number;
  /**
   * Characters of messages and tools together at most: about 6 000 tokens,
   * what a small model on a CPU reads in a couple of minutes.
   */
  maxPromptChars: number;
  /** Requests answered at the same time. */
  concurrency: number;
  /** Requests waiting for their turn (a minute at most); more get 503 `busy`. */
  queue: number;
}

export const DEFAULTS: RelaySettings = {
  enabled: true,
  siteDaily: 20,
  stepsPerQuestion: 8,
  ipPerMinute: 10,
  globalDaily: 2000,
  maxOutputTokens: 1024,
  maxPromptChars: 22_000,
  concurrency: 1,
  queue: 5,
};

/** The bounds of each number setting. */
export const BOUNDS: Record<Exclude<keyof RelaySettings, 'enabled'>, [number, number]> = {
  siteDaily: [1, 10_000],
  stepsPerQuestion: [1, 50],
  ipPerMinute: [1, 10_000],
  globalDaily: [1, 1_000_000],
  maxOutputTokens: [16, 8192],
  maxPromptChars: [1000, 1_000_000],
  concurrency: [1, 64],
  queue: [0, 100],
};

/** Stored settings over the defaults, each within its bounds. */
export function settingsOf(stored: unknown): RelaySettings {
  const raw = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const out: RelaySettings = { ...DEFAULTS };
  if (typeof raw.enabled === 'boolean') out.enabled = raw.enabled;
  for (const [key, [min, max]] of Object.entries(BOUNDS) as [
    keyof typeof BOUNDS,
    [number, number],
  ][]) {
    const value = raw[key];
    if (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max)
      out[key] = value;
  }
  return out;
}

/** A change of the settings from the admin: the new settings, or what is wrong. */
export function changeSettings(current: RelaySettings, input: unknown): RelaySettings | string {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const next = { ...current };
  if (raw.enabled !== undefined) {
    if (typeof raw.enabled !== 'boolean') return 'enabled: true or false.';
    next.enabled = raw.enabled;
  }
  for (const [key, [min, max]] of Object.entries(BOUNDS) as [
    keyof typeof BOUNDS,
    [number, number],
  ][]) {
    if (raw[key] === undefined) continue;
    const value = Number(raw[key]);
    if (!Number.isInteger(value) || value < min || value > max)
      return `${key}: a whole number from ${min} to ${max}.`;
    next[key] = value;
  }
  return next;
}

/** The UTC day of a time, e.g. `2026-11-21`: the counters start again each day. */
export function dayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** When the day of `now` ends (UTC midnight), in milliseconds. */
export function resetOf(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

/**
 * The origin a site registers with: https, a host name (no address, no
 * localhost), no path. Null when it is not one.
 */
export function siteOriginOf(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 300) return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.startsWith('[')) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|test|example|invalid)$/.test(host)) return null;
  return url.origin;
}

/** The relay key of a site from `Authorization: Bearer …`; null without one. */
export function bearerOf(header: string | undefined): string | null {
  const match = /^Bearer\s+(cxai_[A-Za-z0-9_-]{20,100})$/.exec(header?.trim() ?? '');
  return match ? match[1]! : null;
}

export type ChatRequest = AiChatInput & {
  /** The person asked something (last message): counted as a question. */
  question: boolean;
};

/**
 * Checks a chat completions request: messages and tools in the OpenAI
 * format, no streaming, within the size limit. The request or what is wrong
 * (`too_large` when only the size is).
 */
export function parseChat(
  input: unknown,
  settings: RelaySettings,
): ChatRequest | { error: 'invalid_request' | 'prompt_too_long'; detail: string } {
  const bad = (detail: string) => ({ error: 'invalid_request' as const, detail });
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  if (raw.stream === true) return bad('stream: answers are not streamed; leave it out.');
  if (!Array.isArray(raw.messages) || raw.messages.length === 0 || raw.messages.length > 400)
    return bad('messages: 1 to 400 messages.');
  const messages: AiChatMessage[] = [];
  for (const m of raw.messages as Record<string, unknown>[]) {
    if (!m || typeof m !== 'object') return bad('messages: not valid.');
    if (m.role === 'system' || m.role === 'user') {
      if (typeof m.content !== 'string') return bad(`messages: a ${m.role} message needs a text.`);
      messages.push({ role: m.role, content: m.content });
    } else if (m.role === 'assistant') {
      if (m.content != null && typeof m.content !== 'string')
        return bad('messages: the content of an assistant message is a text.');
      const calls = m.tool_calls;
      if (calls !== undefined && !Array.isArray(calls))
        return bad('messages: tool_calls is a list.');
      messages.push({
        role: 'assistant',
        content: (m.content as string | null | undefined) ?? null,
        ...(Array.isArray(calls) && calls.length > 0
          ? {
              tool_calls: calls as NonNullable<
                Extract<AiChatMessage, { role: 'assistant' }>['tool_calls']
              >,
            }
          : {}),
      });
    } else if (m.role === 'tool') {
      if (typeof m.tool_call_id !== 'string' || typeof m.content !== 'string')
        return bad('messages: a tool message needs tool_call_id and a text.');
      messages.push({ role: 'tool', tool_call_id: m.tool_call_id, content: m.content });
    } else {
      return bad('messages: role is system, user, assistant or tool.');
    }
  }
  let tools: AiChatTool[] | undefined;
  if (raw.tools !== undefined) {
    if (!Array.isArray(raw.tools) || raw.tools.length > 128) return bad('tools: up to 128 tools.');
    tools = [];
    for (const t of raw.tools as Record<string, unknown>[]) {
      const fn = (t?.function ?? null) as Record<string, unknown> | null;
      if (t?.type !== 'function' || !fn || typeof fn.name !== 'string')
        return bad('tools: functions with a name.');
      tools.push(t as unknown as AiChatTool);
    }
  }
  const size = JSON.stringify(messages).length + (tools ? JSON.stringify(tools).length : 0);
  if (size > settings.maxPromptChars)
    return {
      error: 'prompt_too_long',
      detail: `The request is too long for the free service (${settings.maxPromptChars} characters at most).`,
    };
  const asked = Number(raw.max_completion_tokens ?? raw.max_tokens);
  const maxTokens =
    Number.isFinite(asked) && asked > 0
      ? Math.min(Math.round(asked), settings.maxOutputTokens)
      : settings.maxOutputTokens;
  const temperature = Number(raw.temperature);
  const choice = raw.tool_choice;
  return {
    messages,
    ...(tools && tools.length > 0 ? { tools } : {}),
    ...(choice === 'auto' || choice === 'none' || choice === 'required'
      ? { toolChoice: choice }
      : {}),
    maxTokens,
    ...(raw.temperature !== undefined && Number.isFinite(temperature)
      ? { temperature: Math.min(Math.max(temperature, 0), 2) }
      : {}),
    question: messages.at(-1)!.role === 'user',
  };
}

/** Counters in a sliding window, in memory (one server). */
export class Window {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly spanMs: number) {}

  /** Takes one from the key's allowance; false (and nothing taken) when it is used up. */
  take(key: string, limit: number, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.spanMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) {
      for (const [k, times] of this.hits) {
        if (!times.some((t) => now - t < this.spanMs)) this.hits.delete(k);
      }
    }
    return true;
  }
}
