// Writes src/divi/fa-codes.ts: Font Awesome's code points (as Divi keeps its
// "fa" icons) → the free icons' names, from Font Awesome's metadata.
// node packages/blocks/scripts/divi-fa-codes.mjs (from the repository root).
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(join(process.cwd(), 'plugins/fresco/package.json'));
const root = dirname(require.resolve('@fortawesome/fontawesome-free/package.json'));
const icons = JSON.parse(readFileSync(join(root, 'metadata/icon-families.json'), 'utf8'));
const entries = new Map();
for (const [name, icon] of Object.entries(icons)) {
  const free = (icon.familyStylesByLicense?.free ?? []).filter((s) => s.family === 'classic');
  if (free.length === 0) continue;
  const styles = new Set(free.map((s) => s.style));
  const flag = styles.has('brands') ? '*' : styles.has('regular') ? '+' : '';
  const codes = [icon.unicode, ...(icon.aliases?.unicodes?.primary ?? [])];
  for (const code of codes) {
    if (code && !entries.has(code)) entries.set(code, `${name}${flag}`);
  }
}
const list = [...entries].sort(([a], [b]) => a.localeCompare(b)).map(([c, n]) => `${c} ${n}`);
const chunks = [];
for (let i = 0; i < list.length; i += 8) chunks.push(`  '${list.slice(i, i + 8).join(',')}',`);
writeFileSync(
  'packages/blocks/src/divi/fa-codes.ts',
  `/**
 * Font Awesome's code points → the names of its free icons (Font Awesome
 * Free, CC BY 4.0), as Divi keeps its "fa" icons (\`&#xf095;||fa||900\`).
 * \`*\`: a brand icon; \`+\`: it also has a regular (outlined) style.
 * Written by \`packages/blocks/scripts/divi-fa-codes.mjs\`.
 */
export const FA_CODES: readonly string[] = [
${chunks.join('\n')}
];
`,
);
console.log(entries.size, 'codes');
