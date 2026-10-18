import type { Device, Sheet } from '@cleitext/design';
import type { CxdBlock } from '@cleitext/plugin-sdk';
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
import { safeTag } from '../../lib/tags';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';
import { sideDefaults, sidesCss, typographyDefaults } from '../heading';

/**
 * FAQ: questions and answers (`faq-item` children) as an accordion or a
 * grid, with the schema.org FAQPage data of the page. The icons, the
 * question tag and the layout are the parent's, copied onto each item by
 * the editor (and on import), since an item draws them.
 */

const DEFAULTS: Attrs = {
  layout: 'accordion',
  inactiveOtherItems: true,
  expandFirstItem: false,
  enableSchemaSupport: false,
  schema: '',
  enableToggle: true,
  equalHeight: true,
  headingTag: 'span',
  align: 'left',
  enableSeparator: false,
  rowsGap: 10,
  rowsGapTablet: '',
  rowsGapMobile: '',
  rowsGapUnit: 'px',
  columnsGap: 10,
  columnsGapTablet: '',
  columnsGapMobile: '',
  columnsGapUnit: 'px',
  columns: 2,
  tcolumns: 2,
  mcolumns: 1,
  boxBgType: 'color',
  boxBgHoverType: 'color',
  boxBgColor: '',
  boxBgHoverColor: '',
  boxPaddingTypeMobile: 'px',
  boxPaddingTypeTablet: 'px',
  boxPaddingTypeDesktop: 'px',
  vBoxPaddingMobile: 10,
  hBoxPaddingMobile: 10,
  vBoxPaddingTablet: 10,
  hBoxPaddingTablet: 10,
  vBoxPaddingDesktop: 10,
  hBoxPaddingDesktop: 10,
  questionTextColor: '',
  questionTextActiveColor: '',
  questionTextBgColor: '',
  questionTextActiveBgColor: '',
  questionPaddingTypeDesktop: 'px',
  questionPaddingTypeTablet: 'px',
  questionPaddingTypeMobile: 'px',
  vquestionPaddingMobile: 10,
  vquestionPaddingTablet: 10,
  vquestionPaddingDesktop: 10,
  hquestionPaddingMobile: 10,
  hquestionPaddingTablet: 10,
  hquestionPaddingDesktop: 10,
  questionLeftPaddingTablet: 10,
  questionBottomPaddingTablet: 10,
  questionLeftPaddingDesktop: 10,
  questionBottomPaddingDesktop: 10,
  questionLeftPaddingMobile: 10,
  questionBottomPaddingMobile: 10,
  questionSpacingLink: '',
  answerTextColor: '',
  answerPaddingTypeDesktop: 'px',
  answerPaddingTypeTablet: 'px',
  answerPaddingTypeMobile: 'px',
  vanswerPaddingMobile: 10,
  vanswerPaddingTablet: 10,
  vanswerPaddingDesktop: 10,
  hanswerPaddingMobile: 10,
  hanswerPaddingTablet: 10,
  hanswerPaddingDesktop: 10,
  answerSpacingLink: '',
  ...Object.fromEntries(
    ['Top', 'Right', 'Bottom', 'Left'].flatMap((side) =>
      ['', 'Tablet', 'Mobile'].map((s) => [`answer${side}Padding${s}`, 10]),
    ),
  ),
  iconColor: '',
  iconActiveColor: '',
  gapBtwIconQUestion: 10,
  gapBtwIconQUestionTablet: 10,
  gapBtwIconQUestionMobile: 10,
  ...typographyDefaults('question'),
  questionFontSizeTypeTablet: '',
  questionFontSizeTypeMobile: '',
  ...typographyDefaults('answer'),
  answerFontSizeTypeTablet: '',
  answerFontSizeTypeMobile: '',
  icon: 'plus',
  iconActive: 'minus',
  iconAlign: 'row',
  iconSize: 12,
  iconSizeTablet: '',
  iconSizeMobile: '',
  iconSizeType: 'px',
  iconBgSize: '',
  iconBgSizeTablet: '',
  iconBgSizeMobile: '',
  iconBgSizeType: 'px',
  iconBgColor: '',
  borderStyle: 'solid',
  borderWidth: 1,
  borderRadius: 2,
  borderColor: '#1e1e1e',
  borderHoverColor: '',
  ...borderDefaults('overall'),
  ...borderDefaults('icon'),
  ...sideDefaults('block', 'Padding'),
  ...sideDefaults('block', 'Margin'),
};

