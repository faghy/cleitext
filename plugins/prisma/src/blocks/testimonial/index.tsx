import type { BaseDevice as Device, Sheet } from '@cleitext/design';
import { cssUrl, gradient as gradientOf } from '../../lib/background';
import { blockClass } from '../../lib/css';
import {
  border,
  borderDefaults,
  DEVICES,
  emit,
  numeric,
  px,
  suffix,
  typography,
  type Declarations,
} from '../../lib/emit';
import { Icon } from '../../lib/icons';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';
import { safeInline } from './rich';

/** One testimonial of the list (`test_block`), as Spectra saves it. */
export interface TestimonialItem {
  description?: string;
  name?: string;
  company?: string;
  image?:
    | {
        id?: string | number;
        url?: string;
        alt?: string;
        sizes?: Record<string, { url?: string }>;
      }
    | null
    | '';
}

const SAMPLE =
  'I have been working with these guys for years now! With lots of hard work and timely communication, they made sure they delivered the best to me. Highly recommended!';

/** Typography of a text part, with Spectra's own defaults for it. */
function typo(p: string, values: Attrs = {}): Attrs {
  const out: Attrs = {
    [`${p}FontFamily`]: '',
    [`${p}FontWeight`]: '',
    [`${p}FontStyle`]: '',
    [`${p}Transform`]: '',
    [`${p}Decoration`]: '',
    [`${p}FontSizeType`]: 'px',
    [`${p}LineHeightType`]: 'em',
    [`${p}LetterSpacingType`]: 'px',
    [`${p}LoadGoogleFonts`]: false,
  };
  for (const s of ['', 'Tablet', 'Mobile']) {
    out[`${p}FontSize${s}`] = '';
    out[`${p}LineHeight${s}`] = '';
    out[`${p}LetterSpacing${s}`] = '';
  }
  return { ...out, ...values };
}

/** Four sides by device, unset by default (the older single values then apply). */
function sides(p: string): Attrs {
  const out: Attrs = {};
  for (const s of ['', 'Tablet', 'Mobile'])
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) out[`${p}${side}${s}`] = '';
  return out;
}

const DEFAULTS: Attrs = {
  test_item_count: 3,
  test_block: [1, 2, 3].map(() => ({
    description: SAMPLE,
    name: 'John Doe ',
    company: 'Company Name',
    image: '',
  })),
  classMigrate: false,
  headingAlign: 'center',
  headingAlignTablet: 'center',
  headingAlignMobile: 'center',
  companyColor: '#888888',
  descColor: '#333',
  authorColor: '#333',
  iconimgStyle: 'circle',
  imagePosition: 'bottom',
  imageAlignment: 'top',
  imageSize: 'thumbnail',
  ...typo('name', { nameFontSize: 20, nameFontWeight: 'Default', nameLineHeight: 2 }),
  ...typo('company', { companyFontStyle: 'normal' }),
  ...typo('desc', { descFontSize: 18, descFontWeight: '400', descLineHeight: 1.6 }),
  descSpace: 20,
  descSpaceTablet: '',
  descSpaceMobile: '',
  descSpaceType: 'px',
  nameSpace: 5,
  nameSpaceTablet: '',
  nameSpaceMobile: '',
  nameSpaceType: 'px',
  imgVrPadding: 10,
  imgHrPadding: 10,
  ...sides('imgpadding'),
  imgpaddingUnit: 'px',
  imgtabletPaddingUnit: 'px',
  imgmobilePaddingUnit: 'px',
  imgspacingLink: false,
  imageWidth: 60,
  imageWidthTablet: '',
  imageWidthMobile: '',
  imageWidthType: 'px',
  imgTagHeight: 0,
  rowGap: 10,
  rowGapTablet: 10,
  rowGapMobile: 10,
  rowGapType: 'px',
  columnGap: 10,
  columnGapTablet: 10,
  columnGapMobile: 10,
  columnGapType: 'px',
  contentPadding: 5,
  ...sides('padding'),
  paddingUnit: 'px',
  tabletPaddingUnit: 'px',
  mobilePaddingUnit: 'px',
  spacingLink: false,
  backgroundType: 'none',
  backgroundColor: '#eeeeee',
  backgroundHoverColor: '',
  backgroundImage: '',
  backgroundPosition: 'center-center',
  backgroundSize: 'cover',
  backgroundRepeat: 'no-repeat',
  backgroundAttachment: '',
  backgroundImageColor: '',
  backgroundOpacity: '',
  overlayType: 'color',
  selectGradient: 'basic',
  gradientValue: 'linear-gradient(90deg, rgb(6, 147, 227, 0.5) 0%, rgb(155, 81, 224, 0.5) 100%)',
  gradientColor1: '#06558a',
  gradientColor2: '#0063a1',
  gradientType: 'linear',
  gradientLocation1: 0,
  gradientLocationTablet1: '',
  gradientLocationMobile1: '',
  gradientLocation2: 100,
  gradientLocationTablet2: '',
  gradientLocationMobile2: '',
  gradientAngle: 0,
  gradientAngleTablet: '',
  gradientAngleMobile: '',
  gradientPosition: 'center center',
  arrowColor: '#333',
  arrowDots: 'arrowDots',
  arrowSize: 20,
  arrowSizeType: 'px',
  arrowBorderSize: 0,
  arrowBorderRadius: 0,
  columns: 1,
  tcolumns: 1,
  mcolumns: 1,
  autoplay: true,
  autoplaySpeed: 2000,
  infiniteLoop: true,
  pauseOnHover: true,
  transitionSpeed: 500,
  stack: 'tablet',
  equalHeight: false,
  vAlignContent: 'flex-start',
  // The older single border, used where the newer one is unset.
  borderStyle: 'none',
  borderWidth: 1,
  borderRadius: '',
  borderColor: '',
  borderHoverColor: '',
  ...borderDefaults('overall'),
};

