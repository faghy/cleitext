/**
 * The admin makes no request to font services (Google Fonts, Bunny Fonts):
 * it uses the system's fonts, and its policy (`font-src 'self' data:`)
 * allows no other origin. Themes' fonts in the block editor come from the
 * site's copies (`/_fonts`). Checks the sources and, once built, the
 * served page and stylesheets.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const SERVICES = /fonts\.googleapis\.com|fonts\.gstatic\.com|fonts\.bunny\.net/;

function files(): string[] {
  const found = [join(root, 'index.html'), join(root, 'src', 'index.css')];
  const assets = join(root, 'dist', 'assets');
  if (existsSync(join(root, 'dist', 'index.html'))) found.push(join(root, 'dist', 'index.html'));
  if (existsSync(assets)) {
    for (const name of readdirSync(assets)) {
      if (name.endsWith('.css')) found.push(join(assets, name));
    }
  }
  return found;
}

describe('admin fonts', () => {
  it('never come from Google Fonts or Bunny Fonts', () => {
    for (const file of files()) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(SERVICES);
    }
  });
});
