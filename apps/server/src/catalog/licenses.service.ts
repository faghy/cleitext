import { settings, withContext, type DatabaseClient } from '@cleitext/db';
import {
  formatLicenseKey,
  isLicenseKey,
  licenseStorageKey,
  normalizeLicenseKey,
  type LicensedType,
  type LicenseView,
} from '@cleitext/shared';
import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../common/request-context.js';
import { seal, unseal, type SealedSecret } from '../common/secrets.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { UpdatesService } from '../updates/updates.service.js';

export const LICENSES_NAMESPACE = 'licenses';
const TIMEOUT_MS = 15_000;

/** What a site keeps of a license: the key and the activation, encrypted. */
interface StoredLicense {
  key: SealedSecret;
  activation: SealedSecret;
  server: string;
  keyHint: string;
  activatedAt: string;
  updatesUntil: string | null;
  seats: { used: number; total: number } | null;
  renewUrl: string | null;
}

const seatsSchema = z
  .object({ used: z.number().int().nonnegative(), total: z.number().int().nonnegative() })
  .nullable()
  .default(null);
const datetime = z.iso.datetime({ offset: true }).nullable().default(null);
const renewSchema = z.url().nullable().default(null);

const activateAnswer = z.object({
  activation: z.string().min(16).max(200),
  updatesUntil: datetime,
  seats: seatsSchema,
  renewUrl: renewSchema,
});
const statusAnswer = z.object({
  status: z.enum(['active', 'revoked', 'unknown']),
  updatesUntil: datetime,
  seats: seatsSchema,
  renewUrl: renewSchema,
});
const tokenAnswer = z.object({ url: z.string().min(1).max(2000), updatesUntil: datetime });

/** A paid theme or plugin. */
export interface LicensedItem {
  type: LicensedType;
  slug: string;
}

/**
 * Licenses of paid themes and plugins (RF-CAT-03), one per item and site. The key is
 * activated once with the theme's license server and kept encrypted; the
 * server is asked again only to download a version or to refresh the status,
 * never while pages are rendered.
 */
