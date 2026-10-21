/**
 * Fresco's API for other plugins (Fresco Pro), on `globalThis` under
 * `Symbol.for('cleitext.fresco')`, on the server and in the admin. They
 * build elements with the same parts as Fresco's own and register them in
 * the shared registry; they extend every element through `extensions`.
 */
import type { ComponentType } from 'react';
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
import { DEFAULT_BREAKPOINTS } from './core/model.js';
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
    DEFAULT_BREAKPOINTS,
    newId,
    videoEmbed,
  };
}

export type FrescoApi = ReturnType<typeof createApi> & {
  /** Server only: the plugin block of an element, for `ctx.blocks.register`. */
  blockFor?: unknown;
  /**
   * Admin only: the editor's parts, for other editors over Fresco's elements
   * (`ControlField` with a `ControlEnv`, the pickers, the editor’s CSS).
   */
  ui?: {
    ControlField: unknown;
    ColorPicker: unknown;
    MediaPicker: unknown;
    Svg: unknown;
    EDITOR_CSS: string;
    normalizeKit: unknown;
    /** Block editor documents to Fresco elements and back. */
    fromBlocks: unknown;
    toBlocks: unknown;
    /** Loads the icons of the icon picker (once). */
    loadIcons: () => Promise<void>;
    /**
     * The editor's dialogs instead of the browser's (Fresco 2.1): in the
     * editor they show at once; admin pages mount `Host` once.
     */
    dialogs?: {
      askText: (options: {
        title: string;
        label?: string;
        value?: string;
      }) => Promise<string | null>;
      confirmAction: (options: {
        title: string;
        text?: string;
        action: string;
        danger?: boolean;
      }) => Promise<boolean>;
      notify: (text: string, kind?: 'info' | 'success' | 'error') => void;
      Host: ComponentType;
    };
  };
};

const KEY = Symbol.for('cleitext.fresco');

const QUEUE = Symbol.for('cleitext.fresco.queue');

export function installApi(extra: Partial<FrescoApi> = {}): FrescoApi {
  const api: FrescoApi = { ...createApi(), ...extra };
  const holder = globalThis as unknown as Record<symbol, unknown>;
  holder[KEY] = api;
  // Extensions loaded before Fresco (admin entries load in parallel) wait in a queue.
  const queue = (holder[QUEUE] as ((api: FrescoApi) => void)[] | undefined) ?? [];
  holder[QUEUE] = [];
  for (const callback of queue) {
    try {
      callback(api);
    } catch (error) {
      console.error('Fresco: an extension failed to start', error);
    }
  }
  return api;
}