/** The box border, the older single values filling what it leaves unset (desktop). */
function boxBorder(a: Attrs, device: Device): Declarations {
  const current = border(a, 'overall', device);
  if (device !== 'desktop' || !('border-style' in current)) return current;
  const width = numeric(a.borderWidth) !== null ? px(a.borderWidth) : '';
  const radius = numeric(a.borderRadius) !== null ? px(a.borderRadius) : '';
  const filled = (key: string, fallback: string) =>
    current[key] || current[key] === 0 ? current[key] : fallback;
  return {
    'border-top-width': filled('border-top-width', width),
    'border-left-width': filled('border-left-width', width),
    'border-right-width': filled('border-right-width', width),
    'border-bottom-width': filled('border-bottom-width', width),
    'border-top-left-radius': filled('border-top-left-radius', radius),
    'border-top-right-radius': filled('border-top-right-radius', radius),
    'border-bottom-left-radius': filled('border-bottom-left-radius', radius),
    'border-bottom-right-radius': filled('border-bottom-right-radius', radius),
    'border-color': current['border-color'] || a.borderColor,
    'border-style': current['border-style'] || a.borderStyle,
  };
}

/** The question's padding: the older vertical/horizontal values replace an untouched 10. */
function questionPadding(a: Attrs, device: Device): Declarations {
  const D = device === 'desktop' ? 'Desktop' : device === 'tablet' ? 'Tablet' : 'Mobile';
  const v = a[`vquestionPadding${D}`];
  const h = a[`hquestionPadding${D}`];
  const bottom =
    a[`questionBottomPadding${D}`] === 10 && v !== 10 ? v : a[`questionBottomPadding${D}`];
  const left = a[`questionLeftPadding${D}`] === 10 && h !== 10 ? h : a[`questionLeftPadding${D}`];
  const unit = a[`questionPaddingType${D}`];
  return {
    'padding-top': px(v, unit),
    'padding-bottom': px(bottom, unit),
    'padding-right': px(h, unit),
    'padding-left': px(left, unit),
  };
}

function answerPadding(a: Attrs, device: Device): Declarations {
  const s = suffix(device);
  const D = device === 'desktop' ? 'Desktop' : device === 'tablet' ? 'Tablet' : 'Mobile';
  const unit = a[`answerPaddingType${D}`];
  const v = a[`vanswerPadding${D}`];
  const h = a[`hanswerPadding${D}`];
  const side = (name: string, fallback: unknown) => {
    const value = a[`answer${name}Padding${s}`];
    return px(value === undefined || value === null ? fallback : value, unit);
  };
  return {
    'padding-top': side('Top', v),
    'padding-bottom': side('Bottom', v),
    'padding-right': side('Right', h),
    'padding-left': side('Left', h),
  };
}