@Injectable()
export class LicensesService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly updates: UpdatesService,
    private readonly audit: AuditService,
  ) {}

  private run<T>(siteId: string, auth: AuthContext, fn: Parameters<typeof withContext<T>>[2]) {
    return withContext(this.database.db, { siteId, userId: auth.userId }, fn);
  }

  private async stored(siteId: string, auth: AuthContext, item: LicensedItem) {
    const key = licenseStorageKey(item.type, item.slug);
    const [row] = await this.run(siteId, auth, (tx) =>
      tx
        .select({ value: settings.value })
        .from(settings)
        .where(
          and(
            eq(settings.siteId, siteId),
            eq(settings.namespace, LICENSES_NAMESPACE),
            eq(settings.key, key),
          ),
        ),
    );
    return (row?.value as StoredLicense | undefined) ?? null;
  }

  private async save(
    siteId: string,
    auth: AuthContext,
    item: LicensedItem,
    value: StoredLicense | null,
    audit?: { action: string; ip: string; meta?: Record<string, unknown> },
  ): Promise<void> {
    const key = licenseStorageKey(item.type, item.slug);
    await this.run(siteId, auth, async (tx) => {
      await tx
        .delete(settings)
        .where(
          and(
            eq(settings.siteId, siteId),
            eq(settings.namespace, LICENSES_NAMESPACE),
            eq(settings.key, key),
          ),
        );
      if (value) {
        await tx.insert(settings).values({ siteId, namespace: LICENSES_NAMESPACE, key, value });
      }
      if (audit) {
        await this.audit.record(tx, {
          siteId,
          userId: auth.userId,
          action: audit.action,
          targetType: item.type,
          targetId: item.slug,
          meta: audit.meta ?? {},
          ip: audit.ip,
        });
      }
    });
  }

  private view(item: LicensedItem, s: StoredLicense): LicenseView {
    return {
      type: item.type,
      slug: item.slug,
      keyHint: s.keyHint,
      activatedAt: s.activatedAt,
      updatesUntil: s.updatesUntil,
      seats: s.seats,
      renewUrl: s.renewUrl,
    };
  }

  /** The licenses of the site, by storage key (`licenseStorageKey`). */
  async list(siteId: string, auth: AuthContext): Promise<Map<string, LicenseView>> {
    const rows = await this.run(siteId, auth, (tx) =>
      tx
        .select({ key: settings.key, value: settings.value })
        .from(settings)
        .where(and(eq(settings.siteId, siteId), eq(settings.namespace, LICENSES_NAMESPACE))),
    );
    return new Map(
      rows.map((r) => {
        const item: LicensedItem = r.key.startsWith('plugin:')
          ? { type: 'plugin', slug: r.key.slice('plugin:'.length) }
          : { type: 'theme', slug: r.key };
        return [r.key, this.view(item, r.value as StoredLicense)];
      }),
    );
  }

  async has(siteId: string, auth: AuthContext, item: LicensedItem): Promise<boolean> {
    return (await this.stored(siteId, auth, item)) !== null;
  }

  /** Activates a key for this site with the license server, and keeps it. */
  async activate(
    siteId: string,
    auth: AuthContext,
    input: LicensedItem & { key: string; server: string; origin: string; ip: string },
  ): Promise<LicenseView> {
    const item: LicensedItem = { type: input.type, slug: input.slug };
    if (!isLicenseKey(input.key)) {
      throw new BadRequestException(
        'This is not a valid license key: check it against the email you received.',
      );
    }
    const key = normalizeLicenseKey(input.key);
    const answer = activateAnswer.parse(
      await this.call(input.server, 'activate', {
        key,
        slug: input.slug,
        siteOrigin: input.origin,
        siteId,
      }),
    );
    const value: StoredLicense = {
      key: seal(this.config.appSecret, key),
      activation: seal(this.config.appSecret, answer.activation),
      server: input.server,
      keyHint: formatLicenseKey(key).slice(-5),
      activatedAt: new Date().toISOString(),
      updatesUntil: answer.updatesUntil,
      seats: answer.seats,
      renewUrl: answer.renewUrl,
    };
    await this.save(siteId, auth, item, value, {
      action: 'license.activated',
      ip: input.ip,
      meta: { keyHint: value.keyHint },
    });
    return this.view(item, value);
  }

  /**
   * Frees the site's seat and forgets the key. The item keeps working; it
   * cannot be activated again on this site without a license.
   */
  async deactivate(
    siteId: string,
    auth: AuthContext,
    item: LicensedItem,
    ip: string,
  ): Promise<{ warning: string | null }> {
    const slug = item.slug;
    const stored = await this.stored(siteId, auth, item);
    if (!stored) return { warning: null };
    let warning: string | null = null;
    const activation = unseal(this.config.appSecret, stored.activation);
    if (activation) {
      try {
        await this.call(stored.server, 'deactivate', { activation, slug });
      } catch (error) {
        warning = `The license server was not told (${(error as Error).message}): the seat may stay in use until you free it from your account.`;
      }
    }
    await this.save(siteId, auth, item, null, { action: 'license.deactivated', ip });
    return { warning };
  }

  /** Asks the server what the license includes now (e.g. after a renewal). */
  async refresh(
    siteId: string,
    auth: AuthContext,
    item: LicensedItem,
  ): Promise<LicenseView | null> {
    const slug = item.slug;
    const stored = await this.stored(siteId, auth, item);
    if (!stored) return null;
    const answer = statusAnswer.parse(
      await this.call(stored.server, 'status', { activation: this.activation(stored), slug }),
    );
    if (answer.status !== 'active') {
      await this.save(siteId, auth, item, null, {
        action: 'license.deactivated',
        ip: '',
        meta: { reason: answer.status },
      });
      throw new BadRequestException(
        answer.status === 'revoked'
          ? 'The license was revoked (for example after a refund): it has been removed from this site.'
          : 'The license server does not know this site any more: enter the key again.',
      );
    }
    const value = {
      ...stored,
      updatesUntil: answer.updatesUntil,
      seats: answer.seats,
      renewUrl: answer.renewUrl ?? stored.renewUrl,
    };
    await this.save(siteId, auth, item, value);
    return this.view(item, value);
  }

  /**
   * A short-lived download address for a version. With a license, the server
   * refuses versions released after the updates it includes; without one, it
   * may give the demo (installed to try with the live preview, never activated).
   */
  async downloadUrl(
    siteId: string,
    auth: AuthContext,
    input: LicensedItem & { version: string; server: string; origin: string },
  ): Promise<string> {
    const item: LicensedItem = { type: input.type, slug: input.slug };
    const stored = await this.stored(siteId, auth, item);
    const server = stored?.server ?? input.server;
    const body = stored
      ? { activation: this.activation(stored), slug: input.slug, version: input.version }
      : {
          demo: true,
          slug: input.slug,
          version: input.version,
          siteOrigin: input.origin,
          siteId,
        };
    let answer: z.infer<typeof tokenAnswer>;
    try {
      answer = tokenAnswer.parse(await this.call(server, 'download-token', body));
    } catch (error) {
      const until = (error as { updatesUntil?: unknown }).updatesUntil;
      if (stored && typeof until === 'string' && until !== stored.updatesUntil) {
        await this.save(siteId, auth, item, { ...stored, updatesUntil: until });
      }
      throw error;
    }
    if (stored && answer.updatesUntil !== stored.updatesUntil) {
      await this.save(siteId, auth, item, { ...stored, updatesUntil: answer.updatesUntil });
    }
    // The address is relative to the license server, or on the same server.
    const url = new URL(answer.url, `${server.replace(/\/+$/, '')}/`);
    if (url.origin !== new URL(server).origin) {
      throw new BadRequestException('The license server gave a download address elsewhere.');
    }
    return url.href;
  }

  private activation(stored: StoredLicense): string {
    const activation = unseal(this.config.appSecret, stored.activation);
    if (!activation) {
      throw new BadRequestException(
        'The license cannot be read (the server secret changed): enter the key again.',
      );
    }
    return activation;
  }

  /** POSTs to the license server; its message is shown as is when it refuses. */
  private async call(server: string, action: string, body: unknown): Promise<unknown> {
    const base = licenseServerUrl(server);
    let res: Response;
    try {
      res = await fetch(`${base}/${action}`, {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'user-agent': `Cleitext/${this.updates.current}`,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ServiceUnavailableException(
        `The license server (${new URL(base).host}) cannot be reached: try again later. Installed themes and plugins keep working.`,
      );
    }
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.ok && data) return data;
    const message =
      typeof data?.message === 'string' && data.message.length < 500
        ? data.message
        : `The license server answered ${res.status}.`;
    if (res.status >= 500 || !data) throw new ServiceUnavailableException(message);
    // Refusals keep their meaning: 402 renew, 409 no seat left, 404 unknown key…
    const status = [402, 403, 404, 409, 429].includes(res.status) ? res.status : 400;
    const error = new HttpException({ message }, status);
    if (typeof data.updatesUntil === 'string') {
      (error as HttpException & { updatesUntil?: string }).updatesUntil = data.updatesUntil;
    }
    throw error;
  }
}

/** https, or http to this machine (tests, a local license server). */
export function licenseServerUrl(server: string): string {
  const url = new URL(server);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new BadRequestException('License servers must use https.');
  }
  return url.href.replace(/\/+$/, '');
}
