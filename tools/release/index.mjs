// Builds a release for production (docs/DEPLOYMENT.md): a folder and a .tar.gz
// with the compiled server, CLI, admin and official plugins, production
// dependencies only. The build never runs on the server.
//
//   pnpm release            → release/cleitext-<version>/ and release/cleitext-<version>.tar.gz
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
/** The version is in the archive names only: inside, the folder is always `cleitext`. */
const name = `cleitext-${version}`;
const folder = 'cleitext';
const out = join(root, 'release', folder);
const pnpm = (...args) => execFileSync('pnpm', args, { cwd: root, stdio: 'inherit' });

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

console.log('[release] building…');
pnpm('build');

console.log('[release] server and CLI with production dependencies…');
// A flat node_modules, as npm makes it: no symbolic links, which file managers of
// hosting panels may not recreate when unpacking the .zip.
const flat = '--config.node-linker=hoisted';
pnpm(flat, '--filter', '@cleitext/server', 'deploy', '--prod', join(out, 'apps/server'));
pnpm(flat, '--filter', '@cleitext/cli', 'deploy', '--prod', join(out, 'packages/cli'));
for (const dir of ['apps/server', 'packages/cli']) {
  for (const file of ['pnpm-lock.yaml', 'pnpm-workspace.yaml'])
    await rm(join(out, dir, file), { force: true });
  // Command shortcuts of the dependencies: links, and not used at runtime.
  await rm(join(out, dir, 'node_modules/.bin'), { recursive: true, force: true });
}

console.log('[release] admin and official plugins…');
await cp(join(root, 'apps/admin/dist'), join(out, 'apps/admin/dist'), { recursive: true });
/**
 * Official plugins. Every one gets its own package (for the catalog and for
 * Upload Plugin); those not in SEPARATE are also in the base package.
 */
const SEPARATE = [
  'multilingual',
  'privacy',
  'analytics',
  'showcase',
  'wordpress-importer',
  'maps',
  'click-to-chat',
  'edge-cache',
  'store',
  'fresco',
  'shop',
  'widgets',
  'prisma',
  'vetta',
  'classic-editor',
  'editor-convert',
  'layout-import',
  'maintenance',
  'kross-booking',
  'captcha',
  'social-feed',
  'antispam',
  'diorama',
  'agenda',
];
const separate = [];
for (const slug of await readdir(join(root, 'plugins'))) {
  const source = join(root, 'plugins', slug);
  if (!existsSync(join(source, 'cleitext.plugin.json'))) continue;
  const own = join(root, 'release', `plugin-${slug}`, slug);
  await rm(dirname(own), { recursive: true, force: true });
  separate.push(slug);
  const targets = SEPARATE.includes(slug) ? [own] : [join(out, 'plugins', slug), own];
  for (const target of targets) {
    for (const part of [
      'cleitext.plugin.json',
      'dist',
      'migrations',
      'README.md',
      'README.it.md',
    ]) {
      if (existsSync(join(source, part)))
        await cp(join(source, part), join(target, part), { recursive: true });
    }
  }
}

// Startup file for Plesk / Passenger, and the `cleitext` command.
await writeFile(
  join(out, 'app.js'),
  `// Startup file (Plesk Node.js / Passenger). Settings: environment variables, or a
// .env file next to this one (see docs/DEPLOYMENT.md).
import { existsSync } from 'node:fs';

const env = new URL('./.env', import.meta.url);
if (existsSync(env)) process.loadEnvFile(env);
process.env.NODE_ENV ??= 'production';
// No top-level await: Passenger loads this file with require().
import('./apps/server/dist/main.js').catch((error) => {
  console.error(error);
  process.exit(1);
});
`,
);
await mkdir(join(out, 'bin'), { recursive: true });
await writeFile(
  join(out, 'bin/cleitext'),
  `#!/bin/sh
# The cleitext command of this release (migrations, sites, users, plugins, backups…).
DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
export NODE_ENV="\${NODE_ENV:-production}"
export CLEITEXT_APP_ROOT="$DIR"
# Node: CLEITEXT_NODE, the PATH, or the newest LTS (even) version installed by Plesk.
NODE="\${CLEITEXT_NODE:-$(command -v node || ls -d /opt/plesk/node/*[02468]/bin/node 2>/dev/null | sort -V | tail -n 1)}"
[ -n "$NODE" ] || { echo "Node.js not found: set CLEITEXT_NODE" >&2; exit 1; }
exec "$NODE" --env-file-if-exists="$DIR/.env" "$DIR/packages/cli/dist/bin.js" "$@"
`,
);
await chmod(join(out, 'bin/cleitext'), 0o755);
// Passenger: document root (static files served by nginx) and restart file folder.
for (const dir of ['public', 'tmp']) {
  await mkdir(join(out, dir), { recursive: true });
  await writeFile(join(out, dir, '.keep'), '');
}
await writeFile(
  join(out, 'package.json'),
  `${JSON.stringify(
    {
      name: 'cleitext-release',
      version,
      private: true,
      type: 'module',
      license: 'GPL-2.0-or-later',
      engines: { node: '>=22.12' },
      scripts: { start: 'node app.js' },
    },
    null,
    2,
  )}\n`,
);
await cp(join(root, '.env.example'), join(out, '.env.example'));
for (const file of ['LICENSE', 'README.md']) await cp(join(root, file), join(out, file));
await cp(join(root, 'docs/DEPLOYMENT.md'), join(out, 'DEPLOYMENT.md')).catch(() => {});

console.log('[release] archives…');
execFileSync('tar', ['-czf', `${name}.tar.gz`, folder], {
  cwd: join(root, 'release'),
  stdio: 'inherit',
});
// The same as .zip, for panels whose file manager unpacks zip files (Plesk).
await rm(join(root, 'release', `${name}.zip`), { force: true });
const zip = (file, folder, cwd) =>
  execFileSync('python3', ['-I', join(root, 'tools/release/zip.py'), file, folder], {
    cwd,
    stdio: 'inherit',
  });
zip(`${name}.zip`, folder, join(root, 'release'));
console.log(`[release] release/${name}.tar.gz and .zip`);
const separateFiles = [];
for (const slug of separate) {
  const manifest = JSON.parse(
    await readFile(join(root, 'plugins', slug, 'cleitext.plugin.json'), 'utf8'),
  );
  const file = `cleitext-plugin-${slug}-${manifest.version}.zip`;
  separateFiles.push(file);
  await rm(join(root, 'release', file), { force: true });
  zip(join('..', file), slug, join(root, 'release', `plugin-${slug}`));
  await rm(join(root, 'release', `plugin-${slug}`), { recursive: true, force: true });
  console.log(`[release] release/${file} (upload it from Plugins)`);
}

// SHA-256 of what is published: the updater checks the archive against it.
const published = [`${name}.tar.gz`, `${name}.zip`, ...separateFiles];
const sums = [];
for (const file of published) {
  const hash = createHash('sha256')
    .update(await readFile(join(root, 'release', file)))
    .digest('hex');
  sums.push(`${hash}  ${file}`);
}
await writeFile(join(root, 'release', 'SHA256SUMS'), `${sums.join('\n')}\n`);
console.log('[release] release/SHA256SUMS');
