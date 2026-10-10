import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, type DatabaseClient } from '@cleitext/db';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { OperationError } from '../src/operations.js';
import { buildTheme, installTheme, listThemes, uninstallTheme } from '../src/themes.js';

const example = fileURLToPath(new URL('../../../examples/theme-plain', import.meta.url));
let owner: DatabaseClient;
let themesPath: string;

beforeAll(async () => {
  owner = createDatabase(inject('ownerUrl'), { max: 2 });
  themesPath = await mkdtemp(path.join(tmpdir(), 'cleitext-themes-'));
});

afterAll(async () => {
  await owner?.close();
  await rm(path.join(example, 'dist'), { recursive: true, force: true });
});

describe('themes', () => {
  it('builds a theme without bundling React or the SDK', async () => {
    const { manifest, output } = await buildTheme(example);
    expect(manifest.slug).toBe('plain');
    const code = await readFile(output, 'utf8');
    expect(code).toContain('globalThis.__cleitextShared["@cleitext/theme-sdk"]');
    expect(code).toContain('globalThis.__cleitextShared["react/jsx-runtime"]');
    expect(code).not.toContain('react.production');
  });

  it('installs, lists, updates and uninstalls a theme', async () => {
    const first = await installTheme({ source: example, themesPath });
    expect(first.previousVersion).toBeNull();
    expect(existsSync(path.join(themesPath, 'plain', 'dist', 'index.js'))).toBe(true);
    expect((await listThemes(themesPath)).map((t) => t.slug)).toEqual(['plain']);
    const again = await installTheme({ source: example, themesPath });
    expect(again.previousVersion).toBe('1.0.0');

    await uninstallTheme(owner.db, 'plain', themesPath);
    expect(await listThemes(themesPath)).toEqual([]);
    await expect(uninstallTheme(owner.db, 'aurora', themesPath)).rejects.toThrow(OperationError);
  });
});
