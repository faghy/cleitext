import type { Device, Sheet } from '@cleitext/design';
import type { CxdInline } from '@cleitext/plugin-sdk';
import { mediaUrl } from '../../lib/background';
import { blockClass } from '../../lib/css';
import { DEVICES, emit, numeric, px, suffix, typography } from '../../lib/emit';
import { Icon } from '../../lib/icons';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';
import { typographyDefaults } from '../heading';

const DEFAULTS: Attrs = {
  descriptionText: [],
  author: [],
  skinStyle: 'border',
  align: 'left',
  descColor: '',
  ...typographyDefaults('desc', ''),
  descFontSize: 18,
  descFontStyle: 'italic',
  descLineHeight: 1.5,
  descSpace: 25,
  descSpaceTablet: 20,
  descSpaceMobile: 15,
  descSpaceUnit: 'px',
  authorColor: '#888888',
  ...typographyDefaults('author', ''),
  authorSpace: 15,
  authorSpaceTablet: 15,
  authorSpaceMobile: 15,
  authorImage: { url: '', alt: 'Author Image' },
  authorImageSize: 'thumbnail',
  authorImageWidth: 40,
  authorImageWidthTablet: 35,
  authorImageWidthMobile: 30,
  authorImageWidthUnit: 'px',
  authorImageGap: 10,
  authorImageGapTablet: 10,
  authorImageGapMobile: 10,
  authorImageGapUnit: 'px',
  authorImgBorderRadius: 100,
  authorImgBorderRadiusTablet: 100,
  authorImgBorderRadiusMobile: 100,
  authorImgPosition: 'left',
  stack: 'none',
  enableTweet: true,
  iconView: 'icon_text',
  iconSkin: 'classic',
  iconLabel: 'Tweet',
  iconShareVia: '',
  iconTargetUrl: 'current',
  customUrl: '',
  tweetLinkColor: '#1DA1F2',
  tweetBtnColor: '#fff',
  tweetBtnBgColor: '#1DA1F2',
  tweetBtnHoverColor: '',
  tweetBtnBgHoverColor: '#1DA1F2',
  ...typographyDefaults('tweetBtn', ''),
  tweetBtnFontSize: 15,
  tweetBtnHrPadding: 10,
  tweetBtnVrPadding: 10,
  ...Object.fromEntries(
    ['Top', 'Right', 'Bottom', 'Left'].flatMap((s) => [
      [`paddingBtn${s}`, ''],
      [`paddingBtn${s}Tablet`, ''],
      [`paddingBtn${s}Mobile`, ''],
    ]),
  ),
  paddingBtnUnit: 'px',
  tabletPaddingBtnUnit: 'px',
  mobilePaddingBtnUnit: 'px',
  tweetIconSpacing: 10,
  tweetIconSpacingUnit: 'px',
  borderColor: '#abb8c3',
  borderStyle: 'solid',
  borderWidth: 4,
  borderWidthUnit: 'px',
  borderGap: 15,
  borderGapTablet: 15,
  borderGapMobile: 15,
  borderGapUnit: 'px',
  verticalPadding: '',
  verticalPaddingTablet: '',
  verticalPaddingMobile: '',
  verticalPaddingUnit: 'px',
  quoteStyle: 'style_2',
  quoteColor: '#3d3d3d',
  quoteSize: 25,
  quoteSizeType: 'px',
  quoteSizeTablet: '',
  quoteSizeMobile: '',
  quoteTopMargin: '',
  quoteBottomMargin: 15,
  quoteLeftMargin: '',
  quoteRightMargin: 20,
  quoteTopMarginTablet: '',
  quoteBottomMarginTablet: '',
  quoteLeftMarginTablet: '',
  quoteRightMarginTablet: '',
  quoteTopMarginMobile: '',
  quoteBottomMarginMobile: '',
  quoteLeftMarginMobile: '',
  quoteRightMarginMobile: '',
  quoteUnit: 'px',
  quotetabletUnit: 'px',
  quotemobileUnit: 'px',
  quoteBorderRadius: 100,
  quoteBorderRadiusUnit: '%',
  quoteBgColor: '#f4f4f4',
  quoteHoverColor: '',
  quoteBgHoverColor: '',
  borderHoverColor: '',
  quotePadding: 10,
  quotePaddingType: 'px',
  quotePaddingTablet: '',
  quotePaddingMobile: '',
};

/** The first value that is a number (an unset side falls back to the older single setting). */
const firstNumber = (...values: unknown[]): unknown =>
  values.find((v) => numeric(v) !== null) ?? '';

