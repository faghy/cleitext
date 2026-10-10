import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { cookieValue } from './page.js';

/**
 * The setup token (RF-SIT-02). Before Cleitext has a configuration there is no
 * secret to derive it from, so it is random and kept in `tmp/setup-token`:
 * every process of the server shows and accepts the same one, and only who
 * can read the server's files or logs knows it. Once entered, a session
 * cookie carries the proof through the next steps, across restarts.
 */

/** The application root: the release folder, or the repository in development. */
export function appRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
}

/**
 * Whether the wizard and the installer ask for the setup token. Off for now, by
 * the maintainer's choice: install right after enabling the application, since
 * until then whoever opens the site first can complete the setup. Turn it on
 * with CLEITEXT_SETUP_TOKEN=true.
 */
export function tokenRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CLEITEXT_SETUP_TOKEN === 'true' || env.CLEITEXT_SETUP_TOKEN === '1';
}

export function tokenFile(root: string): string {
  return join(root, 'tmp', 'setup-token');
}

export function readToken(root: string): string | null {
  try {
    const token = readFileSync(tokenFile(root), 'utf8').trim();
    return token.length >= 20 ? token : null;
  } catch {
    return null;
  }
}

/** The current token, created on first use (readable by the domain's user only). */
export function ensureToken(root: string): string {
  const existing = readToken(root);
  if (existing) return existing;
  const file = tokenFile(root);
  mkdirSync(dirname(file), { recursive: true });
  const token = randomBytes(18).toString('base64url');
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return token;
}

/** After the installation the token has no use left. */
export function removeToken(root: string): void {
  if (existsSync(tokenFile(root))) rmSync(tokenFile(root), { force: true });
}

export function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const SESSION_COOKIE = 'cleitext_setup';

function sessionValue(token: string): string {
  return createHmac('sha256', token).update('cleitext-setup-session').digest('base64url');
}

export function hasSession(request: FastifyRequest, token: string): boolean {
  const given = cookieValue(request, SESSION_COOKIE);
  return given !== undefined && sameSecret(given, sessionValue(token));
}

export function startSession(request: FastifyRequest, reply: FastifyReply, token: string): void {
  const secure = isHttps(request) ? '; Secure' : '';
  reply.header(
    'set-cookie',
    `${SESSION_COOKIE}=${sessionValue(token)}; Path=/install; HttpOnly; SameSite=Strict; Max-Age=7200${secure}`,
  );
}

export function isHttps(request: FastifyRequest): boolean {
  const forwarded = request.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return request.protocol === 'https' || proto?.trim() === 'https';
}
