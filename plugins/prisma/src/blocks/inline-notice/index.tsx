import type { CxdBlock } from '@cleitext/plugin-sdk';
import type { Sheet } from '@cleitext/design';
import { blockClass } from '../../lib/css';
import { DEVICES, emit, numeric, px, suffix, typography } from '../../lib/emit';
import { Icon } from '../../lib/icons';
import { safeTag } from '../../lib/tags';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';
import { typographyDefaults } from '../heading';

function paddingDefaults(p: 'title' | 'content'): Attrs {
  const out: Attrs = {};
  for (const s of ['', 'Tablet', 'Mobile'])
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) out[`${p}${side}Padding${s}`] = '';
  return out;
}

const DEFAULTS: Attrs = {
  noticeTitle: [{ text: 'Notice Title' }],
  headingTag: 'h4',
  c_id: null,
  cookies: false,
  close_cookie_days: 1,
  noticeDismiss: '',
  noticeAlignment: 'left',
  layout: 'modern',
  icon: 'rectangle-xmark',
  iconSize: 16,
  iconSizeTab: '',
  iconSizeMob: '',
  iconSizeUnit: 'px',
  textColor: '',
  titleColor: '',
  noticeColor: '#FFD54F',
  contentBgColor: '',
  noticeDismissColor: '',
  highlightWidth: 10,
  highlightWidthTablet: 10,
  highlightWidthMobile: 10,
  ...typographyDefaults('title'),
  ...typographyDefaults('desc'),
  titleFontStyle: '',
  descFontStyle: '',
  titleLineHeightType: '',
  descLineHeightType: '',
  titleLoadGoogleFonts: '',
  descLoadGoogleFonts: '',
  titleHrPadding: 15,
  titleVrPadding: 15,
  contentHrPadding: 15,
  contentVrPadding: 15,
  ...paddingDefaults('title'),
  ...paddingDefaults('content'),
  titlePaddingUnit: 'px',
  tabletTitlePaddingUnit: 'px',
  mobileTitlePaddingUnit: 'px',
  titlePaddingLink: false,
  contentPaddingUnit: 'px',
  tabletContentPaddingUnit: 'px',
  mobileContentPaddingUnit: 'px',
  contentPaddingLink: false,
};

/** Paddings of a part on a device: its own value, else the shared vertical/horizontal one. */
function padding(a: Attrs, p: 'title' | 'content', s: string, unit: unknown) {
  const pick = (side: string, shared: unknown) => {
    const own = a[`${p}${side}Padding${s}`];
    return numeric(own) !== null ? own : shared;
  };
  return {
    'padding-left': px(pick('Left', a[`${p}HrPadding`]), unit),
    'padding-right': px(pick('Right', a[`${p}HrPadding`]), unit),
    'padding-top': px(pick('Top', a[`${p}VrPadding`]), unit),
    'padding-bottom': px(pick('Bottom', a[`${p}VrPadding`]), unit),
  };
}

const UNIT = { desktop: '', tablet: 'tablet', mobile: 'mobile' } as const;

function css(a: Attrs, B: string, sheet: Sheet): void {
  const modern = a.layout === 'modern';
  const simple = a.layout === 'simple';
  const iconSize = { desktop: a.iconSize, tablet: a.iconSizeTab, mobile: a.iconSizeMob };
  for (const device of DEVICES) {
    const s = suffix(device);
    const u = UNIT[device];
    const titleUnit = u ? a[`${u}TitlePaddingUnit`] : a.titlePaddingUnit;
    const contentUnit = u ? a[`${u}ContentPaddingUnit`] : a.contentPaddingUnit;
    const border = simple
      ? `${px(a[`highlightWidth${s}`])} solid ${String(a.noticeColor ?? '')}`
      : '';
    emit(sheet, device, `${B} .pr-inline-notice__title`, {
      ...padding(a, 'title', s, titleUnit),
      ...(device === 'desktop'
        ? {
            color: a.titleColor,
            ...(modern
              ? {
                  'background-color': a.noticeColor,
                  'border-top-right-radius': '3px',
                  'border-top-left-radius': '3px',
                }
              : {}),
            ...(simple ? { 'background-color': a.contentBgColor } : {}),
          }
        : {}),
      ...(simple ? { 'border-left': border } : {}),
      ...typography(a, 'title', device),
    });
    emit(sheet, device, `${B} .pr-inline-notice__text`, {
      ...(device !== 'tablet' ? { color: a.textColor } : {}),
      ...padding(a, 'content', s, contentUnit),
      ...(device === 'desktop' && modern
        ? {
            'background-color': a.contentBgColor,
            border: `2px solid ${String(a.noticeColor ?? '')}`,
            'border-bottom-left-radius': '3px',
            'border-bottom-right-radius': '3px',
          }
        : {}),
      ...(device === 'desktop' && simple ? { 'background-color': a.contentBgColor } : {}),
      ...(simple ? { 'border-left': border } : {}),
      ...typography(a, 'desc', device),
    });
    const size = px(iconSize[device], a.iconSizeUnit);
    emit(sheet, device, `${B} .pr-inline-notice__close svg`, {
      ...(device === 'desktop' ? { fill: a.noticeDismissColor, color: a.noticeDismissColor } : {}),
      width: size,
      height: size,
    });
  }
}

