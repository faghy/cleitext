import { describe, expect, it } from 'vitest';
import {
  attrJson,
  cleanPhone,
  colorVars,
  formattedMessage,
  override,
  replaceVariables,
} from './format';
import { floatingHtml, waLink, type ChatSettings } from './render';

const vars = {
  site: 'Bar Roma',
  title: 'Menu',
  url: 'https://bar.example/menu',
  home: 'https://bar.example/',
};

describe('cleanPhone', () => {
  it('keeps the digits, without leading zeros', () => {
    expect(cleanPhone('+39 333 123 4567')).toBe('393331234567');
    expect(cleanPhone('0039-333-1234567')).toBe('393331234567');
    expect(cleanPhone(undefined)).toBe('');
  });
  it('fixes Argentinian and Mexican numbers as WhatsApp wants them', () => {
    expect(cleanPhone('+54 2966 15 123456')).toBe('5492966123456');
    expect(cleanPhone('+52 55 1234 5678')).toBe('5215512345678');
  });
});

describe('variables and overrides', () => {
  it('replaces the variables, escaped in HTML', () => {
    expect(replaceVariables('Hi from {SITE}: {URL} {OTHER}', vars, 'raw')).toBe(
      'Hi from Bar Roma: https://bar.example/menu {OTHER}',
    );
    expect(replaceVariables('{TITLE}', { ...vars, title: '<b>&' }, 'html')).toBe('&lt;b&gt;&amp;');
  });
  it('treats {} as an empty value on purpose', () => {
    expect(override('{}', 'site')).toBe('');
    expect(override('  ', 'site')).toBe('site');
    expect(override('page', 'site')).toBe('page');
  });
  it('turns the color into Joinchat’s variables', () => {
    expect(colorVars('#25d366', true)).toBe('--ch:142;--cs:70%;--cl:49%;--bw:1');
    expect(colorVars('nonsense', false)).toBe('--ch:142;--cs:70%;--cl:49%;--bw:0');
  });
  it('writes JSON safe in a single-quoted attribute', () => {
    expect(attrJson({ m: "it's <b>&" })).toBe('{"m":"it\\u0027s \\u003cb\\u003e\\u0026"}');
  });
});

describe('formattedMessage', () => {
  it('formats like WhatsApp and splits the bubbles', () => {
    expect(formattedMessage('Hi from *{SITE}*!\n===\n_How_ can we ~not~ help?', vars)).toBe(
      '<div class="joinchat__bubble">Hi from <strong>Bar Roma</strong>!</div>\n' +
        '<div class="joinchat__bubble"><em>How</em> can we <del>not</del> help?</div>',
    );
  });
  it('escapes HTML, and makes links, buttons and images', () => {
    expect(formattedMessage('<script>alert(1)</script>', vars)).toBe(
      '<div class="joinchat__bubble">&lt;script&gt;alert(1)&lt;/script&gt;</div>',
    );
    expect(formattedMessage('[Menu](/menu) {BTN https://other.example/book Book}', vars)).toBe(
      '<div class="joinchat__bubble"><a href="/menu">Menu</a> <a href="https://other.example/book" class="joinchat__btn" rel="external nofollow noopener noreferrer" target="_blank">Book</a></div>',
    );
    expect(formattedMessage('[x](javascript:alert(1))', vars)).not.toContain('href=');
    expect(formattedMessage('![Our bar](https://bar.example/bar.jpg 200)', vars)).toBe(
      '<div class="joinchat__bubble joinchat__bubble--media"><img data-src="https://bar.example/bar.jpg" alt="Our bar" width="200" loading="lazy"></div>',
    );
  });
  it('makes notes and random texts', () => {
    expect(formattedMessage('Hello\n>>>\nWe answer in minutes', vars)).toBe(
      '<div class="joinchat__bubble">Hello</div>\n<div class="joinchat__bubble joinchat__bubble--note">We answer in minutes</div>',
    );
    expect(formattedMessage('{RAND Hi||Hello {SITE}}', vars)).toBe(
      '<div class="joinchat__bubble"><jc-rand><jc-opt>Hi</jc-opt><jc-opt>Hello Bar Roma</jc-opt></jc-rand></div>',
    );
  });
});

describe('floatingHtml', () => {
  const settings: ChatSettings = {
    telephone: '+39 333 1234567',
    message_send: 'Hi! I am on {URL}',
    button_tip: 'Need help?',
    button_delay: 3,
    position: 'right',
    color: '#25d366',
    text_color: 'white',
    dark_mode: 'auto',
    mobile_only: false,
    whatsapp_web: false,
    qr: true,
    qr_text: 'Scan me',
    message_text: 'Hello from *{SITE}*',
    header: 'whatsapp',
    header_text: '',
    message_start: 'Open chat',
    message_delay: 10,
    message_views: 2,
    message_badge: false,
    optin_text: 'I accept the [privacy policy](/privacy)',
    optin_check: true,
    gads: '',
    ga_event: '',
    tracking: true,
  };

  it('renders Joinchat’s button, chat window and settings', () => {
    const html = floatingHtml({
      settings,
      vars,
      locale: 'en',
      triggersOnly: false,
      trackingUrl: '/click-to-chat/track',
    });
    expect(html).toMatch(
      /^<div class="joinchat joinchat--right joinchat--dark-auto joinchat--optout" data-settings='\{"telephone":"393331234567",/,
    );
    expect(html).toContain('"message_send":"Hi! I am on https://bar.example/menu"');
    expect(html).toContain('"tracking_url":"/click-to-chat/track"');
    expect(html).toContain(' hidden aria-hidden="false">');
    expect(html).toContain('aria-label="Need help? Open Chat"');
    expect(html).toContain('<div class="joinchat__qr"><div>Scan me</div><svg');
    expect(html).toContain('<strong>Bar Roma</strong>');
    expect(html).toContain(
      '<input type="checkbox" id="joinchat_optin"><label for="joinchat_optin">I accept the <a href="/privacy">privacy policy</a></label>',
    );
    expect(html).toContain('<div class="joinchat__open__text">Open chat</div>');
  });

  it('opens WhatsApp at once without messages, and uses the page’s number', () => {
    const html = floatingHtml({
      settings: { ...settings, message_text: '', optin_text: '', qr: false, button_delay: -1 },
      override: { telephone: '+39 02 1234567' },
      vars,
      locale: 'it',
      triggersOnly: false,
    });
    expect(html).toContain(
      'class="joinchat joinchat--right joinchat--dark-auto joinchat--show joinchat--noanim joinchat--btn"',
    );
    expect(html).toContain('"telephone":"39021234567"');
    expect(html).toContain('aria-label="Need help? Contatto WhatsApp"');
    expect(html).not.toContain('joinchat__chatbox');
    expect(html).not.toContain(' hidden');
  });

  it('keeps only the triggers on pages without the button', () => {
    const html = floatingHtml({ settings, vars, locale: 'en', triggersOnly: true });
    expect(html).toContain('"triggers_only":true');
    expect(html).toContain(' hidden aria-hidden="false">');
    expect(html).not.toContain('joinchat__qr');
  });

  it('is empty without a number', () => {
    expect(
      floatingHtml({
        settings: { ...settings, telephone: '' },
        vars,
        locale: 'en',
        triggersOnly: false,
      }),
    ).toBe('');
    expect(waLink('393331234567', 'Ciao è')).toBe('https://wa.me/393331234567?text=Ciao+%C3%A8');
  });
});
