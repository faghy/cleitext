import type { BaseDevice as Device, Sheet } from '@cleitext/design';
import { useEffect, useRef, useState } from 'react';
import { blockClass } from '../../lib/css';
import {
  border,
  borderDefaults,
  clean,
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
import { collectHeadings, renderList } from './build';

function typographyDefaults(p: string): Attrs {
  return {
    [`${p}FontFamily`]: '',
    [`${p}FontSizeType`]: 'px',
    [`${p}FontSize`]: '',
    [`${p}FontSizeTablet`]: '',
    [`${p}FontSizeMobile`]: '',
    [`${p}LineHeightType`]: 'em',
    [`${p}LineHeight`]: '',
    [`${p}LineHeightTablet`]: '',
    [`${p}LineHeightMobile`]: '',
    [`${p}LetterSpacing`]: '',
    [`${p}LetterSpacingTablet`]: '',
    [`${p}LetterSpacingMobile`]: '',
    [`${p}LetterSpacingType`]: 'px',
  };
}

const DEFAULTS: Attrs = {
  headingTitle: [{ text: 'Table Of Contents' }],
  emptyHeadingTeaxt: 'Add a header to begin generating the table of contents',
  disableBullets: false,
  smoothScroll: true,
  smoothScrollOffset: 30,
  smoothScrollOffsetType: 'px',
  scrollToTop: false,
  scrollToTopColor: '',
  scrollToTopBgColor: '',
  considerH1: true,
  considerH2: true,
  considerH3: true,
  considerH4: true,
  considerH5: true,
  considerH6: true,
  customWidth: true,
  widthDesktop: 100,
  widthTablet: '',
  widthMobile: '',
  widthTypeDesktop: '%',
  widthTypeTablet: '%',
  widthTypeMobile: '%',
  tColumnsDesktop: 1,
  tColumnsTablet: 1,
  tColumnsMobile: 1,
  mappingHeaders: [true, true, true, true, true, true],
  makeCollapsible: false,
  initialCollapse: false,
  icon: 'angle-down',
  iconColor: '',
  bulletColor: '',
  iconSize: '',
  align: 'left',
  overallAlign: 'left',
  headingAlignment: 'left',
  linkColor: '#54595F',
  linkHoverColor: '',
  ...Object.fromEntries(
    ['top', 'right', 'bottom', 'left'].flatMap((side) => [
      [`${side}Padding`, ''],
      [`${side}PaddingTablet`, ''],
      [`${side}PaddingMobile`, ''],
      [`${side}Margin`, ''],
      [`${side}MarginTablet`, ''],
      [`${side}MarginMobile`, ''],
    ]),
  ),
  vPaddingDesktop: 30,
  vPaddingTablet: '',
  vPaddingMobile: '',
  hPaddingDesktop: 30,
  hPaddingTablet: '',
  hPaddingMobile: '',
  paddingTypeDesktop: 'px',
  paddingTypeTablet: 'px',
  paddingTypeMobile: 'px',
  paddingLink: false,
  vMarginDesktop: '',
  vMarginTablet: '',
  vMarginMobile: '',
  hMarginDesktop: '',
  hMarginTablet: '',
  hMarginMobile: '',
  marginTypeDesktop: 'px',
  marginTypeTablet: 'px',
  marginTypeMobile: 'px',
  marginLink: false,
  contentPaddingDesktop: '',
  contentPaddingTablet: '',
  contentPaddingMobile: '',
  contentPaddingTypeDesktop: 'px',
  contentPaddingTypeTablet: 'px',
  contentPaddingTypeMobile: 'px',
  headingBottom: '',
  headingBottomTablet: '',
  headingBottomMobile: '',
  backgroundColor: '#fff',
  headingColor: '',
  loadGoogleFonts: false,
  fontFamily: '',
  fontWeight: '',
  fontStyle: '',
  fontTransform: '',
  fontDecoration: 'underline',
  fontSize: '',
  fontSizeType: 'px',
  fontSizeTablet: '',
  fontSizeMobile: '',
  lineHeightType: 'em',
  lineHeight: '',
  lineHeightTablet: '',
  lineHeightMobile: '',
  letterSpacing: '',
  letterSpacingTablet: '',
  letterSpacingMobile: '',
  letterSpacingType: 'px',
  headingLoadGoogleFonts: false,
  ...typographyDefaults('heading'),
  headingFontWeight: 'Default',
  headingFontSize: 20,
  headingFontStyle: '',
  headingTransform: '',
  headingDecoration: '',
  markerView: 'disc',
  separatorStyle: 'none',
  separatorHeightType: 'px',
  separatorSpaceType: 'px',
  separatorColor: '',
  separatorHeight: 1,
  separatorSpace: 15,
  separatorSpaceTablet: '',
  separatorSpaceMobile: '',
  separatorHColor: '',
  // The border before per-side settings: used where those are empty.
  borderStyle: 'solid',
  borderWidth: 1,
  borderRadius: '',
  borderColor: '#333',
  enableCollapsableList: false,
  collapsibleListDepth: 5,
  initiallyCollapseList: false,
  ...borderDefaults('overall'),
};

/** The overall border, completed by the older single values where the per-side ones are empty. */
function overallBorder(a: Attrs, device: Device): Declarations {
  const out = border(a, 'overall', device);
  if (device !== 'desktop' || a.overallBorderStyle === 'default') return out;
  const set = (v: unknown) => v !== '' && v !== undefined;
  for (const side of ['top', 'left', 'right', 'bottom'])
    if (!set(out[`border-${side}-width`])) out[`border-${side}-width`] = px(a.borderWidth);
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right'])
    if (!set(out[`border-${corner}-radius`])) out[`border-${corner}-radius`] = px(a.borderRadius);
  if (!clean(out['border-color'])) out['border-color'] = a.borderColor;
  if (!clean(out['border-style'])) out['border-style'] = a.borderStyle;
  return out;
}

/** A value: its own when it is a number, else the fallback. */
const own = (value: unknown, fallback: unknown) => (numeric(value) !== null ? value : fallback);

function css(a: Attrs, B: string, sheet: Sheet): void {
  const R = `${B}.pr-toc`;
  const W = `${R} .pr-toc__wrap`;
  const L = `${R} .pr-toc__list-wrap`;
  const icon = numeric(a.iconSize) !== null ? `${numeric(a.iconSize)}px` : '20px';
  const separator = a.separatorStyle !== 'none' && a.separatorStyle;
  for (const device of DEVICES) {
    const s = suffix(device);
    const d = device === 'desktop' ? 'Desktop' : s;
    const v = (side: string, base: 'Padding' | 'Margin', short: 'v' | 'h') =>
      own(a[`${side}${base}${s}`], a[`${short}${base}${d}`]);
    const pUnit = a[`paddingType${d}`];
    const mUnit = a[`marginType${d}`];
    const left = px(v('left', 'Padding', 'h'), pUnit);
    const right = px(v('right', 'Padding', 'h'), pUnit);
    emit(sheet, device, W, {
      ...overallBorder(a, device),
      ...(device === 'desktop'
        ? a.customWidth
          ? { width: px(a.widthDesktop, a.widthTypeDesktop) }
          : {}
        : { width: px(a[`width${d}`], a[`widthType${d}`]) }),
      'padding-left': left,
      'padding-right': right,
      'padding-top': px(v('top', 'Padding', 'v'), pUnit),
      'padding-bottom': px(v('bottom', 'Padding', 'v'), pUnit),
      ...(device === 'desktop' ? { background: a.backgroundColor } : {}),
    });
    emit(sheet, device, `${L} ul li, ${L} ol li`, {
      'font-size': px(a[`fontSize${s}`], a.fontSizeType),
    });
    emit(sheet, device, `${R} .pr-toc__title`, {
      ...(device === 'desktop'
        ? {
            color: a.headingColor,
            'justify-content':
              a.customWidth && a.makeCollapsible ? 'space-between' : a.headingAlignment,
            ...(a.makeCollapsible ? { cursor: 'pointer' } : {}),
          }
        : {}),
      'margin-bottom': px(a[`headingBottom${s}`]),
      ...typography(
        { ...a, headingFontWeight: a.headingFontWeight === 'Default' ? '' : a.headingFontWeight },
        'heading',
        device,
      ),
    });
    emit(sheet, device, L, {
      'column-count': numeric(a[`tColumns${d}`]) ?? '',
      overflow: 'hidden',
      'text-align': a.align,
    });
    emit(sheet, device, `${L} > ol.pr-toc__list:first-child`, {
      'margin-left': px(v('left', 'Margin', 'h'), mUnit),
      'margin-right': px(v('right', 'Margin', 'h'), mUnit),
      'margin-top': px(v('top', 'Margin', 'v'), mUnit),
      'margin-bottom': px(v('bottom', 'Margin', 'v'), mUnit),
    });
    const gap = px(a[`contentPadding${d}`], a[`contentPaddingType${d}`]);
    if (gap) {
      emit(sheet, device, `${L} ol.pr-toc__list > li, ${L} ul.pr-toc__list > li`, {
        'padding-top': `calc(${gap} / 2)`,
        'padding-bottom': `calc(${gap} / 2)`,
      });
      if (device === 'desktop')
        emit(sheet, device, `${L} li.pr-toc__item--expandable > ul.pr-toc__list`, {
          'padding-top': `calc(${gap} / 2)`,
        });
    }
    // As Spectra, these two match only lists that start with a sub-list.
    emit(sheet, device, `${L} > ul.pr-toc__list > li:first-child`, { 'padding-top': 0 });
    emit(sheet, device, `${L} ul.pr-toc__list:last-child > li:last-child`, {
      'padding-bottom': 0,
    });
    // The list's typography (the font size above also sizes the markers).
    emit(sheet, device, `${L} ol li a`, {
      ...(device === 'desktop'
        ? {
            'font-family': a.fontFamily,
            'text-transform': a.fontTransform,
            'text-decoration': a.fontDecoration,
            'font-style': a.fontStyle,
            'font-weight': a.fontWeight,
          }
        : {}),
      'font-size': px(a[`fontSize${s}`], a.fontSizeType),
      'line-height': px(a[`lineHeight${s}`], a.lineHeightType),
      'letter-spacing': px(a[`letterSpacing${s}`], a.letterSpacingType),
    });
    if (separator) {
      emit(sheet, device, `${R} .pr-toc__separator`, {
        ...(device === 'desktop'
          ? {
              'border-top-style': a.separatorStyle,
              'border-top-width': px(a.separatorHeight, a.separatorHeightType),
              'border-color': a.separatorColor,
            }
          : {}),
        width: `calc(100% + ${left || '0px'} + ${right || '0px'})`,
        'margin-left': `-${left || '0px'}`,
        'margin-bottom': px(a[`separatorSpace${s}`], a.separatorSpaceType),
      });
    }
  }
  emit(sheet, 'desktop', R, { 'text-align': a.overallAlign });
  emit(sheet, 'desktop', `${L} li a:hover`, { color: a.linkHoverColor });
  emit(sheet, 'desktop', `${L} li a`, { color: a.linkColor });
  emit(sheet, 'desktop', `${W}:hover`, { 'border-color': a.overallBorderHColor });
  emit(sheet, 'desktop', `${L} > ol.pr-toc__list li`, { color: a.bulletColor });
  emit(sheet, 'desktop', `${R} svg`, { width: icon, height: icon, fill: a.iconColor });
  if (a.disableBullets)
    emit(sheet, 'desktop', `${R} .pr-toc__list, ${R} .pr-toc__item`, {
      'list-style-type': 'none !important',
    });
  else
    emit(sheet, 'desktop', `${R} .pr-toc__list .pr-toc__list, ${R} .pr-toc__list .pr-toc__item`, {
      'list-style-type': `${clean(a.markerView) || 'disc'} !important`,
    });
  if (separator)
    emit(sheet, 'desktop', `${W}:hover .pr-toc__separator`, { 'border-color': a.separatorHColor });
  // The button that goes back to the top is the page's own.
  emit(sheet, 'desktop', '.pr-toc__scroll-top', { color: a.scrollToTopColor });
  emit(sheet, 'desktop', '.pr-toc__scroll-top.is-visible', { background: a.scrollToTopBgColor });
}

/** The site script's settings. */
export function tocConfig(a: Attrs) {
  return {
    mapping: Array.isArray(a.mappingHeaders)
      ? [0, 1, 2, 3, 4, 5].map((i) => (a.mappingHeaders as unknown[])[i] !== false)
      : [true, true, true, true, true, true],
    smooth: a.smoothScroll !== false,
    offset: numeric(a.smoothScrollOffset) ?? 30,
    toTop: Boolean(a.scrollToTop),
    collapsible: Boolean(a.makeCollapsible),
    list: Boolean(a.enableCollapsableList),
    depth: numeric(a.collapsibleListDepth) ?? 5,
    listCollapsed: Boolean(a.initiallyCollapseList),
  };
}

/** In the editor: the headings of the page being edited, kept up to date. */
function useEditorList(editing: boolean, a: Attrs) {
  const ref = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState('');
  const mapping = JSON.stringify(tocConfig(a).mapping);
  const depth = numeric(a.collapsibleListDepth) ?? 5;
  const list = Boolean(a.enableCollapsableList);
  useEffect(() => {
    const element = ref.current;
    if (!editing || !element) return;
    const doc = element.ownerDocument;
    const root = element.closest('.is-root-container') ?? doc.body;
    let timer = 0;
    const update = () => {
      const found = collectHeadings(
        root,
        JSON.parse(mapping),
        (h) => h.closest('.pr-toc') !== null,
      );
      setHtml(
        found.length
          ? renderList(
              found.map((f) => f.heading),
              { collapsible: list, depth },
            )
          : '',
      );
    };
    update();
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(update, 300);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [editing, mapping, depth, list]);
  return { ref, html };
}

function View({ attrs: a, id, root, text, editing }: ViewProps) {
  const { ref, html } = useEditorList(editing, a);
  const collapsed = Boolean(a.makeCollapsible && a.initialCollapse);
  const columns = Math.max(1, Math.round(numeric(a.tColumnsDesktop) ?? 1));
  const align = ['left', 'center', 'right'].includes(String(a.align)) ? String(a.align) : 'left';
  const placeholder = String(a.emptyHeadingTeaxt ?? '');
  return root(
    'div',
    {
      className: [
        'wp-block-prisma-table-of-contents',
        'pr-toc',
        `pr-toc--align-${align}`,
        `pr-toc--columns-${columns}`,
        collapsed && !editing ? 'pr-toc--collapsed' : '',
        a.enableCollapsableList ? 'pr-toc--collapsible-list' : '',
        blockClass(id),
      ]
        .filter(Boolean)
        .join(' '),
    },
    <div
      className="pr-toc__wrap"
      ref={ref}
      {...(editing ? {} : { 'data-pr-table-of-contents': JSON.stringify(tocConfig(a)) })}
    >
      <div className="pr-toc__title">
        {text('headingTitle', {
          tagName: 'span',
          className: 'pr-toc__title-text',
          placeholder: 'Table of contents',
        })}
        {a.makeCollapsible && a.icon ? <Icon name={a.icon} className="pr-toc__icon" /> : null}
      </div>
      {a.separatorStyle !== 'none' ? <div className="pr-toc__separator" /> : null}
      {editing ? (
        html ? (
          <div className="pr-toc__list-wrap" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p className="pr-toc__placeholder">{placeholder}</p>
        )
      ) : (
        <>
          <div className="pr-toc__list-wrap" />
          <p className="pr-toc__placeholder" hidden>
            {placeholder}
          </p>
        </>
      )}
    </div>,
  );
}

export const tableOfContents: PrismaBlock = {
  name: 'table-of-contents',
  title: 'Table of Contents',
  description:
    "A list of the page's headings linking to them, with smooth scrolling, columns and collapsible parts.",
  keywords: ['table of contents', 'toc', 'index', 'headings', 'navigation'],
  richAttributes: ['headingTitle'],
  script: { file: 'table-of-contents.js', marker: 'data-pr-table-of-contents' },
  defaults: DEFAULTS,
  css,
  View,
  spectra: {
    'uagb/table-of-contents': (a, src) => {
      const attrs: Attrs = { ...a };
      // The title is kept in an attribute; older blocks named it `heading`.
      const title = typeof a.headingTitle === 'string' ? a.headingTitle : a.heading;
      delete attrs.heading;
      delete attrs.headerLinks;
      if (typeof title === 'string') attrs.headingTitle = title;
      else delete attrs.headingTitle;
      return [src.block('table-of-contents', attrs)];
    },
  },
};
