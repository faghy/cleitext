/**
 * How other plugins (Diorama Pro) extend Diorama on the server: through a
 * set of lists kept on `globalThis` under `Symbol.for('cleitext.diorama')`,
 * set up again whenever plugins reload. Diorama Pro requires Diorama, so it
 * loads after it and finds the API in its own `setup`. A failing extension
 * is logged and left out: it never breaks a page or the editor.
 */
import type { BlockLoadContext } from '@cleitext/plugin-sdk';
import type { ReactNode } from 'react';
import { BREAKPOINT, DESIGN_WIDTH, EASINGS } from './model/presets';
import { BASE_CSS } from './render/base-css';
import { layerDeclarations, sliderCss } from './render/css';
import type { PostItem } from './model/posts';
import type { SliderData, SliderRecord } from './model/types';
import {
  LayerView,
  SlideView,
  SliderView,
  type RenderDecorator,
  type RenderInput,
  type RenderMedia,
} from './render/render';
import { stringsFor } from './render/strings';

/** Sliders a site may have without Diorama Pro. */
export const FREE_SLIDERS = 1;

/** A content source besides the slides written by hand and the latest posts. */
export interface SourceProvider {
  /** Stored as `ext.source` = `{ kind: id, … }` by the plugin's editor panel. */
  id: string;
  /** Items to fill the template slide with, as the latest posts are (title, excerpt, link, picture…). */
  load(slider: SliderRecord, context: BlockLoadContext): Promise<PostItem[]>;
}

export interface DioramaServerApi {
  version: 1;
  /**
   * How many sliders a site may have: the largest answer wins, `null` means
   * "no opinion". Diorama answers 1; Diorama Pro, with a valid license,
   * `Infinity`. Sliders already made always keep working and stay editable.
   */
  sliderLimit: ((siteId: string) => number | null | Promise<number | null>)[];
  /** Content sources (`ext.source.kind`), e.g. a shop's products. */
  sources: SourceProvider[];
  /** A slider before it is drawn on a page (e.g. scheduled slides left out). */
  beforeRender: ((
    slider: SliderData,
    context: { siteId: string; locale: string },
  ) => SliderData | Promise<SliderData>)[];
  /**
   * Draws a slider instead of Diorama (e.g. a carousel or a popup kept in
   * `ext`): the first answer that is not `undefined` is used.
   */
  renderers: ((input: RenderInput) => ReactNode | undefined)[];
  /** Media ids a slider uses in its `ext` data, preloaded for rendering. */
  media: ((slider: SliderData) => string[])[];
  /** The address of the Diorama Pro page shown in the invitation. */
  upgradeUrl: string;
  /**
   * Diorama 1.1: changes to the markup of every slider (classes, attributes,
   * CSS, global layers, thumbnails), asked before `renderers`; their answers
   * are merged into `input.decorate`.
   */
  decorators: ((input: RenderInput) => RenderDecorator | undefined)[];
  /** Diorama 1.1: the site's sliders, read only (e.g. popups placed on every page). */
  sliders: DioramaSliders;
  /** Diorama 1.1: Diorama's own drawing, for renderers that reuse it (nothing is bundled twice). */
  lib: DioramaLib;
}

export interface DioramaSliders {
  list(siteId: string): Promise<SliderRecord[]>;
  get(siteId: string, idOrAlias: string): Promise<SliderRecord | null>;
}

export const LIB = {
  SliderView,
  SlideView,
  LayerView,
  sliderCss,
  layerDeclarations,
  BASE_CSS,
  stringsFor,
  BREAKPOINT,
  DESIGN_WIDTH,
  EASINGS,
};
export type DioramaLib = typeof LIB;

const KEY = Symbol.for('cleitext.diorama');

export function installServerApi(sliders: DioramaSliders): DioramaServerApi {
  const api: DioramaServerApi = {
    version: 1,
    sliderLimit: [() => FREE_SLIDERS],
    sources: [],
    beforeRender: [],
    renderers: [],
    media: [],
    upgradeUrl: 'https://cleitext.com/plugins/diorama-pro',
    decorators: [],
    sliders,
    lib: LIB,
  };
  (globalThis as unknown as Record<symbol, unknown>)[KEY] = api;
  return api;
}

export function serverApi(): DioramaServerApi | undefined {
  return (globalThis as unknown as Record<symbol, DioramaServerApi | undefined>)[KEY];
}

/** The number of sliders the site may have (at least the free one). */
export async function sliderLimit(
  api: DioramaServerApi,
  siteId: string,
  log?: (message: string) => void,
): Promise<number> {
  let limit = FREE_SLIDERS;
  for (const provider of api.sliderLimit) {
    try {
      const value = await provider(siteId);
      if (typeof value === 'number' && !Number.isNaN(value) && value > limit) limit = value;
    } catch (error) {
      log?.(`A slider limit provider failed: ${String(error)}`);
    }
  }
  return limit;
}

export type { RenderDecorator, RenderInput, RenderMedia };
