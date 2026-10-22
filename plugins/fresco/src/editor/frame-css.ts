/**
 * The editor's canvas shows the page as the site does, with a few changes
 * made to the CSS that goes into it:
 * - the page settings' rules for the content column are aimed at the theme's
 *   own element (on the site it holds the elements; in the canvas, Fresco's
 *   wrappers, which take no room of their own);
 * - elements hidden on a device stay in the canvas, faded, as in Elementor.
 */
import { activeDevices, type Breakpoints, type Device } from '../core/model.js';
import { PAGE_CONTENT } from '../core/page-css.js';

/** The attribute marking the theme's content element in the canvas. */
export const CONTENT_ATTRIBUTE = 'data-fre-content';

/** The page settings' CSS, with the content column found in the canvas. */
export function editorPageCss(css: string): string {
  return css.split(PAGE_CONTENT).join(`[${CONTENT_ATTRIBUTE}]`);
}

/** Elements hidden on a device: faded in the canvas instead of gone. */
export function editorKitCss(css: string): string {
  return css.replace(
    /\.fr-hide-([\w-]+)\{display:none!important\}/g,
    '.fr-hide-$1{opacity:.45;outline:1px dashed #818a96;outline-offset:-1px;background-image:repeating-linear-gradient(135deg,transparent 0 8px,rgba(129,138,150,.12) 8px 16px)}',
  );
}

/** Whether an element's settings hide it on a device (Advanced → Responsive). */
export function hiddenOn(attrs: Record<string, unknown>, device: Device): boolean {
  return attrs[`_hide_${device}`] === true;
}

/**
 * The device after `device` for Ctrl+Shift+M: every active device in turn,
 * in the order of the top bar, then back to the first.
 */
export function nextDevice(device: Device, breakpoints: Breakpoints): Device {
  const devices = activeDevices(breakpoints);
  const index = devices.indexOf(device);
  return devices[(index + 1) % devices.length] ?? 'desktop';
}
