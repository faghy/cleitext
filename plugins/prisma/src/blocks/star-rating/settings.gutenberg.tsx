import { plain, type Attrs, type Bind } from '../../editor/controls/bind';
import { Color } from '../../editor/controls/color';
import { useDevice } from '../../editor/controls/device';
import {
  Choice,
  InspectorTabs,
  Panel,
  Range,
  Select,
  Spacing,
  Toggle,
} from '../../editor/controls/fields';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';

const dev = (d: 'desktop' | 'tablet' | 'mobile') =>
  d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile';

/** The title's typography attributes have no prefix (`fontFamily`, `fontTransform`): the control gets them as `title…`. */
const TYPOGRAPHY: Record<string, string> = {
  titleTransform: 'fontTransform',
  titleDecoration: 'fontDecoration',
  titleLoadGoogleFonts: 'loadGoogleFonts',
};
const real = (key: string) => TYPOGRAPHY[key] ?? `${key[5]!.toLowerCase()}${key.slice(6)}`;

function titleBind(bind: Bind): Bind {
  const view = (source: Attrs) => {
    const out: Attrs = {};
    for (const key of Object.keys(source)) {
      if (/^(font|lineHeight|letterSpacing|loadGoogleFonts)/.test(key)) {
        const as =
          Object.entries(TYPOGRAPHY).find(([, v]) => v === key)?.[0] ??
          `title${key[0]!.toUpperCase()}${key.slice(1)}`;
        out[as] = source[key];
      }
    }
    return out;
  };
  return {
    attributes: view(bind.attributes),
    defaults: view(bind.defaults),
    setAttributes: (attrs) =>
      bind.setAttributes(Object.fromEntries(Object.entries(attrs).map(([k, v]) => [real(k), v]))),
  };
}

function BlockSpacing({ bind, kind }: { bind: Bind; kind: 'Padding' | 'Margin' }) {
  return (
    <Spacing
      bind={bind}
      label={kind}
      keys={(side, d) => `block${side[0]!.toUpperCase()}${side.slice(1)}${kind}${dev(d)}`}
      unitKeys={(d) => `block${kind}Unit${dev(d)}`}
      linkName={`block${kind}Link`}
    />
  );
}

export const StarRatingSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const [device] = useDevice();
  const stacked = a[`layout${dev(device)}`] === 'stack';
  const showTitle = a.displayTitle !== false;
  return (
    <InspectorTabs
      general={
        <Panel title="General" initialOpen>
          <Toggle bind={bind} name="displayTitle" label="Enable title" />
          <Select
            bind={bind}
            name="range"
            label="Range"
            options={[
              { value: '5', label: '1-5' },
              { value: '10', label: '1-10' },
            ]}
          />
          <Range
            bind={bind}
            label="Rating"
            name="rating"
            min={0}
            max={Number(a.range) || 5}
            step={0.1}
          />
          {showTitle && (
            <>
              <Choice
                bind={bind}
                keys={plain('layout')}
                label="Layout"
                options={[
                  { value: 'inline', label: 'Inline' },
                  { value: 'stack', label: 'Stack' },
                ]}
              />
              <Choice
                bind={bind}
                keys={plain('starPosition')}
                label="Star position"
                options={[
                  { value: 'before', label: 'Before' },
                  { value: 'after', label: 'After' },
                ]}
              />
            </>
          )}
          <Choice
            bind={bind}
            keys={plain('align')}
            label="Alignment"
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
              ...(stacked ? [] : [{ value: 'full', label: 'Full' }]),
            ]}
          />
        </Panel>
      }
      style={
        <>
          {showTitle && (
            <Panel title="Title">
              <Color bind={bind} name="titleColor" label="Color" />
              <Typography bind={titleBind(bind)} prefix="title" />
              <Range
                bind={bind}
                label="Gap between title and stars"
                keys={plain('titleGap')}
                max={100}
              />
            </Panel>
          )}
          <Panel title="Star" initialOpen>
            <Color bind={bind} name="color" label="Color" />
            <Color bind={bind} name="unmarkedColor" label="Unmarked color" />
            <Range bind={bind} label="Size" keys={plain('size')} max={100} />
            <Range bind={bind} label="Gap between stars" keys={plain('gap')} max={50} />
          </Panel>
          <Panel title="Spacing">
            <BlockSpacing bind={bind} kind="Padding" />
            <BlockSpacing bind={bind} kind="Margin" />
          </Panel>
        </>
      }
    />
  );
};
