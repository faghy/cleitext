import { createHash } from 'node:crypto';
import type { AiChatInput, PluginContext } from '@cleitext/plugin-sdk';
import { describe, expect, it } from 'vitest';
import {
  bearerOf,
  changeSettings,
  DEFAULTS,
  parseChat,
  resetOf,
  settingsOf,
  siteOriginOf,
} from '../src/limits';
import { setupAiRelay } from '../src/server';

type Handler = (request: Record<string, unknown>) => Promise<{
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}>;

const SECRET = 'a'.repeat(43);
const ORIGIN = 'https://sito-uno.it';

/** The relay against a fake context; `provider` answers `ctx.ai.chat`. */
function setUp(
  provider: (input: AiChatInput) => Promise<unknown> = async () => ({
    message: { role: 'assistant', content: 'Ciao!' },
    finishReason: 'stop',
    model: 'qwen3:4b-instruct',
    usage: { input: 120, output: 3 },
  }),
) {
  const storage = new Map<string, unknown>();
  const routes = new Map<string, Handler & { timeout?: string }>();
  const fetched: string[] = [];
  /** What each origin shows at /.well-known/cleitext-ai-relay. */
  const challenges = new Map<string, string>();
  const asked: AiChatInput[] = [];
  const logs: string[] = [];
  let clock = Date.UTC(2026, 10, 21, 10, 0, 0);
  const ctx = {
    access: { defineCapability: () => undefined },
    storage: {
      get: async (_s: string, key: string) => structuredClone(storage.get(key) ?? null),
      set: async (_s: string, key: string, value: unknown) =>
        void storage.set(key, structuredClone(value)),
    },
    http: {
      send: async (request: { url: string }) => {
        fetched.push(request.url);
        const origin = new URL(request.url).origin;
        const challenge = challenges.get(origin);
        return challenge
          ? { status: 200, type: 'application/json', text: JSON.stringify({ challenge }) }
          : { status: 404, type: 'application/json', text: '{}' };
      },
    },
    ai: {
      chat: async (_siteId: string, input: AiChatInput) => {
        asked.push(input);
        return provider(input);
      },
    },
    routes: {
      api: (route: { method: string; path: string; handler: Handler; timeout?: string }) =>
        void routes.set(
          `${route.method} ${route.path}`,
          Object.assign(route.handler, { timeout: route.timeout }),
        ),
    },
    log: {
      warn: (m: string) => void logs.push(m),
      error: (m: string) => void logs.push(m),
      info: (m: string) => void logs.push(m),
    },
  } as unknown as PluginContext;
  setupAiRelay(ctx, { now: () => clock });
  const call = (
    key: string,
    body: unknown = {},
    headers: Record<string, string> = {},
    ip = '203.0.113.5',
    query: Record<string, string> = {},
  ) => routes.get(key)!({ siteId: 's', body, params: {}, headers, ip, query });
  /** Registers a site the way its core does: shows the hash, posts the secret. */
  const register = async (origin = ORIGIN, ip?: string) => {
    challenges.set(origin, createHash('sha256').update(SECRET).digest('hex'));
    const res = await call('POST /register', { origin, secret: SECRET }, {}, ip);
    challenges.delete(origin);
    return res;
  };
  const ask = (key: string, body: unknown, ip?: string) =>
    call('POST /v1/chat/completions', body, { authorization: `Bearer ${key}` }, ip);
  return {
    call,
    register,
    ask,
    routes,
    storage,
    fetched,
    challenges,
    asked,
    logs,
    advance: (ms: number) => void (clock += ms),
  };
}

const question = (text = 'Scrivi una pagina sugli orari.') => ({
  model: 'whatever',
  messages: [
    { role: 'system', content: 'You are Chriss.' },
    { role: 'user', content: text },
  ],
  tools: [{ type: 'function', function: { name: 'get_site', parameters: { type: 'object' } } }],
});

const followUp = {
  messages: [
    { role: 'user', content: 'Ciao' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_site', arguments: '{}' } }],
    },
    { role: 'tool', tool_call_id: 'c1', content: '{"name":"Sito"}' },
  ],
};

