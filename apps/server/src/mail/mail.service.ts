import { settings, siteDomains, sites, withContext, type DatabaseClient } from '@cleitext/db';
import type { MailDeliverResult, MailDeliverSmtp, OutgoingMail } from '@cleitext/plugin-sdk';
import type { MailSettingsView } from '@cleitext/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
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
  /**
   * `site`: sent with the site's own SMTP settings; `plugin`: delivered by a
   * transport plugin; `plugin-smtp`: through the SMTP server a plugin gave.
   */
  via: 'site' | 'server' | 'plugin' | 'plugin-smtp';
}

/**
 * Hands a site's email to the transport plugins (`mail.deliver`, plugin API
 * 1.60); null when none took it.
 */
export type MailDeliverer = (
  message: OutgoingMail,
  siteId: string,
) => Promise<MailDeliverResult | null>;

export const MAIL_NAMESPACE = 'mail';

/** The sender without MAIL_FROM nor a site: messages of the server itself. */
const SERVER_FROM = 'Cleitext <no-reply@localhost>';

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
 * - `log://`: printed to the log (development, or a server without sendmail);
 * - `memory://`: kept in `outbox` (tests), site settings included.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly transport: Transporter | null;
  private readonly driver: 'smtp' | 'log' | 'memory';
  private readonly sites = new Map<string, SiteTransport | null>();
  /** Without MAIL_FROM: each site's own sender, from its name and domain. */
  private readonly senders = new Map<string, { from: string; expiresAt: number }>();
  /** Messages sent with the `memory://` driver. */
  readonly outbox: SentMail[] = [];
  private deliverer: MailDeliverer | null = null;

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

  /** A transport plugin's way in (plugin API 1.60), set by the plugin services. */
  useDeliverer(deliverer: MailDeliverer): void {
    this.deliverer = deliverer;
  }

  /**
   * Sends a message; with `siteId`, through a transport plugin when one is
   * active, else the site's SMTP server when it has one.
   */
  async send(message: MailMessage, siteId?: string): Promise<void> {
    const site = siteId ? await this.siteTransport(siteId) : null;
    const { fromOverride, ...rest } = message;
    const from = senderOf(site?.from ?? (await this.serverSender(siteId)), fromOverride);
    const chosen = Boolean(fromOverride?.address || fromOverride?.name);
    if (siteId && (await this.viaPlugin(rest, from, chosen, siteId))) return;
    if (this.driver === 'memory') {
      this.outbox.push({ ...rest, from, via: site ? 'site' : 'server' });
      return;
    }
    const mail = mailFields(from, rest);
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

  /**
   * A transport plugin's turn (`mail.deliver`): true when it delivered the
   * email or its SMTP server took it. Anything else (no plugin, an error, a
   * server that refuses) leaves the email to the usual way, so a broken
   * plugin never stops the site's emails.
   */
  private async viaPlugin(
    rest: Omit<MailMessage, 'fromOverride'>,
    from: string,
    chosen: boolean,
    siteId: string,
  ): Promise<boolean> {
    if (!this.deliverer) return false;
    let result: MailDeliverResult | null;
    try {
      result = await this.deliverer(
        {
          from,
          fromChosen: chosen,
          to: addressList(rest.to),
          cc: rest.cc ?? [],
          bcc: rest.bcc ?? [],
          subject: rest.subject,
          text: rest.text,
          ...(rest.html !== undefined ? { html: rest.html } : {}),
          ...(rest.replyTo ? { replyTo: rest.replyTo } : {}),
          attachments: (rest.attachments ?? []).map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
          })),
        },
        siteId,
      );
    } catch (error) {
      this.logger.warn(`Mail plugin failed, sending the usual way: ${String(error)}`);
      return false;
    }
    if (!result || typeof result !== 'object') return false;
    const sender =
      !chosen && typeof result.from === 'string' && result.from.trim()
        ? senderOf(from, pluginSender(result.from))
        : from;
    if ('delivered' in result && result.delivered === true) {
      if (this.driver === 'memory') this.outbox.push({ ...rest, from: sender, via: 'plugin' });
      return true;
    }
    if (!('smtp' in result)) return false;
    const smtp = checkSmtp(result.smtp);
    if (!smtp) {
      this.logger.warn(
        'Mail plugin gave an SMTP server that is not allowed: sending the usual way',
      );
      return false;
    }
    if (this.driver === 'memory') {
      this.outbox.push({ ...rest, from: sender, via: 'plugin-smtp' });
      return true;
    }
    try {
      await createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.security === 'tls',
        requireTLS: smtp.security === 'starttls',
        ignoreTLS: smtp.security === 'none',
        ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.password ?? '' } } : {}),
        connectionTimeout: 15_000,
      }).sendMail(mailFields(sender, rest));
      return true;
    } catch (error) {
      this.logger.warn(
        `SMTP server of the mail plugin (${smtp.host}) failed, sending the usual way: ${String(error)}`,
      );
      return false;
    }
  }

  /** Forgets cached site settings (after a change). */
  forget(siteId: string): void {
    this.sites.delete(siteId);
    this.senders.delete(siteId);
  }

  /**
   * The sender used without the site's own SMTP settings: MAIL_FROM, or else,
   * as WordPress does, `"Site name" <no-reply@site domain>`.
   */
  private async serverSender(siteId?: string): Promise<string> {
    if (this.config.mail.from) return this.config.mail.from;
    if (!siteId) return SERVER_FROM;
    const cached = this.senders.get(siteId);
    if (cached && cached.expiresAt > Date.now()) return cached.from;
    const { title, name, host } = await withContext(this.database.db, { siteId }, async (tx) => {
      const [setting] = await tx
        .select({ value: settings.value })
        .from(settings)
        .where(and(eq(settings.namespace, 'core'), eq(settings.key, 'title')));
      const [site] = await tx.select({ name: sites.name }).from(sites).where(eq(sites.id, siteId));
      const [domain] = await tx
        .select({ host: siteDomains.host })
        .from(siteDomains)
        .where(eq(siteDomains.siteId, siteId))
        .orderBy(desc(siteDomains.isPrimary))
        .limit(1);
      return { title: setting?.value, name: site?.name, host: domain?.host };
    });
    const from = siteSender(typeof title === 'string' && title ? title : (name ?? ''), host);
    this.senders.set(siteId, { from, expiresAt: Date.now() + 60_000 });
    return from;
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

/** Only these fields reach the mailer: never options of its own. */
function mailFields(from: string, rest: Omit<MailMessage, 'fromOverride'>) {
  return {
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
}

/** `a@x.it, b@y.it` → the addresses. */
function addressList(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/** A plugin's sender, `Name <address>` or an address, on one line. */
function pluginSender(value: string): { address?: string; name?: string } {
  // eslint-disable-next-line no-control-regex
  const line = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  const match = /^"?([^"<]*?)"?\s*<([^<>\s]+@[^<>\s]+)>$/.exec(line);
  if (match) return { name: match[1]!.trim() || undefined, address: match[2]! };
  return /^[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+$/.test(line) ? { address: line } : {};
}

/**
 * The SMTP server a plugin gave, if allowed: a public-looking host name (no
 * addresses, `localhost` or names without a dot, so a plugin cannot reach
 * the server's own network) and a valid port.
 */
export function checkSmtp(value: unknown): MailDeliverSmtp | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const host = typeof v.host === 'string' ? v.host.trim().toLowerCase() : '';
  if (
    host.length > 253 ||
    !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ||
    /\.\d+$/.test(host) ||
    /(^|\.)localhost$/.test(host)
  )
    return null;
  const port = v.port;
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const security = v.security === 'tls' || v.security === 'none' ? v.security : 'starttls';
  return {
    host,
    port,
    security,
    ...(typeof v.user === 'string' && v.user ? { user: v.user } : {}),
    ...(typeof v.password === 'string' ? { password: v.password } : {}),
  };
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

/**
 * `"Site name" <no-reply@domain>`, `www.` left out of the domain. A site
 * without a real domain (localhost, an address) sends as the server.
 */
export function siteSender(name: string, host: string | null | undefined): string {
  const domain = (host ?? '')
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/^www\./, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(domain)) return SERVER_FROM;
  const label = name.replace(/["\\<>\r\n]/g, '').trim();
  return label ? `"${label}" <no-reply@${domain}>` : `no-reply@${domain}`;
}

/** `sendmail://` → /usr/sbin/sendmail; `sendmail:///usr/lib/sendmail` → that program. */
export function sendmailPath(url: string): string {
  const path = url.slice('sendmail://'.length);
  return /^\/[\w./-]+$/.test(path) ? path : '/usr/sbin/sendmail';
}
