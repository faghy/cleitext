import type { CxdInline } from '@cleitext/plugin-sdk';
import type { Device, Sheet } from '@cleitext/design';
import { mediaUrl } from '../../lib/background';
import { blockClass } from '../../lib/css';
import { DEVICES, emit, numeric, px, typography, type Declarations } from '../../lib/emit';
import { safeTag } from '../../lib/tags';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';
import { typographyDefaults } from '../heading';

/** One rated feature. */
interface Part {
  label?: unknown;
  value?: unknown;
}

const DEFAULTS: Attrs = {
  // Texts.
  rTitle: [{ text: 'Name of the reviewed item' }],
  rContent: [{ text: 'A short description of the item and of what the review covers.' }],
  rAuthor: [{ text: '– Author name' }],
  summaryTitle: [{ text: 'Summary' }],
  summaryDescription: [{ text: 'The conclusion of the review in a few words.' }],
  headingTag: 'h3',
  // Content.
  parts: [{ label: '', value: 0 }],
  starCount: 5,
  showFeature: true,
  showAuthor: true,
  enableDescription: true,
  enableImage: true,
  mainimage: { url: '' },
  imgSize: 'thumbnail',
  imgTagWidth: 0,
  imgTagHeight: 0,
  ctaLink: '#',
  ctaTarget: false,
  overallAlignment: 'left',
  // Structured data.
  enableSchema: true,
  itemType: 'Product',
  itemSubtype: '',
  reviewPublisher: '',
  datepublish: '',
  brand: '',
  sku: '',
  identifier: '',
  identifierType: 'gtin',
  aggregateType: 'AggregateRating',
  offerType: 'Offer',
  offerStatus: '',
  offerPrice: 0,
  offerCurrency: 'USD',
  offerExpiry: '',
  isbn: '',
  bookAuthorName: '',
  provider: '',
  courseMode: 'Online',
  courseLocation: '',
  repeatCount: 1,
  repeatFrequency: 'Daily',
  categoryOfCourse: 'Free',
  appCategory: '',
  operatingSystem: '',
  directorname: '',
  datecreated: '',
  // Colors.
  titleColor: '',
  descColor: '',
  authorColor: '',
  contentColor: '',
  summaryColor: '',
  starColor: '#f0ad4e',
  starActiveColor: '#ccd6df',
  starOutlineColor: '#000000',
  activeStarColor: '#eeee00',
  inactiveStarColor: '#888888',
  // Spacing: each side falls back to the shared vertical/horizontal value.
  contentVrPadding: '',
  contentHrPadding: '',
  topPadding: '',
  bottomPadding: '',
  leftPadding: '',
  rightPadding: '',
  paddingTopTablet: '',
  paddingRightTablet: '',
  paddingBottomTablet: '',
  paddingLeftTablet: '',
  paddingTopMobile: '',
  paddingRightMobile: '',
  paddingBottomMobile: '',
  paddingLeftMobile: '',
  paddingUnit: 'px',
  tabletPaddingUnit: 'px',
  mobilePaddingUnit: 'px',
  spacingLink: false,
  ...typographyDefaults('head', ''),
  ...typographyDefaults('subHead', ''),
  ...typographyDefaults('content', ''),
};

// ---- Stars -----------------------------------------------------------------------------------

/** A five-pointed star filling a 150×150 box. */
const STAR_PATH = (() => {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? 29.8 : 78;
    points.push(
      `${(75 + radius * Math.cos(angle)).toFixed(2)},${(82.5 + radius * Math.sin(angle)).toFixed(2)}`,
    );
  }
  return `M${points.join('L')}Z`;
})();

