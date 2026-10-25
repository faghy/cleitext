// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IT } from '../src/admin/it';
import { stringsFor } from '../src/model/strings';

describe('Italian texts', () => {
  it('translate every text of the admin', () => {
    const dir = new URL('../src/admin/', import.meta.url);
    const files = [
      new URL('../src/admin.tsx', import.meta.url),
      ...readdirSync(dir)
        .filter((f) => f.endsWith('.tsx'))
        .map((f) => new URL(f, dir)),
    ];
    const missing: string[] = [];
    for (const file of files) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) {
        if (!(m[1]! in IT)) missing.push(m[1]!);
      }
    }
    expect(missing).toEqual([]);
  });

  it('give the visitors every text in both languages', () => {
    expect(Object.keys(stringsFor('it')).sort()).toEqual(Object.keys(stringsFor('en')).sort());
  });
});
