/**
 * Emails sent by plugins (`ctx.mail.send`, plugin API 1.41): the fields a
 * plugin may set, checked before they reach the mailer. Only these fields go
 * on, so a plugin cannot hand nodemailer its own options (files read from
 * disk or fetched from an address as attachments, raw headers…). Addresses
 * with line breaks are refused (header injection); subjects and names are
 * kept on one line.
 */
import type { MailAttachment, MailMessage } from './mail.service.js';

/** Recipients of one message: To, Cc and Bcc together. */
export const MAX_RECIPIENTS = 50;
/** Files attached to one message. */
export const MAX_ATTACHMENTS = 10;
/** All attachments of a message together, in bytes. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
/** The plain text and the HTML version, each, in characters. */
export const MAX_BODY_LENGTH = 2_000_000;

/** What a plugin passes to `ctx.mail.send` (see the SDK's `MailApi`). */
export interface PluginMailInput {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  from?: string;
  fromName?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: { filename: string; content: Uint8Array | string; contentType?: string }[];
}

export class PluginMailError extends Error {
  override readonly name = 'PluginMailError';
}

const ADDRESS_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;
const CONTENT_TYPE_RE = /^[a-z0-9][\w.+-]*\/[a-z0-9][\w.+-]*$/i;

/** One line: line breaks and control characters become spaces. */
export function headerLine(value: string, max: number): string {
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max)
  );
}

/**
 * Addresses from a string (separated by commas or semicolons) or a list.
 * Each one is a bare address or `Name <address>`; the name is dropped.
 * Line breaks or an invalid address make the whole message fail.
 */
export function parseAddresses(value: unknown, field: string): string[] {
  if (value === undefined || value === null || value === '') return [];
  const parts: unknown[] = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const part of parts) {
    if (typeof part !== 'string') throw new PluginMailError(`mail: ${field} must be text`);
    // eslint-disable-next-line no-control-regex
    if (/[\r\n\u0000]/.test(part)) throw new PluginMailError(`mail: ${field} has a line break`);
    for (const piece of part.split(/[,;]/)) {
      const raw = piece.trim();
      if (!raw) continue;
      const address = (/<([^<>]*)>\s*$/.exec(raw)?.[1] ?? raw).trim();
      if (address.length > 254 || !ADDRESS_RE.test(address)) {
        throw new PluginMailError(`mail: ${field} has an invalid address`);
      }
      if (!out.includes(address.toLowerCase())) out.push(address.toLowerCase());
    }
  }
  return out;
}

/** A file name without folders or control characters. */
export function attachmentName(value: unknown, index: number): string {
  const name =
    typeof value === 'string'
      ? headerLine(value.replace(/[\\/]+/g, '_'), 200).replace(/^\.+/, '')
      : '';
  return name || `attachment-${index + 1}`;
}

/** Checks and normalizes a plugin's message (throws `PluginMailError`). */
export function pluginMail(input: PluginMailInput): MailMessage {
  const to = parseAddresses(input.to, 'to');
  if (!to.length) throw new PluginMailError('mail: no recipient');
  const cc = parseAddresses(input.cc, 'cc').filter((a) => !to.includes(a));
  const bcc = parseAddresses(input.bcc, 'bcc').filter((a) => !to.includes(a) && !cc.includes(a));
  if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) {
    throw new PluginMailError(`mail: more than ${MAX_RECIPIENTS} recipients`);
  }
  if (typeof input.subject !== 'string') throw new PluginMailError('mail: subject must be text');
  if (typeof input.text !== 'string') throw new PluginMailError('mail: text must be text');
  if (input.html !== undefined && typeof input.html !== 'string') {
    throw new PluginMailError('mail: html must be text');
  }
  if (input.text.length > MAX_BODY_LENGTH || (input.html?.length ?? 0) > MAX_BODY_LENGTH) {
    throw new PluginMailError('mail: the message is too long');
  }

  const message: MailMessage = {
    to: to.join(', '),
    subject: headerLine(input.subject, 500),
    text: input.text,
  };
  if (input.html) message.html = input.html;
  const replyTo = parseAddresses(input.replyTo, 'replyTo');
  if (replyTo.length > 1) throw new PluginMailError('mail: replyTo takes one address');
  if (replyTo[0]) message.replyTo = replyTo[0];
  if (cc.length) message.cc = cc;
  if (bcc.length) message.bcc = bcc;

  const from = parseAddresses(input.from, 'from');
  if (from.length > 1) throw new PluginMailError('mail: from takes one address');
  const fromName =
    typeof input.fromName === 'string' ? headerLine(input.fromName.replace(/["<>]/g, ''), 100) : '';
  if (from[0] || fromName) {
    message.fromOverride = {
      ...(from[0] ? { address: from[0] } : {}),
      ...(fromName ? { name: fromName } : {}),
    };
  }

  if (input.attachments !== undefined) {
    if (!Array.isArray(input.attachments))
      throw new PluginMailError('mail: attachments must be a list');
    if (input.attachments.length > MAX_ATTACHMENTS) {
      throw new PluginMailError(`mail: more than ${MAX_ATTACHMENTS} attachments`);
    }
    let total = 0;
    const files: MailAttachment[] = [];
    input.attachments.forEach((file, index) => {
      const content =
        typeof file?.content === 'string'
          ? Buffer.from(file.content, 'utf8')
          : file?.content instanceof Uint8Array
            ? Buffer.from(file.content.buffer, file.content.byteOffset, file.content.byteLength)
            : null;
      if (!content) throw new PluginMailError('mail: an attachment has no content');
      total += content.byteLength;
      if (total > MAX_ATTACHMENT_BYTES) {
        throw new PluginMailError(
          `mail: attachments over ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB together`,
        );
      }
      const type = typeof file.contentType === 'string' ? file.contentType.trim() : '';
      files.push({
        filename: attachmentName(file.filename, index),
        content,
        contentType: CONTENT_TYPE_RE.test(type) ? type.toLowerCase() : 'application/octet-stream',
      });
    });
    if (files.length) message.attachments = files;
  }
  return message;
}
