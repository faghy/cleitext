/** The elements of Fresco (free). Fresco Pro registers its own in the same registry. */
import { registerElement } from '../core/registry.js';
import type { ElementDefinition } from '../core/model.js';
import { button, divider, heading, image, spacer, text } from './basic.js';
import { container } from './container.js';
import { icon, iconBox, imageBox, video } from './general.js';

export const FREE_ELEMENTS: ElementDefinition[] = [
  container,
  heading,
  text,
  image,
  button,
  video,
  divider,
  spacer,
  icon,
  iconBox,
  imageBox,
];

export function registerFreeElements(): void {
  for (const element of FREE_ELEMENTS) registerElement(element);
}
