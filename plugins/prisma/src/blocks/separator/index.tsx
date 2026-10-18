import type { Sheet } from '@cleitext/design';
import { blockClass } from '../../lib/css';
import { DEVICES, emit, numeric, px, suffix, type Declarations } from '../../lib/emit';
import { Icon } from '../../lib/icons';
import { safeTag } from '../../lib/tags';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';

/** Line styles drawn with a repeated mask (the others are CSS border styles). */
export const MASK_STYLES = ['rectangles', 'parallelogram', 'slash', 'leaves'];

function spacingDefaults(kind: 'Padding' | 'Margin', unit: string): Attrs {
  const out: Attrs = { [`block${kind}Link`]: '' };
  for (const s of ['', 'Tablet', 'Mobile']) {
    for (const side of ['Top', 'Right', 'Left', 'Bottom']) out[`block${side}${kind}${s}`] = '';
    out[`block${kind}Unit${s}`] = unit;
  }
  return out;
}

const DEFAULTS: Attrs = {
  separatorAlign: 'center',
  separatorAlignTablet: 'center',
  separatorAlignMobile: 'center',
  separatorStyle: 'solid',
  separatorBorderHeight: 3,
  separatorBorderHeightTablet: '',
  separatorBorderHeightMobile: '',
  separatorBorderHeightUnit: 'px',
  separatorWidth: 100,
  separatorWidthTablet: 100,
  separatorWidthMobile: 100,
  separatorWidthType: '%',
  separatorSize: 5,
  separatorSizeTablet: 5,
  separatorSizeMobile: 5,
  separatorSizeType: 'px',
  separatorHeight: '',
  separatorHeightTablet: '',
  separatorHeightMobile: '',
  separatorHeightType: 'px',
  separatorColor: '',
  elementType: 'none',
  separatorText: 'Divider',
  separatorTextTag: 'h4',
  separatorIcon: 'circle-check',
  elementPosition: 'center',
  elementSpacing: 15,
  elementSpacingTablet: 15,
  elementSpacingMobile: 15,
  elementSpacingUnit: 'px',
  elementTextLoadGoogleFonts: false,
  elementTextFontFamily: 'Default',
  elementTextFontWeight: '',
  elementTextFontSize: '',
  elementTextFontSizeType: 'px',
  elementTextFontSizeTablet: '',
  elementTextFontSizeMobile: '',
  elementTextLineHeightType: 'em',
  elementTextLineHeight: 1,
  elementTextLineHeightTablet: 1,
  elementTextLineHeightMobile: 1,
  elementTextFontStyle: 'normal',
  elementTextLetterSpacing: '',
  elementTextLetterSpacingTablet: '',
  elementTextLetterSpacingMobile: '',
  elementTextLetterSpacingType: 'px',
  elementTextDecoration: '',
  elementTextTransform: '',
  elementColor: '',
  elementIconWidth: '',
  elementIconWidthTablet: '',
  elementIconWidthMobile: '',
  elementIconWidthType: 'px',
  ...spacingDefaults('Padding', ''),
  ...spacingDefaults('Margin', 'px'),
};

const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;

/** Whether a padding or margin is set on any device: the line then gets a spacing wrapper. */
function hasSpacing(a: Attrs): boolean {
  return ['Padding', 'Margin'].some((kind) =>
    SIDES.some((side) =>
      ['', 'Tablet', 'Mobile'].some((s) => numeric(a[`block${side}${kind}${s}`]) !== null),
    ),
  );
}

/** Margins that place a block of the given width left, centered or right. */
function alignMargins(align: unknown): Declarations {
  if (align === 'left') return { 'margin-left': 0, 'margin-right': 'auto' };
  if (align === 'center') return { 'margin-left': 'auto', 'margin-right': 'auto' };
  if (align === 'right') return { 'margin-right': 0, 'margin-left': 'auto' };
  return {};
}

