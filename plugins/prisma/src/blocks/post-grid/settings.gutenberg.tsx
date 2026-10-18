import type { Bind } from '../../editor/controls/bind';
import { Color, States } from '../../editor/controls/color';
import {
  Choice,
  InspectorTabs,
  Panel,
  Range,
  Select,
  Spacing,
  Text,
  Toggle,
} from '../../editor/controls/fields';
import type { Inspector } from '../../editor/register';
import {
  BoxStyle,
  Columns,
  ContentPanel,
  ImagePanel,
  LayoutStyle,
  PartsStyle,
  QueryFields,
  QueryOrder,
  ReadMorePanel,
} from './settings-shared';

const side = (s: string) => s[0]!.toUpperCase() + s.slice(1);

export const PostGridSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const masonry = a.post_type === 'masonry';
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="General" initialOpen>
            <QueryFields bind={bind} a={a} />
            <QueryOrder bind={bind} a={a} />
            <Columns bind={bind} />
            {!masonry && <Toggle bind={bind} name="equalHeight" label="Equal Height" />}
            <Toggle bind={bind} name="postPagination" label="Post Pagination" />
            {Boolean(a.postPagination) && (
              <Range bind={bind} name="pageLimit" label="Page Limit" min={1} max={100} />
            )}
            <Text bind={bind} name="postDisplaytext" label="Display Message" />
          </Panel>
          {Boolean(a.postPagination) && (
            <Panel title="Pagination">
              <Choice
                bind={bind}
                name="paginationAlignment"
                label="Pagination Alignment"
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'center', label: 'Center' },
                  { value: 'right', label: 'Right' },
                ]}
              />
              <Select
                bind={bind}
                name="paginationLayout"
                label="Pagination Layout"
                options={[
                  { value: 'filled', label: 'Filled' },
                  { value: 'border', label: 'Border' },
                ]}
              />
              <Text bind={bind} name="paginationPrevText" label="Previous Text" />
              <Text bind={bind} name="paginationNextText" label="Next Text" />
            </Panel>
          )}
          <ImagePanel bind={bind} a={a} ratio />
          {!masonry && Boolean(a.displayPostImage) && (
            <Panel title="Image Alignment">
              <Toggle bind={bind} name="isLeftToRightLayout" label="Enable Left Right Position" />
              {Boolean(a.isLeftToRightLayout) && (
                <>
                  <Choice
                    bind={bind}
                    name="wrapperAlign"
                    label="Image Alignment"
                    options={[
                      { value: 'row', label: 'Left' },
                      { value: 'row-reverse', label: 'Right' },
                    ]}
                  />
                  <Choice
                    bind={bind}
                    name="wrapperAlignPosition"
                    label="Content Position"
                    options={[
                      { value: 'flex-start', label: 'Top' },
                      { value: 'center', label: 'Center' },
                      { value: 'flex-end', label: 'Bottom' },
                    ]}
                  />
                </>
              )}
            </Panel>
          )}
          <ContentPanel bind={bind} a={a} />
          <ReadMorePanel bind={bind} a={a} inline={!masonry} />
        </>
      }
      style={
        <>
          <LayoutStyle bind={bind} a={a} />
          {Boolean(a.isLeftToRightLayout) && (
            <Panel title="Wrapper">
              <Spacing
                bind={bind}
                label="Wrapper Padding"
                keys={(s, d) =>
                  `wrapper${side(s)}Padding${d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile'}`
                }
                unitKeys={(d) =>
                  d === 'desktop' ? 'wrapperPaddingUnit' : `wrapperPaddingUnit${side(d)}`
                }
                linkName="wrapperPaddingLink"
                min={0}
              />
            </Panel>
          )}
          <PartsStyle bind={bind} a={a} />
          {Boolean(a.postPagination) && (
            <Panel title="Pagination">
              <States
                normal={
                  <>
                    <Color bind={bind} name="paginationColor" label="Text Color" />
                    {a.paginationLayout === 'filled' ? (
                      <Color bind={bind} name="paginationBgColor" label="Background Color" />
                    ) : (
                      <Color bind={bind} name="paginationBorderColor" label="Border Color" />
                    )}
                  </>
                }
                hover={
                  <>
                    <Color bind={bind} name="paginationActiveColor" label="Text Color" />
                    {a.paginationLayout === 'filled' ? (
                      <Color bind={bind} name="paginationBgActiveColor" label="Background Color" />
                    ) : (
                      <Color bind={bind} name="paginationBorderActiveColor" label="Border Color" />
                    )}
                  </>
                }
              />
              {a.paginationLayout !== 'filled' && (
                <>
                  <Range bind={bind} name="paginationBorderSize" label="Border Size" max={20} />
                  <Range
                    bind={bind}
                    name="paginationBorderRadius"
                    label="Border Radius"
                    max={100}
                  />
                </>
              )}
              <Range
                bind={bind}
                name="paginationSpacing"
                unitName="paginationSpacingUnit"
                units={['px', 'em']}
                label="Spacing"
                max={200}
              />
            </Panel>
          )}
          <BoxStyle bind={bind} />
        </>
      }
    />
  );
};
