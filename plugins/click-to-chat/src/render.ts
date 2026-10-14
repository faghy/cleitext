import qrcode from 'qrcode-generator';
import {
  attrJson,
  cleanPhone,
  colorVars,
  escapeHtml,
  formattedMessage,
  override,
  replaceVariables,
  type Variables,
} from './format';

/** Settings of the plugin, as stored (Settings → Click to Chat). */
export interface ChatSettings {
  telephone: string;
  message_send: string;
  button_tip: string;
  button_delay: number;
  position: 'right' | 'left';
  color: string;
  text_color: 'white' | 'black';
  dark_mode: 'no' | 'yes' | 'auto';
  mobile_only: boolean;
  whatsapp_web: boolean;
  qr: boolean;
  qr_text: string;
  message_text: string;
  header: 'whatsapp' | 'custom' | 'none';
  header_text: string;
  message_start: string;
  message_delay: number;
  message_views: number;
  message_badge: boolean;
  optin_text: string;
  optin_check: boolean;
  gads: string;
  ga_event: string;
  tracking: boolean;
}

/** Per-entry settings (the "Click to Chat" box of the editor). */
export interface ChatOverride {
  telephone?: string;
  message_text?: string;
  message_send?: string;
}

export interface FloatingOptions {
  settings: ChatSettings;
  override?: ChatOverride;
  vars: Variables;
  locale: string;
  /** Image of the button (media library), when set. */
  image?: { url: string; mime: string } | null;
  /** Only the triggers work: the button is not shown on this page. */
  triggersOnly: boolean;
  trackingUrl?: string;
}

const TEXTS = {
  en: { contact: 'WhatsApp Contact', open: 'Open Chat', close: 'Close' },
  it: { contact: 'Contatto WhatsApp', open: 'Apri la chat', close: 'Chiudi' },
};

export function texts(locale: string) {
  return locale.toLowerCase().startsWith('it') ? TEXTS.it : TEXTS.en;
}

/** QR code of a link, as an SVG drawn by the server. */
export function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

export function waLink(phone: string, message: string): string {
  const url = new URL(`https://wa.me/${phone}`);
  if (message) url.searchParams.set('text', message);
  return url.toString();
}

