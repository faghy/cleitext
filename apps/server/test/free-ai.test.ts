/**
 * Chriss base, the free AI (core 0.117): the site registers with the relay
 * (a fake one here) through /.well-known/cleitext-ai-relay, keeps the key as
 * its provider's, gets the reduced tools and the short prompt, sees the
 * requests left and the invitation when they are used up. Also `ctx.ai.chat`
 * (plugin API 1.79) and the webhook routes' `authorization` header.
 */
import { createHash, randomBytes } from 'node:crypto';
import { APP_REDIRECT_URI } from '@cleitext/shared';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appVersion } from '../src/common/version.js';
import { ChatService, FREE_TOOLS, trimForFree } from '../src/mcp/chat.service.js';
import { OAuthService } from '../src/mcp/oauth.service.js';
import { chatInput } from '../src/plugins/plugin-context.js';
import { routeRequest } from '../src/plugins/plugin-routes.js';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const KEY = `cxai_${'k'.repeat(43)}`;

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let root: TestClient;
let editor: TestClient;
let editorId: string;
let relay: Server;
let relayUrl: string;
/** What the relay received. */
const registered: { origin: string; challenge: unknown }[] = [];
const asked: { authorization?: string; body: Record<string, unknown> }[] = [];
/** Questions left on the fake relay. */
let remaining = 2;
/** `/usage` fails (the chat then learns of the quota from the answer). */
let usageFails = false;
/** Every request the relay got: path, user agent, how long it was held. */
const calls: { method: string; path: string; userAgent?: string; ms: number }[] = [];
/** The jobs of the fake relay: the states a poll walks through, the last the answer. */
const jobs = new Map<string, { states: Record<string, unknown>[] }>();
/** The states before the answer of the next job (the default: running once). */
let nextStates: Record<string, unknown>[] | null = null;
/** The next job fails upstream. */
let nextFails = false;

function events(body: string) {
  return body
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { type: string; [k: string]: unknown });
}

