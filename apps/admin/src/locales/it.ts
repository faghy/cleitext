import type { Messages } from '@cleitext/admin-sdk';
import { itAdmin } from './it-admin';
import { itContent } from './it-content';
import { itGeneral } from './it-general';
import { itSites } from './it-sites';

/** Italian texts of the admin, by English text. */
export const it: Messages = { ...itGeneral, ...itContent, ...itSites, ...itAdmin };
