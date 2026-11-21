import { pushDevices, siteDomains, withContext, type DatabaseClient } from '@cleitext/db';
import { PUSH_EVENTS, type Label, type PushEvent, type PushStatusView } from '@cleitext/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { IdentityService } from '../auth/identity.service.js';
import type { AuthContext } from '../common/request-context.js';
import { relayUserAgent } from '../common/version.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';

/** A notification for the phones of the people who get an event. */
export interface PushNotice {
  event: PushEvent;
  /** The object it is about (a comment, a message, an order). */
  id: string;
  /** A text, or texts by language (`{ en, it }`): each person reads theirs. */
  title: Label;
  body: Label;
  /** The admin screen the notification opens, e.g. `/cl-admin/comments?status=pending`. */
  adminPath: string;
}

/** What the relay is given: one request per language, at most 100 phones. */
export interface RelayPayload {
  tokens: string[];
  title: string;
  body: string;
  data: Record<string, string>;
}

/** Tokens per request to the relay. */
const BATCH = 100;
const RELAY_TIMEOUT_MS = 5_000;
const TITLE_MAX = 120;
const BODY_MAX = 400;

/** The text for a language: `it-IT` takes `it`, then English, then any. */
export function localized(label: Label, locale: string): string {
  if (typeof label === 'string') return label;
  const base = locale.split(/[-_]/)[0]!.toLowerCase();
  return label[locale] ?? label[base] ?? label.en ?? Object.values(label)[0] ?? '';
}

/** An admin path: starts with one `/`, no line breaks, 500 characters at most. */
export function validAdminPath(path: string): boolean {
  return (
    typeof path === 'string' &&
    path.length <= 500 &&
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !/[\s\\]/.test(path)
  );
}

const cut = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/**
 * Push notifications of the official app: the core asks the relay of
 * cleitext.com (`CLEITEXT_PUSH_RELAY`), which holds the Firebase keys, to
 * send them. Everything happens after the request that caused it, and a
 * failure is only logged: notifications never slow down or break the site.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger('Push');
  private readonly origins = new Map<string, { origin: string; at: number }>();

  /** The request to the relay; tests replace it. */
  transport = async (
    url: string,
    payload: RelayPayload,
    origin: string,
  ): Promise<{ invalid: string[] }> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cleitext-site': origin,
        'user-agent': relayUserAgent(),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
      redirect: 'error',
    });
    if (!res.ok) throw new Error(`The relay answered ${res.status}.`);
    const answer = (await res.json().catch(() => ({}))) as { invalid?: unknown };
    return {
      invalid: Array.isArray(answer.invalid)
        ? answer.invalid.filter((t): t is string => typeof t === 'string')
        : [],
    };
  };

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly identity: IdentityService,
  ) {}

  /** Notifications are sent: a relay is set (an empty `CLEITEXT_PUSH_RELAY` turns them off). */
  get enabled(): boolean {
    return this.config.push.relayUrl !== '';
  }

  /** `GET /push/status`: the events this person can receive on the site. */
  async status(siteId: string, auth: AuthContext): Promise<PushStatusView> {
    const active = await this.identity.activePlugins(siteId);
    return {
      enabled: this.enabled,
      events: PUSH_EVENTS.filter(
        (e) =>
          (e.plugin === null || active.has(e.plugin)) && auth.capabilities.includes(e.capability),
      ).map((e) => e.id),
    };
  }

  /**
   * Sends a notification to the phones of the people who chose the event and
   * have its capability on the site. Never throws: call it without waiting.
   */
  async notify(siteId: string, notice: PushNotice): Promise<void> {
    try {
      await this.deliver(siteId, notice);
    } catch (error) {
      this.logger.warn(`Push notification not sent: ${String(error)}`);
    }
  }

  private async deliver(siteId: string, notice: PushNotice): Promise<void> {
    if (!this.enabled) return;
    const spec = PUSH_EVENTS.find((e) => e.id === notice.event);
    if (!spec || !validAdminPath(notice.adminPath)) return;
    const devices = await withContext(this.database.db, { siteId }, (tx) =>
      tx
        .select({ userId: pushDevices.userId, token: pushDevices.token })
        .from(pushDevices)
        .where(sql`${notice.event} = ANY (${pushDevices.events})`),
    );
    if (devices.length === 0) return;

    // Each person once: still on the site, with the capability, in their language.
    const byLocale = new Map<string, string[]>();
    const people = new Map<string, string[]>();
    for (const d of devices) people.set(d.userId, [...(people.get(d.userId) ?? []), d.token]);
    for (const [userId, tokens] of people) {
      const auth = await this.identity.load(siteId, userId, '');
      if (!auth || !auth.capabilities.includes(spec.capability)) continue;
      const locale = auth.locale || 'en';
      byLocale.set(locale, [...(byLocale.get(locale) ?? []), ...tokens]);
    }
    if (byLocale.size === 0) return;

    const origin = await this.origin(siteId);
    if (!origin) return;
    const data = {
      type: notice.event,
      siteUrl: origin,
      adminPath: notice.adminPath,
      id: String(notice.id),
    };
    const invalid: string[] = [];
    for (const [locale, tokens] of byLocale) {
      const title = cut(localized(notice.title, locale).trim(), TITLE_MAX);
      const body = cut(localized(notice.body, locale).trim(), BODY_MAX);
      if (!title) continue;
      for (let i = 0; i < tokens.length; i += BATCH) {
        try {
          const answer = await this.transport(
            this.config.push.relayUrl,
            { tokens: tokens.slice(i, i + BATCH), title, body, data },
            origin,
          );
          invalid.push(...answer.invalid);
        } catch (error) {
          this.logger.warn(`Push relay: ${String(error)}`);
        }
      }
    }
    // Phones that stopped working (app removed, token renewed): forgotten.
    if (invalid.length > 0) {
      await withContext(this.database.db, { siteId }, (tx) =>
        tx
          .delete(pushDevices)
          .where(and(eq(pushDevices.siteId, siteId), inArray(pushDevices.token, invalid))),
      );
    }
  }

  /** The site's address, from its main domain; cached for a minute. */
  private async origin(siteId: string): Promise<string> {
    const cached = this.origins.get(siteId);
    if (cached && Date.now() - cached.at < 60_000) return cached.origin;
    const [domain] = await withContext(this.database.db, { siteId }, (tx) =>
      tx
        .select({ host: siteDomains.host, https: siteDomains.forceHttps })
        .from(siteDomains)
        .where(eq(siteDomains.siteId, siteId))
        .orderBy(desc(siteDomains.isPrimary))
        .limit(1),
    );
    const origin = domain ? `${domain.https ? 'https' : 'http'}://${domain.host}` : '';
    this.origins.set(siteId, { origin, at: Date.now() });
    return origin;
  }
}
