import type { FastifyReply, FastifyRequest } from 'fastify';

export const SESSION_COOKIE = 'cleitext_session';
export const CSRF_COOKIE = 'cleitext_csrf';

const isSecure = (request: FastifyRequest) => request.protocol === 'https';

export function setSessionCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  token: string,
  options: { remember: boolean; expiresAt: Date },
): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure(request),
    sameSite: 'lax',
    path: '/',
    // Without "remember me" the cookie ends with the browser session; the
    // server-side expiry applies in both cases.
    ...(options.remember ? { expires: options.expiresAt } : {}),
  });
}

export function clearSessionCookie(request: FastifyRequest, reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/', secure: isSecure(request), sameSite: 'lax' });
}

/** CSRF double-submit cookie: readable by the admin, sent back as a header. */
export function setCsrfCookie(request: FastifyRequest, reply: FastifyReply, token: string): void {
  reply.setCookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: isSecure(request),
    sameSite: 'strict',
    path: '/',
  });
}

/** Binds a pending passkey prompt to this browser (5 minutes, API paths only). */
export const WEBAUTHN_COOKIE = 'cleitext_webauthn';

export function setWebauthnCookie(request: FastifyRequest, reply: FastifyReply, token: string) {
  reply.setCookie(WEBAUTHN_COOKIE, token, {
    httpOnly: true,
    secure: isSecure(request),
    sameSite: 'strict',
    path: '/api/v1/',
    maxAge: 300,
  });
}
