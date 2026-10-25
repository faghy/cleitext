import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SPECTRA_CLASSES } from '../src/css-classes';

const blocks = fileURLToPath(new URL('../src/blocks', import.meta.url));
const source = readdirSync(blocks, { recursive: true })
  .map(String)
  .filter((file) => /\.tsx?$/.test(file))
  .map((file) => readFileSync(join(blocks, file), 'utf8'))
  .join('\n');

describe('Spectra’s class names', () => {
  it('map to class names Prisma renders', () => {
    expect(SPECTRA_CLASSES['uagb-ifb-separator']).toBe('pr-info-box__separator');
    for (const [from, to] of Object.entries(SPECTRA_CLASSES)) {
      expect(from).toMatch(/^(wp-block-)?uagb-[\w-]+$/);
      // Written whole, or as a prefix completed by a value (`pr-image--align-${…}`).
      const written =
        source.includes(to) ||
        [...source.matchAll(/pr-[\w-]*?(?:--|__|-)(?=\$\{)/g)].some((m) => to.startsWith(m[0]));
      expect(written, to).toBe(true);
    }
  });
});
