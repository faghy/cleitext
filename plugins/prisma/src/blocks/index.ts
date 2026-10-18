import type { PrismaBlock } from '../lib/types';
import { button, buttons } from './buttons';
import { container } from './container';
import { heading } from './heading';
import { image } from './image';
import { infoBox } from './info-box';

/** Every Prisma block, in the inserter's order. */
export const BLOCKS: PrismaBlock[] = [container, heading, image, infoBox, buttons, button];
