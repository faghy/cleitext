import type { PrismaBlock } from '../lib/types';
import { container } from './container';
import { image } from './image';

/** Every Prisma block, in the inserter's order. */
export const BLOCKS: PrismaBlock[] = [container, image];
