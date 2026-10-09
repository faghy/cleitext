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
  }),
  site: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    defaultLocale: z.string(),
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
