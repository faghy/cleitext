import type { Sheet } from '@cleitext/design';
import { useEffect, useRef } from 'react';
import { blockClass } from '../../lib/css';
import { DEVICES, emit, numeric, px, suffix, typography } from '../../lib/emit';
import { Icon } from '../../lib/icons';
import { safeTag } from '../../lib/tags';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';
import { formatDate, updateTimeline } from './timeline';

const LAYOUTS = ['left', 'center', 'right'];

function typographyDefaults(p: string, family: unknown = ''): Attrs {
  return {
    [`${p}FontFamily`]: family,
    [`${p}FontWeight`]: '',
    [`${p}FontStyle`]: '',
    [`${p}Transform`]: '',
    [`${p}Decoration`]: '',
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
    [`${p}LoadGoogleFonts`]: false,
  };
}

const TIMELINE_DEFAULTS: Attrs = {
  align: '',
  alignTablet: '',
  alignMobile: '',
  headingColor: '',
  subHeadingColor: '',
  separatorBg: '#eee',
  backgroundColor: '#eee',
  separatorColor: '#eee',
  separatorFillColor: '#0693e3',
  separatorBorder: '#eee',
  borderFocus: '#0693e3',
  horizontalSpace: 10,
  horizontalSpaceTablet: '',
  horizontalSpaceMobile: '',
  horizontalSpaceUnit: 'px',
  horizontalSpaceUnitTablet: 'px',
  horizontalSpaceUnitMobile: 'px',
  verticalSpace: 15,
  verticalSpaceTablet: '',
  verticalSpaceMobile: '',
  verticalSpaceUnit: 'px',
  verticalSpaceUnitTablet: 'px',
  verticalSpaceUnitMobile: 'px',
  ...typographyDefaults('head'),
  ...typographyDefaults('subHead'),
  ...typographyDefaults('date'),
  dateFontSizeType: '',
  dateFontsizeType: 'px',
  dateFontsize: '12',
  dateFontsizeTablet: '',
  dateFontsizeMobile: '',
  dateColor: '#333',
  timelinAlignment: 'center',
  timelinAlignmentTablet: '',
  timelinAlignmentMobile: '',
  arrowlinAlignment: 'center',
  stack: 'tablet',
  headSpace: 5,
  headSpaceTablet: '',
  headSpaceMobile: '',
  separatorwidth: 3,
  borderwidth: 0,
  iconColor: '#333',
  iconFocus: '#fff',
  iconBgFocus: '#0693e3',
  connectorBgsize: 35,
  connectorBgsizeTablet: '',
  connectorBgsizeMobile: '',
  dateBottomspace: 5,
  dateBottomspaceTablet: '',
  dateBottomspaceMobile: '',
  borderRadius: 2,
  borderRadiusTablet: '',
  borderRadiusMobile: '',
  bgPadding: 20,
  iconSize: 12,
  iconSizeTablet: '',
  iconSizeMobile: '',
  // Given to the items (each keeps its own copy, as in Spectra).
  icon: 'calendar-days',
  headingTag: 'h4',
  dateFormat: 'F j, Y',
  displayPostDate: true,
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
  paddingUnit: 'px',
  tabletPaddingUnit: 'px',
  mobilePaddingUnit: 'px',
  paddingLink: false,
  marginUnit: 'px',
  tabletMarginUnit: 'px',
  mobileMarginUnit: 'px',
  marginLink: false,
};

/** The layout of each device: its own, else stacked to the left from the `stack` device, else the larger device's. */
export function layouts(a: Attrs): [string, string, string] {
  const pick = (v: unknown) => (LAYOUTS.includes(String(v)) ? String(v) : '');
  const desktop = pick(a.timelinAlignment) || 'center';
  const tablet = pick(a.timelinAlignmentTablet) || (a.stack === 'tablet' ? 'left' : desktop);
  const mobile =
    pick(a.timelinAlignmentMobile) ||
    (a.stack === 'tablet' || a.stack === 'mobile' ? 'left' : tablet);
  return [desktop, tablet, mobile];
}