describe('rules', () => {
  it('accepts only public https origins', () => {
    expect(siteOriginOf('https://sito-uno.it')).toBe('https://sito-uno.it');
    expect(siteOriginOf('https://sito-uno.it/')).toBe('https://sito-uno.it');
    expect(siteOriginOf('https://www.sito.it:8443')).toBe('https://www.sito.it:8443');
    for (const bad of [
      'http://sito-uno.it',
      'https://localhost',
      'https://127.0.0.1',
      'https://[::1]',
      'https://sito.it/path',
      'https://user:pw@sito.it',
      'https://intranet',
      'https://site.test',
      42,
    ])
      expect(siteOriginOf(bad)).toBeNull();
  });

  it('reads the relay key only from a Bearer header', () => {
    expect(bearerOf(`Bearer cxai_${'x'.repeat(43)}`)).toBe(`cxai_${'x'.repeat(43)}`);
    expect(bearerOf('Bearer cx_123')).toBeNull();
    expect(bearerOf(undefined)).toBeNull();
  });

  it('keeps the settings within their bounds', () => {
    expect(settingsOf(null)).toEqual(DEFAULTS);
    expect(settingsOf({ siteDaily: 5, globalDaily: -1, enabled: false })).toMatchObject({
      siteDaily: 5,
      globalDaily: DEFAULTS.globalDaily,
      enabled: false,
    });
    expect(changeSettings(DEFAULTS, { siteDaily: 0 })).toMatch(/^siteDaily/);
    expect(changeSettings(DEFAULTS, { siteDaily: '30' })).toMatchObject({ siteDaily: 30 });
  });

  it('checks a chat request and caps the answer', () => {
    const parsed = parseChat({ ...question(), max_tokens: 5000 }, DEFAULTS);
    expect(parsed).toMatchObject({ maxTokens: 1024, question: true });
    expect(parseChat(followUp, DEFAULTS)).toMatchObject({ question: false });
    expect(parseChat({ ...question(), stream: true }, DEFAULTS)).toMatchObject({
      error: 'invalid_request',
    });
    expect(parseChat({ messages: [{ role: 'boss', content: 'x' }] }, DEFAULTS)).toMatchObject({
      error: 'invalid_request',
    });
    expect(parseChat(question('x'.repeat(DEFAULTS.maxPromptChars)), DEFAULTS)).toMatchObject({
      error: 'prompt_too_long',
    });
  });

  it('starts the counters again at midnight UTC', () => {
    expect(new Date(resetOf(Date.UTC(2026, 10, 21, 23, 59))).toISOString()).toBe(
      '2026-11-22T00:00:00.000Z',
    );
  });
});

describe('registration', () => {
  it('gives a key to a site that proves its address, keeping only its hash', async () => {
    const relay = setUp();
    const res = await relay.register();
    expect(res.status).toBe(200);
    const body = res.body as { key: string; model: string; limit: number };
    expect(body).toMatchObject({ model: 'chriss-base', limit: 20 });
    expect(body.key).toMatch(/^cxai_[\w-]{43}$/);
    expect(relay.fetched).toEqual(['https://sito-uno.it/.well-known/cleitext-ai-relay']);
    const stored = JSON.stringify(relay.storage.get('sites'));
    expect(stored).not.toContain(body.key);
    expect(stored).toContain(createHash('sha256').update(body.key).digest('hex'));
    expect(relay.routes.get('POST /register')!.timeout).toBe('job');
  });

  it('refuses a site that does not show the hash of its secret', async () => {
    const relay = setUp();
    // Someone who read the challenge cannot use it: they lack the secret.
    relay.challenges.set(ORIGIN, createHash('sha256').update('b'.repeat(43)).digest('hex'));
    const res = await relay.call('POST /register', { origin: ORIGIN, secret: SECRET });
    expect(res).toMatchObject({ status: 403, body: { error: 'not_verified' } });
    relay.challenges.clear();
    expect((await relay.call('POST /register', { origin: ORIGIN, secret: SECRET })).status).toBe(
      403,
    );
    expect(
      (await relay.call('POST /register', { origin: 'http://sito.it', secret: SECRET })).body,
    ).toMatchObject({ error: 'invalid_origin' });
  });

  it('limits registrations by address', async () => {
    const relay = setUp();
    for (let i = 0; i < 10; i++)
      expect((await relay.register(`https://s${i}.it`)).status).toBe(200);
    expect((await relay.register('https://s10.it')).status).toBe(429);
    expect((await relay.register('https://s10.it', '198.51.100.9')).status).toBe(200);
  });
});

