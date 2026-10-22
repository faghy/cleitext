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
  /** Copies (plugin API 1.41). */
  cc?: string[];
  /** Hidden copies (plugin API 1.41): in the envelope only, never in a header. */
  bcc?: string[];
  /** Files, from memory only (never read from disk or an address). */
  attachments?: MailAttachment[];
  /**
   * Sender chosen by a plugin (plugin API 1.41): its address and/or its name,
   * in place of the site's. A name alone goes with the site's address.
   */
  fromOverride?: { address?: string; name?: string };
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

/** Messages kept by the `memory://` driver, with the sender actually used. */
export interface SentMail extends Omit<MailMessage, 'fromOverride'> {
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
 * - `sendmail://`: handed to the server's sendmail (Plesk, cPanel…), no mailbox needed;
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
    this.transport =
      this.driver !== 'smtp'
        ? null
        : scheme === 'sendmail'
          ? createTransport({
              sendmail: true,
              newline: 'unix',
              path: sendmailPath(config.mail.url),
            })
          : createTransport(config.mail.url);
  }

  /** Sends a message; with `siteId`, through the site's SMTP server when it has one. */
  async send(message: MailMessage, siteId?: string): Promise<void> {
    const site = siteId ? await this.siteTransport(siteId) : null;
    const { fromOverride, ...rest } = message;
    const from = senderOf(site?.from ?? this.config.mail.from, fromOverride);
    if (this.driver === 'memory') {
      this.outbox.push({ ...rest, from, via: site ? 'site' : 'server' });
      return;
    }
    // Only these fields reach the mailer: never options of its own.
    const mail = {
      from,
      to: rest.to,
      subject: rest.subject,
      text: rest.text,
      ...(rest.html !== undefined ? { html: rest.html } : {}),
      ...(rest.replyTo ? { replyTo: rest.replyTo } : {}),
      ...(rest.cc?.length ? { cc: rest.cc } : {}),
      ...(rest.bcc?.length ? { bcc: rest.bcc } : {}),
      ...(rest.attachments?.length
        ? {
            attachments: rest.attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              contentType: a.contentType,
            })),
          }
        : {}),
    };
    if (site?.transport) {
      await site.transport.sendMail(mail);
      return;
    }
    if (this.driver === 'log') {
      const copies = rest.cc?.length ? ` | Cc: ${rest.cc.join(', ')}` : '';
      const files = rest.attachments?.length ? ` | ${rest.attachments.length} attachment(s)` : '';
      this.logger.log(
        `From: ${from} | To: ${rest.to}${copies}${files} | ${rest.subject}\n${rest.text}`,
      );
      return;
    }
    await this.transport!.sendMail(mail);
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

/**
 * The From header: the site's sender (`Name <address>` or an address), or a
 * plugin's choice. A name alone keeps the site's address.
 */
export function senderOf(base: string, override?: { address?: string; name?: string }): string {
  if (!override || (!override.address && !override.name)) return base;
  const baseAddress = (/<([^<>]+)>\s*$/.exec(base)?.[1] ?? base).trim();
  const baseName = /^\s*"?([^"<]*?)"?\s*</.exec(base)?.[1]?.trim() ?? '';
  const address = override.address ?? baseAddress;
  const name = override.name ?? (override.address ? '' : baseName);
  return name ? `"${name.replace(/["\\]/g, '')}" <${address}>` : address;
}

/** `sendmail://` → /usr/sbin/sendmail; `sendmail:///usr/lib/sendmail` → that program. */
export function sendmailPath(url: string): string {
  const path = url.slice('sendmail://'.length);
  return /^\/[\w./-]+$/.test(path) ? path : '/usr/sbin/sendmail';
}
