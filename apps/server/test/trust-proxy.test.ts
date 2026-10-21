/** The visitor's address behind proxies (TRUST_PROXY, TRUST_CLOUDFLARE). */
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/config.js';
import { fastifyTrustProxy } from '../src/config/trust-proxy.js';

const opened: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});

/** A server configured like Cleitext from `env`, answering with what it sees. */
async function server(env: Record<string, string>): Promise<FastifyInstance> {
  const config = loadConfig({ DATABASE_URL: 'postgres://u:p@h/db', LOG_LEVEL: 'silent', ...env });
  const app = Fastify({ trustProxy: fastifyTrustProxy(config.trustProxy) });
  app.get('/', (request) => ({ ip: request.ip, protocol: request.protocol, host: request.host }));
  opened.push(app);
  await app.ready();
  return app;
}

async function seen(
  app: FastifyInstance,
  peer: string,
  forwardedFor?: string,
  extra: Record<string, string> = {},
): Promise<{ ip: string; protocol: string; host: string }> {
  const response = await app.inject({
    url: '/',
    remoteAddress: peer,
    headers: {
      host: 'site.example',
      ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      ...extra,
    },
  });
  return response.json();
}

describe('TRUST_PROXY=false', () => {
  it('ignores the forwarded headers', async () => {
    const app = await server({ TRUST_PROXY: 'false' });
    const view = await seen(app, '127.0.0.1', '203.0.113.7', {
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'evil.example',
    });
    expect(view).toEqual({ ip: '127.0.0.1', protocol: 'http', host: 'site.example' });
  });
});

describe('TRUST_PROXY=true', () => {
  it('returns the real visitor behind nginx, not a spoofed leftmost address', async () => {
    const app = await server({ TRUST_PROXY: 'true' });
    // The visitor sent "1.2.3.4" itself; nginx appended the address it saw.
    expect((await seen(app, '127.0.0.1', '1.2.3.4, 203.0.113.7')).ip).toBe('203.0.113.7');
    expect((await seen(app, '::ffff:127.0.0.1', '1.2.3.4, 203.0.113.7')).ip).toBe('203.0.113.7');
    expect((await seen(app, '::1', '1.2.3.4, 2001:db8::5')).ip).toBe('2001:db8::5');
  });

  it('walks through HAProxy on a private network', async () => {
    const app = await server({ TRUST_PROXY: 'true' });
    expect((await seen(app, '127.0.0.1', '1.2.3.4, 203.0.113.7, 10.0.0.200')).ip).toBe(
      '203.0.113.7',
    );
    expect((await seen(app, '127.0.0.1', '203.0.113.7, 100.64.1.1, 172.20.0.3')).ip).toBe(
      '203.0.113.7',
    );
  });

  it('stops at a public proxy that is not listed', async () => {
    const app = await server({ TRUST_PROXY: 'true' });
    // A Cloudflare edge is public: without TRUST_CLOUDFLARE it is the "visitor".
    expect((await seen(app, '127.0.0.1', '203.0.113.7, 172.70.1.1')).ip).toBe('172.70.1.1');
  });

  it('ignores the headers from a peer on a public address', async () => {
    const app = await server({ TRUST_PROXY: 'true' });
    const view = await seen(app, '198.51.100.9', '1.2.3.4', {
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'evil.example',
    });
    expect(view).toEqual({ ip: '198.51.100.9', protocol: 'http', host: 'site.example' });
  });

  it('takes scheme and host from the trusted proxy', async () => {
    const app = await server({ TRUST_PROXY: 'true' });
    const view = await seen(app, '127.0.0.1', '203.0.113.7', {
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'www.site.example',
    });
    expect(view).toEqual({ ip: '203.0.113.7', protocol: 'https', host: 'www.site.example' });
  });
});

describe('TRUST_PROXY as a number of hops', () => {
  it('trusts exactly that many hops', async () => {
    const one = await server({ TRUST_PROXY: '1' });
    expect((await seen(one, '127.0.0.1', '1.2.3.4, 203.0.113.7, 10.0.0.200')).ip).toBe(
      '10.0.0.200',
    );
    const two = await server({ TRUST_PROXY: '2' });
    expect((await seen(two, '127.0.0.1', '1.2.3.4, 203.0.113.7, 10.0.0.200')).ip).toBe(
      '203.0.113.7',
    );
    expect(
      (
        await seen(two, '127.0.0.1', '1.2.3.4, 203.0.113.7, 10.0.0.200', {
          'x-forwarded-proto': 'https',
        })
      ).protocol,
    ).toBe('https');
  });
});

describe('TRUST_PROXY as a list', () => {
  it('trusts only the listed addresses and networks', async () => {
    const app = await server({ TRUST_PROXY: 'loopback, 198.51.100.0/24' });
    // A public proxy, listed: walked through.
    expect((await seen(app, '127.0.0.1', '1.2.3.4, 203.0.113.7, 198.51.100.20')).ip).toBe(
      '203.0.113.7',
    );
    // A private address that is not listed is not trusted.
    expect((await seen(app, '127.0.0.1', '1.2.3.4, 203.0.113.7, 10.0.0.200')).ip).toBe(
      '10.0.0.200',
    );
    // Nor is a peer outside the list.
    expect((await seen(app, '10.0.0.200', '1.2.3.4')).ip).toBe('10.0.0.200');
  });
});

describe('TRUST_CLOUDFLARE', () => {
  it('returns the visitor behind Cloudflare, HAProxy and nginx', async () => {
    const app = await server({ TRUST_PROXY: 'true', TRUST_CLOUDFLARE: 'true' });
    // Spoofed entry, visitor (appended by Cloudflare), edge (by HAProxy), HAProxy (by nginx).
    const chain = '1.2.3.4, 203.0.113.7, 172.70.1.1, 10.0.0.200';
    expect((await seen(app, '127.0.0.1', chain)).ip).toBe('203.0.113.7');
    expect((await seen(app, '127.0.0.1', '2001:db8::5, 2606:4700::1, 10.0.0.200')).ip).toBe(
      '2001:db8::5',
    );
  });

  it('does not trust a Cloudflare address in the middle of an untrusted chain', async () => {
    const app = await server({ TRUST_PROXY: 'true', TRUST_CLOUDFLARE: 'true' });
    // A visitor connecting directly cannot pretend to come through Cloudflare.
    expect((await seen(app, '198.51.100.9', '1.2.3.4, 172.70.1.1')).ip).toBe('198.51.100.9');
    // Nor through a trusted proxy, when a non-Cloudflare public hop is in between.
    expect((await seen(app, '127.0.0.1', '1.2.3.4, 172.70.1.1, 198.51.100.9')).ip).toBe(
      '198.51.100.9',
    );
  });

  it('ignores CF-Connecting-IP', async () => {
    const app = await server({ TRUST_PROXY: 'true', TRUST_CLOUDFLARE: 'true' });
    const view = await seen(app, '127.0.0.1', '203.0.113.7, 172.70.1.1', {
      'cf-connecting-ip': '1.2.3.4',
    });
    expect(view.ip).toBe('203.0.113.7');
  });
});
