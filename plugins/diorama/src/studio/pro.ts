/**
 * How other plugins (Diorama Pro) extend Diorama's admin: lists kept on
 * `globalThis` under `Symbol.for('cleitext.diorama.admin')`. Admin entries
 * load in parallel, so an extension that comes first finds the lists ready
 * (they are created by whoever asks first) and Diorama reads them when it
 * draws its screens.
 */
import type { ComponentType, ReactNode } from 'react';
import type { Template } from '../model/templates';
import type { Device, Layer, Slide, SliderData } from '../model/types';
import type { RenderDecorator, RenderInput } from '../render/render';
import type { AdminLib } from './lib';

export interface SliderPanelExtension {
  id: string;
  /** In the language of the admin. */
  title: string;
  component: ComponentType<{
    slider: SliderData;
    device: Device;
    advanced: boolean;
    onChange: (fn: (slider: SliderData) => SliderData) => void;
  }>;
}

export interface DioramaAdminApi {
  version: 1;
  /** More sections of the Slider settings (e.g. a carousel's, a popup's triggers). */
  sliderPanels: SliderPanelExtension[];
  /** More ready-made sliders in the gallery (e.g. Diorama Pro's library). */
  templates: Template[];
  /**
   * Whether a new slider may be made: Diorama asks the server; an extension
   * can answer first (e.g. while its license is being checked).
   */
  canCreate: ((count: number) => boolean | undefined)[];
  /** The text of the invitation to Diorama Pro; an extension may replace it. */
  invitation?: { title: string; text: string; action: string; url: string };
  /** Diorama 1.1: more sections of a layer's tab (the Motion tab when `tab` is not given). */
  layerPanels: LayerPanelExtension[];
  /** Diorama 1.1: more sections of the Slide settings. */
  slidePanels: SlidePanelExtension[];
  /** Diorama 1.1: panels under the canvas (e.g. a timeline of the slide's layers). */
  canvasPanels: CanvasPanelExtension[];
  /** Diorama 1.1: what the Preview adds to the slider, as the server's extensions do on pages. */
  preview: {
    decorators: ((input: RenderInput) => RenderDecorator | undefined)[];
    renderers: ((input: RenderInput) => ReactNode | undefined)[];
    /** Addresses of scripts and style sheets loaded in the preview's frame before Diorama's runtime. */
    scripts: string[];
    styles: string[];
  };
  /** Diorama 1.1: Diorama's own components and helpers, set when its admin loads. */
  lib?: AdminLib;
}

export interface LayerPanelExtension {
  id: string;
  title: string;
  tab?: 'content' | 'style' | 'motion';
  component: ComponentType<{
    layer: Layer;
    slider: SliderData;
    device: Device;
    advanced: boolean;
    onChange: (fn: (layer: Layer) => Layer, group?: string) => void;
  }>;
}

export interface SlidePanelExtension {
  id: string;
  title: string;
  component: ComponentType<{
    slide: Slide;
    slider: SliderData;
    advanced: boolean;
    onChange: (fn: (slide: Slide) => Slide, group?: string) => void;
  }>;
}

export interface CanvasPanelExtension {
  id: string;
  title: string;
  /** Shown only with the Advanced switch on. */
  advancedOnly?: boolean;
  component: ComponentType<{
    slider: SliderData;
    slideIndex: number;
    selected: string | null;
    device: Device;
    advanced: boolean;
    onSelect: (id: string | null) => void;
    /** Changes saved in the history; `group` merges a drag's steps into one undo. */
    onChange: (fn: (slider: SliderData) => SliderData, group?: string) => void;
    /** Plays the slide's motion on the canvas. */
    onPlay: () => void;
  }>;
}

const KEY = Symbol.for('cleitext.diorama.admin');

export function proAdmin(): DioramaAdminApi {
  const holder = globalThis as unknown as Record<symbol, DioramaAdminApi | undefined>;
  holder[KEY] ??= { version: 1, sliderPanels: [], templates: [], canCreate: [] } as never;
  const api = holder[KEY]!;
  // Lists of Diorama 1.1, also when an older extension made the holder first.
  api.layerPanels ??= [];
  api.slidePanels ??= [];
  api.canvasPanels ??= [];
  api.preview ??= { decorators: [], renderers: [], scripts: [], styles: [] };
  return api;
}
