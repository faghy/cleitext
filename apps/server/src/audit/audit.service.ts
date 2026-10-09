import { auditLog, type SiteTransaction } from '@cleitext/db';
import { Injectable } from '@nestjs/common';

export interface AuditEntry {
  siteId: string;
  userId?: string | null;
  /** e.g. 'user.login', 'user.login.failed', 'member.role.changed' */
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
  ip?: string | null;
}

/** Writes the activity log (docs/ARCHITECTURE.md §14). Runs inside a site context. */
@Injectable()
export class AuditService {
  async record(tx: SiteTransaction, entry: AuditEntry): Promise<void> {
    await tx.insert(auditLog).values({
      siteId: entry.siteId,
      userId: entry.userId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      meta: entry.meta ?? {},
      ip: entry.ip ?? null,
    });
  }
}
