/**
 * Floating buttons and Link in bio, free as in Elementor. Their settings are
 * those of Fresco Pro's elements of the same name (until Fresco 2.3 they were
 * Pro only): pages made with those keep them, drawn by Fresco Pro, and the
 * panel offers these instead. Variants: a chat box for the floating buttons,
 * a cover picture and outlined links for the link in bio.
 */
import type { CSSProperties } from 'react';
import { advancedControls, ElementRoot } from '../core/common.js';
import { content, groups, style, textStyle } from '../core/controls.js';
import { Icon } from '../core/icons.js';
import { linkProps } from '../core/links.js';
import { FrImage, isMedia, mediaIds } from '../core/media.js';
import type { ElementDefinition, Settings } from '../core/model.js';
import { plainText } from '../core/sanitize.js';

const list = (settings: Settings, name: string): Settings[] =>
  Array.isArray(settings[name]) ? (settings[name] as Settings[]) : [];
const str = (value: unknown) => (typeof value === 'string' ? value : '');
const num = (value: unknown, fallback: number) =>
  value !== '' && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : fallback;
const pick = <T extends string>(value: unknown, values: readonly T[], fallback: T): T =>
  values.includes(value as T) ? (value as T) : fallback;

// ---- Floating buttons -----------------------------------------------------------------------

/** The ways to be reached, with their icon and the service's color. */
export const CONTACTS = [
  {
    value: 'whatsapp',
    label: 'WhatsApp',
    icon: { set: 'brands', name: 'whatsapp' },
    color: '#25d366',
  },
  { value: 'phone', label: 'Phone', icon: { set: 'solid', name: 'phone' }, color: '#0ea5e9' },
  { value: 'sms', label: 'SMS', icon: { set: 'solid', name: 'comment-sms' }, color: '#16a34a' },
  { value: 'email', label: 'Email', icon: { set: 'solid', name: 'envelope' }, color: '#64748b' },
  {
    value: 'telegram',
    label: 'Telegram',
    icon: { set: 'brands', name: 'telegram' },
    color: '#26a5e4',
  },
  {
    value: 'messenger',
    label: 'Messenger',
    icon: { set: 'brands', name: 'facebook-messenger' },
    color: '#0084ff',
  },
  { value: 'viber', label: 'Viber', icon: { set: 'brands', name: 'viber' }, color: '#7360f2' },
  { value: 'skype', label: 'Skype', icon: { set: 'brands', name: 'skype' }, color: '#00aff0' },
  {
    value: 'map',
    label: 'Directions',
    icon: { set: 'solid', name: 'location-dot' },
    color: '#ea4335',
  },
  { value: 'link', label: 'Link', icon: { set: 'solid', name: 'link' }, color: '#1d4ed8' },
] as const;