function css(a: Attrs, B: string, sheet: Sheet): void {
  const R = `${B}.pr-separator`;
  const element = a.elementType === 'text' || a.elementType === 'icon';
  const masked = MASK_STYLES.includes(String(a.separatorStyle));
  for (const device of DEVICES) {
    const s = suffix(device);
    const lineCss: Declarations = {
      // A pattern repeats along the line at this size; the empty size still sets the height.
      '-webkit-mask-size': `${px(a[`separatorSize${s}`], a.separatorSizeType)} 100%`.trim(),
      'border-top-width': px(a[`separatorBorderHeight${s}`], a.separatorBorderHeightUnit),
      width: px(a[`separatorWidth${s}`], a.separatorWidthType),
      'border-top-color': a.separatorColor,
      // Patterns are masks over a solid line.
      'border-top-style': masked ? 'solid' : a.separatorStyle,
    };
    // Space above and below: the height, unless the padding is set.
    const unset = (v: unknown) => numeric(v) === null;
    const height = (side: 'Top' | 'Bottom') =>
      unset(a[`block${side}Padding${s}`])
        ? px(a[`separatorHeight${s}`], a.separatorHeightType)
        : '';
    emit(sheet, device, R, {
      'padding-bottom': height('Top'),
      'padding-top': height('Bottom'),
      'text-align': a[`separatorAlign${s}`],
    });
    emit(sheet, device, `${R}.pr-separator--text .pr-separator__element .pr-separator__text`, {
      'font-family': a.elementTextFontFamily,
      'font-style': a.elementTextFontStyle,
      'text-decoration': a.elementTextDecoration,
      'text-transform': a.elementTextTransform,
      'font-weight': a.elementTextFontWeight,
      color: a.elementColor,
      ...(device === 'desktop' ? {} : { 'margin-bottom': 'initial' }),
      'font-size': px(a[`elementTextFontSize${s}`], a.elementTextFontSizeType),
      'line-height': px(a[`elementTextLineHeight${s}`], a.elementTextLineHeightType),
      'letter-spacing': px(a[`elementTextLetterSpacing${s}`], a.elementTextLetterSpacingType),
    });
    const icon = px(a[`elementIconWidth${s}`], a.elementIconWidthType);
    emit(sheet, device, `${R}.pr-separator--icon .pr-separator__element svg`, {
      'font-size': icon,
      width: icon,
      height: icon,
      'line-height': icon,
      color: a.elementColor,
      fill: a.elementColor,
    });
    const paddingUnit = a[`blockPaddingUnit${s}`] || 'px';
    const marginUnit = a[`blockMarginUnit${s}`];
    const spacing: Declarations = {};
    for (const side of SIDES) {
      const p = side.toLowerCase();
      spacing[`margin-${p}`] = px(a[`block${side}Margin${s}`], marginUnit);
      spacing[`padding-${p}`] = px(a[`block${side}Padding${s}`], paddingUnit);
    }
    emit(sheet, device, `${B} .pr-separator__spacing`, spacing);
    if (!element) {
      emit(
        sheet,
        device,
        `${R}:not(.pr-separator--text):not(.pr-separator--icon) .pr-separator__inner`,
        {
          ...lineCss,
          'margin-top': '5px',
          'margin-bottom': '5px',
        },
      );
      continue;
    }
    emit(sheet, device, `${R} .pr-separator__inner`, {
      width: px(a[`separatorWidth${s}`], a.separatorWidthType),
      ...alignMargins(a[`separatorAlign${s}`]),
    });
    const position = a.elementPosition;
    const sides = `${R} .pr-separator__inner`;
    emit(sheet, device, `${sides}::before`, position === 'left' ? { display: 'none' } : lineCss);
    emit(sheet, device, `${sides}::after`, position === 'right' ? { display: 'none' } : lineCss);
    const gap = px(a[`elementSpacing${s}`], a.elementSpacingUnit);
    emit(
      sheet,
      device,
      `${R} .pr-separator__inner .pr-separator__element`,
      position === 'left'
        ? { 'margin-right': gap }
        : position === 'right'
          ? { 'margin-left': gap }
          : position === 'center'
            ? { 'margin-right': gap, 'margin-left': gap }
            : {},
    );
  }
}

function View({ attrs: a, id, root }: ViewProps) {
  const type = a.elementType === 'text' || a.elementType === 'icon' ? a.elementType : 'none';
  const style = String(a.separatorStyle ?? '');
  const line = (
    <div className="pr-separator__inner">
      {type !== 'none' && (
        <div className="pr-separator__element">
          {type === 'icon' ? (
            <Icon name={a.separatorIcon} />
          ) : (
            (() => {
              const Tag = safeTag(a.separatorTextTag, 'h4') as 'h4';
              return <Tag className="pr-separator__text">{String(a.separatorText ?? '')}</Tag>;
            })()
          )}
        </div>
      )}
    </div>
  );
  return root(
    'div',
    {
      className: [
        'wp-block-prisma-separator',
        'pr-separator',
        blockClass(id),
        type !== 'none' ? `pr-separator--${type}` : '',
        MASK_STYLES.includes(style) ? `pr-separator--${style}` : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
    hasSpacing(a) ? <div className="pr-separator__spacing">{line}</div> : line,
  );
}

export const separator: PrismaBlock = {
  name: 'separator',
  title: 'Separator',
  description:
    'A line that divides the content, plain or patterned, with an optional text or icon.',
  keywords: ['separator', 'divider', 'line', 'hr'],
  defaults: DEFAULTS,
  css,
  View,
  spectra: {
    'uagb/separator': (a, src) => {
      // The text is kept in the saved HTML (escaped) as well as in the attributes.
      const text =
        /<(h[1-6]|p|span|div)\b[^>]*class="[^"]*\buagb-html-tag\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/i.exec(
          src.html,
        )?.[2];
      const plain =
        text === undefined
          ? undefined
          : src
              .rich(text)
              .map((node) =>
                'text' in node ? node.text : node.children.map((c) => c.text).join(''),
              )
              .join('');
      return [
        src.block('separator', {
          ...a,
          ...(a.separatorText === undefined && plain !== undefined ? { separatorText: plain } : {}),
        }),
      ];
    },
  },
};
