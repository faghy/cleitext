import { z } from 'zod';
import { CAPABILITIES } from './capabilities.js';

/** Password policy (docs/ARCHITECTURE.md §14). */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH);

export const emailSchema = z
  .email()
  .max(254)
  .transform((value) => value.trim().toLowerCase());

export const localeSchema = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'Invalid locale.');

// ---- Auth ----------------------------------------------------------------

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  remember: z.boolean().default(false),
});
export type LoginRequest = z.input<typeof loginRequestSchema>;

/** Answer to a correct password when the account uses 2FA (RF-USR-04). */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  /** Single-use, valid for a few minutes: sent back with the code. */
  challenge: string;
}

export const twoFactorLoginRequestSchema = z.object({
  challenge: z.string().min(10).max(200),
  /** Authenticator code, or a recovery code. */
  code: z.string().trim().min(6).max(20),
});

export const twoFactorCodeRequestSchema = z.object({ code: z.string().trim().min(6).max(20) });

/** Sensitive account changes ask for the password again. */
export const passwordConfirmRequestSchema = z.object({
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export interface TwoFactorStatusView {
  enabled: boolean;
  recoveryCodesLeft: number;
  /** Required for the user's role on this site. */
  required: boolean;
}

export interface TwoFactorSetupView {
  /** Base32 secret, for typing into an authenticator app. */
  secret: string;
  otpauthUrl: string;
}

export interface PasskeyView {
  id: string;
  name: string;
  /** The domain it works on (passkeys are bound to a host). */
  domain: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Browser credential (WebAuthn JSON), checked by the server library. */
const credentialSchema = z
  .object({ id: z.string().min(1).max(1_024), type: z.literal('public-key') })
  .loose();

export const passkeyLoginRequestSchema = z.object({ response: credentialSchema });

export const passkeyRegisterRequestSchema = z.object({
  response: credentialSchema,
  name: z.string().trim().max(100).default(''),
});

export const passkeyRenameRequestSchema = z.object({ name: z.string().trim().min(1).max(100) });

/** `read`: GET requests only; `write`: every request. Always within the owner's permissions. */
export const API_TOKEN_SCOPES = ['read', 'write'] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

export interface ApiTokenView {
  id: string;
  name: string;
  /** First characters, to recognize the token. */
  prefix: string;
  scopes: ApiTokenScope[];
  owner: { id: string; displayName: string } | null;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

export const createApiTokenRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(API_TOKEN_SCOPES)).min(1),
  /** Days of validity; null for a token that never expires. */
  expiresInDays: z.number().int().min(1).max(3650).nullable(),
  /** Another member of the site (`manage_users`). */
  userId: z.uuid().optional(),
});

export const securitySettingsSchema = z.object({
  /** Role slugs that must use 2FA; `super_admin` for super admins. */
  require2fa: z.array(z.string().min(1).max(64)).max(50),
});
export type SecuritySettings = z.infer<typeof securitySettingsSchema>;

export const forgotPasswordRequestSchema = z.object({ email: emailSchema });
export type ForgotPasswordRequest = z.input<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});
export type ResetPasswordRequest = z.input<typeof resetPasswordRequestSchema>;

export const acceptInviteRequestSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(120).optional(),
});
export type AcceptInviteRequest = z.input<typeof acceptInviteRequestSchema>;

export const capabilitySchema = z.enum(CAPABILITIES);

export const meResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    email: z.string(),
    displayName: z.string(),
    locale: z.string(),
    isSuperAdmin: z.boolean(),
    /** Profile picture, or null for initials. */
    avatarUrl: z.string().nullable(),
    twoFactorEnabled: z.boolean(),
    /** 2FA is mandatory for the user's role: only the setup is reachable until it is on. */
    twoFactorRequired: z.boolean(),
  }),
  site: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    defaultLocale: z.string(),
    /** IANA time zone of the site (dates and scheduling). */
    timezone: z.string(),
    locales: z.array(z.object({ code: z.string(), name: z.string(), isDefault: z.boolean() })),
  }),
  role: z.object({ slug: z.string(), name: z.string() }).nullable(),
  /** Core capabilities, plus those of the plugins active on the site. */
  capabilities: z.array(z.string()),
  sites: z.array(z.object({ id: z.uuid(), name: z.string(), host: z.string().nullable() })),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

// ---- Users ---------------------------------------------------------------

export const inviteUserRequestSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().min(1).max(120),
  role: z.string().min(1).max(64),
  /**
   * Set the password directly, as in WordPress's "Add New User"; without
   * it the person receives an invitation to choose one.
   */
  password: passwordSchema.optional(),
  /** Email the person (invitation, or notice of the new account). Default true. */
  sendEmail: z.boolean().optional(),
});
export type InviteUserRequest = z.input<typeof inviteUserRequestSchema>;

export const updateMemberRequestSchema = z.object({ role: z.string().min(1).max(64) });
export type UpdateMemberRequest = z.input<typeof updateMemberRequestSchema>;

export interface MemberView {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: 'active' | 'invited' | 'suspended';
  role: { slug: string; name: string };
  lastLoginAt: string | null;
}

export interface RoleView {
  id: string;
  slug: string;
  name: string;
  system: boolean;
  capabilities: string[];
  /** Members of the current site with this role. */
  members?: number;
}

export const roleRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  /** Generated from the name when omitted. */
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_-]{0,62}$/)
    .optional(),
  capabilities: z.array(z.string().min(1).max(100)).max(200),
});
export const updateRoleRequestSchema = roleRequestSchema.omit({ slug: true }).partial();

/** Capabilities that roles can grant, for the role editor (RF-USR-06). */
export interface CapabilityCatalog {
  core: string[];
  plugins: { name: string; plugin: string; label: string }[];
}

// ---- Profile -------------------------------------------------------------

export const updateProfileRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  locale: localeSchema.optional(),
});
export type UpdateProfileRequest = z.input<typeof updateProfileRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.input<typeof changePasswordRequestSchema>;

export interface SessionView {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
}

// ---- Errors (RFC 9457) ---------------------------------------------------

export interface ProblemDetails {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  errors?: { path: string; message: string }[];
}

/** Header carrying the CSRF token on state-changing requests. */
export const CSRF_HEADER = 'x-csrf-token';