/** The address a button opens, or null when its value does not fit its kind. */
export function contactHref(kind: string, value: string, message = ''): string | null {
  const v = value.trim();
  if (!v) return null;
  const digits = v.replace(/[^\d+]/g, '');
  switch (kind) {
    case 'whatsapp': {
      const number = v.replace(/\D/g, '');
      return number
        ? `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`
        : null;
    }
    case 'phone':
      return digits ? `tel:${digits}` : null;
    case 'sms':
      return digits
        ? `sms:${digits}${message ? `?body=${encodeURIComponent(message)}` : ''}`
        : null;
    case 'email':
      return /^[^@\s"<>]+@[^@\s"<>]+$/.test(v)
        ? `mailto:${v}${message ? `?body=${encodeURIComponent(message)}` : ''}`
        : null;
    case 'telegram':
      return /^@?[\w]{3,64}$/.test(v) ? `https://t.me/${v.replace(/^@/, '')}` : null;
    case 'messenger':
      return /^[\w.]{1,64}$/.test(v) ? `https://m.me/${v}` : null;
    case 'viber':
      return digits ? `viber://chat?number=${encodeURIComponent(digits)}` : null;
    case 'skype':
      return /^[\w.:-]{3,64}$/.test(v) ? `skype:${v}?chat` : null;
    case 'map':
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v)}`;
    default:
      return /^(https?:\/\/|\/)[^\s"<>]*$/.test(v) ? v : null;
  }
}

const POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const;

export const floatingButtons: ElementDefinition = {
  type: 'fresco/floating-buttons',
  title: 'Floating buttons',
  icon: 'M17 21a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M17 15v4 M15 17h4 M4 4h11v6H4z',
  category: 'general',
  keywords: ['floating', 'whatsapp', 'contact', 'chat', 'sticky button', 'call'],
  handler: 'floating-buttons',
  controls: [
    content.repeater('buttons', 'Buttons', 'Buttons', {
      itemTitle: 'kind',
      default: [{ _id: 'a', kind: 'whatsapp', value: '+39 333 1234567', label: 'Chat with us' }],
      fields: [
        content.select('kind', 'Type', 'Button', {
          default: 'whatsapp',
          options: CONTACTS.map((c) => ({ value: c.value, label: c.label })),
        }),
        content.text('value', 'Number, address or link', 'Button'),
        content.text('label', 'Label', 'Button'),
        content.textarea('message', 'Message already written', 'Button', {
          condition: { kind: ['whatsapp', 'sms', 'email'] },
        }),
      ],
    }),
    content.select('mode', 'Layout', 'Layout', {
      default: 'stack',
      options: [
        { value: 'stack', label: 'Show them all' },
        { value: 'menu', label: 'Open from one button' },
        { value: 'chat', label: 'Chat box' },
      ],
      noCss: true,
    }),
    content.media('chat_avatar', 'Photo', 'Chat box', {
      accept: 'image',
      condition: { mode: 'chat' },
    }),
    content.text('chat_name', 'Name', 'Chat box', {
      default: 'Rob Jones',
      condition: { mode: 'chat' },
    }),
    content.text('chat_status', 'Status', 'Chat box', {
      default: 'Typically replies within a day',
      condition: { mode: 'chat' },
    }),
    content.textarea('chat_message', 'Message', 'Chat box', {
      default: 'Hi there 👋 How can I help you?',
      condition: { mode: 'chat' },
    }),
    content.text('chat_cta', 'Button text', 'Chat box', {
      default: 'Start chat',
      condition: { mode: 'chat' },
    }),
    content.select('position', 'Position', 'Layout', {
      default: 'bottom-right',
      options: POSITIONS.map((v) => ({
        value: v,
        label:
          v === 'bottom-right'
            ? 'Bottom right'
            : v === 'bottom-left'
              ? 'Bottom left'
              : v === 'top-right'
                ? 'Top right'
                : 'Top left',
      })),
      noCss: true,
    }),
    content.switch('show_labels', 'Labels next to the buttons', 'Layout', { noCss: true }),
    content.number('delay', 'Show after (seconds)', 'Layout', {
      default: 0,
      min: 0,
      max: 120,
      noCss: true,
    }),
    content.switch('hide_mobile', 'Hide on mobile', 'Layout', { noCss: true }),
    content.switch('hide_desktop', 'Hide on desktop', 'Layout', { noCss: true }),
    style.select('shape', 'Shape', 'Style', {
      default: 'circle',
      options: [
        { value: 'circle', label: 'Circle' },
        { value: 'rounded', label: 'Rounded' },
        { value: 'square', label: 'Square' },
      ],
      noCss: true,
    }),
    style.slider('size', 'Size', 'Style', {
      units: ['px'],
      max: 100,
      default: { size: 56, unit: 'px' },
      selectors: { '{{el}}': '--fr-fab-size: {{value}}' },
    }),
    style.slider('offset', 'Distance from the edges', 'Style', {
      units: ['px'],
      max: 100,
      default: { size: 20, unit: 'px' },
      selectors: { '{{el}}': '--fr-fab-offset: {{value}}' },
    }),
    style.switch('official', 'Colors of each service', 'Style', { default: true, noCss: true }),
    style.color('color', 'Color', 'Style', {
      condition: { official: false },
      selectors: { '{{el}} .fr-fab__btn': '--fr-fab-color: {{value}}' },
    }),
    style.color('icon_color', 'Icon color', 'Style', {
      selectors: { '{{el}} .fr-fab__btn': 'color: {{value}}' },
    }),
    style.color('chat_bg', 'Box background', 'Chat box', {
      condition: { mode: 'chat' },
      selectors: { '{{el}} .fr-fab__chat': 'background-color: {{value}}' },
    }),
    style.color('chat_header_bg', 'Header background', 'Chat box', {
      condition: { mode: 'chat' },
      selectors: { '{{el}} .fr-fab__chat-head': 'background-color: {{value}}' },
    }),
    ...advancedControls(),
  ],
  media: (settings) => mediaIds(settings.chat_avatar),
  render({ node, settings, context }) {
    const buttons = list(settings, 'buttons')
      .map((b, i) => {
        const kind = CONTACTS.find((c) => c.value === b.kind) ?? CONTACTS[0];
        const href = contactHref(kind.value, str(b.value), str(b.message));
        return href
          ? { id: String(b._id ?? i), kind, href, label: plainText(b.label) || kind.label }
          : null;
      })
      .filter((b): b is NonNullable<typeof b> => Boolean(b));
    const position = pick(settings.position, POSITIONS, 'bottom-right');
    const shape = pick(settings.shape, ['circle', 'rounded', 'square'] as const, 'circle');
    const mode = pick(settings.mode, ['stack', 'menu', 'chat'] as const, 'stack');
    const chat = mode === 'chat' && buttons.length > 0;
    const menu = mode === 'menu' && buttons.length > 1;
    const delay = num(settings.delay, 0);
    const editing = context.editing;
    const external = (href: string) => /^https?:/.test(href);
    const link = (b: (typeof buttons)[number]) => (
      <a
        key={b.id}
        className="fr-fab__btn"
        href={b.href}
        target={external(b.href) ? '_blank' : undefined}
        rel={external(b.href) ? 'noopener noreferrer' : undefined}
        style={
          (settings.official !== false ? { '--fr-fab-color': b.kind.color } : {}) as CSSProperties
        }
        aria-label={b.label}
      >
        <Icon value={b.kind.icon} />
        {settings.show_labels === true && <span className="fr-fab__label">{b.label}</span>}
      </a>
    );
    const classes = [
      'fr-fab',
      `fr-fab--${position}`,
      `fr-fab--${shape}`,
      editing ? 'fr-fab--editing' : '',
      settings.hide_mobile === true ? 'fr-fab--no-mobile' : '',
      settings.hide_desktop === true ? 'fr-fab--no-desktop' : '',
      menu ? 'fr-fab--menu' : '',
      chat ? 'fr-fab--chat' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const panel = `fr-fab-${node.id}`;
    let body;
    if (chat) {
      const first = buttons[0]!;
      const avatar = isMedia(settings.chat_avatar) && settings.chat_avatar.url;
      body = (
        <>
          <div
            className="fr-fab__chat"
            id={panel}
            role="dialog"
            aria-label={first.label}
            hidden={!editing}
          >
            <div className="fr-fab__chat-head">
              {avatar ? (
                <span className="fr-fab__avatar">
                  <FrImage value={settings.chat_avatar} context={context} size="thumbnail" />
                </span>
              ) : null}
              <span className="fr-fab__who">
                <strong>{plainText(settings.chat_name)}</strong>
                {plainText(settings.chat_status) ? (
                  <small>{plainText(settings.chat_status)}</small>
                ) : null}
              </span>
              <button
                type="button"
                className="fr-fab__close"
                aria-label="Close"
                data-fr-fab-close=""
              >
                ×
              </button>
            </div>
            {plainText(settings.chat_message) ? (
              <p className="fr-fab__bubble">{plainText(settings.chat_message)}</p>
            ) : null}
            <a
              className="fr-fab__cta"
              href={first.href}
              target={external(first.href) ? '_blank' : undefined}
              rel={external(first.href) ? 'noopener noreferrer' : undefined}
              style={
                (settings.official !== false
                  ? { '--fr-fab-color': first.kind.color }
                  : {}) as CSSProperties
              }
            >
              <Icon value={first.kind.icon} />
              <span>{plainText(settings.chat_cta) || first.label}</span>
            </a>
          </div>
          <button
            type="button"
            className="fr-fab__btn fr-fab__toggle"
            aria-expanded={editing}
            aria-controls={panel}
            aria-label={first.label}
            style={
              (settings.official !== false
                ? { '--fr-fab-color': first.kind.color }
                : {}) as CSSProperties
            }
          >
            <Icon value={first.kind.icon} />
          </button>
        </>
      );
    } else if (menu) {
      body = (
        <>
          <div className="fr-fab__items" id={panel} hidden={!editing}>
            {buttons.map(link)}
          </div>
          <button
            type="button"
            className="fr-fab__btn fr-fab__toggle"
            aria-expanded={editing}
            aria-controls={panel}
            aria-label="Contact us"
          >
            <Icon value={{ set: 'solid', name: 'comment-dots' }} />
          </button>
        </>
      );
    } else {
      body = buttons.map(link);
    }
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name="fr-floating-buttons"
        editing={editing}
        extra={{ 'data-fr-handler': 'floating-buttons', 'data-fr-fab-delay': String(delay) }}
      >
        <div className={classes} hidden={!editing && delay > 0}>
          {body}
        </div>
      </ElementRoot>
    );
  },
};

// ---- Link in bio ----------------------------------------------------------------------------

export const linkInBio: ElementDefinition = {
  type: 'fresco/link-in-bio',
  title: 'Link in bio',
  icon: 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 11h12v3H6z M6 16h12v3H6z',
  category: 'general',
  keywords: ['link in bio', 'links', 'profile', 'social', 'linktree'],
  controls: [
    content.select('layout', 'Layout', 'Profile', {
      default: 'classic',
      options: [
        { value: 'classic', label: 'Classic' },
        { value: 'cover', label: 'With a cover picture' },
      ],
      noCss: true,
    }),
    content.media('cover', 'Cover picture', 'Profile', {
      accept: 'image',
      condition: { layout: 'cover' },
    }),
    content.media('photo', 'Photo', 'Profile', { accept: 'image' }),
    content.text('name', 'Name', 'Profile', { default: 'Your name' }),
    content.textarea('bio', 'Bio', 'Profile', { default: 'A few words about you.' }),
    content.repeater('links', 'Links', 'Links', {
      itemTitle: 'label',
      default: [
        { _id: 'a', label: 'My website' },
        { _id: 'b', label: 'Latest article' },
      ],
      fields: [
        content.text('label', 'Label', 'Link', { default: 'Link' }),
        content.url('link', 'Address', 'Link'),
        content.icon('icon', 'Icon', 'Link'),
      ],
    }),
    content.repeater('social', 'Social icons', 'Social', {
      itemTitle: 'url',
      default: [],
      fields: [
        content.icon('icon', 'Icon', 'Profile', { default: { set: 'brands', name: 'instagram' } }),
        content.text('url', 'Address', 'Profile'),
      ],
    }),
    style.slider('width', 'Width', 'Layout', {
      units: ['px'],
      max: 900,
      default: { size: 480, unit: 'px' },
      selectors: { '{{el}} .fr-bio': 'max-width: {{value}}' },
    }),
    groups.background('bg', 'Background', 'Layout', '{{el}} .fr-bio'),
    style.select('button_style', 'Look', 'Buttons', {
      default: 'filled',
      options: [
        { value: 'filled', label: 'Filled' },
        { value: 'outline', label: 'Outline' },
      ],
      noCss: true,
    }),
    style.color('button_bg', 'Buttons background', 'Buttons', {
      hover: true,
      selectors: { '{{el}} .fr-bio__link': 'background-color: {{value}}' },
    }),
    style.color('button_color', 'Buttons text', 'Buttons', {
      hover: true,
      selectors: { '{{el}} .fr-bio__link': 'color: {{value}}' },
    }),
    style.slider('button_radius', 'Border radius', 'Buttons', {
      units: ['px'],
      max: 40,
      selectors: { '{{el}} .fr-bio__link': 'border-radius: {{value}}' },
    }),
    ...textStyle('name_', 'Name', '{{el}} .fr-bio__name'),
    ...textStyle('bio_', 'Bio', '{{el}} .fr-bio__text'),
    ...advancedControls(),
  ],
  media: (settings) => [...mediaIds(settings.photo), ...mediaIds(settings.cover)],
  render({ node, settings, context }) {
    const layout = settings.layout === 'cover' ? 'cover' : 'classic';
    const look = settings.button_style === 'outline' ? 'outline' : 'filled';
    const social = list(settings, 'social');
    return (
      <ElementRoot node={node} settings={settings} name="fr-link-in-bio" editing={context.editing}>
        <div className={`fr-bio fr-bio--${layout} fr-bio--${look}`}>
          {layout === 'cover' && isMedia(settings.cover) && settings.cover.url ? (
            <span className="fr-bio__cover">
              <FrImage value={settings.cover} context={context} />
            </span>
          ) : null}
          {isMedia(settings.photo) && settings.photo.url ? (
            <span className="fr-bio__photo">
              <FrImage value={settings.photo} context={context} size="thumbnail" />
            </span>
          ) : null}
          <h1 className="fr-bio__name">{plainText(settings.name)}</h1>
          {plainText(settings.bio) ? (
            <p className="fr-bio__text">{plainText(settings.bio)}</p>
          ) : null}
          <div className="fr-bio__links">
            {list(settings, 'links').map((l, i) => {
              const link = linkProps(l.link);
              const body = (
                <>
                  {l.icon ? <Icon value={l.icon} /> : null}
                  <span>{plainText(l.label)}</span>
                </>
              );
              return link ? (
                <a key={String(l._id ?? i)} className="fr-bio__link" {...link}>
                  {body}
                </a>
              ) : (
                <span key={String(l._id ?? i)} className="fr-bio__link">
                  {body}
                </span>
              );
            })}
          </div>
          {social.length > 0 && (
            <div className="fr-bio__social">
              {social.map((s, i) =>
                /^https?:\/\/[^\s"<>]+$/.test(str(s.url)) ? (
                  <a
                    key={String(s._id ?? i)}
                    href={str(s.url)}
                    target="_blank"
                    rel="noopener noreferrer me"
                    aria-label={
                      str(s.url)
                        .replace(/^https?:\/\/(www\.)?/, '')
                        .split('/')[0]
                    }
                  >
                    <Icon value={s.icon ?? { set: 'solid', name: 'link' }} />
                  </a>
                ) : null,
              )}
            </div>
          )}
        </div>
      </ElementRoot>
    );
  },
};
