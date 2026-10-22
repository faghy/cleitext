/** Emails sent by plugins (plugin API 1.41): official fields, limits, header injection. */
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config/config.js';
import type { DatabaseClient } from '@cleitext/db';
import { MailService, senderOf } from '../src/mail/mail.service.js';
import {
  MAX_ATTACHMENT_BYTES,
  parseAddresses,
  pluginMail,
  PluginMailError,
} from '../src/mail/plugin-mail.js';

const base = { to: 'a@example.com', subject: 'Hello', text: 'Body' };

describe('pluginMail', () => {
  it('keeps the fields of API 1.16 as they were', () => {
    expect(pluginMail({ ...base, html: '<p>Body</p>', replyTo: 'r@example.com' })).toEqual({
      to: 'a@example.com',
      subject: 'Hello',
      text: 'Body',
      html: '<p>Body</p>',
      replyTo: 'r@example.com',
    });
  });

  it('takes lists or comma-separated addresses, with names, without duplicates', () => {
    expect(parseAddresses('A <A@example.com>, b@example.com; a@example.com', 'to')).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
    const message = pluginMail({
      ...base,
      to: ['a@example.com', 'b@example.com'],
      cc: 'b@example.com, c@example.com',
      bcc: ['c@example.com', 'd@example.com'],
    });
    expect(message).toMatchObject({
      to: 'a@example.com, b@example.com',
      cc: ['c@example.com'],
      bcc: ['d@example.com'],
    });
  });

  it('refuses addresses with line breaks or that are not valid (header injection)', () => {
    expect(() => pluginMail({ ...base, to: 'a@example.com\r\nBcc: x@evil.test' })).toThrow(
      PluginMailError,
    );
    expect(() => pluginMail({ ...base, cc: 'x@evil.test\nSubject: hi' })).toThrow(/line break/);
    expect(() => pluginMail({ ...base, replyTo: 'not an address' })).toThrow(/invalid/);
    expect(() => pluginMail({ ...base, from: 'a@example.com, b@example.com' })).toThrow(/one/);
    expect(() => pluginMail({ ...base, to: '' })).toThrow(/no recipient/);
  });

  it('keeps subject and sender name on one line', () => {
    const message = pluginMail({
      ...base,
      subject: 'Hi\r\nBcc: x@evil.test',
      fromName: 'Shop "Best"\n<Owner>',
    });
    expect(message.subject).toBe('Hi Bcc: x@evil.test');
    expect(message.fromOverride).toEqual({ name: 'Shop Best Owner' });
  });

  it('limits recipients, attachments and size', () => {
    const many = Array.from({ length: 51 }, (_, i) => `p${i}@example.com`);
    expect(() => pluginMail({ ...base, to: many })).toThrow(/50 recipients/);
    const files = Array.from({ length: 11 }, () => ({ filename: 'a.txt', content: 'x' }));
    expect(() => pluginMail({ ...base, attachments: files })).toThrow(/10 attachments/);
    const big = new Uint8Array(MAX_ATTACHMENT_BYTES / 2 + 1);
    expect(() =>
      pluginMail({
        ...base,
        attachments: [
          { filename: 'a.bin', content: big },
          { filename: 'b.bin', content: big },
        ],
      }),
    ).toThrow(/20 MB/);
    expect(() => pluginMail({ ...base, text: 'x'.repeat(2_000_001) })).toThrow(/too long/);
  });

  it('passes attachments from memory only, with safe names and types', () => {
    const message = pluginMail({
      ...base,
      attachments: [
        { filename: '../../etc/passwd', content: Buffer.from('a'), contentType: 'text/plain' },
        {
          filename: 'x\r\n.pdf',
          content: 'text',
          contentType: 'text/html\r\nX-Evil: 1',
          path: '/etc/passwd',
        } as never,
      ],
    });
    expect(message.attachments).toEqual([
      { filename: '_.._etc_passwd', content: Buffer.from('a'), contentType: 'text/plain' },
      { filename: 'x .pdf', content: Buffer.from('text'), contentType: 'application/octet-stream' },
    ]);
    expect(() =>
      pluginMail({ ...base, attachments: [{ filename: 'a', path: '/etc/passwd' } as never] }),
    ).toThrow(/no content/);
  });

  it('drops fields that are not part of the API', () => {
    const message = pluginMail({ ...base, headers: { 'X-A': '1' }, envelope: {} } as never);
    expect(Object.keys(message).sort()).toEqual(['subject', 'text', 'to']);
  });
});

describe('senderOf', () => {
  it('keeps the site sender, or changes its name, or the whole address', () => {
    expect(senderOf('Site <hi@site.test>')).toBe('Site <hi@site.test>');
    expect(senderOf('Site <hi@site.test>', { name: 'Form' })).toBe('"Form" <hi@site.test>');
    expect(senderOf('hi@site.test', { name: 'Form' })).toBe('"Form" <hi@site.test>');
    expect(senderOf('Site <hi@site.test>', { address: 'me@other.test' })).toBe('me@other.test');
    expect(senderOf('Site <hi@site.test>', { address: 'me@other.test', name: 'Me' })).toBe(
      '"Me" <me@other.test>',
    );
  });
});

describe('MailService with plugin fields', () => {
  it('keeps Cc, Bcc, attachments and the chosen sender', async () => {
    const mail = new MailService(
      { mail: { url: 'memory://', from: 'Server <noreply@server.test>' } } as AppConfig,
      {} as DatabaseClient,
    );
    await mail.send(
      pluginMail({
        ...base,
        cc: 'c@example.com',
        bcc: 'd@example.com',
        fromName: 'Contact form',
        attachments: [{ filename: 'a.txt', content: 'hello', contentType: 'text/plain' }],
      }),
    );
    expect(mail.outbox.at(-1)).toMatchObject({
      from: '"Contact form" <noreply@server.test>',
      to: 'a@example.com',
      cc: ['c@example.com'],
      bcc: ['d@example.com'],
      attachments: [{ filename: 'a.txt', contentType: 'text/plain' }],
      via: 'server',
    });
    expect(mail.outbox.at(-1)).not.toHaveProperty('fromOverride');
  });
});
