import { MediaUpload } from '@wordpress/block-editor';
import { BaseControl, Button } from '@wordpress/components';
import type { Bind, DeviceKeys } from '../../editor/controls/bind';
import { Color, States } from '../../editor/controls/color';
import {
  Choice,
  InspectorTabs,
  Panel,
  Range,
  Select,
  Text,
  Toggle,
} from '../../editor/controls/fields';
import type { Inspector } from '../../editor/register';
import { lottieUrl } from '.';

/** `width`, `widthTablet`, `widthMob`: the block's own names by device. */
const byDevice =
  (base: string): DeviceKeys =>
  (d) =>
    `${base}${d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mob'}`;

const LIVE_ONLY = 'It plays this way on the site, not in the editor.';

export const LottieSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const file = lottieUrl(a);
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Animation" initialOpen>
            <Choice
              bind={bind}
              name="lottieSource"
              label="File source"
              options={[
                { value: 'library', label: 'Library' },
                { value: 'url', label: 'URL' },
              ]}
            />
            {a.lottieSource === 'url' ? (
              <Text
                bind={bind}
                name="lottieURl"
                label="Animation URL (JSON)"
                placeholder="https://"
              />
            ) : (
              <BaseControl __nextHasNoMarginBottom label="Lottie animation (JSON)">
                <MediaUpload
                  allowedTypes={['application/json']}
                  onSelect={(media: { id: string; url: string }) =>
                    setAttributes({
                      jsonLottie: { id: media.id, url: media.url },
                      lottieURl: media.url,
                      lottieSource: 'library',
                    })
                  }
                  render={({ open }: { open: () => void }) => (
                    <Button variant="secondary" onClick={open}>
                      {file ? `Replace ${file.split('/').pop() ?? ''}` : 'Choose a file'}
                    </Button>
                  )}
                />
              </BaseControl>
            )}
          </Panel>
          <Panel title="Playback">
            <Select
              bind={bind}
              name="playOn"
              label="Play"
              options={[
                { value: 'none', label: 'At once' },
                { value: 'hover', label: 'On hover' },
                { value: 'click', label: 'On click' },
                { value: 'scroll', label: 'When in view' },
              ]}
            />
            <Choice
              bind={bind}
              name="align"
              label="Alignment"
              options={[
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Center' },
                { value: 'right', label: 'Right' },
              ]}
            />
            <Toggle
              bind={{
                ...bind,
                // Backwards needs a loop.
                setAttributes: (v) =>
                  setAttributes(v.loop === false ? { ...v, reverse: false } : v),
              }}
              name="loop"
              label="Loop"
              help={LIVE_ONLY}
            />
            <Range bind={bind} label="Speed" name="speed" min={1} max={50} help={LIVE_ONLY} />
            {a.loop !== false && (
              <Toggle bind={bind} name="reverse" label="Reverse" help="Plays backwards." />
            )}
          </Panel>
        </>
      }
      style={
        <Panel title="Size and background" initialOpen>
          <Range bind={bind} label="Width" keys={byDevice('width')} max={1000} />
          <Range bind={bind} label="Height" keys={byDevice('height')} max={1000} />
          <States
            normal={<Color bind={bind} name="backgroundColor" label="Background" />}
            hover={<Color bind={bind} name="backgroundHColor" label="Background" />}
          />
        </Panel>
      }
    />
  );
};
