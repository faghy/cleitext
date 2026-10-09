import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/config.js';

function testConfig(databaseUrl: string) {
  return loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_URL: databaseUrl });
}

describe('health', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp(testConfig(inject('appUrl')));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health/live answers without touching dependencies', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /health/ready reports database and migrations up', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.checks.database.status).toBe('up');
    expect(body.checks.migrations.status).toBe('up');
    expect(body.checks.migrations.applied).toBe(body.checks.migrations.expected);
  });
});

describe('health with an unreachable database', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp(testConfig('postgres://nobody:secret@127.0.0.1:1/none'));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health/ready answers 503 without leaking connection details', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json().checks.database).toEqual({ status: 'down', error: 'database unreachable' });
    expect(res.body).not.toContain('secret');
    expect(res.body).not.toContain('127.0.0.1');
  });
});