function timelineCss(a: Attrs, B: string, sheet: Sheet): void {
  const R = `${B}.pr-timeline`;
  // The date's older attributes are used while the newer ones are empty.
  const dateSize = a.dateFontSize !== '' ? a.dateFontSize : a.dateFontsize;
  const dateUnit = a.dateFontSizeType !== '' ? a.dateFontSizeType : a.dateFontsizeType;
  const dateAttrs: Attrs = { ...a, dateFontSizeType: dateUnit || 'px' };
  const ifSet = (v: unknown) => (numeric(v) === null ? '' : v);
  for (const device of DEVICES) {
    const s = suffix(device);
    const align = a[`align${s}`];
    emit(sheet, device, R, {
      ...(device === 'desktop'
        ? {
            '--pr-timeline-card': a.backgroundColor,
            ...(numeric(a.connectorBgsize) !== null
              ? { '--pr-timeline-line-offset': `calc(${numeric(a.connectorBgsize)}px / 2)` }
              : {}),
          }
        : {}),
      '--pr-timeline-gap': px(
        a[`horizontalSpace${s}`],
        a[`horizontalSpaceUnit${s}`] || a.horizontalSpaceUnit,
      ),
    });
    emit(sheet, device, `${R} .pr-timeline-item__heading`, {
      'text-align': align,
      ...(device === 'desktop' ? { color: a.headingColor } : {}),
      'margin-bottom': px(a[`headSpace${s}`]),
      ...typography(a, 'head', device),
    });
    emit(sheet, device, `${R} .pr-timeline-item__desc`, {
      'text-align': align,
      ...(device === 'desktop' ? { color: a.subHeadingColor } : {}),
      ...typography(a, 'subHead', device),
    });
    emit(sheet, device, `${R} .pr-timeline-item__events`, { 'text-align': align });
    emit(sheet, device, `${R} .pr-timeline-item__date-inner`, {
      'margin-bottom': px(a[`dateBottomspace${s}`]),
      ...(device === 'desktop' ? { color: a.dateColor } : {}),
      'text-align': align,
      ...typography(dateAttrs, 'date', device),
    });
    emit(sheet, device, `${R} .pr-timeline-item__date`, {
      ...typography(dateAttrs, 'date', device),
      ...(device === 'desktop' ? { color: a.dateColor, 'font-size': px(dateSize, dateUnit) } : {}),
    });
    const connector = px(a[`connectorBgsize${s}`]);
    emit(sheet, device, `${R} .pr-timeline-item__marker`, {
      'background-color': a.separatorBg,
      'min-height': connector,
      'min-width': connector,
      'line-height': connector,
      border: `${numeric(a.borderwidth) ?? ''}px solid ${String(a.separatorBorder ?? '')}`,
    });
    emit(sheet, device, `${R} .pr-timeline-item__arrow`, { height: connector });
    emit(sheet, device, `${R} > .pr-timeline-item`, {
      'margin-bottom': px(
        a[`verticalSpace${s}`],
        a[`verticalSpaceUnit${s}`] || a.verticalSpaceUnit,
      ),
    });
    const unit = device === 'desktop' ? a.paddingUnit : a[`${device}PaddingUnit`];
    emit(sheet, device, `${R} .pr-timeline-item__content`, {
      'padding-left': px(a[`leftPadding${s}`], unit),
      'padding-right': px(a[`rightPadding${s}`], unit),
      'padding-top': px(a[`topPadding${s}`], unit),
      'padding-bottom': px(a[`bottomPadding${s}`], unit),
      // As Spectra: on tablets and phones the radius goes to the content.
      ...(device === 'desktop' ? {} : { 'border-radius': px(a[`borderRadius${s}`]) }),
    });
    emit(sheet, device, `${R} .pr-timeline-item__marker svg`, {
      ...(device === 'desktop' ? { color: a.iconColor, fill: a.iconColor } : {}),
      width: px(ifSet(a[`iconSize${s}`])),
    });
  }
  emit(sheet, 'desktop', `${R} .pr-timeline-item__marker.is-in-view svg`, {
    fill: a.iconFocus,
    color: a.iconFocus,
  });
  emit(sheet, 'desktop', `${R} .pr-timeline-item__marker.is-in-view`, {
    background: a.iconBgFocus,
    'border-color': a.borderFocus,
  });
  emit(sheet, 'desktop', `${R} .pr-timeline__line-inner`, {
    'background-color': a.separatorFillColor,
  });
  emit(sheet, 'desktop', `${R} .pr-timeline__line`, {
    'background-color': a.separatorColor,
    width: px(a.separatorwidth),
  });
  emit(sheet, 'desktop', `${R} .pr-timeline-item__events`, {
    'background-color': a.backgroundColor,
    'border-radius': px(a.borderRadius),
  });
}

function TimelineView({ attrs: a, id, root, editing }: ViewProps) {
  const [desktop, tablet, mobile] = layouts(a);
  const arrow = ['top', 'bottom', 'center'].includes(String(a.arrowlinAlignment))
    ? String(a.arrowlinAlignment)
    : 'center';
  // In the editor the line is placed here (the site's script does it on the pages).
  const line = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = line.current?.parentElement;
    const view = element?.ownerDocument.defaultView;
    if (!editing || !element || !view) return;
    let frame = 0;
    const update = () => {
      view.cancelAnimationFrame(frame);
      frame = view.requestAnimationFrame(() => updateTimeline(element));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(element, { childList: true, subtree: true, characterData: true });
    view.addEventListener('scroll', update, true);
    view.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      view.removeEventListener('scroll', update, true);
      view.removeEventListener('resize', update);
      view.cancelAnimationFrame(frame);
    };
  }, [editing]);
  return root(
    'div',
    {
      className: [
        'wp-block-prisma-content-timeline',
        'pr-timeline',
        `pr-timeline--desktop-${desktop}`,
        `pr-timeline--tablet-${tablet}`,
        `pr-timeline--mobile-${mobile}`,
        `pr-timeline--arrow-${arrow}`,
        blockClass(id),
      ].join(' '),
    },
    <div
      className="pr-timeline__line"
      ref={line}
      {...(editing ? {} : { 'data-pr-content-timeline': '' })}
    >
      <div className="pr-timeline__line-inner" />
    </div>,
    true,
  );
}