describe('chat completions', () => {
  it('answers in the OpenAI format with the quota headers, without storing texts', async () => {
    const relay = setUp();
    const { key } = (await relay.register()).body as { key: string };
    const res = await relay.ask(key, question());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: 'chat.completion',
      model: 'chriss-base',
      choices: [
        { index: 0, message: { role: 'assistant', content: 'Ciao!' }, finish_reason: 'stop' },
      ],
      usage: { prompt_tokens: 120, completion_tokens: 3, total_tokens: 123 },
    });
    expect(res.headers).toMatchObject({
      'x-ratelimit-limit': '20',
      'x-ratelimit-remaining': '19',
      'x-ratelimit-reset': String(Date.UTC(2026, 10, 22) / 1000),
    });
    // The provider got the messages and the tools, the answer capped.
    expect(relay.asked[0]).toMatchObject({ maxTokens: 1024, tools: [{ type: 'function' }] });
    expect(relay.asked[0]!.messages).toHaveLength(2);
    expect(relay.routes.get('POST /v1/chat/completions')!.timeout).toBe('job');
    const everything = JSON.stringify([...relay.storage.values()]) + relay.logs.join('\n');
    expect(everything).not.toContain('orari');
  });

  it('passes tool calls through', async () => {
    const relay = setUp(async () => ({
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'c9', type: 'function', function: { name: 'get_site', arguments: '{}' } },
        ],
      },
      model: 'm',
      usage: null,
    }));
    const { key } = (await relay.register()).body as { key: string };
    const res = await relay.ask(key, question());
    expect(res.body).toMatchObject({
      choices: [{ message: { tool_calls: [{ id: 'c9' }] }, finish_reason: 'tool_calls' }],
    });
  });

  it('refuses requests without a valid key', async () => {
    const relay = setUp();
    await relay.register();
    expect((await relay.ask(`cxai_${'z'.repeat(43)}`, question())).body).toMatchObject({
      error: 'invalid_key',
    });
    expect((await relay.call('POST /v1/chat/completions', question())).status).toBe(401);
  });

  it('counts questions per site per day, with follow-ups within the steps', async () => {
    const relay = setUp();
    await relay.call('PUT /admin/settings', {
      siteDaily: 2,
      stepsPerQuestion: 2,
      ipPerMinute: 100,
    });
    const { key } = (await relay.register()).body as { key: string };
    expect((await relay.ask(key, question())).status).toBe(200);
    expect((await relay.ask(key, followUp)).status).toBe(200);
    const second = await relay.ask(key, question());
    expect(second.headers!['x-ratelimit-remaining']).toBe('0');
    // No question left: 429 with the limit and when it starts again.
    const refused = await relay.ask(key, question());
    expect(refused).toMatchObject({
      status: 429,
      body: {
        error: 'quota_exceeded',
        limit: 2,
        resetAt: '2026-11-22T00:00:00.000Z',
        scope: 'site',
      },
    });
    // The follow-ups of the last question still work, within 2 × 2 requests.
    expect((await relay.ask(key, followUp)).status).toBe(200);
    expect((await relay.ask(key, followUp)).status).toBe(429);
    // Another site has its own allowance.
    const other = ((await relay.register('https://sito-due.it')).body as { key: string }).key;
    expect((await relay.ask(other, question())).status).toBe(200);
    // A new day.
    relay.advance(14 * 3600_000);
    expect((await relay.ask(key, question())).status).toBe(200);
    expect((await relay.call('GET /usage', {}, { authorization: `Bearer ${key}` })).body).toEqual({
      limit: 2,
      used: 1,
      remaining: 1,
      resetAt: '2026-11-23T00:00:00.000Z',
    });
  });

  it('has a cap for all sites and one per address', async () => {
    const relay = setUp();
    await relay.call('PUT /admin/settings', { globalDaily: 1 });
    const { key } = (await relay.register()).body as { key: string };
    expect((await relay.ask(key, question())).status).toBe(200);
    expect((await relay.ask(key, question())).body).toMatchObject({
      error: 'quota_exceeded',
      scope: 'global',
    });
    await relay.call('PUT /admin/settings', { globalDaily: 1000, ipPerMinute: 1 });
    const res = await relay.ask(key, question(), '198.51.100.1');
    expect(res.status).toBe(200);
    expect((await relay.ask(key, question(), '198.51.100.1')).status).toBe(429);
  });

  it('gives the request back when the provider fails, logging no text', async () => {
    const relay = setUp(async () => {
      throw new Error('The AI provider answered 500: model crashed reading "orari".');
    });
    const { key } = (await relay.register()).body as { key: string };
    expect((await relay.ask(key, question())).body).toMatchObject({ error: 'upstream_error' });
    expect(relay.logs.join('\n')).toContain('answered 500');
    expect(relay.logs.join('\n')).not.toContain('orari');
    const usage = (await relay.call('GET /usage', {}, { authorization: `Bearer ${key}` })).body;
    expect(usage).toMatchObject({ used: 0, remaining: 20 });
  });

  it('queues requests beyond the parallel ones, and answers 503 when the queue is full', async () => {
    const pending: (() => void)[] = [];
    const relay = setUp(
      () =>
        new Promise((resolve) => {
          pending.push(() =>
            resolve({ message: { role: 'assistant', content: 'ok' }, model: 'm', usage: null }),
          );
        }),
    );
    await relay.call('PUT /admin/settings', { concurrency: 1, queue: 1, ipPerMinute: 100 });
    const { key } = (await relay.register()).body as { key: string };
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const first = relay.ask(key, question());
    await tick();
    const second = relay.ask(key, question());
    await tick();
    // One runs, one waits: the third has no room.
    expect(pending).toHaveLength(1);
    const third = await relay.ask(key, question());
    expect(third).toMatchObject({ status: 503, body: { error: 'busy' } });
    expect(third.headers!['retry-after']).toBe('30');
    pending[0]!();
    expect((await first).status).toBe(200);
    await tick();
    // The waiting one got the turn.
    expect(pending).toHaveLength(2);
    pending[1]!();
    expect((await second).status).toBe(200);
    // The refused one was not counted.
    const usage = (await relay.call('GET /usage', {}, { authorization: `Bearer ${key}` })).body;
    expect(usage).toMatchObject({ used: 2 });
    await relay.call('PUT /admin/settings', { enabled: false });
    expect((await relay.ask(key, question())).body).toMatchObject({ error: 'disabled' });
    expect((await relay.register('https://sito-tre.it')).status).toBe(503);
  });

  it('lists the model', async () => {
    const relay = setUp();
    expect((await relay.call('GET /v1/models')).body).toEqual({
      object: 'list',
      data: [{ id: 'chriss-base', object: 'model', owned_by: 'cleitext' }],
    });
  });
});

