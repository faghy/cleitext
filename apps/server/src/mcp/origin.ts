import type { FastifyRequest } from 'fastify';

/** https://<site host>, as the visitor reached it. */
export function siteOrigin(request: FastifyRequest): string {
  return `${request.protocol}://${request.host}`;
}
