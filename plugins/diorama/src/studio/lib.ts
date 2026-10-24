/**
 * What Diorama's admin shares with its extensions (Diorama 1.1), so that
 * Diorama Pro draws with the same components and builds sliders with the
 * same defaults, without bundling them again.
 */
import {
  contentBox,
  defaultLayer,
  defaultMotion,
  defaultSlide,
  defaultSlider,
  newId,
  normalizeSlider,
} from '../model/normalize';
import { BREAKPOINT, EASINGS, ICONS, MOTIONS } from '../model/presets';
import { BASE_CSS } from '../render/base-css';
import { sliderCss } from '../render/css';
import { LayerView, mergeDecorators, SlideView, SliderView } from '../render/render';
import { stringsFor } from '../render/strings';
import {
  Btn,
  ColorInput,
  Dialog,
  Field,
  ICON,
  IconButton,
  NumberInput,
  Segmented,
  Svg,
  Toggle,
} from './ui';

export const ADMIN_LIB = {
  SliderView,
  SlideView,
  LayerView,
  mergeDecorators,
  sliderCss,
  BASE_CSS,
  stringsFor,
  model: {
    contentBox,
    defaultLayer,
    defaultMotion,
    defaultSlide,
    defaultSlider,
    newId,
    normalizeSlider,
  },
  presets: { BREAKPOINT, EASINGS, ICONS, MOTIONS },
  ui: { Btn, ColorInput, Dialog, Field, ICON, IconButton, NumberInput, Segmented, Svg, Toggle },
};

export type AdminLib = typeof ADMIN_LIB;
