import { describe, expect, it } from 'vitest';
import { challengeHtml, widgetOptions } from './challenge';
import { normalizeConfig } from './config';

const SCRIPT = '/plugin-assets/captcha/1.0.0/captcha.js';

function optionsOf(html: string) {
  const match = /data-cl-captcha="([^"]*)"/.exec(html);
  return JSON.parse(
    match![1]!
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&'),
  );
}

describe('challenge markup', () => {
  it('has the box, a note without JavaScript and the script', () => {
    const config = normalizeConfig({ siteKey: '1x00000000000000000000AA', theme: 'dark' });
    const html = challengeHtml(config, { form: 'core/login', locale: 'it' }, SCRIPT);
    expect(html).toContain('<div class="cl-captcha" data-cl-captcha="');
    expect(html).toContain(
      '<noscript><p class="cl-captcha__noscript">Per inviare questo modulo attiva JavaScript',
    );
    expect(html).toContain(`<script src="${SCRIPT}" defer></script>`);
    expect(optionsOf(html)).toEqual({
      p: 'turnstile',
      k: '1x00000000000000000000AA',
      a: 'core_login',
      theme: 'dark',
      size: 'normal',
      appearance: 'always',
      lang: 'it',
      lock: false,
      failsafe: 'off',
      msg: 'Conferma di non essere un robot, poi riprova.',
      err: expect.stringContaining('Il controllo anti-spam non si è caricato'),
      f: 'core/login',
    });
  });

  it('marks a captcha shown only when asked, without the note (1.1.0)', () => {
    const config = normalizeConfig({ siteKey: '1x00000000000000000000AA', mode: 'on-demand' });
    const html = challengeHtml(config, { form: 'core/comment', locale: 'en' }, SCRIPT);
    expect(optionsOf(html)).toMatchObject({ d: true, f: 'core/comment' });
    expect(html).not.toContain('noscript');
    expect(normalizeConfig({ mode: 'sometimes' }).mode).toBe('always');
  });

  it('marks invisible checks and escapes custom texts', () => {
    const config = normalizeConfig({
      provider: 'recaptcha3',
      siteKey: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI',
      messages: { en: '"Robots" <not> welcome & so on' },
      failsafe: 'recaptcha',
      fallbackSiteKey: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI',
    });
    const html = challengeHtml(config, { form: 'fresco-pro/form', locale: 'en' }, SCRIPT);
    expect(html).toContain('class="cl-captcha cl-captcha--invisible"');
    expect(html).not.toContain('<not>');
    const options = optionsOf(html);
    expect(options).toMatchObject({ p: 'recaptcha3', a: 'fresco_pro/form', failsafe: 'off' });
    expect(options.msg).toBe('"Robots" <not> welcome & so on');
    expect(options).not.toHaveProperty('fallback');
  });

  it('gives Turnstile the fallback key and a fixed language when set', () => {
    const config = normalizeConfig({
      siteKey: '1x00000000000000000000AA',
      failsafe: 'recaptcha',
      fallbackSiteKey: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI',
      language: 'de',
      disableSubmit: true,
    });
    expect(widgetOptions(config, 'core/comment', 'it')).toMatchObject({
      failsafe: 'recaptcha',
      fallback: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI',
      lang: 'de',
      lock: true,
    });
  });
});
