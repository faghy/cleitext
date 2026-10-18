import type { Inspector } from '../editor/register';
import { ButtonSettings, ButtonsSettings } from './buttons/settings.gutenberg';
import { ContainerSettings } from './container/settings.gutenberg';
import { GallerySettings } from './gallery/settings.gutenberg';
import { HeadingSettings } from './heading/settings.gutenberg';
import { ImageSettings } from './image/settings.gutenberg';
import { InfoBoxSettings } from './info-box/settings.gutenberg';

/** The sidebar settings of each block, by name (editor only). */
export const SETTINGS: Record<string, Inspector> = {
  buttons: ButtonsSettings,
  button: ButtonSettings,
  container: ContainerSettings,
  gallery: GallerySettings,
  heading: HeadingSettings,
  image: ImageSettings,
  'info-box': InfoBoxSettings,
};
