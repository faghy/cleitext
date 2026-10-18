import { htmlToInline, inlineText, inlineToHtml, type CxdInline } from '@cleitext/blocks/inline';
import type { Sheet } from '@cleitext/design';
import { Fragment } from 'react';
import { mediaUrl } from '../../lib/background';
import { blockClass } from '../../lib/css';
import { DEVICES, emit, numeric, px, suffix, typography } from '../../lib/emit';
import { safeTag } from '../../lib/tags';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';

/** Typography attributes of a part (`head`, `price`, `title`…), with their defaults. */
function typographyDefaults(p: string, overrides: Attrs = {}): Attrs {
  const out: Attrs = {
    [`${p}FontFamily`]: 'Default',
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
  return { ...out, ...overrides };
}

// ---- Shared helpers ---------------------------------------------------------------------

/** Plain text of a rich text attribute: CXD inline nodes on the site, HTML in the editor. */
export function plainText(value: unknown): string {
  if (Array.isArray(value)) return inlineText(value as CxdInline[]).trim();
  if (typeof value === 'string') return inlineText(htmlToInline(value)).trim();
  if (typeof value === 'number') return String(value);
  return '';
}

/** Rich text kept as an HTML string (tools, materials), made safe for the page. */
const safeHtml = (value: unknown): string =>
  typeof value === 'string' ? inlineToHtml(htmlToInline(value)) : '';

/** The image of the chosen size when the media object lists its sizes, else the image. */
export function sizedUrl(media: unknown, size: unknown): string {
  const sizes = (media as { sizes?: Record<string, { url?: unknown }> } | null)?.sizes;
  const chosen = typeof size === 'string' && sizes ? sizes[size]?.url : undefined;
  return mediaUrl(chosen) || mediaUrl(media);
}

const mediaId = (media: unknown): string[] => {
  const id = (media as { id?: unknown } | null)?.id;
  return typeof id === 'string' ? [id] : [];
};

export function safeHref(value: unknown): string {
  return typeof value === 'string' && /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(value.trim())
    ? value.trim()
    : '';
}

/** A positive whole number for an `<img>` size, or undefined. */
const imgSize = (value: unknown): number | undefined => {
  const n = numeric(value);
  return n !== null && n > 0 ? Math.round(n) : undefined;
};

// ---- How-to -----------------------------------------------------------------------------

const DEFAULTS: Attrs = {
  headingTitle: [{ text: 'How to plant a tree' }],
  headingDesc: [
    {
      text: 'A short introduction to the task: what it is for and what you will have at the end.',
    },
  ],
  headingTag: 'h3',
  overallAlignment: 'left',
  headingAlign: 'left',
  descriptionAlign: 'left',
  mainimage: { url: '', title: '' },
  imgSize: 'thumbnail',
  imgTagWidth: 0,
  imgTagHeight: 0,
  showTotaltime: true,
  timeNeeded: [{ text: 'Total time needed:' }],
  time: '30',
  timeIn: ' Minutes',
  timeInMins: '',
  timeInHours: '',
  timeInDays: '',
  timeInMonths: '',
  timeInYears: '',
  showEstcost: true,
  estCost: [{ text: 'Total cost:' }],
  cost: [{ text: '65' }],
  currencyType: [{ text: ' USD' }],
  showTools: true,
  toolsTitle: [{ text: 'Required tools:' }],
  tools_count: 1,
  tools: [{ add_required_tools: '- A spade' }],
  showMaterials: true,
  materialTitle: [{ text: 'Things needed:' }],
  material_count: 1,
  materials: [{ add_required_materials: '- A young tree' }],
  stepsTitle: [{ text: 'Steps:' }],
  schema: '',
  headingColor: '',
  showEstcostcolor: '',
  showTotaltimecolor: '',
  subHeadingColor: '',
  headSpace: 15,
  separatorSpace: 15,
  timeSpace: 5,
  costSpace: 5,
  row_gap: 20,
  rowGapTablet: '',
  rowGapMobile: '',
  step_gap: '',
  ...typographyDefaults('head', { headFontWeight: '500' }),
  ...typographyDefaults('subHead'),
  ...typographyDefaults('price', { priceFontSize: 18, priceFontWeight: '500' }),
};

function css(a: Attrs, B: string, sheet: Sheet): void {
  const R = `${B}.pr-how-to`;
  for (const device of DEVICES) {
    const s = suffix(device);
    const gap = px(device === 'desktop' ? a.row_gap : a[`rowGap${s}`]);
    if (device === 'desktop') {
      emit(sheet, device, R, { 'text-align': a.overallAlignment });
      // Every paragraph (times, cost, the steps' descriptions) keeps the row gap below.
      emit(sheet, device, `${R} p`, { 'margin-bottom': gap });
      emit(sheet, device, `${B} .pr-how-to-step`, { 'margin-bottom': px(a.step_gap) });
      emit(sheet, device, `${B} .pr-how-to-step:last-child`, { 'margin-bottom': '0px' });
      emit(sheet, device, `${B} .pr-how-to__time .pr-how-to__time-value`, {
        'margin-left': px(a.timeSpace),
      });
      emit(sheet, device, `${B} .pr-how-to__cost .pr-how-to__cost-value`, {
        'margin-left': px(a.costSpace),
      });
      emit(sheet, device, `${B} .pr-how-to__title`, { color: a.headingColor });
      emit(
        sheet,
        device,
        `${B} .pr-how-to__desc, ${B} .pr-how-to__time p, ${B} .pr-how-to__cost p, ${B} .pr-how-to__tool, ${B} .pr-how-to__material`,
        { color: a.subHeadingColor },
      );
      emit(
        sheet,
        device,
        `${B} .pr-how-to__time-label, ${B} .pr-how-to__cost-label, ${B} .pr-how-to__tools-title, ${B} .pr-how-to__materials-title, ${B} .pr-how-to__steps-title`,
        { color: a.showTotaltimecolor },
      );
    }
    emit(sheet, device, `${R} .pr-how-to__desc, ${R} .pr-how-to__image`, {
      'margin-bottom': gap,
    });
    emit(sheet, device, `${R} .pr-how-to__time, ${R} .pr-how-to__cost`, {
      'margin-bottom': gap,
      ...(device === 'desktop' ? { 'justify-content': a.overallAlignment } : {}),
    });
    emit(sheet, device, `${B} .pr-how-to__steps-title`, {
      'margin-top': gap,
      'margin-bottom': gap,
    });
    emit(sheet, device, `${B} .pr-how-to__materials-title`, { 'margin-top': gap });
    emit(sheet, device, `${B} p`, typography(a, 'subHead', device));
    emit(sheet, device, `${B} h4`, typography(a, 'price', device));
    emit(sheet, device, `${B} .pr-how-to__title`, typography(a, 'head', device));
    emit(
      sheet,
      device,
      `${B} .pr-how-to__tool, ${B} .pr-how-to__material`,
      typography(a, 'subHead', device),
    );
  }
}

/** A time part shown: a number above zero. */
const amount = (value: unknown): number | null => {
  const n = numeric(value);
  return n !== null && n > 0 ? n : null;
};

/** Years, months, days, hours and minutes of the total time, as shown. */
export function timeParts(a: Attrs): { value: number | string; unit: string }[] {
  const parts: { value: number | string; unit: string }[] = [];
  const units: [string, string, string][] = [
    ['timeInYears', 'Year', 'Years'],
    ['timeInMonths', 'Month', 'Months'],
    ['timeInDays', 'Day', 'Days'],
    ['timeInHours', 'Hour', 'Hours'],
  ];
  let larger = false;
  for (const [key, one, many] of units) {
    const n = amount(a[key]);
    if (n === null) continue;
    larger = true;
    parts.push({ value: n, unit: n > 1 ? many : one });
  }
  // Without its own minutes, the older single value counts, unless larger units are set.
  const minutes = amount(a.timeInMins) ?? (larger ? null : amount(a.time));
  if (minutes !== null) parts.push({ value: minutes, unit: minutes > 1 ? 'Minutes' : 'Minute' });
  return parts;
}

/** One step of the schema. */
export interface SchemaStep {
  url?: string;
  name?: string;
  text?: string;
  image?: string;
}

/** A step's schema from its attributes (rich texts as HTML or inline nodes). */
export function stepSchema(a: Attrs): SchemaStep {
  const step: SchemaStep = {};
  const url = safeHref(a.url);
  const name = plainText(a.name);
  const text = plainText(a.description);
  const image = mediaUrl(a.image);
  if (url && url !== '#') step.url = url;
  if (name) step.name = name;
  if (text) step.text = text;
  if (image) step.image = image;
  return step;
}

/** The steps kept in the `schema` attribute (written by the editor, or by the imported page). */
function savedSteps(schema: unknown): SchemaStep[] {
  if (typeof schema !== 'string' || !schema.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(schema);
  } catch {
    return [];
  }
  const steps = (parsed as { step?: unknown } | null)?.step;
  if (!Array.isArray(steps)) return [];
  return steps
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
    .map((s) => stepSchema({ url: s.url, name: s.name, description: s.text, image: s.image }));
}

/**
 * The page's HowTo structured data (schema.org): the block's own fields from
 * its attributes, the steps from `steps` (the editor's) or else from the
 * saved `schema`.
 */
export function howToSchema(a: Attrs, steps?: SchemaStep[]): Record<string, unknown> {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: plainText(a.headingTitle),
  };
  const description = plainText(a.headingDesc);
  if (description) data.description = description;
  const image = mediaUrl(a.mainimage);
  if (image) data.image = { '@type': 'ImageObject', url: image };
  if (a.showTotaltime) {
    const n = (key: string) => amount(a[key]) ?? 0;
    const larger = ['timeInYears', 'timeInMonths', 'timeInDays', 'timeInHours'].some(
      (k) => amount(a[k]) !== null,
    );
    const minutes = amount(a.timeInMins) ?? (larger ? 0 : (amount(a.time) ?? 0));
    data.totalTime = `P${n('timeInYears')}Y${n('timeInMonths')}M${n('timeInDays')}DT${n('timeInHours')}H${minutes}M`;
  }
  if (a.showEstcost) {
    const value = plainText(a.cost);
    if (value)
      data.estimatedCost = {
        '@type': 'MonetaryAmount',
        currency: plainText(a.currencyType),
        value,
      };
  }
  const list = (items: unknown, key: string, type: string) =>
    (Array.isArray(items) ? items : [])
      .map((item) => plainText((item as Record<string, unknown> | null)?.[key]))
      .filter(Boolean)
      .map((name) => ({ '@type': type, name }));
  if (a.showTools) data.tool = list(a.tools, 'add_required_tools', 'HowToTool');
  if (a.showMaterials) data.supply = list(a.materials, 'add_required_materials', 'HowToSupply');
  data.step = (steps ?? savedSteps(a.schema)).map((s) => ({ '@type': 'HowToStep', ...s }));
  return data;
}

