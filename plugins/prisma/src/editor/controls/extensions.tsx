import { createContext, useContext } from 'react';
import { ANIMATIONS } from '../../lib/extensions';
import type { Bind } from './bind';
import { Panel, Range, Select, Toggle } from './fields';

/** The block being edited, for the panels every block has. */
export const ExtensionBind = createContext<Bind | null>(null);

/** Responsive visibility and entrance animation (Advanced tab of every block). */
export function ExtensionPanels() {
  const bind = useContext(ExtensionBind);
  if (!bind) return null;
  const a = { ...bind.defaults, ...bind.attributes };
  // Hiding works once one of the toggles has been touched (as in the blocks it replaces).
  const visibility: Bind = {
    ...bind,
    setAttributes: (v) => bind.setAttributes({ ...v, responsiveConditions: true }),
  };
  return (
    <>
      <Panel title="Responsive visibility">
        <Toggle bind={visibility} name="hideDesktop" label="Hide on desktop" />
        <Toggle bind={visibility} name="hideTablet" label="Hide on tablet" />
        <Toggle bind={visibility} name="hideMobile" label="Hide on mobile" />
      </Panel>
      <Panel title="Animation">
        <Select
          bind={bind}
          name="animationType"
          label="Entrance animation"
          options={[
            { value: '', label: 'None' },
            ...ANIMATIONS.map((t) => ({
              value: t,
              label: t.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
            })),
          ]}
        />
        {Boolean(a.animationType) && (
          <>
            <Range
              bind={bind}
              label="Duration (ms)"
              name="animationTime"
              min={0}
              max={3000}
              step={50}
            />
            <Range
              bind={bind}
              label="Delay (ms)"
              name="animationDelay"
              min={0}
              max={3000}
              step={50}
            />
            <Select
              bind={bind}
              name="animationEasing"
              label="Easing"
              options={['ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out'].map((v) => ({
                value: v,
                label: v,
              }))}
            />
            <Toggle bind={bind} name="animationRepeat" label="Repeat when scrolling back" />
          </>
        )}
      </Panel>
    </>
  );
}
