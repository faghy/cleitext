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
  /** The sign-in name besides the email, if the account has one. */
  username?: string | null;
  displayName: string;
  locale: string;
  avatarUrl: string | null;
  /** 2FA is optional: each person turns it on in their profile. */
  twoFactor: { enabled: boolean };
  /** Set when the request was authenticated with an API token. */
  apiToken?: { id: string; scopes: string[] };
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