/** JSON for a `<script>`: nothing in it can close the element. */
export const scriptJson = (data: unknown): string =>
  JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

function View({ attrs: a, id, text, root, editing }: ViewProps) {
  const image = sizedUrl(a.mainimage, a.imgSize);
  const media = (a.mainimage ?? {}) as { title?: unknown; alt?: unknown };
  const items = (list: unknown, key: string, className: string) =>
    (Array.isArray(list) ? list : []).map((item, i) => (
      <div
        key={i}
        className={className}
        dangerouslySetInnerHTML={{
          __html: safeHtml((item as Record<string, unknown> | null)?.[key]),
        }}
      />
    ));
  const time = timeParts(a);
  return root(
    'div',
    { className: ['wp-block-prisma-how-to', 'pr-how-to', blockClass(id)].join(' ') },
    <>
      {!editing && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: scriptJson(howToSchema(a)) }}
        />
      )}
      {text('headingTitle', {
        tagName: safeTag(/^h[1-6]$/.test(String(a.headingTag)) ? a.headingTag : 'h3', 'h3'),
        className: 'pr-how-to__title',
        placeholder: 'How-to title',
      })}
      {text('headingDesc', {
        tagName: 'p',
        className: 'pr-how-to__desc',
        placeholder: 'Description',
      })}
      {image && (
        <img
          className="pr-how-to__image"
          src={image}
          alt={typeof media.alt === 'string' ? media.alt : ''}
          {...(typeof media.title === 'string' && media.title ? { title: media.title } : {})}
          width={imgSize(a.imgTagWidth)}
          height={imgSize(a.imgTagHeight)}
          loading="lazy"
          decoding="async"
        />
      )}
      {Boolean(a.showTotaltime) && (
        <span className="pr-how-to__time">
          {text('timeNeeded', {
            tagName: 'h4',
            className: 'pr-how-to__time-label',
            placeholder: 'Total time needed:',
          })}
          {time.map((part) => (
            <Fragment key={part.unit}>
              <p className="pr-how-to__time-value">{part.value}</p>
              <p className="pr-how-to__time-unit">{part.unit}</p>
            </Fragment>
          ))}
        </span>
      )}
      {Boolean(a.showEstcost) && (
        <span className="pr-how-to__cost">
          {text('estCost', {
            tagName: 'h4',
            className: 'pr-how-to__cost-label',
            placeholder: 'Total cost:',
          })}
          {text('cost', { tagName: 'p', className: 'pr-how-to__cost-value', placeholder: '0' })}
          {text('currencyType', {
            tagName: 'p',
            className: 'pr-how-to__currency',
            placeholder: 'USD',
          })}
        </span>
      )}
      {Boolean(a.showTools) && (
        <>
          {text('toolsTitle', {
            tagName: 'h4',
            className: 'pr-how-to__tools-title',
            placeholder: 'Required tools:',
          })}
          {items(a.tools, 'add_required_tools', 'pr-how-to__tool')}
        </>
      )}
      {Boolean(a.showMaterials) && (
        <>
          {text('materialTitle', {
            tagName: 'h4',
            className: 'pr-how-to__materials-title',
            placeholder: 'Things needed:',
          })}
          {items(a.materials, 'add_required_materials', 'pr-how-to__material')}
        </>
      )}
      {text('stepsTitle', {
        tagName: 'h4',
        className: 'pr-how-to__steps-title',
        placeholder: 'Steps:',
      })}
    </>,
    true,
  );
}

