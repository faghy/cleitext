import { z } from 'zod';

/** One line of the activity log (RF-ADM-06). */
export interface AuditEntryView {
  id: number;
  action: string;
  targetType: string | null;
  targetId: string | null;
  /** Readable name of the target (entry title, user name…) when it still exists. */
  targetLabel: string | null;
  meta: Record<string, unknown>;
  /** Only for administrators. */
  ip: string | null;
  createdAt: string;
  user: { id: string; displayName: string } | null;
}

export interface AuditListResponse {
  items: AuditEntryView[];
  nextCursor: string | null;
}

export const listAuditQuerySchema = z.object({
  /** Action or action prefix, e.g. `entry` or `user.login.failed`. */
  action: z
    .string()
    .max(64)
    .regex(/^[a-z.]*$/)
    .optional(),
  user: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().regex(/^\d+$/).optional(),
});

/** Dashboard widgets (RF-ADM-02). */
export interface DashboardView {
  /** Entries per content type. */
  counts: {
    type: string;
    name: Record<string, string>;
    published: number;
    drafts: number;
    scheduled: number;
  }[];
  /** The user's latest drafts. */
  drafts: { id: string; type: string; title: string; updatedAt: string }[];
  /** Latest published entries. */
  published: { id: string; type: string; title: string; publishedAt: string | null }[];
  /** Latest activity, for those who may see the log. */
  activity: AuditEntryView[] | null;
  /** Problems worth a look, for administrators. */
  warnings: string[];
  /** Plugins deactivated on this site after repeated errors (RF-PLG-05). */
  pluginNotices: { plugin: string; error: string; at: string }[];
}

/** System status page (RF-ADM-07). */
export interface SystemStatusView {
  version: string;
  environment: string;
  uptimeSeconds: number;
  node: string;
  postgres: string;
  migrations: { applied: number; expected: number; upToDate: boolean };
  database: { sizeBytes: number | null };
  media: { files: number; bytes: number };
  cache: { enabled: boolean; entries: number; hits: number; misses: number; invalidations: number };
  plugins: {
    slug: string;
    version: string;
    status: string;
    active: boolean;
    errors: number;
    lastError: string | null;
  }[];
  scheduler: { intervalSeconds: number };
  mail: { siteSettings: boolean; serverDriver: string };
}

/** Global admin search for the command palette (RF-ADM-05). */
export interface AdminSearchResult {
  entries: { id: string; type: string; title: string; status: string }[];
  media: { id: string; filename: string; mime: string }[];
  terms: { id: string; name: string; taxonomy: string }[];
  users: { id: string; displayName: string; email: string }[];
}
