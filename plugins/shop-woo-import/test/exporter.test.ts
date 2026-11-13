import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXPORTER_PHP } from '../src/exporter';

describe('the WordPress exporter', () => {
  it('offered by the admin page is the one in exporter/', () => {
    const file = readFileSync(
      new URL('../exporter/cleitext-woo-export.php', import.meta.url),
      'utf8',
    );
    expect(EXPORTER_PHP).toBe(file);
  });
});
