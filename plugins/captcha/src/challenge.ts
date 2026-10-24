/**
 * The markup placed in a protected form: a box with the widget's options
 * for the plugin's script, a message for browsers without JavaScript and
 * the script itself. No token or visitor data: pages of guests are cached.
 */
import { actionFor, loadErrorFor, messageFor, type CaptchaConfig } from './config';

/** What the browser script needs (`data-cl-captcha`). */
export interface WidgetOptions {
  /** Provider. */
  p: CaptchaConfig['provider'];
  /** Site key. */
  k: string;
  /** Action name. */
  a: string;
  theme: CaptchaConfig['theme'];
  size: CaptchaConfig['size'];
  appearance: CaptchaConfig['appearance'];
  /** Widget language. */
  lang: string;
  /** Disable the submit button until solved. */
  lock: boolean;
  /** Failsafe of Turnstile, with the fallback reCAPTCHA site key. */
  failsafe: CaptchaConfig['failsafe'];
  fallback?: string;
  /** Message when the visitor sends the form before the check is done. */
  msg: string;
  /** Message when the widget cannot load and no failsafe applies. */
  err: string;
  /** The form's id. */
  f: string;
  /** Shown only when asked (`on-demand` mode, 1.1.0). */
  d?: true;
}

const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeText = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The widget's options for a form. */
export function widgetOptions(config: CaptchaConfig, form: string, locale: string): WidgetOptions {
  return {
    p: config.provider,
    k: config.siteKey,
    a: actionFor(config.provider, form),
    theme: config.theme,
    size: config.size,
    appearance: config.appearance,
    lang: config.language === 'auto' ? locale || 'auto' : config.language,
    lock: config.disableSubmit,
    failsafe: config.provider === 'turnstile' ? config.failsafe : 'off',
    ...(config.provider === 'turnstile' && config.failsafe === 'recaptcha' && config.fallbackSiteKey
      ? { fallback: config.fallbackSiteKey }
      : {}),
    msg: messageFor(config, locale),
    err: loadErrorFor(locale),
    f: form,
    ...(config.mode === 'on-demand' ? { d: true as const } : {}),
  };
}

/** The markup of the challenge: the box, a note without JavaScript, the script. */
export function challengeHtml(
  config: CaptchaConfig,
  input: { form: string; locale: string },
  scriptUrl: string,
): string {
  const options = widgetOptions(config, input.form, input.locale);
  const it = input.locale.startsWith('it');
  const noscript = it
    ? 'Per inviare questo modulo attiva JavaScript: serve al controllo anti-spam.'
    : 'Turn on JavaScript to send this form: the spam check needs it.';
  const invisible = config.provider === 'recaptcha3' || config.provider === 'recaptcha2-invisible';
  // On demand, most visitors never see it: no note for them.
  const note =
    config.mode === 'on-demand'
      ? ''
      : `<noscript><p class="cl-captcha__noscript">${escapeText(noscript)}</p></noscript>`;
  return (
    `<div class="cl-captcha${invisible ? ' cl-captcha--invisible' : ''}" data-cl-captcha="${escapeAttr(JSON.stringify(options))}"></div>` +
    note +
    `<script src="${escapeAttr(scriptUrl)}" defer></script>`
  );
}
