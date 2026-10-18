import type { Sheet } from '@cleitext/design';
import { mediaUrl } from '../../lib/background';
import { blockClass } from '../../lib/css';
import { DEVICES, emit, numeric, px, suffix, typography } from '../../lib/emit';
import { Icon } from '../../lib/icons';
import { safeTag } from '../../lib/tags';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';
import { typographyDefaults } from '../heading';

const DEFAULTS: Attrs = {
  title: [],
  prefix: [],
  description_text: [],
  align: 'center',
  tag: 'h3',
  titleColor: '',
  prefixColor: '#888888',
  descColor: '',
  socialColor: '#333',
  socialHoverColor: '',
  ...typographyDefaults('title', ''),
  ...typographyDefaults('prefix', ''),
  prefixFontSize: 15,
  ...typographyDefaults('desc', ''),
  descFontSize: 15,
  socialFontSize: 20,
  socialFontSizeType: 'px',
  socialFontSizeTablet: '',
  socialFontSizeMobile: '',
  image: '',
  imgSize: 'thumbnail',
  imgStyle: 'normal',
  imgPosition: 'above',
  imgAlign: 'top',
  imgWidth: 100,
  imgWidthTablet: '',
  imgWidthMobile: '',
  stack: 'tablet',
  titleSpace: 6,
  titleSpaceTablet: '',
  titleSpaceMobile: '',
  prefixSpace: 11,
  prefixSpaceTablet: '',
  prefixSpaceMobile: '',
  descSpace: 18,
  descSpaceTablet: '',
  descSpaceMobile: '',
  imgLeftMargin: '',
  imgRightMargin: '',
  imgTopMargin: '',
  imgBottomMargin: 15,
  imageLeftMargin: 20,
  imageRightMargin: 20,
  imageTopMargin: '',
  imageBottomMargin: '',
  imageMarginLeftTablet: 'auto',
  imageMarginRightTablet: 'auto',
  imageMarginTopTablet: '',
  imageMarginBottomTablet: '',
  imageMarginLeftMobile: 'auto',
  imageMarginRightMobile: 'auto',
  imageMarginTopMobile: '',
  imageMarginBottomMobile: '',
  imageMarginUnit: 'px',
  tabletImageMarginUnit: 'px',
  mobileImageMarginUnit: 'px',
  spacingLink: false,
  socialEnable: true,
  socialSpace: 20,
  socialSpaceTablet: '',
  socialSpaceMobile: '',
  socialTarget: false,
  twitterIcon: 'twitter',
  fbIcon: 'facebook',
  linkedinIcon: 'linkedin',
  pinIcon: 'pinterest',
  twitterLink: '#',
  fbLink: '#',
  linkedinLink: '#',
  pinLink: '#',
};

/** The four profiles, in their order on the card. */
export const SOCIALS = [
  ['twitterIcon', 'twitterLink', 'X (Twitter)'],
  ['fbIcon', 'fbLink', 'Facebook'],
  ['linkedinIcon', 'linkedinLink', 'LinkedIn'],
  ['pinIcon', 'pinLink', 'Pinterest'],
] as const;

function css(a: Attrs, B: string, sheet: Sheet): void {
  const tag = safeTag(a.tag, 'h3');
  const above = a.imgPosition === 'above';
  const IMAGES = [
    `${B}.pr-team--image-left > .pr-team__image`,
    `${B}.pr-team--image-right .pr-team__content + .pr-team__image`,
    `${B}.pr-team--image-above .pr-team__image`,
  ].join(', ');
  const SOCIAL = `${B} .pr-team__social-icon`;
  // The space around centered icons falls back to the larger device's.
  const tabletSpace = numeric(a.socialSpaceTablet) ?? a.socialSpace;
  const mobileSpace = numeric(a.socialSpaceMobile) ?? tabletSpace;

  for (const device of DEVICES) {
    const s = suffix(device);
    const desktop = device === 'desktop';
    emit(sheet, device, `${B} p.pr-team__desc`, {
      ...(desktop ? { color: a.descColor } : {}),
      'margin-bottom': px(a[`descSpace${s}`]),
      'margin-top': px(a[`prefixSpace${s}`]),
      ...typography(a, 'desc', device),
    });
    emit(sheet, device, `${B} .pr-team__prefix`, {
      ...(desktop ? { color: a.prefixColor } : {}),
      ...typography(a, 'prefix', device),
    });
    const icon = px(a[`socialFontSize${s}`], a.socialFontSizeType);
    emit(sheet, device, `${SOCIAL} a`, {
      ...(desktop ? { color: a.socialColor } : {}),
      'font-size': icon,
      width: icon,
      height: icon,
      'line-height': icon,
    });
    emit(sheet, device, `${SOCIAL} svg`, {
      ...(desktop ? { fill: a.socialColor } : {}),
      width: icon,
      height: icon,
    });
    if (desktop) {
      emit(sheet, device, `${SOCIAL}:hover a`, { color: a.socialHoverColor });
      emit(sheet, device, `${SOCIAL}:hover svg`, { fill: a.socialHoverColor });
    }
    const space = px(a[`socialSpace${s}`]);
    const half = numeric(desktop ? a.socialSpace : device === 'tablet' ? tabletSpace : mobileSpace);
    emit(sheet, device, `${B}.pr-team--image-left .pr-team__social-icon`, {
      'margin-right': space,
      'margin-left': '0px',
    });
    emit(sheet, device, `${B}.pr-team--image-right .pr-team__social-icon`, {
      'margin-left': space,
      'margin-right': '0px',
    });
    emit(sheet, device, `${B}.pr-team--image-above.pr-team--align-center .pr-team__social-icon`, {
      'margin-right': half === null ? '' : px(half / 2),
      'margin-left': half === null ? '' : px(half / 2),
    });
    emit(sheet, device, `${B}.pr-team--image-above.pr-team--align-left .pr-team__social-icon`, {
      'margin-right': space,
      'margin-left': '0px',
    });
    emit(sheet, device, `${B}.pr-team--image-above.pr-team--align-right .pr-team__social-icon`, {
      'margin-left': space,
      'margin-right': '0px',
    });
    // The picture.
    const width = px(a[`imgWidth${s}`]);
    emit(sheet, device, IMAGES, {
      ...(desktop
        ? {
            'margin-top': px(a.imageTopMargin, a.imageMarginUnit),
            'margin-bottom': px(a.imageBottomMargin, a.imageMarginUnit),
            'margin-left': px(a.imageLeftMargin, a.imageMarginUnit),
            'margin-right': px(a.imageRightMargin, a.imageMarginUnit),
          }
        : {}),
      width,
      height: width,
    });
    if (desktop && above && ['center', 'left', 'right'].includes(String(a.align))) {
      emit(sheet, device, `${B} .pr-team__social-list`, {
        'justify-content':
          a.align === 'center' ? 'center' : a.align === 'left' ? 'flex-start' : 'flex-end',
      });
    }
    if (desktop && !above) {
      const middle = a.imgAlign === 'middle';
      emit(sheet, device, `${B} .pr-team__image`, {
        'align-self': middle ? 'center' : 'flex-start',
      });
      if (middle) emit(sheet, device, `${B} .pr-team__content`, { 'align-self': 'center' });
    }
    emit(sheet, device, `${B} ${tag}.pr-team__title`, {
      ...(desktop ? { color: a.titleColor } : {}),
      'margin-bottom': px(a[`titleSpace${s}`]),
      ...typography(a, 'title', device),
    });
  }
}

