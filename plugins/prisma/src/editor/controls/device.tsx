import { Button, Dropdown, MenuGroup, MenuItem } from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { desktop, mobile, tablet } from '@wordpress/icons';
import type { BaseDevice as Device } from '@cleitext/design';

type DeviceType = 'Desktop' | 'Tablet' | 'Mobile';

const TO_DEVICE: Record<DeviceType, Device> = {
  Desktop: 'desktop',
  Tablet: 'tablet',
  Mobile: 'mobile',
};
const ICONS = { desktop, tablet, mobile };
const LABELS: Record<Device, string> = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' };

/** The editor's preview device (`cleitext/editor`), which responsive settings edit. */
export function useDevice(): [Device, (device: Device) => void] {
  const type = useSelect((select) => {
    const store = (select as (name: string) => { getDeviceType?(): DeviceType } | undefined)(
      'cleitext/editor',
    );
    return store?.getDeviceType?.() ?? 'Desktop';
  }, []);
  const dispatch = useDispatch('cleitext/editor') as { setDeviceType?(type: DeviceType): void };
  return [
    TO_DEVICE[type],
    (device) =>
      dispatch.setDeviceType?.(
        device === 'desktop' ? 'Desktop' : device === 'tablet' ? 'Tablet' : 'Mobile',
      ),
  ];
}

/** The device icon next to a responsive setting: the preview switches with it. */
export function DeviceSwitch() {
  const [device, setDevice] = useDevice();
  return (
    <Dropdown
      className="pr-device"
      popoverProps={{ placement: 'bottom-start' }}
      renderToggle={({ isOpen, onToggle }) => (
        <Button
          size="small"
          icon={ICONS[device]}
          label={`Responsive: ${LABELS[device]}`}
          aria-expanded={isOpen}
          onClick={onToggle}
          className="pr-device__toggle"
        />
      )}
      renderContent={({ onClose }) => (
        <MenuGroup>
          {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
            <MenuItem
              key={d}
              icon={ICONS[d]}
              isSelected={d === device}
              onClick={() => {
                setDevice(d);
                onClose();
              }}
            >
              {LABELS[d]}
            </MenuItem>
          ))}
        </MenuGroup>
      )}
    />
  );
}
