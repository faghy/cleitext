#!/usr/bin/env node
/**
 * Builds src/public/icons.json from Font Awesome Free (icons: CC BY 4.0):
 * `{ "solid": { "star": [width, height, "path"] }, "regular": …, "brands": … }`.
 * Run after updating @fortawesome/fontawesome-free.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const root = dirname(require.resolve('@fortawesome/fontawesome-free/package.json'));
const out = {};
for (const set of ['solid', 'regular', 'brands']) {
  out[set] = {};
  const dir = join(root, 'svgs', set);
  for (const file of readdirSync(dir).sort()) {
    const svg = readFileSync(join(dir, file), 'utf8');
    const box = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1].split(/\s+/).map(Number);
    const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
    if (!box || paths.length === 0) continue;
    out[set][file.replace(/\.svg$/, '')] = [box[2], box[3], paths.join(' ')];
  }
}
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
writeFileSync(
  join(here, '..', 'src', 'public', 'icons.json'),
  JSON.stringify({ source: `Font Awesome Free ${version} (CC BY 4.0)`, ...out }),
);
console.log(
  `icons.json: ${Object.values(out).reduce((n, s) => n + Object.keys(s).length, 0)} icons`,
);
