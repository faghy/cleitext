// Initial load of the built admin, gzipped (RNF-04): what index.html loads
// before any route runs. Gutenberg must stay out of it (lazy-loaded).
//
//   pnpm --filter @cleitext/admin build && pnpm check:bundle
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const LIMIT = 500 * 1024;
const dist = join(dirname(fileURLToPath(import.meta.url)), '../../apps/admin/dist');
const html = await readFile(join(dist, 'index.html'), 'utf8');
const files = [
  ...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="\/admin\/(assets\/[^"]+\.(?:js|css))"/g),
].map((match) => match[1]);

let total = gzipSync(html).length;
for (const file of new Set(files)) {
  const size = gzipSync(await readFile(join(dist, file))).length;
  total += size;
  console.log(`${(size / 1024).toFixed(1).padStart(8)} KB  ${file}`);
}
console.log(
  `${(total / 1024).toFixed(1).padStart(8)} KB  initial load (gzip), limit ${LIMIT / 1024} KB`,
);
if (files.some((file) => /gutenberg|block-editor/i.test(file))) {
  console.error('The block editor is part of the initial load: it must be lazy-loaded.');
  process.exit(1);
}
if (total > LIMIT) process.exit(1);
