import { createCoreRegistry } from '@cleitext/blocks';

/**
 * Block definitions known to the server: core blocks plus those of the
 * installed plugins (added when plugins load). Blocks of plugins that are
 * not installed are still accepted and preserved, just not validated.
 */
export const blockRegistry = createCoreRegistry();
