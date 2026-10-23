/** The elements of Fresco (free). Fresco Pro registers its own in the same registry. */
import { registerElement } from '../core/registry.js';
import type { ElementDefinition } from '../core/model.js';
import { button, divider, heading, image, spacer, text } from './basic.js';
import { ATOMIC_ELEMENTS } from './atomic.js';
import { componentInstance } from './component.js';
import { floatingButtons, linkInBio } from './contact.js';
import { container } from './container.js';
import { navMenu } from './menu.js';
import { pluginBlock } from './plugin-block.js';
import { icon, iconBox, imageBox, video } from './general.js';
import { accordionWidget, tabs, toggleWidget } from './nested.js';
import {
  alert,
  audio,
  counter,
  gallery,
  googleMaps,
  html,
  iconList,
  imageCarousel,
  menuAnchor,
  progress,
  socialIcons,
  starRating,
  testimonial,
  textPath,
} from './widgets.js';

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
  iconList,
  counter,
  progress,
  testimonial,
  tabs,
  accordionWidget,
  toggleWidget,
  socialIcons,
  floatingButtons,
  linkInBio,
  alert,
  starRating,
  html,
  menuAnchor,
  googleMaps,
  textPath,
  imageCarousel,
  gallery,
  audio,
  navMenu,
  pluginBlock,
  ...ATOMIC_ELEMENTS,
  componentInstance,
];

export function registerFreeElements(): void {
  for (const element of FREE_ELEMENTS) registerElement(element);
}
