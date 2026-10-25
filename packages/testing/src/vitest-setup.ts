import { afterAll } from 'vitest';
import { enterFileTemp } from './temp.js';

/**
 * Vitest `setupFiles` entry: each test file writes its temporary files in a
 * folder of its own, removed when the file ends (after its own `afterAll`
 * hooks, which run first), even when one of its tests failed.
 */
const leave = enterFileTemp();
afterAll(leave);
