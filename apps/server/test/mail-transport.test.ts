/** The server's mail transport from MAIL_URL. */
import { describe, expect, it } from 'vitest';
import { sendmailPath, siteSender } from '../src/mail/mail.service.js';

describe('sendmail://', () => {
  it("uses the server's sendmail, or the program given", () => {
    expect(sendmailPath('sendmail://')).toBe('/usr/sbin/sendmail');
    expect(sendmailPath('sendmail:///usr/lib/sendmail')).toBe('/usr/lib/sendmail');
    expect(sendmailPath('sendmail://;rm -rf')).toBe('/usr/sbin/sendmail');
  });
});

describe('the sender without MAIL_FROM', () => {
  it('is the site, from no-reply at its domain', () => {
    expect(siteSender('Luciana Bertorelli', 'www.lucianabertorelli.com')).toBe(
      '"Luciana Bertorelli" <no-reply@lucianabertorelli.com>',
    );
    expect(siteSender('Shop "Best" <x>', 'shop.example.it:8443')).toBe(
      '"Shop Best x" <no-reply@shop.example.it>',
    );
    expect(siteSender('', 'example.com')).toBe('no-reply@example.com');
    expect(siteSender('Local', 'localhost')).toBe('Cleitext <no-reply@localhost>');
    expect(siteSender('Local', '127.0.0.1')).toBe('Cleitext <no-reply@localhost>');
    expect(siteSender('None', null)).toBe('Cleitext <no-reply@localhost>');
  });
});
