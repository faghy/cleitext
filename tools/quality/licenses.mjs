// Checks that every production dependency has a license compatible with
// GPL-2.0-or-later (RNF-17). Apache-2.0 and MPL-2.0 are compatible through
// GPL-3.0, which "or later" allows.
//
//   pnpm check:licenses
import { execFileSync } from 'node:child_process';

const ALLOWED = new Set([
  '0BSD',
  'Apache-2.0',
  'Apache-2.0 WITH LLVM-exception',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'GPL-2.0-or-later',
  'GPL-3.0-or-later',
  'ISC',
  'LGPL-2.1-or-later',
  'LGPL-3.0-or-later',
  'MIT',
  'MIT-0',
  'MPL-2.0',
  'Python-2.0',
  'Unlicense',
  'Zlib',
]);

/** "(MIT OR Apache-2.0)" passes when any alternative is allowed. */
function allowed(license) {
  const expression = license.replace(/^\(|\)$/g, '').trim();
  if (ALLOWED.has(expression)) return true;
  if (expression.includes(' OR ')) return expression.split(' OR ').some((part) => allowed(part));
  if (expression.includes(' AND ')) return expression.split(' AND ').every((part) => allowed(part));
  return false;
}

const report = JSON.parse(
  execFileSync('pnpm', ['-r', 'licenses', 'list', '--prod', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }),
);
let total = 0;
const refused = [];
for (const [license, packages] of Object.entries(report)) {
  total += packages.length;
  if (allowed(license)) continue;
  for (const pkg of packages) refused.push(`${pkg.name}@${pkg.versions.join(', ')}: ${license}`);
}

if (refused.length > 0) {
  console.error(
    `Dependencies with licenses not known to be GPL-compatible:\n  ${refused.join('\n  ')}`,
  );
  process.exit(1);
}
console.log(`${total} production dependencies, all with GPL-compatible licenses.`);
