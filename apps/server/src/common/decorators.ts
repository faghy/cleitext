import type { Capability } from '@cleitext/shared';
import {
  createParamDecorator,
  type ExecutionContext,
  InternalServerErrorException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AuthContext, SiteContext } from './request-context.js';

export const PUBLIC_KEY = 'cleitext:public';
export const CAPABILITIES_KEY = 'cleitext:capabilities';

/** The route does not require an authenticated user. CSRF still applies. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** The authenticated user must hold every listed capability on the site. */
export const RequireCapability = (...capabilities: Capability[]) =>
  SetMetadata(CAPABILITIES_KEY, capabilities);

/** Site of the current request (always set outside `/health`). */
export const CurrentSite = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SiteContext => {
    const site = ctx.switchToHttp().getRequest<FastifyRequest>().site;
    if (!site) throw new InternalServerErrorException('Site context missing');
    return site;
  },
);

/** Authenticated user (guaranteed on non-public routes). */
export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const auth = ctx.switchToHttp().getRequest<FastifyRequest>().auth;
    if (!auth) throw new UnauthorizedException();
    return auth;
  },
);