export const contentTimeline: PrismaBlock = {
  name: 'content-timeline',
  title: 'Content Timeline',
  description:
    'Events along a vertical line, alternating left and right or on one side, stacked on smaller screens.',
  keywords: ['timeline', 'history', 'events', 'milestones'],
  container: true,
  allowedBlocks: ['prisma/content-timeline-item'],
  script: { file: 'content-timeline.js', marker: 'data-pr-content-timeline' },
  defaults: TIMELINE_DEFAULTS,
  css: timelineCss,
  View: TimelineView,
  spectra: {
    'uagb/content-timeline': (a, src) => {
      const attrs = { ...a };
      // Editor-only data of Spectra (the items' default content, class names).
      for (const key of ['tm_content', 't_date', 'content_class', 'timelineItem', 'tm_client_id'])
        delete attrs[key];
      return [src.block('content-timeline', attrs, src.children)];
    },
  },
};

// ---- Item ------------------------------------------------------------------------------------

const ITEM_DEFAULTS: Attrs = {
  time_heading: [{ text: 'Timeline Heading ' }],
  time_desc: [
    { text: 'This is timeline description. Please click here to change this description.' },
  ],
  t_date: '1/1/2019',
  dateFormat: 'F j, Y',
  // True hides the date (the timeline's "Display date" sets it on every item).
  displayPostDate: false,
  headingTag: 'h4',
  icon: 'calendar-days',
};

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'p'];

function ItemView({ attrs: a, id, root, text }: ViewProps) {
  const date = a.displayPostDate !== true && a.t_date ? formatDate(a.dateFormat, a.t_date) : '';
  const tag = HEADING_TAGS.includes(String(a.headingTag)) ? String(a.headingTag) : 'h4';
  return root(
    'article',
    { className: `wp-block-prisma-content-timeline-item pr-timeline-item ${blockClass(id)}` },
    <>
      <div className="pr-timeline-item__marker">
        <Icon name={a.icon} />
      </div>
      <div className="pr-timeline-item__events">
        <div className="pr-timeline-item__content">
          {date ? <div className="pr-timeline-item__date-inner">{date}</div> : null}
          {text('time_heading', {
            tagName: safeTag(tag, 'h4'),
            className: 'pr-timeline-item__heading',
            placeholder: 'Heading…',
          })}
          {text('time_desc', {
            tagName: 'p',
            className: 'pr-timeline-item__desc',
            placeholder: 'Description…',
          })}
          <div className="pr-timeline-item__arrow" />
        </div>
      </div>
      <div className="pr-timeline-item__date">{date}</div>
    </>,
  );
}

/** HTML text → plain text (dates are plain). */
const plainText = (html: string) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

export const contentTimelineItem: PrismaBlock = {
  name: 'content-timeline-item',
  title: 'Timeline Item',
  description: 'One event of a content timeline: date, heading and description.',
  keywords: ['timeline', 'event'],
  parent: ['content-timeline'],
  richAttributes: ['time_heading', 'time_desc'],
  defaults: ITEM_DEFAULTS,
  css: () => {},
  View: ItemView,
  spectra: {
    'uagb/content-timeline-child': (a, src) => {
      const attrs: Attrs = { ...a };
      for (const key of [
        'content_class',
        'dayalign_class',
        'timelinAlignment',
        'timelinAlignmentTablet',
        'timelinAlignmentMobile',
        'arrowlinAlignment',
        'align',
        'alignTablet',
        'alignMobile',
        'timelineItem',
        'tm_client_id',
        'iconSize',
        'stack',
      ])
        delete attrs[key];
      const heading = src.innerAny('uagb-timeline__heading');
      const desc = src.inner('p', 'uagb-timeline-desc-content');
      if (heading) attrs.time_heading = heading;
      if (desc) attrs.time_desc = desc;
      // The date as the page showed it (in the site's language): kept as typed when ours differs.
      const shown = plainText(src.inner('div', 'uagb-timeline__date-new'));
      if (shown) {
        const format = attrs.dateFormat ?? ITEM_DEFAULTS.dateFormat;
        const date = attrs.t_date ?? ITEM_DEFAULTS.t_date;
        if (formatDate(format, date) !== shown) {
          attrs.t_date = shown;
          attrs.dateFormat = 'custom';
        }
      }
      return [src.block('content-timeline-item', attrs)];
    },
  },
};
