import type { Capability } from '@cleitext/shared';

/** Site resolved from the request host (docs/ARCHITECTURE.md §8). */
export interface SiteContext {
  id: string;
  status: 'active' | 'maintenance';
}

/** Authenticated user on the current site. */
export interface AuthContext {
  userId: string;
  sessionId: string;
  email: string;
  displayName: string;
  locale: string;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
  role: { id: string; slug: string; name: string } | null;
  /** Core capabilities plus those defined by active plugins. */
  capabilities: (Capability | (string & {}))[];
}

declare module 'fastify' {
  interface FastifyRequest {
    site?: SiteContext;
    auth?: AuthContext | null;
  }
}