/** The floating button and its chat window (Joinchat's public/partials/html.php). */
export function floatingHtml(options: FloatingOptions): string {
  const s = options.settings;
  const o = options.override ?? {};
  const t = texts(options.locale);
  const telephone = cleanPhone(override(o.telephone, s.telephone));
  if (!telephone) return '';
  const ctaText = override(o.message_text, s.message_text);
  const send = replaceVariables(override(o.message_send, s.message_send), options.vars, 'raw');

  let box = '';
  const cta = formattedMessage(ctaText, options.vars);
  if (cta) box = `<div class="joinchat__chat">${cta}</div>`;
  if (s.optin_text.trim()) {
    const optin = formattedMessage(s.optin_text, options.vars)
      .replace(/^<div class="joinchat__bubble[^"]*">|<\/div>$/g, '')
      .replace(/ data-src="/g, ' src="');
    box += `<div class="joinchat__optin">${
      s.optin_check
        ? `<input type="checkbox" id="joinchat_optin"><label for="joinchat_optin">${optin}</label>`
        : optin
    }</div>`;
  }

  const delay = s.button_delay;
  const classes = ['joinchat', `joinchat--${s.position}`];
  if (s.dark_mode !== 'no')
    classes.push(s.dark_mode === 'auto' ? 'joinchat--dark-auto' : 'joinchat--dark');
  if (delay < 0 && !options.triggersOnly) {
    classes.push('joinchat--show', 'joinchat--noanim');
    if (s.mobile_only) classes.push('joinchat--mobile');
  }
  if (s.optin_text.trim() && s.optin_check) classes.push('joinchat--optout');
  if (!box) classes.push('joinchat--btn');

  // What the script needs (Joinchat's data-settings, without the display fields).
  const data: Record<string, unknown> = {
    telephone,
    mobile_only: s.mobile_only,
    button_delay: Math.max(delay, 0),
    whatsapp_web: s.whatsapp_web,
    qr: s.qr,
    message_views: Math.max(s.message_views, 1),
    message_delay: s.message_delay,
    message_badge: s.message_badge,
    message_send: send,
    message_hash: cta ? hash(ctaText) : '',
    ga_event: s.ga_event.trim() === 'off' ? '' : s.ga_event.trim() || 'generate_lead',
  };
  if (/^AW-\d{1,12}\/[\w-]{1,22}$/.test(s.gads.trim())) data.gads = s.gads.trim();
  if (options.triggersOnly) data.triggers_only = true;
  if (s.tracking && options.trackingUrl) data.tracking_url = options.trackingUrl;

  const label = `${s.button_tip ? `${s.button_tip} ` : ''}${box ? t.open : t.contact}`;
  const image = options.image
    ? options.image.mime.startsWith('video/')
      ? `<div class="joinchat__button__image"><video autoplay loop muted playsinline src="${escapeHtml(options.image.url)}"></video></div>`
      : `<div class="joinchat__button__image"><img src="${escapeHtml(options.image.url)}" alt="" loading="lazy"></div>`
    : '';
  const header =
    s.header === 'whatsapp'
      ? WA_LOGO
      : s.header === 'custom' && s.header_text.trim()
        ? `<span>${escapeHtml(s.header_text.trim())}</span>`
        : '';

  return `<div class="${classes.join(' ')}" data-settings='${attrJson(data)}'${
    delay > 0 || options.triggersOnly ? ' hidden aria-hidden="false"' : ''
  }><div class="joinchat__button" role="button" tabindex="0" aria-label="${escapeHtml(label)}">${image}${
    s.button_tip
      ? `<div class="joinchat__tooltip" aria-hidden="true"><div>${escapeHtml(s.button_tip)}</div></div>`
      : ''
  }</div>${box && s.message_badge ? '<div class="joinchat__badge">1</div>' : ''}${
    s.qr && !options.triggersOnly
      ? `<div class="joinchat__qr"><div>${escapeHtml(s.qr_text)}</div>${qrSvg(waLink(telephone, send))}</div>`
      : ''
  }${
    box
      ? `<div class="joinchat__chatbox" role="dialog" aria-labelledby="joinchat__label" aria-modal="true"><div class="joinchat__header"><div id="joinchat__label">${header}</div><div class="joinchat__close" role="button" tabindex="0" aria-label="${t.close}"></div></div><div class="joinchat__scroll"><div class="joinchat__content">${box}<div class="joinchat__open" role="button" tabindex="0">${
          s.message_start.trim()
            ? `<div class="joinchat__open__text">${escapeHtml(s.message_start.trim())}</div>`
            : ''
        }${SEND_ICON}</div></div></div></div>`
      : ''
  }</div>`;
}

/** Joinchat's hash of the call to action (seen once per visitor): any stable short hash. */
function hash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

const WA_LOGO =
  '<svg class="joinchat__wa" width="120" height="28" viewBox="0 0 120 28"><title>WhatsApp</title><path d="M117.2 17c0 .4-.2.7-.4 1-.1.3-.4.5-.7.7l-1 .2c-.5 0-.9 0-1.2-.2l-.7-.7a3 3 0 0 1-.4-1 5.4 5.4 0 0 1 0-2.3c0-.4.2-.7.4-1l.7-.7a2 2 0 0 1 1.1-.3 2 2 0 0 1 1.8 1l.4 1a5.3 5.3 0 0 1 0 2.3m2.5-3c-.1-.7-.4-1.3-.8-1.7a4 4 0 0 0-1.3-1.2c-.6-.3-1.3-.4-2-.4-.6 0-1.2.1-1.7.4a3 3 0 0 0-1.2 1.1V11H110v13h2.7v-4.5c.4.4.8.8 1.3 1 .5.3 1 .4 1.6.4a4 4 0 0 0 3.2-1.5c.4-.5.7-1 .8-1.6.2-.6.3-1.2.3-1.9s0-1.3-.3-2zm-13.1 3c0 .4-.2.7-.4 1l-.7.7-1.1.2c-.4 0-.8 0-1-.2-.4-.2-.6-.4-.8-.7a3 3 0 0 1-.4-1 5.4 5.4 0 0 1 0-2.3c0-.4.2-.7.4-1 .1-.3.4-.5.7-.7a2 2 0 0 1 1-.3 2 2 0 0 1 1.9 1l.4 1a5.4 5.4 0 0 1 0 2.3m1.7-4.7a4 4 0 0 0-3.3-1.6c-.6 0-1.2.1-1.7.4a3 3 0 0 0-1.2 1.1V11h-2.6v13h2.7v-4.5c.3.4.7.8 1.2 1 .6.3 1.1.4 1.7.4a4 4 0 0 0 3.2-1.5c.4-.5.6-1 .8-1.6s.3-1.2.3-1.9-.1-1.3-.3-2c-.2-.6-.4-1.2-.8-1.6m-17.5 3.2 1.7-5 1.7 5zm.2-8.2-5 13.4h3l1-3h5l1 3h3L94 7.3zm-5.3 9.1-.6-.8-1-.5a11.6 11.6 0 0 0-2.3-.5l-1-.3a2 2 0 0 1-.6-.3.7.7 0 0 1-.3-.6c0-.2 0-.4.2-.5l.3-.3h.5l.5-.1c.5 0 .9 0 1.2.3.4.1.6.5.6 1h2.5c0-.6-.2-1.1-.4-1.5a3 3 0 0 0-1-1 4 4 0 0 0-1.3-.5 7.7 7.7 0 0 0-3 0c-.6.1-1 .3-1.4.5l-1 1a3 3 0 0 0-.4 1.5 2 2 0 0 0 1 1.8l1 .5 1.1.3 2.2.6c.6.2.8.5.8 1l-.1.5-.4.4a2 2 0 0 1-.6.2 2.8 2.8 0 0 1-1.4 0 2 2 0 0 1-.6-.3l-.5-.5-.2-.8H77c0 .7.2 1.2.5 1.6.2.5.6.8 1 1 .4.3.9.5 1.4.6a8 8 0 0 0 3.3 0c.5 0 1-.2 1.4-.5a3 3 0 0 0 1-1c.3-.5.4-1 .4-1.6 0-.5 0-.9-.3-1.2M74.7 8h-2.6v3h-1.7v1.7h1.7v5.8c0 .5 0 .9.2 1.2l.7.7 1 .3a7.8 7.8 0 0 0 2 0h.7v-2.1a3.4 3.4 0 0 1-.8 0l-1-.1-.2-1v-4.8h2V11h-2zm-7.6 9v.5l-.3.8-.7.6c-.2.2-.7.2-1.2.2h-.6l-.5-.2a1 1 0 0 1-.4-.4l-.1-.6.1-.6.4-.4.5-.3a4.8 4.8 0 0 1 1.2-.2 8 8 0 0 0 1.2-.2l.4-.3v1zm2.6 1.5v-5c0-.6 0-1.1-.3-1.5l-1-.8-1.4-.4a10.9 10.9 0 0 0-3.1 0l-1.5.6c-.4.2-.7.6-1 1a3 3 0 0 0-.5 1.5h2.7c0-.5.2-.9.5-1a2 2 0 0 1 1.3-.4h.6l.6.2.3.4.2.7c0 .3 0 .5-.3.6-.1.2-.4.3-.7.4l-1 .1a22 22 0 0 0-2.4.4l-1 .5c-.3.2-.6.5-.8.9-.2.3-.3.8-.3 1.3s.1 1 .3 1.3c.1.4.4.7.7 1l1 .4c.4.2.9.2 1.3.2a6 6 0 0 0 1.8-.2c.6-.2 1-.5 1.5-1a4 4 0 0 0 .2 1H70l-.3-1zm-11-6.7c-.2-.4-.6-.6-1-.8-.5-.2-1-.3-1.8-.3-.5 0-1 .1-1.5.4a3 3 0 0 0-1.3 1.2v-5h-2.7v13.4H53v-5.1c0-1 .2-1.7.5-2.2.3-.4.9-.6 1.6-.6.6 0 1 .2 1.3.6s.4 1 .4 1.8v5.5h2.7v-6c0-.6 0-1.2-.2-1.6 0-.5-.3-1-.5-1.3zm-14 4.7-2.3-9.2h-2.8l-2.3 9-2.2-9h-3l3.6 13.4h3l2.2-9.2 2.3 9.2h3l3.6-13.4h-3zm-24.5.2L18 15.6c-.3-.1-.6-.2-.8.2A20 20 0 0 1 16 17c-.2.2-.4.3-.7.1-.4-.2-1.5-.5-2.8-1.7-1-1-1.7-2-2-2.4-.1-.4 0-.5.2-.7l.5-.6.4-.6v-.6L10.4 8c-.3-.6-.6-.5-.8-.6H9c-.2 0-.6.1-.9.5C7.8 8.2 7 9 7 10.7s1.3 3.4 1.4 3.6c.2.3 2.5 3.7 6 5.2l1.9.8c.8.2 1.6.2 2.2.1s2-.8 2.3-1.6c.3-.9.3-1.5.2-1.7l-.7-.4zM14 25.3c-2 0-4-.5-5.8-1.6l-.4-.2-4.4 1.1 1.2-4.2-.3-.5A11.5 11.5 0 0 1 22.1 5.7 11.5 11.5 0 0 1 14 25.3M14 0A13.8 13.8 0 0 0 2 20.7L0 28l7.3-2A13.8 13.8 0 1 0 14 0"/></svg>';

const SEND_ICON =
  '<svg class="joinchat__open__icon" width="60" height="60" viewbox="0 0 400 400"><path class="joinchat__pa" d="M168.83 200.504H79.218L33.04 44.284a1 1 0 0 1 1.386-1.188L365.083 199.04a1 1 0 0 1 .003 1.808L34.432 357.903a1 1 0 0 1-1.388-1.187l29.42-99.427"/><path class="joinchat__pb" d="M318.087 318.087c-52.982 52.982-132.708 62.922-195.725 29.82l-80.449 10.18 10.358-80.112C18.956 214.905 28.836 134.99 81.913 81.913c65.218-65.217 170.956-65.217 236.174 0 42.661 42.661 57.416 102.661 44.265 157.316"/></svg>';

export { colorVars };