function css(a: Attrs, B: string, sheet: Sheet): void {
  const border = a.skinStyle === 'border';
  // Without a centered quotation the author line sits on the footer's baseline.
  const authorSpaced = a.align === 'center' && !border;
  // The border skin is always left-aligned.
  const textAlign = border ? 'left' : a.align;
  const SB = `${B}.pr-blockquote--skin-border .pr-blockquote__quote`;
  const SQ = `${B}.pr-blockquote--skin-quotation .pr-blockquote__icon`;
  const TW = 'a.pr-blockquote__tweet';
  const btnPadding = (device: Device) => {
    const s = suffix(device);
    if (device !== 'desktop') {
      const unit = a[`${device}PaddingBtnUnit`];
      return {
        'padding-left': px(a[`paddingBtnLeft${s}`], unit),
        'padding-right': px(a[`paddingBtnRight${s}`], unit),
        'padding-top': px(a[`paddingBtnTop${s}`], unit),
        'padding-bottom': px(a[`paddingBtnBottom${s}`], unit),
      };
    }
    const unit = a.paddingBtnUnit;
    return {
      'padding-left': px(firstNumber(a.paddingBtnLeft, a.tweetBtnHrPadding), unit),
      'padding-right': px(firstNumber(a.paddingBtnRight, a.tweetBtnHrPadding), unit),
      'padding-top': px(firstNumber(a.paddingBtnTop, a.tweetBtnVrPadding), unit),
      'padding-bottom': px(firstNumber(a.paddingBtnBottom, a.tweetBtnVrPadding), unit),
    };
  };

  for (const device of DEVICES) {
    const s = suffix(device);
    const desktop = device === 'desktop';
    emit(sheet, device, `${B} .pr-blockquote__content`, {
      ...(desktop ? { color: a.descColor } : {}),
      'margin-bottom': px(a[`descSpace${s}`], a.descSpaceUnit),
      ...(desktop ? { 'text-align': textAlign } : {}),
      ...typography(a, 'desc', device),
    });
    emit(sheet, device, `${B} .pr-blockquote__author`, {
      ...(desktop ? { color: a.authorColor, 'text-align': textAlign } : {}),
      ...typography(a, 'author', device),
    });
    emit(sheet, device, SB, {
      ...(desktop
        ? {
            'border-color': a.borderColor,
            'border-left-style': a.borderStyle,
            'border-left-width': px(a.borderWidth, a.borderWidthUnit),
          }
        : {}),
      'padding-left': px(a[`borderGap${s}`], a.borderGapUnit),
      'padding-top': px(a[`verticalPadding${s}`], a.verticalPaddingUnit),
      'padding-bottom': px(a[`verticalPadding${s}`], a.verticalPaddingUnit),
    });
    const quoteUnit = desktop ? a.quoteUnit : a[`quote${device}Unit`];
    emit(sheet, device, SQ, {
      ...(desktop
        ? {
            background: a.quoteBgColor,
            'border-radius': px(a.quoteBorderRadius, a.quoteBorderRadiusUnit),
          }
        : {}),
      'margin-top': px(a[`quoteTopMargin${s}`], quoteUnit),
      'margin-bottom': px(a[`quoteBottomMargin${s}`], quoteUnit),
      'margin-left': px(a[`quoteLeftMargin${s}`], quoteUnit),
      'margin-right': px(a[`quoteRightMargin${s}`], quoteUnit),
      padding: px(a[`quotePadding${s}`], a.quotePaddingType),
    });
    emit(sheet, device, `${SQ} svg`, {
      width: px(a[`quoteSize${s}`], a.quoteSizeType),
      height: px(a[`quoteSize${s}`], a.quoteSizeType),
      ...(desktop ? { fill: a.quoteColor } : {}),
    });
    if (desktop) {
      emit(sheet, device, `${B}.pr-blockquote--style-style_1 .pr-blockquote__quote`, {
        'text-align': a.align,
      });
    }
    // The author and the picture.
    emit(sheet, device, `${B} .pr-blockquote__author-wrap`, {
      'margin-bottom': px(authorSpaced ? a[`authorSpace${s}`] : 0),
    });
    emit(sheet, device, `${B} .pr-blockquote__author-wrap img`, {
      width: px(a[`authorImageWidth${s}`]),
      height: px(a[`authorImageWidth${s}`]),
      'border-radius': px(a[`authorImgBorderRadius${s}`], '%'),
    });
    const gap = px(a[`authorImageGap${s}`], a.authorImageGapUnit);
    // Side pictures go above the name once the author line stacks.
    const stacked =
      device === 'tablet' ? a.stack === 'tablet' : device === 'mobile' && a.stack !== 'none';
    emit(
      sheet,
      device,
      `${B} .pr-blockquote__author-wrap--right img`,
      desktop
        ? { 'margin-left': gap }
        : { 'margin-left': stacked ? '0px' : gap, 'margin-bottom': stacked ? gap : '0px' },
    );
    emit(sheet, device, `${B} .pr-blockquote__author-wrap--top img`, { 'margin-bottom': gap });
    emit(
      sheet,
      device,
      `${B} .pr-blockquote__author-wrap--left img`,
      desktop
        ? { 'margin-right': gap }
        : { 'margin-right': stacked ? '0px' : gap, 'margin-bottom': stacked ? gap : '0px' },
    );
    if (desktop) {
      emit(sheet, device, `${SQ}:hover svg`, { fill: a.quoteHoverColor });
      emit(sheet, device, `${SQ}:hover`, { background: a.quoteBgHoverColor });
      emit(sheet, device, `${SB}:hover`, { 'border-left-color': a.borderHoverColor });
      emit(sheet, device, `${B}.pr-blockquote--align-center .pr-blockquote__quote`, {
        'text-align': a.align,
      });
    }
    // The share button.
    if (a.enableTweet) {
      const LINK = `${B}.pr-blockquote--tweet-style-link ${TW}`;
      const CLASSIC = `${B}.pr-blockquote--tweet-style-classic ${TW}`;
      const BUBBLE = `${B}.pr-blockquote--tweet-style-bubble ${TW}`;
      if (desktop) {
        emit(sheet, device, LINK, { color: a.tweetLinkColor });
        emit(sheet, device, `${LINK} svg`, { fill: a.tweetLinkColor });
        const classic = btnPadding(device);
        emit(sheet, device, CLASSIC, {
          color: a.tweetBtnColor,
          'background-color': a.tweetBtnBgColor,
          ...classic,
          // The classic skin repeats the top padding at the bottom (as the pages it replaces).
          'padding-bottom': classic['padding-top'],
        });
        emit(sheet, device, `${CLASSIC} svg`, { fill: a.tweetBtnColor });
        emit(sheet, device, BUBBLE, {
          color: a.tweetBtnColor,
          'background-color': a.tweetBtnBgColor,
          ...btnPadding(device),
        });
        emit(sheet, device, `${BUBBLE} svg`, { fill: a.tweetBtnColor });
        emit(sheet, device, `${BUBBLE}::before`, { 'border-right-color': a.tweetBtnBgColor });
        emit(sheet, device, `${B} ${TW} svg`, {
          width: px(a.tweetBtnFontSize, a.tweetBtnFontSizeType),
          height: px(a.tweetBtnFontSize, a.tweetBtnFontSizeType),
        });
        emit(sheet, device, `${B}.pr-blockquote--tweet-icon_text ${TW} svg`, {
          'margin-right': px(a.tweetIconSpacing, a.tweetIconSpacingUnit),
        });
        emit(sheet, device, `${LINK}:hover`, { color: a.tweetBtnHoverColor });
        emit(sheet, device, `${LINK}:hover svg`, { fill: a.tweetBtnHoverColor });
        for (const skin of [CLASSIC, BUBBLE]) {
          emit(sheet, device, `${skin}:hover`, {
            color: a.tweetBtnHoverColor,
            'background-color': a.tweetBtnBgHoverColor,
          });
          emit(sheet, device, `${skin}:hover svg`, { fill: a.tweetBtnHoverColor });
        }
        emit(sheet, device, `${BUBBLE}:hover::before`, {
          'border-right-color': a.tweetBtnBgHoverColor,
        });
      }
    }
    if (!desktop) {
      // These follow the device whether or not the button is shown, as the pages they replace.
      emit(sheet, device, `${B} ${TW} svg`, {
        width: px(a[`tweetBtnFontSize${s}`], a.tweetBtnFontSizeType),
        height: px(a[`tweetBtnFontSize${s}`], a.tweetBtnFontSizeType),
      });
      emit(sheet, device, `${B}.pr-blockquote--tweet-style-classic ${TW}`, btnPadding(device));
      emit(sheet, device, `${B}.pr-blockquote--tweet-style-bubble ${TW}`, btnPadding(device));
    }
    emit(sheet, device, `${B} .pr-blockquote__quote ${TW}`, typography(a, 'tweetBtn', device));
  }
}