function css(a: Attrs, B: string, sheet: Sheet): void {
  const R = `${B}.pr-faq`;
  const accordion = a.layout !== 'grid';
  const iconColor = a.iconColor || a.questionTextColor;
  const activeColor = a.iconActiveColor || a.questionTextActiveColor;
  for (const device of DEVICES) {
    const s = suffix(device);
    const desktop = device === 'desktop';
    const iconSize = px(a[`iconSize${s}`], a.iconSizeType);
    emit(sheet, device, `${B} .pr-faq-item__icon svg`, {
      width: iconSize,
      height: iconSize,
      'font-size': iconSize,
      ...(desktop ? { fill: iconColor } : {}),
    });
    emit(sheet, device, `${B} .pr-faq-item__icon-active svg`, {
      width: iconSize,
      height: iconSize,
      'font-size': iconSize,
      ...(desktop ? { fill: activeColor } : {}),
    });
    emit(sheet, device, `${B} .pr-faq-item`, {
      'margin-bottom': px(a[`rowsGap${s}`], a.rowsGapUnit),
      ...(desktop
        ? { 'background-color': a.boxBgType === 'color' ? a.boxBgColor : 'transparent' }
        : {}),
      ...boxBorder(a, device),
    });
    emit(sheet, device, `${B} .pr-faq-item__question`, {
      ...questionPadding(a, device),
      ...(desktop ? { 'background-color': a.questionTextBgColor } : {}),
    });
    emit(sheet, device, `${B} .pr-faq-item__content`, answerPadding(a, device));
    const gap = px(a[`gapBtwIconQUestion${s}`]);
    emit(sheet, device, `${R}.pr-faq--icon-row .pr-faq-item .pr-faq-item__icon-wrap`, {
      'margin-right': gap,
    });
    emit(sheet, device, `${R}.pr-faq--icon-row-reverse .pr-faq-item .pr-faq-item__icon-wrap`, {
      'margin-left': gap,
    });
    emit(sheet, device, `${R} .pr-faq-item .pr-faq-item__icon-wrap`, {
      padding: px(a[`iconBgSize${s}`], a.iconBgSizeType),
      ...(desktop ? { 'background-color': a.iconBgColor } : {}),
      ...border(a, 'icon', device),
    });
    emit(sheet, device, R, {
      ...sidesCss(a, 'block', 'Padding', device),
      ...sidesCss(a, 'block', 'Margin', device),
    });
    emit(
      sheet,
      device,
      `${B} .pr-faq-item__question .pr-faq-item__text`,
      typography(a, 'question', device),
    );
    emit(sheet, device, `${B} .pr-faq-item .pr-faq-item__content`, typography(a, 'answer', device));
    if (a.enableSeparator) {
      emit(sheet, device, `${B} .pr-faq-item .pr-faq-item__content`, {
        'border-style': 'solid',
        'border-top-color': a.overallBorderColor,
        'border-top-width': px(a[`overallBorderTopWidth${s}`]),
        'border-right-width': '0px',
        'border-bottom-width': '0px',
        'border-left-width': '0px',
      });
    }
    if (!accordion) {
      const columns = numeric(
        a[device === 'desktop' ? 'columns' : device === 'tablet' ? 'tcolumns' : 'mcolumns'],
      );
      emit(sheet, device, `${R}.pr-faq--layout-grid`, {
        'grid-template-columns': columns !== null ? `repeat(${columns}, 1fr)` : '',
        'grid-column-gap': px(a[`columnsGap${s}`], a.columnsGapUnit),
        'grid-row-gap': px(a[`rowsGap${s}`], a.rowsGapUnit),
        ...(desktop ? { display: 'grid' } : {}),
      });
    }
  }
  emit(sheet, 'desktop', `${B} .pr-faq-item:hover`, {
    'background-color': a.boxBgHoverType === 'color' ? a.boxBgHoverColor : 'transparent',
    'border-color': a.overallBorderHColor || a.borderHoverColor,
  });
  emit(sheet, 'desktop', `${B} .pr-faq-item .pr-faq-item__text`, { color: a.questionTextColor });
  emit(
    sheet,
    'desktop',
    `${B} .pr-faq-item.pr-faq-item--active .pr-faq-item__text, ${B} .pr-faq-item:hover .pr-faq-item__text`,
    { color: a.questionTextActiveColor },
  );
  emit(
    sheet,
    'desktop',
    `${B} .pr-faq-item.pr-faq-item--active .pr-faq-item__question, ${B} .pr-faq-item:hover .pr-faq-item__question`,
    { 'background-color': a.questionTextActiveBgColor },
  );
  emit(sheet, 'desktop', `${R} .pr-faq-item .pr-faq-item__icon-wrap:hover`, {
    'border-color': a.iconBorderHColor,
  });
  emit(sheet, 'desktop', `${B} .pr-faq-item:hover .pr-faq-item__icon svg`, { fill: activeColor });
  emit(sheet, 'desktop', `${B} .pr-faq-item .pr-faq-item__question`, {
    'flex-direction': a.iconAlign,
  });
  emit(sheet, 'desktop', `${B} .pr-faq-item .pr-faq-item__content`, { color: a.answerTextColor });
  if (accordion && a.inactiveOtherItems) {
    // Answers start closed (the editor keeps them open to edit them).
    emit(sheet, 'desktop', `${R}:not(.pr-faq--editing) .pr-faq-item .pr-faq-item__content`, {
      display: 'none',
    });
  }
  if (accordion && a.expandFirstItem) {
    emit(sheet, 'desktop', `${R} > .pr-faq-item:first-of-type .pr-faq-item__content`, {
      display: 'block',
    });
  }
  if (a.enableSeparator) {
    emit(sheet, 'desktop', `${B} .pr-faq-item .pr-faq-item__content:hover`, {
      'border-top-color': a.overallBorderHColor || a.borderHoverColor,
    });
  }
  if (!accordion) {
    emit(sheet, 'desktop', `${R}.pr-faq--layout-grid .pr-faq-item`, { 'text-align': a.align });
  }
}

