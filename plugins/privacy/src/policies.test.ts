import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { policy } from './policies';

describe('privacy policy', () => {
  it('adds the sections of other plugins, as text, to the privacy policy only', () => {
    const sections = [{ title: 'Booking <appointments>', text: 'We use your name & email.' }];
    const site = { name: 'Studio', url: 'https://studio.test' };
    const privacy = JSON.stringify(
      policy('privacy', DEFAULT_CONFIG, 'en', site, {}, [], sections).document,
    );
    expect(privacy).toContain('"text":"Booking <appointments>"');
    expect(privacy).toContain('We use your name & email.');
    const cookies = JSON.stringify(
      policy('cookies', DEFAULT_CONFIG, 'en', site, {}, [], sections).document,
    );
    expect(cookies).not.toContain('Booking');
  });
});
