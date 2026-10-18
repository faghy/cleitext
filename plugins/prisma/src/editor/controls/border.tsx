import { Color, States } from './color';
import { Select, Spacing, type Side } from './fields';
import { plain, type Bind } from './bind';

const STYLES = [
  { value: 'default', label: 'Default' },
  { value: 'none', label: 'None' },
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'double', label: 'Double' },
];

const SIDE = (side: Side) => side[0]!.toUpperCase() + side.slice(1);
const CORNER: Record<Side, string> = {
  top: 'TopLeft',
  right: 'TopRight',
  bottom: 'BottomRight',
  left: 'BottomLeft',
};
const device = (d: 'desktop' | 'tablet' | 'mobile') =>
  d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile';

/**
 * Border of a part of a block (`<prefix>Border…`): style, widths and radius
 * by device, color and hover color.
 */
export function Border({
  bind,
  prefix,
  hover = true,
}: {
  bind: Bind;
  prefix: string;
  hover?: boolean;
}) {
  const style = String(
    bind.attributes[`${prefix}BorderStyle`] ?? bind.defaults[`${prefix}BorderStyle`] ?? '',
  );
  const visible = style !== '' && style !== 'default' && style !== 'none';
  return (
    <>
      <Select bind={bind} name={`${prefix}BorderStyle`} label="Style" options={STYLES} />
      {visible && (
        <Spacing
          bind={bind}
          label="Width"
          units={['px']}
          min={0}
          keys={(side, d) => `${prefix}Border${SIDE(side)}Width${device(d)}`}
        />
      )}
      <Spacing
        bind={bind}
        label="Radius"
        units={['px', '%', 'em']}
        min={0}
        sides={['Top left', 'Top right', 'Bottom right', 'Bottom left']}
        keys={(side, d) => `${prefix}Border${CORNER[side]}Radius${device(d)}`}
        unitKeys={plain(`${prefix}BorderRadiusUnit`)}
      />
      {visible &&
        (hover ? (
          <States
            normal={<Color bind={bind} name={`${prefix}BorderColor`} label="Color" />}
            hover={<Color bind={bind} name={`${prefix}BorderHColor`} label="Color" />}
          />
        ) : (
          <Color bind={bind} name={`${prefix}BorderColor`} label="Color" />
        ))}
    </>
  );
}