/** The testimonials, safe to draw. */
export function items(a: Attrs): TestimonialItem[] {
  return Array.isArray(a.test_block)
    ? (a.test_block as unknown[]).filter(
        (t): t is TestimonialItem => Boolean(t) && typeof t === 'object',
      )
    : [];
}

const safeUrl = (url: unknown) =>
  typeof url === 'string' && /^(https?:\/\/|\/(?!\/))[^\s"'<>]*$/.test(url) ? url : '';

const isSet = (v: unknown) => v !== '' && v !== undefined && v !== null;

/** A side of the padding: its own value, else the older single value. */
const side = (a: Attrs, key: string, fallback: unknown) => (isSet(a[key]) ? a[key] : fallback);

/** The value of a device, else the larger device's (a number only). */
function fallback(a: Attrs, base: string, device: Device): unknown {
  const d = a[base];
  const t = numeric(a[`${base}Tablet`]) !== null ? a[`${base}Tablet`] : d;
  if (device === 'desktop') return d;
  if (device === 'tablet') return t;
  return numeric(a[`${base}Mobile`]) !== null ? a[`${base}Mobile`] : t;
}

/** The desktop border, filled from the older single border where unset. */
function overallBorder(a: Attrs): Declarations {
  const out = border(a, 'overall', 'desktop');
  if (a.overallBorderStyle === 'default') return {};
  const width = px(a.borderWidth);
  const radius = px(a.borderRadius);
  const pick = (v: unknown, legacy: string) => (v || v === 0 ? v : legacy);
  return {
    'border-top-width': pick(out['border-top-width'], width),
    'border-left-width': pick(out['border-left-width'], width),
    'border-right-width': pick(out['border-right-width'], width),
    'border-bottom-width': pick(out['border-bottom-width'], width),
    'border-top-left-radius': pick(out['border-top-left-radius'], radius),
    'border-top-right-radius': pick(out['border-top-right-radius'], radius),
    'border-bottom-left-radius': pick(out['border-bottom-left-radius'], radius),
    'border-bottom-right-radius': pick(out['border-bottom-right-radius'], radius),
    'border-color': out['border-color'] || a.borderColor,
    'border-style': out['border-style'] || a.borderStyle,
  };
}

/** Typography without Spectra's `Default` weight (not a CSS value). */
function textCss(a: Attrs, p: string, device: Device): Declarations {
  const out = typography(a, p, device);
  if (out['font-weight'] === 'Default') delete out['font-weight'];
  return out;
}

const FLEX: Record<string, string> = { left: 'flex-start', right: 'flex-end' };

function css(a: Attrs, B: string, sheet: Sheet): void {
  const count = numeric(a.test_item_count);
  const columns = numeric(a.columns);
  const advanced = a.selectGradient === 'advanced';
  const bgType = String(a.backgroundType);
  for (const device of DEVICES) {
    const s = suffix(device);
    const desktop = device === 'desktop';
    const gap = numeric(fallback(a, 'columnGap', device)) ?? 0;
    emit(sheet, device, `${B} .pr-testimonial__wrap`, {
      'margin-bottom': px(fallback(a, 'rowGap', device), a.rowGapType),
      'padding-left': px(gap / 2, a.columnGapType),
      'padding-right': px(gap / 2, a.columnGapType),
    });
    const unit = desktop ? a.paddingUnit : a[`${device}PaddingUnit`];
    const pad = (sideName: string) =>
      desktop ? side(a, `padding${sideName}`, a.contentPadding) : a[`padding${sideName}${s}`];
    let content: Declarations = {
      'text-align': a[`headingAlign${s}`],
      'padding-top': px(pad('Top'), unit),
      'padding-bottom': px(pad('Bottom'), unit),
      'padding-left': px(pad('Left'), unit),
      'padding-right': px(pad('Right'), unit),
      'align-content': a.vAlignContent,
    };
    // As Spectra: a gradient background takes the place of the content's other
    // settings on that device (alignment and padding are then not written).
    if (bgType === 'gradient') {
      content = {
        'background-color': 'transparent',
        'background-image': desktop || advanced ? gradientOf(a, device) : '',
      };
    }
    emit(sheet, device, `${B} .pr-testimonial__content`, content);
    const imgUnit = desktop ? a.imgpaddingUnit : a[`img${device}PaddingUnit`];
    const imgPad = (sideName: string, legacy: unknown) =>
      desktop ? side(a, `imgpadding${sideName}`, legacy) : a[`imgpadding${sideName}${s}`];
    emit(sheet, device, `${B} .pr-testimonial__wrap .pr-testimonial__image-content`, {
      'text-align': a[`headingAlign${s}`],
      'padding-top': px(imgPad('Top', a.imgVrPadding), imgUnit),
      'padding-right': px(imgPad('Right', a.imgHrPadding), imgUnit),
      'padding-bottom': px(imgPad('Bottom', a.imgVrPadding), imgUnit),
      'padding-left': px(imgPad('Left', a.imgHrPadding), imgUnit),
    });
    const width = px(a[`imageWidth${s}`], a.imageWidthType);
    emit(sheet, device, `${B} .pr-testimonial__image img`, { width, 'max-width': width });
    emit(sheet, device, `${B} .pr-testimonial__author-name`, {
      ...textCss(a, 'name', device),
      ...(desktop ? { color: a.authorColor } : {}),
      'margin-bottom': px(a[`nameSpace${s}`], a.nameSpaceType),
    });
    emit(sheet, device, `${B} .pr-testimonial__company`, {
      ...textCss(a, 'company', device),
      ...(desktop ? { color: a.companyColor } : {}),
    });
    const narrow = count === 1 || a.arrowDots === 'dots' || columns !== 1 ? 'auto' : '20px';
    emit(sheet, device, `${B} .pr-testimonial__desc`, {
      ...textCss(a, 'desc', device),
      ...(desktop ? { color: a.descColor } : {}),
      'margin-bottom': px(a[`descSpace${s}`], a.descSpaceType),
      ...(device === 'mobile' ? { 'margin-left': narrow, 'margin-right': narrow } : {}),
    });
    emit(
      sheet,
      device,
      `${B} .pr-testimonial__wrap .pr-testimonial__content`,
      desktop ? overallBorder(a) : border(a, 'overall', device),
    );
    if (bgType === 'image' && a.overlayType === 'gradient') {
      emit(sheet, device, `${B} .pr-testimonial__wrap--bg-image .pr-testimonial__overlay`, {
        'background-image': desktop || advanced ? gradientOf(a, device) : '',
      });
    }
  }
  emit(sheet, 'desktop', `${B} .pr-testimonial__wrap .pr-testimonial__content:hover`, {
    'border-color': a.overallBorderHColor,
  });
  emit(sheet, 'desktop', `${B} .pr-testimonial__dot::before`, { color: a.arrowColor });
  emit(sheet, 'desktop', `${B} .pr-testimonial__dot.is-active::before`, { color: a.arrowColor });
  emit(sheet, 'desktop', `${B} .pr-testimonial__wrap--image-top .pr-testimonial__image-content`, {
    'justify-content': FLEX[String(a.headingAlign)] ?? 'center',
  });
  // Arrows: Spectra writes these on the buttons themselves.
  emit(sheet, 'desktop', `${B} .pr-testimonial__arrow`, {
    'border-color': a.arrowColor,
    'border-radius': px(a.arrowBorderRadius),
    'border-width': px(a.arrowBorderSize),
  });
  emit(sheet, 'desktop', `${B} .pr-testimonial__arrow svg`, {
    fill: a.arrowColor,
    width: px(a.arrowSize, a.arrowSizeType),
    height: px(a.arrowSize, a.arrowSizeType),
  });
  if (bgType === 'image') {
    if (a.overlayType === 'color') {
      const opacity = numeric(a.backgroundOpacity);
      emit(sheet, 'desktop', `${B} .pr-testimonial__wrap--bg-image .pr-testimonial__overlay`, {
        'background-color': a.backgroundImageColor,
        opacity: opacity !== null && opacity !== 101 ? (100 - opacity) / 100 : '',
      });
    }
  } else {
    emit(sheet, 'desktop', `${B} .pr-testimonial__wrap--bg-color .pr-testimonial__content`, {
      'background-color': a.backgroundColor,
    });
  }
  emit(sheet, 'desktop', `${B} .pr-testimonial__wrap--bg-image .pr-testimonial__content`, {
    'background-image': cssUrl(a.backgroundImage),
    'background-position': String(a.backgroundPosition ?? '').replace('-', ' '),
    'background-repeat': a.backgroundRepeat,
    'background-size': a.backgroundSize,
  });
  // Room under the slides for the dots, none when every testimonial is in view.
  if (count !== null && count === columns)
    emit(sheet, 'desktop', `${B}.pr-testimonial`, { padding: 0 });
  else if (a.arrowDots === 'dots')
    emit(sheet, 'desktop', `${B}.pr-testimonial`, { padding: '0 0 35px 0' });
}

const clampColumns = (v: unknown) => Math.min(Math.max(Math.round(numeric(v) ?? 1), 1), 10);

/** The address of a testimonial's image at the chosen size, else the original. */
function imageUrl(item: TestimonialItem, size: unknown): string {
  const image = item.image;
  if (!image || typeof image !== 'object') return '';
  return safeUrl(image.sizes?.[String(size)]?.url) || safeUrl(image.url);
}

function wrapClasses(a: Attrs): string {
  const P = 'pr-testimonial__wrap';
  const out = [
    P,
    `${P}--style-${String(a.iconimgStyle)}`,
    `${P}--image-${String(a.imagePosition)}`,
  ];
  if (a.imagePosition === 'left' || a.imagePosition === 'right') {
    out.push(`${P}--aligned-${String(a.imageAlignment)}`);
    if (a.stack !== 'none') {
      out.push(`${P}--stacked-${String(a.stack)}`);
      if (a.imagePosition === 'right') out.push(`${P}--reverse-${String(a.stack)}`);
    }
  }
  out.push(`${P}--bg-${String(a.backgroundType)}`);
  return out.map((c) => c.replace(/[^\w-]/g, '')).join(' ');
}

function View({ attrs: a, id, root }: ViewProps) {
  const list = items(a);
  const position = String(a.imagePosition);
  const count = numeric(a.test_item_count);
  const cols = [a.columns, a.tcolumns, a.mcolumns].map(clampColumns) as [number, number, number];
  const dots =
    a.arrowDots === 'dots' || a.arrowDots === 'arrowDots' || a.arrowDots === 'arrows_dots';
  const arrows =
    a.arrowDots === 'arrows' || a.arrowDots === 'arrowDots' || a.arrowDots === 'arrows_dots';
  const config = {
    autoplay: a.autoplay !== false ? Math.max(100, numeric(a.autoplaySpeed) ?? 2000) : 0,
    infinite: a.infiniteLoop !== false,
    pauseOnHover: a.pauseOnHover !== false,
    speed: Math.max(0, numeric(a.transitionSpeed) ?? 500),
    arrows,
    dots,
  };
  const width = numeric(a.imageWidth);
  const height = numeric(a.imgTagHeight);
  const image = (item: TestimonialItem) => {
    const src = imageUrl(item, a.imageSize);
    if (!src) return null;
    return (
      <div className="pr-testimonial__image-content">
        <div className="pr-testimonial__image">
          <img
            className="pr-testimonial__img"
            src={src}
            alt={item.image && typeof item.image.alt === 'string' ? item.image.alt : ''}
            {...(width ? { width } : {})}
            {...(height ? { height } : {})}
            loading="lazy"
          />
        </div>
      </div>
    );
  };
  const html = (value: unknown, className: string, tag: 'div' | 'span') => {
    const Tag = tag;
    return <Tag className={className} dangerouslySetInnerHTML={{ __html: safeInline(value) }} />;
  };
  return root(
    'div',
    {
      className: [
        'wp-block-prisma-testimonial',
        'pr-testimonial',
        'pr-testimonial--arrows-outside',
        blockClass(id),
        a.equalHeight ? 'pr-testimonial--equal-height' : '',
        count !== null && count === numeric(a.columns) ? 'pr-testimonial--all-desktop' : '',
        count !== null && count === numeric(a.tcolumns) ? 'pr-testimonial--all-tablet' : '',
        count !== null && count === numeric(a.mcolumns) ? 'pr-testimonial--all-mobile' : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
    <div
      className="pr-testimonial__items"
      style={
        {
          '--pr-columns-desktop': String(cols[0]),
          '--pr-columns-tablet': String(cols[1]),
          '--pr-columns-mobile': String(cols[2]),
        } as Record<string, string>
      }
      data-pr-testimonial={JSON.stringify(config)}
    >
      <div className="pr-testimonial__viewport">
        <div className="pr-testimonial__track">
          {list.map((item, i) => (
            <div key={i} className={wrapClasses(a)} data-index={i}>
              <div className="pr-testimonial__content">
                <div className="pr-testimonial__overlay" />
                {(position === 'top' || position === 'left') && image(item)}
                <div className="pr-testimonial__text-wrap">
                  {html(item.description, 'pr-testimonial__desc', 'div')}
                  <div className="pr-testimonial__meta-inner">
                    {position === 'bottom' && image(item)}
                    <div className="pr-testimonial__details">
                      {html(item.name, 'pr-testimonial__author-name', 'span')}
                      {html(item.company, 'pr-testimonial__company', 'span')}
                    </div>
                  </div>
                </div>
                {position === 'right' && image(item)}
              </div>
            </div>
          ))}
        </div>
      </div>
      {arrows && (
        <>
          <button
            type="button"
            className="pr-testimonial__arrow pr-testimonial__arrow--prev"
            aria-label="Previous"
            hidden
          >
            <Icon name="angle-left" />
          </button>
          <button
            type="button"
            className="pr-testimonial__arrow pr-testimonial__arrow--next"
            aria-label="Next"
            hidden
          >
            <Icon name="angle-right" />
          </button>
        </>
      )}
    </div>,
  );
}

/** Texts of the saved testimonials, read back from Spectra's HTML in order. */
function savedTexts(html: string, className: string): string[] {
  const out: string[] = [];
  const pattern = new RegExp(
    `<(div|span|p)\\b[^>]*class="(?:[^"]*\\s)?${className}(?:\\s[^"]*)?"[^>]*>([\\s\\S]*?)</\\1>`,
    'gi',
  );
  for (const match of html.matchAll(pattern)) out.push(match[2]!.trim());
  return out;
}

export const testimonial: PrismaBlock = {
  name: 'testimonial',
  title: 'Testimonials',
  description: 'Customer testimonials with a picture, in columns or a carousel.',
  keywords: ['testimonial', 'testimonials', 'review', 'quote', 'carousel', 'slider'],
  script: { file: 'testimonial.js', marker: 'data-pr-testimonial' },
  defaults: DEFAULTS,
  css,
  View,
  media: (a) =>
    items(a)
      .map((t) => (t.image && typeof t.image.id === 'string' ? t.image.id : null))
      .filter((m): m is string => m !== null),
  spectra: {
    'uagb/testimonial': (a, src) => {
      // The texts are kept in the attributes; when they are not (older saves), the HTML has them.
      const descs = savedTexts(src.html, 'uagb-tm__desc');
      const names = savedTexts(src.html, 'uagb-tm__author-name');
      const companies = savedTexts(src.html, 'uagb-tm__company');
      const list = Array.isArray(a.test_block)
        ? (a.test_block as TestimonialItem[])
        : descs.map(() => ({}) as TestimonialItem);
      const test_block = list.map((t, i) => ({
        description: typeof t?.description === 'string' ? t.description : (descs[i] ?? ''),
        name: typeof t?.name === 'string' ? t.name : (names[i] ?? ''),
        company: typeof t?.company === 'string' ? t.company : (companies[i] ?? ''),
        image: t?.image && typeof t.image === 'object' ? t.image : '',
      }));
      const out: Attrs = { ...a };
      if (Array.isArray(a.test_block) || test_block.length) out.test_block = test_block;
      return [src.block('testimonial', out)];
    },
  },
};