beforeAll(async () => {
  relay = createServer((req, res) => {
    let data = '';
    const started = Date.now();
    req.on('data', (chunk) => (data += chunk));
    req.on('end', async () => {
      const path = req.url?.replace(/^\/relay/, '');
      const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
        calls.push({
          method: req.method ?? '',
          path: path ?? '',
          ...(req.headers['user-agent'] ? { userAgent: req.headers['user-agent'] } : {}),
          ms: Date.now() - started,
        });
        res.writeHead(status, { 'content-type': 'application/json', ...headers });
        res.end(JSON.stringify(body));
      };
      if (req.method === 'POST' && path === '/register') {
        const body = JSON.parse(data) as { origin: string; secret: string };
        // What the real relay does over https: reads the site's challenge.
        const shown = await app.inject({
          method: 'GET',
          url: '/.well-known/cleitext-ai-relay',
          headers: { host: new URL(body.origin).host },
        });
        const challenge = shown.statusCode === 200 ? shown.json().challenge : null;
        registered.push({ origin: body.origin, challenge });
        if (challenge !== createHash('sha256').update(body.secret).digest('hex'))
          return json(403, { error: 'not_verified', detail: 'The site could not be verified.' });
        return json(200, { key: KEY, model: 'chriss-base', limit: 20 });
      }
      if (req.method === 'GET' && path === '/usage') {
        if (usageFails) return json(500, {});
        return json(200, {
          limit: 20,
          used: 20 - remaining,
          remaining,
          resetAt: '2026-11-22T00:00:00.000Z',
        });
      }
      /** The answer of a chat request: status, body, quota headers. */
      const answerOf = (body: Record<string, unknown>) => {
        asked.push({ authorization: req.headers.authorization, body });
        const messages = body.messages as { role: string; content?: string }[];
        const last = messages.at(-1)!;
        if (last.role === 'user') {
          if (remaining === 0)
            return {
              status: 429,
              body: {
                error: 'quota_exceeded',
                limit: 20,
                resetAt: '2026-11-22T00:00:00.000Z',
              } as Record<string, unknown>,
            };
          remaining--;
        }
        // A tool first when asked, then the text.
        if (last.role === 'user' && last.content === 'Tool please')
          return {
            status: 200,
            body: {
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 't1',
                        type: 'function',
                        function: { name: 'list_entries', arguments: '{"type":"page"}' },
                      },
                    ],
                  },
                },
              ],
            } as Record<string, unknown>,
          };
        return {
          status: 200,
          body: {
            model: 'chriss-base',
            choices: [{ message: { role: 'assistant', content: 'Ciao!' }, finish_reason: 'stop' }],
          } as Record<string, unknown>,
        };
      };
      const quota = () => ({ limit: 20, remaining, resetAt: '2026-11-22T00:00:00.000Z' });
      const quotaHeaders = () => ({
        'x-ratelimit-limit': '20',
        'x-ratelimit-remaining': String(remaining),
        'x-ratelimit-reset': String(Date.UTC(2026, 10, 22) / 1000),
      });
      if (req.method === 'POST' && path === '/v1/chat/completions') {
        const answer = answerOf(JSON.parse(data) as Record<string, unknown>);
        return json(answer.status, answer.body, answer.status === 200 ? quotaHeaders() : {});
      }
      if (req.method === 'POST' && path === '/v1/chat/jobs') {
        const answer = answerOf(JSON.parse(data) as Record<string, unknown>);
        if (answer.status !== 200) return json(answer.status, answer.body);
        const id = `job_${jobs.size + 1}`;
        const last = nextFails
          ? {
              status: 'error',
              error: { error: 'upstream_error', message: 'The free service could not answer.' },
            }
          : { status: 'done', result: answer.body };
        jobs.set(id, { states: [...(nextStates ?? [{ status: 'running' }]), last] });
        nextStates = null;
        nextFails = false;
        return json(202, { id, status: 'queued', position: 0, ...quota() }, quotaHeaders());
      }
      const polled = /^\/v1\/chat\/jobs\/([\w-]+)$/.exec(path ?? '');
      if (req.method === 'GET' && polled) {
        const job = jobs.get(polled[1]!);
        if (!job) return json(404, { error: 'not_found' });
        const state = job.states.length > 1 ? job.states.shift()! : job.states[0]!;
        return json(200, { id: polled[1], ...state, ...quota() }, quotaHeaders());
      }
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => relay.listen(0, '127.0.0.1', resolve));
  relayUrl = `http://127.0.0.1:${(relay.address() as AddressInfo).port}/relay`;

  app = await startTestApp({ env: { CLEITEXT_AI_RELAY: relayUrl } });
  owner = ownerDatabase();
  site = await seedSite(owner, 'free-ai');
  await seedUser(owner, {
    email: 'root@free-ai.test',
    password: PASSWORD,
    site,
    role: 'subscriber',
    superAdmin: true,
  });
  editorId = await seedUser(owner, {
    email: 'editor@free-ai.test',
    password: PASSWORD,
    site,
    role: 'editor',
  });
  root = new TestClient(app, site.host, '10.39.0.1');
  await root.login('root@free-ai.test', PASSWORD);
  editor = new TestClient(app, site.host, '10.39.0.2');
  await editor.login('editor@free-ai.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
  relay?.close();
});

