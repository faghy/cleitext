import { loginThrottle, type DatabaseClient } from '@cleitext/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';
import { DATABASE } from '../database/database.module.js';

/**
 * Rate limiting and progressive lockout for logins (RF-USR-09).
 *
 * - per email: from the 5th consecutive failure, locked for 1 min, doubling
 *   on every further failure up to 15 min;
 * - per IP: 20 failures lock the address for 15 min.
 * A successful login clears the email counter.
 */
@Injectable()
export class LoginThrottleService {
  static readonly EMAIL_THRESHOLD = 5;
  static readonly IP_THRESHOLD = 20;
  static readonly MAX_LOCK_SECONDS = 15 * 60;

  constructor(@Inject(DATABASE) private readonly database: DatabaseClient) {}

  /** Seconds until a new attempt is allowed, or 0. */
  async retryAfter(email: string, ip: string): Promise<number> {
    const rows = await this.database.db
      .select({ lockedUntil: loginThrottle.lockedUntil })
      .from(loginThrottle)
      .where(inArray(loginThrottle.key, [emailKey(email), ipKey(ip)]));
    const now = Date.now();
    const waits = rows.map((r) =>
      r.lockedUntil ? Math.ceil((r.lockedUntil.getTime() - now) / 1000) : 0,
    );
    return Math.max(0, ...waits);
  }

  async recordFailure(email: string, ip: string): Promise<void> {
    await this.bump(emailKey(email), LoginThrottleService.EMAIL_THRESHOLD, (failures) =>
      Math.min(
        60 * 2 ** (failures - LoginThrottleService.EMAIL_THRESHOLD),
        LoginThrottleService.MAX_LOCK_SECONDS,
      ),
    );
    await this.bump(ipKey(ip), LoginThrottleService.IP_THRESHOLD, () => 15 * 60);
  }

  async recordSuccess(email: string): Promise<void> {
    await this.database.db.delete(loginThrottle).where(eq(loginThrottle.key, emailKey(email)));
  }

  private async bump(key: string, threshold: number, lockSeconds: (failures: number) => number) {
    const [row] = await this.database.db
      .insert(loginThrottle)
      .values({ key, failures: 1 })
      .onConflictDoUpdate({
        target: loginThrottle.key,
        set: { failures: sql`${loginThrottle.failures} + 1`, updatedAt: sql`now()` },
      })
      .returning({ failures: loginThrottle.failures });
    const failures = row?.failures ?? 1;
    if (failures >= threshold) {
      const until = new Date(Date.now() + lockSeconds(failures) * 1000);
      await this.database.db
        .update(loginThrottle)
        .set({ lockedUntil: until })
        .where(eq(loginThrottle.key, key));
    }
  }
}

const emailKey = (email: string) => `email:${email.trim().toLowerCase()}`;
const ipKey = (ip: string) => `ip:${ip}`;
