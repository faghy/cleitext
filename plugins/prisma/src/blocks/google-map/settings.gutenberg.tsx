import { plain, type Bind } from '../../editor/controls/bind';
import { InspectorTabs, Panel, Range, Select, Text, Toggle } from '../../editor/controls/fields';
import type { Inspector } from '../../editor/register';
import { MAP_LANGUAGES } from '.';

export const GoogleMapSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const a = { ...block.defaults, ...attributes };
  const bind: Bind = {
    attributes,
    // Satellite pictures stop at zoom 21.
    setAttributes: (v) =>
      setAttributes(v.enableSatelliteView === true && Number(a.zoom) > 21 ? { ...v, zoom: 21 } : v),
    defaults: block.defaults,
  };
  return (
    <InspectorTabs
      general={
        <Panel title="Map" initialOpen>
          <Text bind={bind} name="address" label="Address" placeholder="Type the address" />
          <Toggle bind={bind} name="enableSatelliteView" label="Satellite view" />
          <Range
            bind={bind}
            label="Zoom"
            name="zoom"
            min={1}
            max={a.enableSatelliteView ? 21 : 22}
          />
          <Range bind={bind} label="Height" keys={plain('height')} max={1000} />
          <Select
            bind={bind}
            name="language"
            label="Language"
            options={MAP_LANGUAGES.map(([value, label]) => ({ value, label }))}
          />
        </Panel>
      }
    />
  );
};