/** Rich text of a Spectra HTML list item (`<div class="… label …">`), every one in order. */
function listItems(html: string, className: string): string[] {
  const out: string[] = [];
  const pattern = new RegExp(
    `<div\\b[^>]*class="(?:[^"]*\\s)?${className}(?:\\s[^"]*)?"[^>]*>([\\s\\S]*?)</div>`,
    'gi',
  );
  for (const match of html.matchAll(pattern)) out.push(match[1]!.trim());
  return out;
}

export const howTo: PrismaBlock = {
  name: 'how-to',
  title: 'How-to',
  description:
    'Instructions in steps, with total time, cost, tools and materials, and HowTo structured data for search engines.',
  keywords: ['how to', 'how-to', 'steps', 'instructions', 'schema', 'guide'],
  container: true,
  allowedBlocks: ['prisma/how-to-step'],
  richAttributes: [
    'headingTitle',
    'headingDesc',
    'timeNeeded',
    'estCost',
    'cost',
    'currencyType',
    'toolsTitle',
    'materialTitle',
    'stepsTitle',
  ],
  defaults: DEFAULTS,
  css,
  View,
  media: (a) => mediaId(a.mainimage),
  spectra: {
    'uagb/how-to': (a, src) => {
      const texts: Attrs = {};
      const read = (name: string, html: string) => {
        if (html) texts[name] = html;
      };
      read('headingTitle', src.innerAny('uagb-howto-heading-text'));
      read('headingDesc', src.inner('p', 'uagb-howto-desc-text'));
      read('timeNeeded', src.inner('h4', 'uagb-howto-timeNeeded-text'));
      read('estCost', src.inner('h4', 'uagb-howto-estcost-text'));
      read('cost', src.inner('p', 'uagb-howto-estcost-value'));
      read('currencyType', src.inner('p', 'uagb-howto-estcost-type'));
      read('toolsTitle', src.inner('h4', 'uagb-howto-req-tools-text'));
      read('materialTitle', src.inner('h4', 'uagb-howto-req-materials-text'));
      read('stepsTitle', src.inner('h4', 'uagb-howto-req-steps-text'));
      // Values kept as plain attributes may still be numbers in older pages.
      for (const key of ['cost', 'currencyType'] as const) {
        if (!(key in texts) && (typeof a[key] === 'number' || typeof a[key] === 'string'))
          texts[key] = String(a[key]);
      }
      const tools = listItems(src.html, 'uagb-tools__label');
      if (tools.length) texts.tools = tools.map((t) => ({ add_required_tools: t }));
      const materials = listItems(src.html, 'uagb-materials__label');
      if (materials.length) texts.materials = materials.map((m) => ({ add_required_materials: m }));
      return [src.block('how-to', { ...a, ...texts }, src.children)];
    },
  },
};

