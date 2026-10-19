import { ADMIN_PATH } from '@cleitext/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE } from '../auth/cookies.js';
import type { ApiTokenService } from '../auth/api-token.service.js';
import type { IdentityService } from '../auth/identity.service.js';
import type { SessionService } from '../auth/session.service.js';
import type { LanguagesService } from '../content/languages.service.js';
import type { SiteResolverService } from './site-resolver.service.js';
import type { InstallReportService } from '../catalog/install-report.service.js';

interface Dependencies {
  sites: SiteResolverService;
  languages: LanguagesService;
  sessions: SessionService;
  identity: IdentityService;
  apiTokens: ApiTokenService;
  reports?: InstallReportService;
}

/**
 * Runs before routing for every request except health probes:
 * 1. resolves the site from the host — unknown hosts get a neutral 404 (RF-SIT-05);
 * 2. enforces HTTPS and the primary domain for page requests (RF-SIT-04);
 * 3. loads the signed-in user from an API token (`Authorization: Bearer`)
 *    or from the session cookie, if any.
 */
export function createRequestHook({
  sites,
  languages,
  sessions,
  identity,
  apiTokens,
  reports,
}: Dependencies) {
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
    // Secondary domains lead to the primary one, except the public pages of a
    // domain that serves one of the site's languages (language plugin).
    const aliasHost =
      !resolution.isPrimary &&
      resolution.primaryHost &&
      !(
        isPage &&
        !request.url.startsWith(ADMIN_PATH) &&
        (await languages.isLanguageHost(resolution.siteId, request.hostname))
      ) &&
      resolution.primaryHost;
    if (httpsRequired || (isPage && aliasHost)) {
      const scheme = resolution.forceHttps ? 'https' : request.protocol;
      const host = isPage && aliasHost ? aliasHost : request.host;
      // 308 keeps the method and body for API calls.
      await reply.redirect(`${scheme}://${host}${request.url}`, isPage ? 301 : 308);
      return reply;
    }

    // About once a day, what the site runs goes to the registry (never waits).
    if (isPage) {
      reports?.touch(
        resolution.siteId,
        resolution.primaryHost ?? request.hostname,
        resolution.forceHttps,
      );
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

    // An explicit API token wins over the cookie; an invalid one is not
    // replaced by the session, so that the client sees the error.
    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      const found = await apiTokens.authenticate(resolution.siteId, authorization.slice(7).trim());
      const auth = found && (await identity.load(resolution.siteId, found.userId, ''));
      if (found && auth)
        request.auth = { ...auth, apiToken: { id: found.id, scopes: found.scopes } };
      return;
    }

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