/** Stars filled up to `value` (a part of the last one), as many as `limit`. */
function Stars({
  value,
  limit,
  maskId,
  className,
  a,
}: {
  value: number;
  limit: number;
  maskId: string;
  className?: string;
  a: Attrs;
}) {
  const outline = String(a.starOutlineColor ?? '');
  return (
    <div
      className={['pr-review__stars', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={`${Math.round(value * 10) / 10} / ${limit}`}
    >
      {Array.from({ length: limit }, (_, i) => {
        const fill = Math.min(1, Math.max(0, value - i));
        return (
          <div key={i} className="pr-review__star-wrap">
            <svg xmlns="http://www.w3.org/2000/svg" height="20" width="20" viewBox="0 0 150 150">
              <defs>
                <mask id={`${maskId}-${i}`}>
                  <rect height="150" width={150 * fill} y="0" x="0" fill="#fff" />
                </mask>
              </defs>
              <path
                fill={String(a.inactiveStarColor ?? '')}
                strokeWidth="2.5"
                d={STAR_PATH}
                stroke={outline}
              />
              <path
                className="pr-review__star"
                mask={`url(#${maskId}-${i})`}
                fill={String(a.activeStarColor ?? '')}
                strokeWidth="2.5"
                d={STAR_PATH}
                stroke={outline}
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

// ---- CSS -------------------------------------------------------------------------------------

function css(a: Attrs, B: string, sheet: Sheet): void {
  const set = (v: unknown) => numeric(v) !== null;
  for (const device of DEVICES) {
    let spacing: Declarations;
    if (device === 'desktop') {
      const side = (own: unknown, shared: unknown) => (set(own) ? own : shared);
      spacing = {
        'padding-left': px(side(a.leftPadding, a.contentHrPadding), a.paddingUnit),
        'padding-right': px(side(a.rightPadding, a.contentHrPadding), a.paddingUnit),
        'padding-top': px(side(a.topPadding, a.contentVrPadding), a.paddingUnit),
        'padding-bottom': px(side(a.bottomPadding, a.contentVrPadding), a.paddingUnit),
        'text-align': a.overallAlignment,
      };
    } else {
      const D = device === 'tablet' ? 'Tablet' : 'Mobile';
      const unit = a[`${device}PaddingUnit`];
      spacing = {
        'padding-left': px(a[`paddingLeft${D}`], unit),
        'padding-right': px(a[`paddingRight${D}`], unit),
        'padding-top': px(a[`paddingTop${D}`], unit),
        'padding-bottom': px(a[`paddingBottom${D}`], unit),
      };
    }
    emit(sheet, device, `${B} .pr-review__block`, spacing);
    emitTypography(sheet, device, a, 'head', [`${B} .pr-review__title`, `${B} .pr-review__entry`]);
    emitTypography(sheet, device, a, 'subHead', [
      `${B} .pr-review__desc`,
      `${B} .pr-review__author`,
    ]);
    emitTypography(sheet, device, a, 'content', [
      `${B} .pr-review__summary`,
      `${B} .pr-review__block .pr-review__summary-title`,
    ]);
  }
  emit(sheet, 'desktop', `${B} .pr-review__block .pr-review__title`, { color: a.titleColor });
  emit(sheet, 'desktop', `${B} .pr-review__block .pr-review__desc`, { color: a.descColor });
  emit(sheet, 'desktop', `${B} .pr-review__block .pr-review__author`, { color: a.authorColor });
  emit(sheet, 'desktop', `${B} .pr-review__entry`, { color: a.contentColor });
  emit(sheet, 'desktop', `${B} .pr-review__summary`, { color: a.summaryColor });
  emit(
    sheet,
    'desktop',
    `${B} .pr-review__entry .pr-review__star, ${B} .pr-review__average-stars .pr-review__star`,
    { fill: a.starColor },
  );
  emit(sheet, 'desktop', `${B} .pr-review__entry path, ${B} .pr-review__average-stars path`, {
    stroke: a.starOutlineColor,
    fill: a.starActiveColor,
  });
}

function emitTypography(sheet: Sheet, device: Device, a: Attrs, p: string, selectors: string[]) {
  emit(sheet, device, selectors.join(', '), typography(a, p, device));
}

// ---- Structured data --------------------------------------------------------------------------

/** Plain text of a rich text (or of an HTML string). */
function plain(value: unknown): string {
  if (typeof value === 'string') return value.replace(/<[^>]*>/g, '').trim();
  if (!Array.isArray(value)) return '';
  return (value as CxdInline[])
    .map((node) =>
      'children' in node ? node.children.map((c) => c.text).join('') : (node.text ?? ''),
    )
    .join('')
    .trim();
}

const parts = (a: Attrs): Part[] =>
  Array.isArray(a.parts) ? (a.parts as Part[]).filter((p) => p && typeof p === 'object') : [];

/** The average of the ratings. */
function average(a: Attrs): number {
  const list = parts(a);
  if (!list.length) return 0;
  return list.reduce((sum, p) => sum + (numeric(p.value) ?? 0), 0) / list.length;
}

/** Values left out of the structured data: empty texts, empty lists and objects. */
function prune(value: unknown): unknown {
  if (Array.isArray(value)) {
    const list = value.map(prune).filter((v) => v !== undefined);
    return list.length ? list : undefined;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([k, v]) => [k, prune(v)] as const)
      .filter(([, v]) => v !== undefined);
    return entries.some(([k]) => k !== '@type') ? Object.fromEntries(entries) : undefined;
  }
  return value === '' || value === null || value === undefined ? undefined : value;
}

/** The review as schema.org data (a `Review` of the item, with its rating). */
export function reviewSchema(a: Attrs, imageUrl: string): Record<string, unknown> {
  const type = String(a.itemType || 'Product');
  const subtype = String(a.itemSubtype ?? '');
  const itemType =
    ['Product', 'SoftwareApplication', 'Book'].includes(type) && subtype && !/^none$/i.test(subtype)
      ? subtype
      : type;
  const rating = average(a);
  const name = plain(a.rTitle);
  const description = a.enableDescription !== false ? plain(a.rContent) : '';
  const url = String(a.ctaLink ?? '') === '#' ? '' : String(a.ctaLink ?? '');
  let item: Record<string, unknown>;
  switch (type) {
    case 'Book':
      item = { '@type': itemType, name, description, author: plain(a.rAuthor), isbn: a.isbn };
      break;
    case 'Course':
      item = {
        '@type': type,
        name,
        description,
        provider: { '@type': 'Organization', name: a.provider },
        offers: [{ '@type': 'Offer', category: a.categoryOfCourse }],
        hasCourseInstance: [
          {
            '@type': 'CourseInstance',
            courseMode: a.courseMode,
            location: a.courseMode === 'Online' ? '' : a.courseLocation,
            courseSchedule: {
              '@type': 'Schedule',
              repeatCount: a.repeatCount,
              repeatFrequency: a.repeatFrequency,
            },
          },
        ],
      };
      break;
    case 'Movie':
      item = {
        '@type': type,
        name,
        dateCreated: a.datecreated,
        director: { '@type': 'Person', name: a.directorname },
      };
      break;
    case 'SoftwareApplication':
      item = {
        '@type': itemType,
        name,
        applicationCategory: a.appCategory,
        operatingSystem: a.operatingSystem,
        aggregateRating: {
          '@type': a.aggregateType || 'AggregateRating',
          ratingValue: rating,
          ratingCount: parts(a).length,
        },
        offers: {
          '@type': a.offerType || 'Offer',
          price: a.offerPrice,
          url,
          priceCurrency: a.offerCurrency,
        },
      };
      break;
    default:
      item = {
        '@type': itemType,
        name,
        description,
        sku: a.sku,
        brand: { '@type': 'Brand', name: a.brand },
        ...(a.identifier && /^[a-z0-9]{1,10}$/.test(String(a.identifierType))
          ? { [String(a.identifierType)]: a.identifier }
          : {}),
        offers: {
          '@type': a.offerType || 'Offer',
          price: a.offerPrice,
          url,
          priceValidUntil: a.offerExpiry,
          priceCurrency: a.offerCurrency,
          availability: a.offerStatus,
        },
      };
  }
  if (imageUrl && type !== 'Course') item.image = imageUrl;
  const data = {
    '@context': 'https://schema.org/',
    '@type': 'Review',
    reviewBody: plain(a.summaryDescription),
    description,
    itemReviewed: item,
    reviewRating: {
      '@type': 'Rating',
      ratingValue: Math.round(rating * 100) / 100,
      worstRating: 0,
      bestRating: numeric(a.starCount) ?? 5,
    },
    author: a.showAuthor !== false ? { '@type': 'Person', name: plain(a.rAuthor) } : undefined,
    publisher: a.reviewPublisher ? { '@type': 'Organization', name: a.reviewPublisher } : undefined,
    datePublished: a.datepublish,
    url,
    ...(type === 'Course' ? { provider: { '@type': 'Organization', name: a.provider } } : {}),
  };
  return (prune(data) as Record<string, unknown>) ?? {};
}

/** What the structured data misses (shown in the editor only, as a reminder). */
function missing(a: Attrs, imageUrl: string): string[] {
  const out: string[] = [];
  const empty = (v: unknown) => v === undefined || v === null || v === '';
  const need = (v: unknown, label: string) => empty(v) && out.push(label);
  switch (a.itemType) {
    case 'Product':
      need(a.sku, 'SKU of the product');
      need(a.brand, 'brand of the product');
      need(a.offerCurrency, 'offer currency');
      need(a.offerPrice, 'offer price');
      need(a.identifier, 'global identifier');
      break;
    case 'Book':
      need(a.isbn, 'ISBN of the book');
      need(a.bookAuthorName, 'author of the book');
      break;
    case 'Movie':
      need(a.datecreated, 'release date of the movie');
      need(a.directorname, 'director of the movie');
      break;
    case 'Course':
      need(a.provider, 'provider of the course');
      break;
    case 'SoftwareApplication':
      need(a.appCategory, 'application category');
      need(a.operatingSystem, 'operating system');
      need(a.offerPrice, 'offer price');
      need(a.offerCurrency, 'offer currency');
      break;
  }
  if (!plain(a.rTitle)) out.push('review title');
  if (a.enableDescription === false || !plain(a.rContent)) out.push('review description');
  if (a.enableImage === false || !imageUrl) out.push('review image');
  if (empty(a.ctaLink) || a.ctaLink === '#') out.push('link');
  if (a.showAuthor === false || !plain(a.rAuthor)) out.push('review author');
  need(a.reviewPublisher, 'review publisher');
  need(a.datepublish, 'date of publishing');
  return out;
}

// ---- Markup ----------------------------------------------------------------------------------

function safeHref(value: unknown): string {
  return typeof value === 'string' && /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(value.trim())
    ? value.trim()
    : '';
}

function View({ attrs: a, id, text, root, editing }: ViewProps) {
  const limit = Math.max(1, Math.min(10, Math.round(numeric(a.starCount) ?? 5)));
  const list = parts(a);
  const avg = average(a);
  const imageUrl = mediaUrl(a.mainimage);
  const mask = `pr-review-${id.replace(/[^\w-]/g, '')}`;
  const href = safeHref(a.ctaLink);
  const title = text('rTitle', {
    tagName: safeTag(a.headingTag, 'h3'),
    className: 'pr-review__title',
    placeholder: 'Title of the review',
  });
  const width = numeric(a.imgTagWidth);
  const height = numeric(a.imgTagHeight);
  const notes = editing && a.enableSchema !== false ? missing(a, imageUrl) : [];
  return root(
    'div',
    {
      className: [
        'wp-block-prisma-review',
        'pr-review',
        blockClass(id),
        list.length > 1 ? 'pr-review--multi' : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
    <>
      {a.enableSchema !== false && !editing && (
        <script
          type="application/ld+json"
          // `<` is escaped so that no text can close the script.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(reviewSchema(a, imageUrl)).replace(/</g, '\\u003c'),
          }}
        />
      )}
      {notes.length > 0 && (
        <div className="pr-review__notice">
          <strong>The structured data of this review misses:</strong> {notes.join(', ')}. This note
          shows only in the editor.
        </div>
      )}
      <div className="pr-review__block">
        {editing ? (
          <div className="pr-review__link">{title}</div>
        ) : (
          <a
            href={href || '#'}
            className="pr-review__link"
            {...(a.ctaTarget ? { target: '_blank' } : {})}
            rel="noopener noreferrer"
          >
            {title}
          </a>
        )}
        {a.enableDescription !== false &&
          text('rContent', {
            tagName: 'p',
            className: 'pr-review__desc',
            placeholder: 'Review description',
          })}
        {a.showAuthor !== false &&
          text('rAuthor', {
            tagName: 'p',
            className: 'pr-review__author',
            placeholder: 'Review author',
          })}
        {a.enableImage !== false && (
          <div className="pr-review__image">
            {imageUrl && (
              <img
                src={imageUrl}
                alt={String((a.mainimage as { alt?: unknown } | undefined)?.alt ?? '')}
                {...(width ? { width } : {})}
                {...(height ? { height } : {})}
                loading="lazy"
                decoding="async"
              />
            )}
          </div>
        )}
        {a.showFeature !== false &&
          list.map((part, i) => (
            <div key={i} className="pr-review__entry">
              <div className="pr-review__entry-label">{plain(part.label)}</div>
              <div className="pr-review__entry-stars">
                <Stars
                  value={numeric(part.value) ?? 0}
                  limit={limit}
                  maskId={`${mask}-${i}`}
                  a={a}
                />
              </div>
            </div>
          ))}
        <div className="pr-review__summary">
          {text('summaryTitle', {
            tagName: 'p',
            className: 'pr-review__summary-title',
            placeholder: 'Title of the summary',
          })}
          <div className="pr-review__overall">
            {text('summaryDescription', {
              tagName: 'p',
              className: 'pr-review__summary-desc',
              placeholder: 'Summary of the review',
            })}
            <div className="pr-review__average">
              <span className="pr-review__rating">{Math.round(avg * 10) / 10}</span>
              <Stars
                value={avg}
                limit={limit}
                maskId={`${mask}-average`}
                className="pr-review__average-stars"
                a={a}
              />
            </div>
          </div>
        </div>
      </div>
    </>,
  );
}

// ---- Import ----------------------------------------------------------------------------------

/** Whether the saved HTML has an element with a class (even an empty one). */
const hasClass = (html: string, className: string) =>
  new RegExp(`class="(?:[^"]*\\s)?${className}(?:\\s[^"]*)?"`).test(html);

export const review: PrismaBlock = {
  name: 'review',
  title: 'Review',
  description:
    'A review of a product or item: ratings by feature, a summary with the average and structured data for search engines.',
  keywords: ['review', 'rating', 'ratings', 'schema', 'stars'],
  richAttributes: ['rTitle', 'rContent', 'rAuthor', 'summaryTitle', 'summaryDescription'],
  defaults: DEFAULTS,
  css,
  View,
  media: (a) => {
    const id = (a.mainimage as { id?: unknown } | undefined)?.id;
    return typeof id === 'string' ? [id] : [];
  },
  spectra: {
    'uagb/review': (a, src) => {
      const out: Attrs = { ...a };
      // The schema saved by the editor is made again from the attributes.
      delete out.schema;
      delete out.items;
      // Texts as saved; an element left empty stays empty.
      const texts: [string, string][] = [
        ['rTitle', 'uagb-rating-title'],
        ['rContent', 'uagb-rating-desc'],
        ['rAuthor', 'uagb-rating-author'],
        ['summaryTitle', 'uagb_review_summary_title'],
        ['summaryDescription', 'uagb_review_summary_desc'],
      ];
      for (const [name, className] of texts) {
        if (hasClass(src.html, className)) out[name] = src.innerAny(className);
      }
      // Feature names are kept as plain text.
      if (Array.isArray(out.parts)) {
        out.parts = (out.parts as Part[]).map((p) => ({
          label:
            typeof p.label === 'string'
              ? src
                  .rich(p.label)
                  .map((n) => ('children' in n ? n.children.map((c) => c.text).join('') : n.text))
                  .join('')
              : '',
          value: numeric(p.value) ?? 0,
        }));
      }
      // The image shown, at the size shown (the placeholder of the old plugin is left out).
      const img = /<img\b[^>]*\bclass="[^"]*\buagb-howto__source-image\b[^"]*"[^>]*>/i.exec(
        src.html,
      )?.[0];
      const shown = img ? (/\ssrc="([^"]*)"/i.exec(img)?.[1] ?? '') : '';
      const url = /ultimate-addons-for-gutenberg\//.test(shown) ? '' : shown;
      if (out.mainimage && typeof out.mainimage === 'object') {
        if (url) out.mainimage = { ...(out.mainimage as object), url };
      } else {
        out.mainimage = { url };
      }
      return [src.block('review', out)];
    },
  },
};