// ---- Step -------------------------------------------------------------------------------

const STEP_DEFAULTS: Attrs = {
  name: [{ text: 'Step' }],
  description: [],
  url: '',
  urlType: 'all',
  urlText: 'Read more',
  urlTarget: false,
  image: { url: '', alt: '' },
  imageSize: 'thumbnail',
  imgPosition: 'above-title',
  imgTagWidth: 0,
  imgTagHeight: 0,
  titleColor: '',
  descriptionColor: '',
  urlColor: '',
  ...typographyDefaults('title'),
  ...typographyDefaults('description'),
  ...typographyDefaults('url'),
};

function stepCss(a: Attrs, B: string, sheet: Sheet): void {
  for (const device of DEVICES) {
    const color = (value: unknown) => (device === 'desktop' ? { color: value } : {});
    emit(sheet, device, `${B} .pr-how-to-step__link-text`, {
      ...color(a.urlColor),
      ...typography(a, 'url', device),
    });
    emit(sheet, device, `${B} .pr-how-to-step__name`, {
      ...color(a.titleColor),
      ...typography(a, 'title', device),
    });
    emit(sheet, device, `${B} .pr-how-to-step__desc`, {
      ...color(a.descriptionColor),
      ...typography(a, 'description', device),
    });
  }
}

