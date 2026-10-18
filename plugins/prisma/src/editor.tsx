import { BLOCKS } from './blocks';
import { SETTINGS } from './blocks/settings';
import { normalizeGlobals } from './lib/globals';
import { registerPrismaBlocks, setGlobals } from './editor/register';
import { addEditorStyles } from './editor/styles';

/** Prisma's blocks in the block editor (plugin API 1.23). */
addEditorStyles();
// The site's defaults; editors who cannot read settings keep the built-in ones.
void fetch('/api/v1/plugins/prisma/settings', { credentials: 'same-origin' })
  .then((res) => (res.ok ? res.json() : null))
  .then((settings: Record<string, unknown> | null) => setGlobals(normalizeGlobals(settings)))
  .catch(() => {});
registerPrismaBlocks(BLOCKS, SETTINGS);