/** Plain text of rich text (for the shared post). */
function plain(value: unknown): string {
  if (!Array.isArray(value)) return typeof value === 'string' ? value.replace(/<[^>]+>/g, '') : '';
  return (value as CxdInline[])
    .map((node) => ('type' in node ? node.children.map((c) => c.text).join('') : node.text))
    .join('');
}

/** The address of the share dialog; the page's own address is added on the site by the script. */
function shareUrl(a: Attrs): string {
  const author = plain(a.author).trim();
  const params = new URLSearchParams({
    text: plain(a.descriptionText) + (author ? ` — ${author}` : ''),
  });
  const custom = typeof a.customUrl === 'string' ? a.customUrl.trim() : '';
  if (a.iconTargetUrl !== 'current' && /^https?:\/\//i.test(custom)) params.set('url', custom);
  const via = typeof a.iconShareVia === 'string' ? a.iconShareVia.trim().replace(/^@/, '') : '';
  if (via) params.set('via', via);
  return `https://x.com/intent/tweet?${params.toString()}`;
}

function View({ attrs: a, id, text, root, editing }: ViewProps) {
  const has = (name: string) =>
    editing || (Array.isArray(a[name]) && (a[name] as unknown[]).length > 0);
  const skin = a.skinStyle === 'quotation' ? 'quotation' : 'border';
  const word = (v: unknown, fallback: string) =>
    typeof v === 'string' && /^[\w-]+$/.test(v) ? v : fallback;
  const view = word(a.iconView, 'icon_text');
  const className = [
    'wp-block-prisma-blockquote',
    'pr-blockquote',
    blockClass(id),
    `pr-blockquote--skin-${skin}`,
    skin !== 'border' ? `pr-blockquote--align-${word(a.align, 'left')}` : '',
    skin === 'quotation' ? `pr-blockquote--style-${word(a.quoteStyle, 'style_2')}` : '',
    a.enableTweet
      ? `pr-blockquote--with-tweet pr-blockquote--tweet-style-${word(a.iconSkin, 'classic')} pr-blockquote--tweet-${view}`
      : '',
    `pr-blockquote--stack-${word(a.stack, 'none')}`,
  ]
    .filter(Boolean)
    .join(' ');
  const image = mediaUrl(a.authorImage);
  const width = numeric(a.authorImageWidth);
  const label = String(a.iconLabel ?? '');
  const tweetContent = (
    <>
      {view !== 'text' && <Icon name="x-twitter" />}
      {view !== 'icon' && label}
    </>
  );
  const tweet = a.enableTweet ? (
    editing ? (
      <span className="pr-blockquote__tweet">{tweetContent}</span>
    ) : (
      <a
        href={shareUrl(a)}
        className="pr-blockquote__tweet"
        target="_blank"
        rel="noopener noreferrer"
        {...(a.iconTargetUrl === 'current' ? { 'data-pr-blockquote': '' } : {})}
        {...(view === 'icon' ? { 'aria-label': label || 'Share on X' } : {})}
      >
        {tweetContent}
      </a>
    )
  ) : null;
  return root(
    'div',
    { className },
    <blockquote className="pr-blockquote__quote">
      {skin === 'quotation' && (
        <span className="pr-blockquote__icon">
          <Icon name="quote-left" />
        </span>
      )}
      {has('descriptionText') &&
        text('descriptionText', {
          tagName: 'div',
          className: 'pr-blockquote__content',
          placeholder: 'Write a quote',
        })}
      <footer>
        <div
          className={`pr-blockquote__author-wrap${a.authorImage !== '' ? ` pr-blockquote__author-wrap--${word(a.authorImgPosition, 'left')}` : ''}`}
        >
          {image && (
            <img
              src={image}
              alt={String((a.authorImage as { alt?: unknown }).alt ?? '')}
              {...(width !== null ? { width, height: width } : {})}
              loading="lazy"
            />
          )}
          {has('author') && (
            <cite className="pr-blockquote__author">
              {text('author', { tagName: 'span', placeholder: 'Author' })}
            </cite>
          )}
        </div>
        {tweet}
      </footer>
    </blockquote>,
  );
}

export const blockquote: PrismaBlock = {
  name: 'blockquote',
  title: 'Blockquote',
  description: 'A quotation with its author, a picture and a link to share it on X.',
  keywords: ['blockquote', 'quote', 'citation', 'testimonial', 'tweet'],
  richAttributes: ['descriptionText', 'author'],
  defaults: DEFAULTS,
  css,
  View,
  media: (a) => {
    const id = (a.authorImage as { id?: unknown } | undefined)?.id;
    return typeof id === 'string' ? [id] : [];
  },
  script: { file: 'blockquote.js', marker: 'data-pr-blockquote' },
  spectra: {
    'uagb/blockquote': (a, src) => {
      const img =
        /<div class="[^"]*\buagb-blockquote__author-wrap\b[^"]*">\s*<img\b[^>]*\ssrc="([^"]*)"/i.exec(
          src.html,
        )?.[1];
      return [
        src.block('blockquote', {
          ...a,
          // Texts are only in the saved HTML: an empty one was left out.
          descriptionText: src.inner('div', 'uagb-blockquote__content'),
          author: src.inner('cite', 'uagb-blockquote__author'),
          ...(img && a.authorImage && typeof a.authorImage === 'object'
            ? { authorImage: { ...(a.authorImage as object), url: img } }
            : {}),
        }),
      ];
    },
  },
};
