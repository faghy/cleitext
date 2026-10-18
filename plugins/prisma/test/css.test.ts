import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
// @ts-expect-error a plain ES module of the build scripts
import { buildCss } from '../scripts/css.mjs';

it('prisma.css is built from the current styles (run `pnpm css`)', () => {
  expect(readFileSync(new URL('../src/public/prisma.css', import.meta.url), 'utf8')).toBe(
    buildCss(),
  );
});