describe('Chriss base', () => {
  it('is offered, never chosen silently', async () => {
    expect((await root.get('/api/v1/assistants/provider/free')).json()).toEqual({
      available: true,
      host: '127.0.0.1:' + new URL(relayUrl).port,
      active: false,
    });
    expect((await root.get('/api/v1/assistants/provider')).json()).toBeNull();
    // Only while a registration is pending.
    const idle = await app.inject({
      method: 'GET',
      url: '/.well-known/cleitext-ai-relay',
      headers: { host: site.host },
    });
    expect(idle.statusCode).toBe(404);
    expect((await editor.post('/api/v1/assistants/provider/free', {})).statusCode).toBe(403);
  });

  it('registers the site in one click and keeps the key as the provider’s', async () => {
    const activated = await root.post('/api/v1/assistants/provider/free', {});
    expect(activated.statusCode).toBe(200);
    expect(activated.json()).toEqual({
      baseUrl: `${relayUrl}/v1`,
      model: 'chriss-base',
      hasKey: true,
      free: true,
    });
    // The relay saw the hash of the secret, at the site's own address.
    expect(registered).toHaveLength(1);
    expect(registered[0]!.origin).toBe(`http://${site.host}`);
    expect(registered[0]!.challenge).toMatch(/^[0-9a-f]{64}$/);
    // The challenge is gone once the registration ends.
    const after = await app.inject({
      method: 'GET',
      url: '/.well-known/cleitext-ai-relay',
      headers: { host: site.host },
    });
    expect(after.statusCode).toBe(404);
    expect((await root.get('/api/v1/assistants/provider/free')).json()).toEqual({
      available: true,
      host: '127.0.0.1:' + new URL(relayUrl).port,
      active: true,
      quota: { remaining: 2, limit: 20, resetAt: '2026-11-22T00:00:00.000Z' },
    });
  });

  it('sends the essential tools and a short prompt, and says what is left', async () => {
    const answer = await editor.post('/api/v1/assistants/chat', {
      messages: [{ role: 'user', content: 'Ciao' }],
    });
    const lines = events(answer.body);
    expect(lines).toContainEqual({
      type: 'quota',
      remaining: 1,
      limit: 20,
      resetAt: '2026-11-22T00:00:00.000Z',
    });
    expect(lines).toContainEqual({ type: 'text', text: 'Ciao!' });
    const sent = asked.at(-1)!;
    expect(sent.authorization).toBe(`Bearer ${KEY}`);
    const body = sent.body as {
      max_tokens: number;
      tools: { function: { name: string } }[];
      messages: { role: string; content: string }[];
    };
    expect(body.max_tokens).toBe(1024);
    const names = body.tools.map((t) => t.function.name);
    expect(names.every((name) => FREE_TOOLS.includes(name))).toBe(true);
    expect(names).toContain('create_entry');
    expect(names).not.toContain('get_block_guide');
    expect(body.messages[0]!.content).toMatch(/^You are Chriss/);
    expect(body.messages[0]!.content.length).toBeLessThan(1000);
    // The prompt and the tools within about 1 500 tokens, the same at every turn.
    expect(JSON.stringify(body.tools).length + body.messages[0]!.content.length).toBeLessThan(4500);
    expect(lines.findIndex((l) => l.type === 'reading')).toBeLessThan(
      lines.findIndex((l) => l.type === 'text'),
    );
    await editor.post('/api/v1/assistants/chat', {
      messages: [
        { role: 'user', content: 'Ciao' },
        { role: 'assistant', content: 'Ciao!' },
        { role: 'user', content: 'Ancora' },
      ],
    });
    const next = asked.at(-1)!.body as typeof body;
    expect(JSON.stringify([next.messages[0], next.tools])).toBe(
      JSON.stringify([body.messages[0], body.tools]),
    );
  });

  it('asks as a job, reads it every couple of seconds and says the place in the queue', async () => {
    remaining = 3;
    let from = calls.length;
    nextStates = [
      { status: 'queued', position: 2 },
      { status: 'queued', position: 2 },
      { status: 'queued', position: 1 },
      { status: 'running' },
    ];
    const answer = await editor.post('/api/v1/assistants/chat', {
      messages: [{ role: 'user', content: 'Ciao' }],
    });
    const lines = events(answer.body).filter((l) => l.type !== 'ping');
    expect(lines.filter((l) => l.type === 'queue')).toEqual([
      { type: 'queue', position: 2 },
      { type: 'queue', position: 1 },
    ]);
    expect(lines.findIndex((l) => l.type === 'reading')).toBeLessThan(
      lines.findIndex((l) => l.type === 'queue'),
    );
    expect(lines).toContainEqual({ type: 'text', text: 'Ciao!' });
    expect(lines).toContainEqual({
      type: 'quota',
      remaining: 2,
      limit: 20,
      resetAt: '2026-11-22T00:00:00.000Z',
    });
    // One submission, then short polls; never the long chat completions request.
    const these = calls.slice(from).filter((c) => c.path !== '/usage');
    expect(these.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual(['/v1/chat/jobs']);
    expect(these.filter((c) => c.method === 'GET').length).toBe(5);
    expect(these.every((c) => c.ms < 3000)).toBe(true);

    // Plugins on Chriss base (ctx.ai.complete, ctx.ai.chat) go the same way.
    from = calls.length;
    const text = await app
      .get(ChatService)
      .generate(site.id, { messages: [{ role: 'user', content: 'Ciao' }] });
    expect(text).toMatchObject({ text: 'Ciao!', model: 'chriss-base', finishReason: 'stop' });
    const round = await app.get(ChatService).round(site.id, {
      messages: [{ role: 'user', content: 'Tool please' }],
      tools: [{ type: 'function', function: { name: 'list_entries' } }],
    });
    expect(round.message.tool_calls).toHaveLength(1);
    expect(calls.slice(from).some((c) => c.path === '/v1/chat/completions')).toBe(false);
    remaining = 2;
  });

  it('reports a job that failed at the service', async () => {
    remaining = 2;
    nextFails = true;
    const answer = await editor.post('/api/v1/assistants/chat', {
      messages: [{ role: 'user', content: 'Ciao' }],
    });
    const failed = events(answer.body).find((l) => l.type === 'error');
    expect(failed?.message).toContain('The free service could not answer.');
    remaining = 2;
  });

  it('tells the relay who calls, with the core version', () => {
    // Registration, usage, jobs and polls.
    expect(new Set(calls.map((c) => c.path.replace(/job_\d+/, ':id')))).toEqual(
      new Set(['/register', '/usage', '/v1/chat/jobs', '/v1/chat/jobs/:id']),
    );
    const agents = new Set(calls.map((c) => c.userAgent));
    expect(calls.length).toBeGreaterThan(0);
    expect([...agents]).toEqual([`Cleitext/${appVersion()} (+https://cleitext.com)`]);
  });

  it('turns the end of the free requests into the invitation', async () => {
    remaining = 0;
    // Known before asking: a plain 429.
    const early = await editor.post('/api/v1/assistants/chat', {
      messages: [{ role: 'user', content: 'Ancora' }],
    });
    expect(early.statusCode).toBe(429);
    expect(early.json()).toEqual({
      error: 'quota_exceeded',
      limit: 20,
      resetAt: '2026-11-22T00:00:00.000Z',
    });
    expect(Number(early.headers['retry-after'])).toBeGreaterThan(0);
    // Learnt from the answer: an error event of the stream.
    usageFails = true;
    const answer = await editor.post('/api/v1/assistants/chat', {
      messages: [{ role: 'user', content: 'Ancora' }],
    });
    usageFails = false;
    expect(answer.statusCode).toBe(200);
    expect(events(answer.body)).toContainEqual({
      type: 'error',
      message:
        "You used today's free requests: connect your own AI service to continue without limits.",
      error: 'quota_exceeded',
      limit: 20,
      resetAt: '2026-11-22T00:00:00.000Z',
    });
    // Plugins get the same message.
    await expect(
      app.get(ChatService).generate(site.id, { messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow("You used today's free requests");
    remaining = 2;
  });

  it('stays Chriss base when saved again as it is, not with another key or address', async () => {
    const same = await root.request('PUT', '/api/v1/assistants/provider', {
      baseUrl: `${relayUrl}/v1`,
      model: 'chriss-base',
    });
    expect(same.json().free).toBe(true);
    const own = await root.request('PUT', '/api/v1/assistants/provider', {
      baseUrl: `${relayUrl}/v1`,
      model: 'chriss-base',
      apiKey: 'sk-own',
    });
    expect(own.json().free).toBeUndefined();
    expect((await root.get('/api/v1/assistants/provider/free')).json()).toEqual({
      available: true,
      host: '127.0.0.1:' + new URL(relayUrl).port,
      active: false,
    });
  });

  it('reports a refused registration', async () => {
    const other = await seedSite(owner, 'free-ai-other');
    await seedUser(owner, {
      email: 'root@free-ai-other.test',
      password: PASSWORD,
      site: other,
      role: 'subscriber',
      superAdmin: true,
    });
    const client = new TestClient(app, other.host, '10.39.0.3');
    await client.login('root@free-ai-other.test', PASSWORD);
    // The relay reads the challenge of another host: the hashes differ.
    const handlers = relay.listeners('request') as ((...args: unknown[]) => void)[];
    relay.removeAllListeners('request');
    relay.on('request', (_req, res) => {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_verified', detail: 'The site could not be verified.' }));
    });
    const refused = await client.post('/api/v1/assistants/provider/free', {});
    expect(refused.statusCode).toBe(400);
    expect(refused.json().detail).toBe('The site could not be verified.');
    expect((await client.get('/api/v1/assistants/provider')).json()).toBeNull();
    relay.removeAllListeners('request');
    for (const handler of handlers) relay.on('request', handler);
  });
});

describe('the conversation sent to Chriss base', () => {
  const long = (n: number) => 'x'.repeat(n);
  it('leaves out the oldest questions first', () => {
    const messages = [
      { role: 'user', content: long(500) },
      { role: 'assistant', content: long(500) },
      { role: 'user', content: long(500) },
      { role: 'assistant', content: long(500) },
      { role: 'user', content: 'now' },
    ];
    expect(trimForFree(messages, 100_000)).toEqual(messages);
    const trimmed = trimForFree(messages, 1500);
    expect(trimmed.map((m) => m.content)).toEqual([long(500), long(500), 'now']);
    expect(trimmed[0]!.role).toBe('user');
    expect(trimForFree(messages, 10)).toEqual([{ role: 'user', content: 'now' }]);
  });

  it('cuts the older tool results of the current question', () => {
    const messages = [
      { role: 'user', content: 'now' },
      { role: 'assistant', content: null, tool_calls: [] },
      { role: 'tool', tool_call_id: 'a', content: long(3000) },
      { role: 'tool', tool_call_id: 'b', content: long(3000) },
    ];
    const trimmed = trimForFree(messages, 4000);
    expect((trimmed[2]!.content as string).length).toBeLessThan(700);
    expect(trimmed[3]!.content).toBe(long(3000));
    // The conversation kept is unchanged.
    expect(messages[2]!.content).toBe(long(3000));
  });
});

describe('the chat from the official app (core 0.117)', () => {
  /** An OAuth token, as the app (or an assistant) gets it at sign-in. */
  async function token(redirect: string, scopes: string[]) {
    const oauth = app.get(OAuthService);
    const client = await oauth.register(site.id, { name: 'Cleitext', redirectUris: [redirect] });
    const verifier = randomBytes(40).toString('base64url');
    const code = await oauth.createCode(site.id, {
      clientId: client.clientId,
      userId: editorId,
      redirectUri: redirect,
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
      scopes,
    });
    const issued = await oauth.exchangeCode(site.id, {
      code,
      clientId: client.clientId,
      redirectUri: redirect,
      codeVerifier: verifier,
    });
    return issued.access_token;
  }
  const ask = (bearer: string, content: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/assistants/chat',
      headers: { host: site.host, authorization: `Bearer ${bearer}` },
      payload: { messages: [{ role: 'user', content }], publish: true },
    });

  it('runs the tools as the app’s token, in the same stream', async () => {
    const bearer = await token(APP_REDIRECT_URI, ['read', 'write']);
    const answer = await ask(bearer, 'Tool please');
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['content-type']).toContain('application/x-ndjson');
    const lines = events(answer.body);
    expect(lines).toContainEqual({ type: 'tool-done', name: 'list_entries', ok: true });
    expect(lines).toContainEqual({ type: 'text', text: 'Ciao!' });
    // Without the publish scope, the chat may not publish even if asked.
    const system = (asked.at(-1)!.body.messages as { content: string }[])[0]!.content;
    expect(system).toContain('may not publish');
  });

  it('refuses read-only app tokens and the tokens of other clients', async () => {
    expect((await ask(await token(APP_REDIRECT_URI, ['read']), 'Hi')).statusCode).toBe(403);
    const assistant = await token('https://assistant.example/cb', ['read', 'write']);
    const refused = await ask(assistant, 'Hi');
    expect(refused.statusCode).toBe(403);
    expect(refused.json().detail).toContain('use MCP instead');
  });
});

describe('without a relay', () => {
  it('offers no preset when CLEITEXT_AI_RELAY is empty', async () => {
    const plain = await startTestApp();
    try {
      const client = new TestClient(plain, site.host, '10.39.0.4');
      await client.login('root@free-ai.test', PASSWORD);
      expect((await client.get('/api/v1/assistants/provider/free')).json()).toEqual({
        available: false,
        active: false,
      });
      expect((await client.post('/api/v1/assistants/provider/free', {})).statusCode).toBe(400);
    } finally {
      await plain.close();
    }
  });
});

describe('plugin API 1.79', () => {
  it('ctx.ai.chat keeps only messages and tools in the chat completions format', () => {
    const input = chatInput({
      messages: [
        { role: 'system', content: 'Be short.' },
        { role: 'user', content: 'Hi' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'c1', type: 'function', function: { name: 'get_site', arguments: '{}' } },
          ],
        },
        { role: 'tool', tool_call_id: 'c1', content: '{}' },
        { role: 'boss', content: 'x' } as never,
      ],
      tools: [
        { type: 'function', function: { name: 'get_site', parameters: { type: 'object' } } },
        { type: 'function', function: { name: 'bad name!' } },
      ],
      toolChoice: 'auto',
      maxTokens: 99_999,
      temperature: 5,
    });
    expect(input.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
    expect(input.tools!.map((t) => t.function.name)).toEqual(['get_site']);
    expect(input).toMatchObject({ toolChoice: 'auto', maxTokens: 32_000, temperature: 2 });
    expect(() => chatInput({ messages: [] })).toThrow('at least one message');
  });

  it('ctx.ai.chat answers with the message of the provider', async () => {
    const answer = await app.get(ChatService).round(site.id, {
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [{ type: 'function', function: { name: 'get_site' } }],
      maxTokens: 50,
    });
    expect(answer).toEqual({
      message: { role: 'assistant', content: 'Ciao!' },
      finishReason: 'stop',
      model: 'chriss-base',
      usage: null,
    });
  });

  it('webhook routes get the authorization header, other routes never', () => {
    const request = {
      url: '/api/v1/ext/x/y',
      method: 'POST',
      headers: { authorization: 'Bearer cxai_abc', cookie: 'a=b', 'x-other': '1' },
      body: {},
      ip: '1',
      protocol: 'https',
      host: 'example.org',
      cookies: {},
    } as unknown as FastifyRequest;
    expect(routeRequest(request, 's', '/y', {}, { authorization: true }).headers).toMatchObject({
      authorization: 'Bearer cxai_abc',
      'x-other': '1',
    });
    const plain = routeRequest(request, 's', '/y', {});
    expect(plain.headers.authorization).toBeUndefined();
    expect(plain.headers.cookie).toBeUndefined();
  });
});