/**
 * The page's FAQPage data, given as JSON (built from the items by the
 * editor and on import), written so that it cannot close its script element.
 */
export function schemaJson(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const data: unknown = JSON.parse(value);
    if (!data || typeof data !== 'object') return '';
    return JSON.stringify(data)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
  } catch {
    return '';
  }
}

/** Plain text of a rich text value: HTML (editor) or CXD inline nodes (stored). */
export function plainText(value: unknown): string {
  if (Array.isArray(value))
    return value
      .map((n: { text?: unknown; children?: { text?: unknown }[] }) =>
        Array.isArray(n.children)
          ? n.children.map((c) => String(c.text ?? '')).join('')
          : String(n.text ?? ''),
      )
      .join('')
      .trim();
  if (typeof value !== 'string') return '';
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/** The FAQPage data of questions and answers, as JSON ('' without any). */
export function buildSchema(items: { question: unknown; answer: unknown }[]): string {
  const mainEntity = items
    .map((item) => ({ name: plainText(item.question), text: plainText(item.answer) }))
    .filter((q) => q.name)
    .map((q) => ({
      '@type': 'Question',
      name: q.name,
      acceptedAnswer: { '@type': 'Answer', text: q.text },
    }));
  return mainEntity.length
    ? JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity })
    : '';
}

function View({ attrs: a, id, root, editing }: ViewProps) {
  const layout = a.layout === 'grid' ? 'grid' : 'accordion';
  const json = a.enableSchemaSupport && !editing ? schemaJson(a.schema) : '';
  return root(
    'div',
    {
      className: [
        'wp-block-prisma-faq',
        'pr-faq',
        blockClass(id),
        `pr-faq--icon-${a.iconAlign === 'row-reverse' ? 'row-reverse' : 'row'}`,
        `pr-faq--layout-${layout}`,
        `pr-faq--expand-first-${a.expandFirstItem ? 'true' : 'false'}`,
        `pr-faq--inactive-other-${a.inactiveOtherItems ? 'true' : 'false'}`,
        a.enableToggle !== false ? 'pr-faq--toggle' : '',
        a.equalHeight ? 'pr-faq--equal-height' : '',
        editing ? 'pr-faq--editing' : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
    json ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} /> : null,
    true,
  );
}

/** What the parent decides for every item. */
const SHARED = ['icon', 'iconActive', 'headingTag', 'layout'] as const;

export const faq: PrismaBlock = {
  name: 'faq',
  title: 'FAQ',
  description:
    'Questions and answers as an accordion or a grid, with FAQ schema for search engines.',
  keywords: ['faq', 'accordion', 'questions', 'schema', 'toggle'],
  container: true,
  allowedBlocks: ['prisma/faq-item'],
  defaults: DEFAULTS,
  css,
  View,
  script: { file: 'faq.js', marker: 'data-pr-faq' },
  spectra: {
    'uagb/faq': (a, src) => {
      const shared: Attrs = {
        icon: a.icon ?? 'plus',
        iconActive: a.iconActive ?? 'minus',
        headingTag: a.headingTag ?? 'span',
        layout: a.layout ?? 'accordion',
      };
      const children: CxdBlock[] = src.children.map((child) =>
        child.type === 'prisma/faq-item'
          ? { ...child, attrs: { ...child.attrs, ...shared } }
          : child,
      );
      const items = children
        .filter((c) => c.type === 'prisma/faq-item')
        .map((c) => ({
          question: c.attrs?.question ?? ITEM_DEFAULTS.question,
          answer: c.attrs?.answer ?? ITEM_DEFAULTS.answer,
        }));
      // Spectra spells these two with a lower-case "load".
      const { questionloadGoogleFonts, answerloadGoogleFonts, ...rest } = a;
      const fonts: Attrs = {};
      if (questionloadGoogleFonts !== undefined)
        fonts.questionLoadGoogleFonts = questionloadGoogleFonts;
      if (answerloadGoogleFonts !== undefined) fonts.answerLoadGoogleFonts = answerloadGoogleFonts;
      return [src.block('faq', { ...rest, ...fonts, schema: buildSchema(items) }, children)];
    },
  },
};

// ---- FAQ item ----------------------------------------------------------------------------------

const ITEM_DEFAULTS: Attrs = {
  question: [{ text: 'What is FAQ?' }],
  answer: [
    {
      text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    },
  ],
  icon: 'plus',
  iconActive: 'minus',
  layout: 'accordion',
  headingTag: 'span',
};

const QUESTION_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'p'];

