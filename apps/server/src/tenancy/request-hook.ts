import type { FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE } from '../auth/cookies.js';
import type { IdentityService } from '../auth/identity.service.js';
import type { SessionService } from '../auth/session.service.js';
import type { SiteResolverService } from './site-resolver.service.js';

interface Dependencies {
  sites: SiteResolverService;
  sessions: SessionService;
  identity: IdentityService;
}

/**
 * Runs before routing for every request except health probes:
 * 1. resolves the site from the host — unknown hosts get a neutral 404 (RF-SIT-05);
 * 2. enforces HTTPS and the primary domain for page requests (RF-SIT-04);
 * 3. loads the signed-in user from the session cookie, if any.
 */
export function createRequestHook({ sites, sessions, identity }: Dependencies) {
  return async function onRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (request.url.startsWith('/health/')) return;

    const resolution = await sites.resolve(request.hostname);
    if (!resolution) {
      await reply
        .code(404)
        .type('application/problem+json')
        .send({ title: 'Not Found', status: 404 });
      return reply;
    }

    const isPage =
      (request.method === 'GET' || request.method === 'HEAD') && !request.url.startsWith('/api/');
    const httpsRequired = resolution.forceHttps && request.protocol !== 'https';
    const aliasHost = !resolution.isPrimary && resolution.primaryHost;
    if (httpsRequired || (isPage && aliasHost)) {
      const scheme = resolution.forceHttps ? 'https' : request.protocol;
      const host = isPage && aliasHost ? aliasHost : request.host;
      // 308 keeps the method and body for API calls.
      await reply.redirect(`${scheme}://${host}${request.url}`, isPage ? 301 : 308);
      return reply;
    }

    // Media files of other sites are not served on this host, and paths that
    // try to leave the site's folder are refused before reaching the disk.
    // Profile pictures belong to users, not sites: served on every site.
    if (
      request.url.startsWith('/media/') &&
      ((!request.url.startsWith(`/media/${resolution.siteId}/`) &&
        !request.url.startsWith('/media/avatars/')) ||
        !isSafeMediaPath(request.url))
    ) {
      await reply
        .code(404)
        .type('application/problem+json')
        .send({ title: 'Not Found', status: 404 });
      return reply;
    }

    request.site = { id: resolution.siteId, status: resolution.siteStatus };
    request.auth = null;

    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      const session = await sessions.validate(token);
      if (session) {
        request.auth = await identity.load(resolution.siteId, session.userId, session.id);
      }
    }
  };
}

function isSafeMediaPath(url: string): boolean {
  let path: string;
  try {
    path = decodeURIComponent(url.split('?')[0]!);
  } catch {
    return false;
  }
  return !path.includes('..') && !path.includes('\\') && !path.includes('\0');
}
