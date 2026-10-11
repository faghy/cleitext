import { CSRF_HEADER, type Capability } from '@cleitext/shared';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { CAPABILITIES_KEY, NO_CSRF_KEY, PUBLIC_KEY } from '../common/decorators.js';
import { CSRF_COOKIE } from './cookies.js';
import { safeEqual } from './crypto.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard, in order:
 * 1. CSRF on state-changing requests: same-origin `Origin`/`Referer` and a
 *    double-submit token (header must match the CSRF cookie);
 * 2. authentication, unless the route is `@Public()`;
 * 3. capabilities required with `@RequireCapability()`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    const targets = [context.getHandler(), context.getClass()];
    // Bearer tokens are never sent by browsers on their own: no CSRF risk.
    if (request.auth?.apiToken) assertTokenAllowed(request);
    else if (
      !SAFE_METHODS.has(request.method) &&
      !this.reflector.getAllAndOverride<boolean>(NO_CSRF_KEY, targets)
    ) {
      verifyCsrf(request);
    }

    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const auth = request.auth;
    if (!auth) throw new UnauthorizedException('Sign in to continue.');

    const required =
      this.reflector.getAllAndOverride<Capability[]>(CAPABILITIES_KEY, targets) ?? [];
    const missing = required.filter((c) => !auth.capabilities.includes(c));
    if (missing.length > 0) {
      throw new ForbiddenException('You are not allowed to do this.');
    }
    return true;
  }
}

/**
 * What an API token may do (RF-USR-08): `read` tokens only GET; no token
 * manages accounts, sessions or tokens (only `GET /auth/me` is allowed there).
 */
export function assertTokenAllowed(request: FastifyRequest): void {
  const token = request.auth?.apiToken;
  if (!token) return;
  const path = request.url.split('?')[0]!;
  // MCP checks the scopes tool by tool (src/mcp/tools.ts).
  if (path === '/mcp') return;
  if (
    /^\/api\/v1\/(auth|profile|tokens)(\/|$)/.test(path) &&
    !(request.method === 'GET' && path === '/api/v1/auth/me')
  ) {
    throw new ForbiddenException('API tokens cannot manage accounts or tokens.');
  }
  if (!SAFE_METHODS.has(request.method) && !token.scopes.includes('write')) {
    throw new ForbiddenException('This API token can only read.');
  }
}

/** Same-origin check and double-submit CSRF token (also used by plugin routes). */
export function verifyCsrf(request: FastifyRequest): void {
  verifySameOrigin(request);

  const header = request.headers[CSRF_HEADER];
  const cookie = request.cookies[CSRF_COOKIE];
  if (typeof header !== 'string' || !cookie || !safeEqual(header, cookie)) {
    throw new ForbiddenException('Invalid or missing CSRF token.');
  }
}

/** Rejects requests whose `Origin` (or `Referer`) is another host. */
export function verifySameOrigin(request: FastifyRequest): void {
  const origin = request.headers.origin ?? refererOrigin(request.headers.referer);
  if (!origin) throw new ForbiddenException('Missing request origin.');
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ForbiddenException('Invalid request origin.');
  }
  if (originHost !== request.host) {
    throw new ForbiddenException('Cross-origin request rejected.');
  }
}

function refererOrigin(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
