import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../config/config.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

/**
 * Outgoing email. Driver chosen by MAIL_URL:
 * - `smtp://` / `smtps://`: real delivery (nodemailer);
 * - `log://`: printed to the log (development);
 * - `memory://`: kept in `outbox` (tests).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly transport: Transporter | null;
  private readonly driver: 'smtp' | 'log' | 'memory';
  /** Messages sent with the `memory://` driver. */
  readonly outbox: MailMessage[] = [];

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const scheme = config.mail.url.split(':')[0];
    this.driver = scheme === 'log' ? 'log' : scheme === 'memory' ? 'memory' : 'smtp';
    this.transport = this.driver === 'smtp' ? createTransport(config.mail.url) : null;
  }

  async send(message: MailMessage): Promise<void> {
    switch (this.driver) {
      case 'memory':
        this.outbox.push(message);
        return;
      case 'log':
        this.logger.log(`To: ${message.to} | ${message.subject}\n${message.text}`);
        return;
      default:
        await this.transport!.sendMail({ from: this.config.mail.from, ...message });
    }
  }
}
