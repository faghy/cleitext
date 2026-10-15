/**
 * Fresco's API for other plugins (Fresco Pro), on `globalThis` under
 * `Symbol.for('cleitext.fresco')`, on the server and in the admin. They
 * build elements with the same parts as Fresco's own and register them in
 * the shared registry; they extend every element through `extensions`.
 */
import { ANIMATIONS, advancedControls, ElementRoot, rootProps, UNITS } from './core/common.js';
import {
  ALIGN,
  content,
  groups,
  HEADING_TAGS,
  sizeControls,
  style,
  TEXT_ALIGN,
  textStyle,
} from './core/controls.js';
import {
  conditionMet,
  documentCss,
  elementClass,
  elementCss,
  safeColor,
  withDefaults,
} from './core/css.js';
import { controlsOf, extensions } from './core/extensions.js';
import { Icon } from './core/icons.js';
import { newId } from './core/ids.js';
import { linkProps } from './core/links.js';
import { FrImage, IMAGE_SIZES, isMedia, mediaIds } from './core/media.js';
import { getElement, listElements, registerElement, unregisterElement } from './core/registry.js';
import { plainText, sanitizeRich } from './core/sanitize.js';
import { videoEmbed } from './elements/general.js';

export const FRESCO_API_VERSION = 1;

export function createApi() {
  return {
    version: FRESCO_API_VERSION,
    registerElement,
    unregisterElement,
    getElement,
    listElements,
    controlsOf,
    extensions,
    ElementRoot,
    rootProps,
    advancedControls,
    UNITS,
    ANIMATIONS,
    controls: { content, style, groups, textStyle, sizeControls, ALIGN, TEXT_ALIGN, HEADING_TAGS },
    Icon,
    FrImage,
    IMAGE_SIZES,
    isMedia,
    mediaIds,
    linkProps,
    plainText,
    sanitizeRich,
    safeColor,
    withDefaults,
    conditionMet,
    elementClass,
    elementCss,
    documentCss,
    newId,
    videoEmbed,
  };
}

export type FrescoApi = ReturnType<typeof createApi> & {
  /** Server only: the plugin block of an element, for `ctx.blocks.register`. */
  blockFor?: unknown;
};

const KEY = Symbol.for('cleitext.fresco');

export function installApi(extra: Partial<FrescoApi> = {}): FrescoApi {
  const api: FrescoApi = { ...createApi(), ...extra };
  (globalThis as unknown as Record<symbol, FrescoApi>)[KEY] = api;
  return api;
}