describe('admin', () => {
  it('lists the sites with today’s use, and revokes them', async () => {
    const relay = setUp();
    const { key } = (await relay.register()).body as { key: string };
    await relay.ask(key, question());
    const view = (await relay.call('GET /admin')).body as {
      sites: { origin: string; questions: number; requests: number; revoked: boolean }[];
      today: { total: number };
      chat: boolean;
    };
    expect(view.chat).toBe(true);
    expect(view.today.total).toBe(1);
    expect(view.sites).toMatchObject([
      { origin: ORIGIN, questions: 1, requests: 1, revoked: false },
    ]);

    await relay.call('POST /admin/sites/revoke', { origin: ORIGIN });
    expect((await relay.ask(key, question())).body).toMatchObject({ error: 'revoked' });
    expect((await relay.register()).body).toMatchObject({ error: 'revoked' });
    await relay.call('POST /admin/sites/revoke', { origin: ORIGIN, revoked: false });
    expect((await relay.ask(key, question())).status).toBe(200);

    await relay.call('DELETE /admin/sites', {}, {}, undefined, { origin: ORIGIN });
    expect((await relay.ask(key, question())).status).toBe(401);
    expect((await relay.call('PUT /admin/settings', { siteDaily: 'x' })).status).toBe(400);
  });
});