const POSITIONS = new Set(['above-title', 'left-title', 'right-title']);

function StepView({ attrs: a, id, text, root, editing }: ViewProps) {
  const type = String(a.urlType);
  const href = safeHref(a.url);
  const target = a.urlTarget ? '_blank' : '_self';
  const image = sizedUrl(a.image, a.imageSize);
  const alt = (a.image as { alt?: unknown } | null)?.alt;
  const position = POSITIONS.has(String(a.imgPosition)) ? String(a.imgPosition) : 'above-title';
  const linkText = <span className="pr-how-to-step__link-text">{String(a.urlText ?? '')}</span>;
  const body = (
    <div className={`pr-how-to-step__body pr-how-to-step__body--${position}`}>
      {image && (
        <img
          className="pr-how-to-step__image"
          src={image}
          alt={typeof alt === 'string' ? alt : ''}
          width={imgSize(a.imgTagWidth)}
          height={imgSize(a.imgTagHeight)}
          loading="lazy"
          decoding="async"
        />
      )}
      <div className="pr-how-to-step__content">
        {text('name', { tagName: 'div', className: 'pr-how-to-step__name', placeholder: 'Step' })}
        {text('description', {
          tagName: 'p',
          className: 'pr-how-to-step__desc',
          placeholder: 'What to do in this step',
        })}
        {type === 'text' &&
          (href && !editing ? (
            <a
              href={href}
              target={target}
              className="pr-how-to-step__link"
              rel="noopener noreferrer"
            >
              {linkText}
            </a>
          ) : (
            linkText
          ))}
      </div>
    </div>
  );
  return root(
    'div',
    { className: ['wp-block-prisma-how-to-step', 'pr-how-to-step', blockClass(id)].join(' ') },
    <>
      {type === 'all' && href && !editing && (
        <a
          href={href}
          target={target}
          className="pr-how-to-step__link-all"
          rel="noopener noreferrer"
          aria-label={plainText(a.name) || 'Step'}
        />
      )}
      {body}
    </>,
  );
}

const decodeText = (html: string): string => inlineText(htmlToInline(html)).trim();

export const howToStep: PrismaBlock = {
  name: 'how-to-step',
  title: 'Step',
  description: 'One step of a how-to: a name, a description, an image and a link.',
  keywords: ['step', 'how to'],
  parent: ['how-to'],
  richAttributes: ['name', 'description'],
  defaults: STEP_DEFAULTS,
  css: stepCss,
  View: StepView,
  media: (a) => mediaId(a.image),
  spectra: {
    'uagb/how-to-step': (a, src) => {
      const texts: Attrs = {};
      const name = src.innerAny('uagb-how-to-step-name');
      const description = src.inner('p', 'uagb-how-to-step-description');
      const urlText = src.innerAny('uagb-step-link-text');
      // An empty element in the saved HTML is an empty text, not the default one.
      if (name || /class="[^"]*\buagb-how-to-step-name\b/.test(src.html)) texts.name = name;
      if (description || /class="[^"]*\buagb-how-to-step-description\b/.test(src.html))
        texts.description = description;
      if (urlText) texts.urlText = decodeText(urlText);
      return [src.block('how-to-step', { ...a, ...texts })];
    },
  },
};
