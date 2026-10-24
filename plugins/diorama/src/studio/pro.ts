/**
 * How other plugins (Diorama Pro) extend Diorama's admin: lists kept on
 * `globalThis` under `Symbol.for('cleitext.diorama.admin')`. Admin entries
 * load in parallel, so an extension that comes first finds the lists ready
 * (they are created by whoever asks first) and Diorama reads them when it
 * draws its screens.
 */
import type { ComponentType } from 'react';
import type { Template } from '../model/templates';
import type { Device, SliderData } from '../model/types';

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
}

const KEY = Symbol.for('cleitext.diorama.admin');

export function proAdmin(): DioramaAdminApi {
  const holder = globalThis as unknown as Record<symbol, DioramaAdminApi | undefined>;
  holder[KEY] ??= { version: 1, sliderPanels: [], templates: [], canCreate: [] };
  return holder[KEY];
}
