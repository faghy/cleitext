import type { Inspector } from '../editor/register';
import { ContainerSettings } from './container/settings.gutenberg';
import { ImageSettings } from './image/settings.gutenberg';

/** The sidebar settings of each block, by name (editor only). */
export const SETTINGS: Record<string, Inspector> = {
  container: ContainerSettings,
  image: ImageSettings,
};
