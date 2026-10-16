import { settings, withContext, type DatabaseClient } from '@cleitext/db';
import type { MailSettingsView } from '@cleitext/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { createTransport, type Transporter } from 'nodemailer';
import { unseal } from '../common/secrets.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** An HTML version (plugin API 1.16); `text` stays for clients without HTML. */
  html?: string;
  replyTo?: string;
}

/** Messages kept by the `memory://` driver, with the sender actually used. */
export interface SentMail extends MailMessage {
  from: string;
  /** `site`: sent with the site's own SMTP settings. */
  via: 'site' | 'server';
}

export const MAIL_NAMESPACE = 'mail';

interface SiteTransport {
  transport: Transporter | null;
  from: string;
  expiresAt: number;
}

/**
 * Outgoing email. A site can have its own SMTP server (RF-SET-02); otherwise
 * the server's MAIL_URL is used:
 * - `smtp://` / `smtps://`: real delivery (nodemailer);
 * - `log://`: printed to the log (development);
 * - `memory://`: kept in `outbox` (tests), site settings included.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly transport: Transporter | null;
  private readonly driver: 'smtp' | 'log' | 'memory';
  private readonly sites = new Map<string, SiteTransport | null>();
  /** Messages sent with the `memory://` driver. */
  readonly outbox: SentMail[] = [];

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: DatabaseClient,
  ) {
    const scheme = config.mail.url.split(':')[0];
    this.driver = scheme === 'log' ? 'log' : scheme === 'memory' ? 'memory' : 'smtp';
    this.transport = this.driver === 'smtp' ? createTransport(config.mail.url) : null;
  }

  /** Sends a message; with `siteId`, through the site's SMTP server when it has one. */
  async send(message: MailMessage, siteId?: string): Promise<void> {
    const site = siteId ? await this.siteTransport(siteId) : null;
    const from = site?.from ?? this.config.mail.from;
    if (this.driver === 'memory') {
      this.outbox.push({ ...message, from, via: site ? 'site' : 'server' });
      return;
    }
    if (site?.transport) {
      await site.transport.sendMail({ from, ...message });
      return;
    }
    if (this.driver === 'log') {
      this.logger.log(`From: ${from} | To: ${message.to} | ${message.subject}\n${message.text}`);
      return;
    }
    await this.transport!.sendMail({ from, ...message });
  }

  /** Forgets cached site settings (after a change). */
  forget(siteId: string): void {
    this.sites.delete(siteId);
  }

  /** The site's settings, without the password. */
  async view(siteId: string): Promise<MailSettingsView> {
    const values = await this.load(siteId);
    return {
      configured: typeof values.host === 'string',
      host: typeof values.host === 'string' ? values.host : null,
      port: typeof values.port === 'number' ? values.port : null,
      security: (values.security as MailSettingsView['security']) ?? null,
      user: typeof values.user === 'string' ? values.user : null,
      from: typeof values.from === 'string' ? values.from : null,
      hasPassword: Boolean(values.password),
      serverLogsOnly: this.driver === 'log',
    };
  }

  /** False when the site's emails would only be written to the log. */
  async delivers(siteId: string): Promise<boolean> {
    return this.driver !== 'log' || Boolean((await this.siteTransport(siteId))?.transport);
  }

  private async load(siteId: string): Promise<Record<string, unknown>> {
    const rows = await withContext(this.database.db, { siteId }, (tx) =>
      tx.select().from(settings).where(eq(settings.namespace, MAIL_NAMESPACE)),
    );
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  private async siteTransport(siteId: string): Promise<SiteTransport | null> {
    const cached = this.sites.get(siteId);
    if (cached !== undefined && (cached === null || cached.expiresAt > Date.now())) return cached;
    const values = await this.load(siteId);
    let result: SiteTransport | null = null;
    if (typeof values.host === 'string' && typeof values.from === 'string') {
      const password = values.password ? unseal(this.config.appSecret, values.password) : null;
      if (values.password && password === null) {
        this.logger.error(
          `SMTP password of site ${siteId} cannot be decrypted (APP_SECRET changed?)`,
        );
      }
      result = {
        from: values.from,
        expiresAt: Date.now() + 60_000,
        transport:
          this.driver === 'memory'
            ? null
            : createTransport({
                host: values.host,
                port: typeof values.port === 'number' ? values.port : 587,
                secure: values.security === 'tls',
                requireTLS: values.security === 'starttls',
                ignoreTLS: values.security === 'none',
                ...(typeof values.user === 'string' && values.user
                  ? { auth: { user: values.user, pass: password ?? '' } }
                  : {}),
                connectionTimeout: 15_000,
              }),
      };
    }
    this.sites.set(siteId, result);
    return result;
  }
}