function safeHref(value: unknown): string {
  return typeof value === 'string' && /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(value.trim())
    ? value.trim()
    : '#';
}

function View({ attrs: a, id, text, root, editing }: ViewProps) {
  const word = (v: unknown, fallback: string) =>
    typeof v === 'string' && /^[\w-]+$/.test(v) ? v : fallback;
  const position = word(a.imgPosition, 'above');
  const url = mediaUrl(a.image);
  const width = numeric(a.imgWidth);
  const image = url ? (
    <img
      className={`pr-team__image pr-team__image--${word(a.imgStyle, 'normal')}`}
      src={url}
      alt={String((a.image as { alt?: unknown }).alt ?? '')}
      {...(width !== null ? { height: width, width } : {})}
      loading="lazy"
    />
  ) : null;
  const target = a.socialTarget ? '_blank' : '_self';
  const socials = a.socialEnable ? (
    <ul className="pr-team__social-list">
      {SOCIALS.filter(([icon]) => a[icon] !== '').map(([icon, link, label]) => (
        <li key={icon} className="pr-team__social-icon">
          {editing ? (
            <span>
              <Icon name={a[icon]} />
            </span>
          ) : (
            <a
              href={safeHref(a[link])}
              aria-label={typeof a[icon] === 'string' ? (a[icon] as string) : label}
              target={target}
              rel="noopener noreferrer"
            >
              <Icon name={a[icon]} />
            </a>
          )}
        </li>
      ))}
    </ul>
  ) : null;
  const className = [
    'wp-block-prisma-team',
    'pr-team',
    `pr-team--image-${position}`,
    `pr-team--align-${word(a.align, 'center')}`,
    `pr-team--stack-${word(a.stack, 'tablet')}`,
    blockClass(id),
  ].join(' ');
  return root(
    'div',
    { className },
    <>
      {position === 'left' && image}
      <div className="pr-team__content">
        {position === 'above' && image}
        {text('title', {
          tagName: safeTag(a.tag, 'h3'),
          className: 'pr-team__title',
          placeholder: 'Name',
        })}
        {text('prefix', {
          tagName: 'span',
          className: 'pr-team__prefix',
          placeholder: 'Designation',
        })}
        {text('description_text', {
          tagName: 'p',
          className: 'pr-team__desc',
          placeholder: 'Description',
        })}
        {socials}
      </div>
      {position === 'right' && image}
    </>,
  );
}

export const team: PrismaBlock = {
  name: 'team',
  title: 'Team',
  description: 'A person with a picture, the name, the role, a description and social profiles.',
  keywords: ['team', 'member', 'person', 'profile', 'staff'],
  richAttributes: ['title', 'prefix', 'description_text'],
  defaults: DEFAULTS,
  css,
  View,
  media: (a) => {
    const id = (a.image as { id?: unknown } | undefined)?.id;
    return typeof id === 'string' ? [id] : [];
  },
  spectra: {
    'uagb/team': (a, src) => {
      // The size shown on the page, when the saved object has another.
      const img =
        /<img\b[^>]*class="[^"]*\buagb-team__image-crop-[^"]*"[^>]*\ssrc="([^"]*)"/i.exec(
          src.html,
        )?.[1] ??
        /<img\b[^>]*\ssrc="([^"]*)"[^>]*class="[^"]*\buagb-team__image-crop-/i.exec(src.html)?.[1];
      return [
        src.block('team', {
          ...a,
          title: src.innerAny('uagb-team__title'),
          prefix: src.inner('span', 'uagb-team__prefix'),
          description_text: src.inner('p', 'uagb-team__desc'),
          ...(img && a.image && typeof a.image === 'object'
            ? { image: { ...(a.image as object), url: img } }
            : {}),
        }),
      ];
    },
  },
};
