import { describe, expect, it } from 'vitest';
import { challengeHtml } from './challenge';
import { shownFields, spamMessage, storedFields } from './server';

describe('the markup', () => {
  it('is the same for every visitor: honeypot, marker, empty token, script', () => {
    const html = challengeHtml(
      { form: 'core/comment', locale: 'it' },
      '/plugin-assets/antispam/1.0.0/antispam.js',
    );
    expect(html).toContain('data-cl-antispam="core/comment"');
    expect(html).toContain('name="cl_as_hp" value=""');
    expect(html).toContain('<input type="hidden" name="cl_as" value="1">');
    expect(html).toContain('<input type="hidden" name="cl_as_t" value="">');
    expect(html).toContain('Lascia vuoto questo campo');
    expect(html).toContain(
      '<script src="/plugin-assets/antispam/1.0.0/antispam.js" defer></script>',
    );
    expect(html).toContain('aria-hidden="true"');
    expect(challengeHtml({ form: 'forms/contact', locale: 'en' }, '/a.js')).toContain(
      'Leave this field empty',
    );
  });

  it('escapes what it is given', () => {
    expect(challengeHtml({ form: 'x/"><b>', locale: 'en' }, '/a.js?x="1"')).not.toContain('"><b>');
  });
});

describe('stored fields', () => {
  it('drop tokens, captchas and passwords, keep what delivery needs', () => {
    expect(
      storedFields({
        _spec: 'signed',
        _back: '/contact',
        name: 'Anna',
        topics: ['a', 'b', 3],
        cl_as: '1',
        cl_as_t: '1.x',
        cl_as_hp: '',
        'cf-turnstile-response': 't',
        'g-recaptcha-response': 'g',
        password: 'secret',
        nested: { a: 1 },
      }),
    ).toEqual({ _spec: 'signed', _back: '/contact', name: 'Anna', topics: ['a', 'b'] });
  });

  it('stay small', () => {
    const big = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`f${i}`, 'x'.repeat(9000)]),
    );
    expect(Object.keys(storedFields(big)).length).toBeLessThan(8);
  });

  it('are shown without the hidden ones', () => {
    expect(shownFields({ _spec: 's', name: 'Anna', topics: ['a', 'b'], empty: '' })).toEqual([
      { name: 'name', value: 'Anna' },
      { name: 'topics', value: 'a, b' },
    ]);
    expect(shownFields(null)).toEqual([]);
  });
});

describe('the message', () => {
  it('speaks the visitor’s language', () => {
    expect(spamMessage('it-IT')).toContain('spam');
    expect(spamMessage('it')).toMatch(/^Il messaggio/);
    expect(spamMessage('en')).toMatch(/^Your message/);
  });
});
