// Copies the public folder (the loader and the vendored jQuery, with its
// license) into dist/public as it is: `cleitext plugin:build` would bundle
// and minify the scripts of a src/public folder, and jQuery must keep its
// own build and license header.
import { cp, rm } from 'node:fs/promises';

const from = new URL('../public/', import.meta.url);
const to = new URL('../dist/public/', import.meta.url);
await rm(to, { recursive: true, force: true });
await cp(from, to, { recursive: true });