function ItemView({ attrs: a, id, root, text, editing }: ViewProps) {
  const accordion = a.layout !== 'grid';
  const tag = QUESTION_TAGS.includes(String(a.headingTag)) ? safeTag(a.headingTag, 'span') : 'span';
  const interactive = accordion && !editing;
  return root(
    'div',
    { className: `wp-block-prisma-faq-item pr-faq-item ${blockClass(id)}` },
    <>
      <div
        className="pr-faq-item__question"
        {...(interactive
          ? { role: 'button', tabIndex: 0, 'aria-expanded': false, 'data-pr-faq': '' }
          : {})}
      >
        {accordion && (
          <>
            <span className="pr-faq-item__icon pr-faq-item__icon-wrap">
              <Icon name={a.icon} />
            </span>
            <span className="pr-faq-item__icon-active pr-faq-item__icon-wrap">
              <Icon name={a.iconActive} />
            </span>
          </>
        )}
        {text('question', {
          tagName: tag,
          className: 'pr-faq-item__text',
          placeholder: 'Question',
        })}
      </div>
      <div className="pr-faq-item__content">
        {text('answer', { tagName: 'p', placeholder: 'Answer' })}
      </div>
    </>,
  );
}

export const faqItem: PrismaBlock = {
  name: 'faq-item',
  title: 'FAQ Item',
  description: 'A question and its answer.',
  keywords: ['faq', 'question', 'answer'],
  parent: ['faq'],
  richAttributes: ['question', 'answer'],
  defaults: ITEM_DEFAULTS,
  css: () => {},
  View: ItemView,
  spectra: {
    'uagb/faq-child': (a, src) => {
      // Older saved markup keeps the texts in the HTML; newer content keeps them in the attributes.
      const question =
        typeof a.question === 'string' ? a.question : src.innerAny('uagb-question') || undefined;
      const answerHtml = src.innerAny('uagb-faq-content');
      const answer =
        typeof a.answer === 'string'
          ? a.answer
          : answerHtml
            ? answerHtml.replace(/^\s*(?:<span>)?\s*<p>([\s\S]*)<\/p>\s*(?:<\/span>)?\s*$/i, '$1')
            : undefined;
      const attrs: Attrs = { ...a };
      if (question !== undefined) attrs.question = question;
      else delete attrs.question;
      if (answer !== undefined) attrs.answer = answer;
      else delete attrs.answer;
      return [src.block('faq-item', attrs)];
    },
  },
};

export { SHARED as FAQ_SHARED };
