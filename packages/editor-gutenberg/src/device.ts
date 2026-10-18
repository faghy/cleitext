import { createReduxStore, register, select } from '@wordpress/data';

/** Devices of the canvas preview, as WordPress names them. */
export type DeviceType = 'Desktop' | 'Tablet' | 'Mobile';

/** Canvas widths of the preview (WordPress's own). */
export const DEVICE_WIDTHS: Record<DeviceType, string> = {
  Desktop: '100%',
  Tablet: '780px',
  Mobile: '360px',
};

interface State {
  deviceType: DeviceType;
}

/**
 * The editor's preview device (plugin API 1.23): `cleitext/editor`, read
 * with `select('cleitext/editor').getDeviceType()` and changed with
 * `dispatch('cleitext/editor').setDeviceType('Tablet')`. Responsive settings
 * of blocks follow it, and the canvas takes the device's width, so its
 * media queries apply as on the site.
 */
export const editorStore = createReduxStore('cleitext/editor', {
  reducer(
    state: State = { deviceType: 'Desktop' },
    action: { type: string; deviceType?: DeviceType },
  ) {
    if (action.type === 'SET_DEVICE_TYPE' && action.deviceType) {
      return { ...state, deviceType: action.deviceType };
    }
    return state;
  },
  actions: {
    setDeviceType(deviceType: DeviceType) {
      return { type: 'SET_DEVICE_TYPE', deviceType };
    },
  },
  selectors: {
    getDeviceType(state: State): DeviceType {
      return state.deviceType;
    },
  },
});

/** Registered once, on the default registry (blocks and plugins read it there). */
export function registerEditorStore(): void {
  if (!(select as unknown as (name: string) => unknown)('cleitext/editor')) register(editorStore);
}
