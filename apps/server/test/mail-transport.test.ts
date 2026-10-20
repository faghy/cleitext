/** The server's mail transport from MAIL_URL. */
import { describe, expect, it } from 'vitest';
import { sendmailPath } from '../src/mail/mail.service.js';

describe('sendmail://', () => {
  it("uses the server's sendmail, or the program given", () => {
    expect(sendmailPath('sendmail://')).toBe('/usr/sbin/sendmail');
    expect(sendmailPath('sendmail:///usr/lib/sendmail')).toBe('/usr/lib/sendmail');
    expect(sendmailPath('sendmail://;rm -rf')).toBe('/usr/sbin/sendmail');
  });
});