/** Whether the visitor can close the notice. */
const dismissible = (a: Attrs) => Boolean(a.noticeDismiss) && Boolean(a.icon);

function View({ attrs: a, id, text, inner, root, editing }: ViewProps) {
  const align = String(a.noticeAlignment ?? 'left').replace(/\W/g, '');
  const closable = dismissible(a);
  // A remembered notice waits hidden until the script knows it was not closed.
  const remembered = closable && a.cookies === true;
  const storeId = String(a.c_id ?? '') || id;
  return root(
    'div',
    {
      className: [
        'wp-block-prisma-inline-notice',
        'pr-inline-notice',
        blockClass(id),
        `pr-inline-notice--align-${align}`,
        closable ? 'pr-inline-notice--dismissible' : '',
        remembered && !editing ? 'pr-inline-notice--hidden' : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
    <>
      {closable && (
        <button
          className="pr-inline-notice__close"
          type="button"
          aria-label="Close"
          {...(editing
            ? {}
            : {
                'data-pr-inline-notice': JSON.stringify(
                  remembered
                    ? {
                        id: storeId.replace(/[^\w-]/g, ''),
                        days: numeric(a.close_cookie_days) ?? 1,
                      }
                    : {},
                ),
              })}
        >
          <Icon name={a.icon} />
        </button>
      )}
      {text('noticeTitle', {
        tagName: safeTag(a.headingTag, 'h4'),
        className: 'pr-inline-notice__title',
        placeholder: 'Notice title',
      })}
      {inner({ className: 'pr-inline-notice__text' })}
    </>,
  );
}

let counter = 0;

/** Paragraphs of older notices, whose text was kept in the notice itself. */
function paragraphs(html: string, rich: (h: string) => CxdBlock['content']): CxdBlock[] {
  const parts = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1]!);
  return (parts.length ? parts : [html]).map((p) => ({
    id: `n${Date.now().toString(36)}${(counter++).toString(36)}`,
    type: 'core/paragraph',
    v: 1,
    attrs: {},
    content: rich(p),
  }));
}

export const inlineNotice: PrismaBlock = {
  name: 'inline-notice',
  title: 'Inline Notice',
  description: 'A highlighted notice with a title and text, which visitors can close.',
  keywords: ['inline notice', 'notice', 'alert', 'message'],
  container: true,
  richAttributes: ['noticeTitle'],
  defaults: DEFAULTS,
  css,
  View,
  script: { file: 'inline-notice.js', marker: 'data-pr-inline-notice' },
  spectra: {
    'uagb/inline-notice': (a, src) => {
      const title = /class="[^"]*\buagb-notice-title\b/.test(src.html)
        ? src.innerAny('uagb-notice-title')
        : undefined;
      let children = src.children;
      if (children.length === 0) {
        const legacy = src.inner('div', 'uagb-notice-text');
        if (legacy.trim()) children = paragraphs(legacy, src.rich);
      }
      return [
        src.block(
          'inline-notice',
          { ...a, ...(title !== undefined ? { noticeTitle: title } : {}) },
          children,
        ),
      ];
    },
  },
};
