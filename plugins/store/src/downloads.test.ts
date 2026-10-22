import { describe, expect, it } from 'vitest';
import { compareVersions, isZip, latestOf, parseServerReport, safeFilename } from './downloads';

const server = 'a'.repeat(64);
const good = {
  product: 'cleitext-toolkit',
  server,
  version: '0.6.0',
  panel: 'plesk',
  panelVersion: '18.0.81',
  installations: 3,
};

describe('server reports', () => {
  it('keeps the known fields only', () => {
    expect(
      parseServerReport({ ...good, domain: 'example.com', ip: '1.2.3.4', email: 'a@b.c' }),
    ).toEqual({ forget: false, ...good });
  });

  it('accepts the forget form', () => {
    expect(parseServerReport({ product: 'cleitext-toolkit', server, forget: true })).toEqual({
      forget: true,
      product: 'cleitext-toolkit',
      server,
    });
  });

  it('refuses invalid fields', () => {
    for (const bad of [
      { server: 'A'.repeat(64) },
      { server: 'abc' },
      { product: 'X' },
      { version: 'latest' },
      { panel: 'Plesk Obsidian' },
      { panelVersion: '18.0.81.4.1' },
      { panelVersion: 'eighteen' },
      { installations: -1 },
      { installations: 1.5 },
      { installations: '3' },
      { installations: 100_001 },
    ]) {
      expect(parseServerReport({ ...good, ...bad }), JSON.stringify(bad)).toBeNull();
    }
    expect(parseServerReport(null)).toBeNull();
    expect(parseServerReport({ product: 'cleitext-toolkit', forget: true })).toBeNull();
  });
});

describe('public downloads', () => {
  it('compares versions by every number', () => {
    expect(compareVersions('0.6.0-1', '0.5.1-1')).toBeGreaterThan(0);
    expect(compareVersions('0.5.1-1', '0.5.0-2')).toBeGreaterThan(0);
    expect(compareVersions('0.5.0-2', '0.5.0-1')).toBeGreaterThan(0);
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.0-1')).toBeLessThan(0);
  });

  it('picks the highest version, not the latest upload', () => {
    expect(
      latestOf([{ version: '0.5.1-1' }, { version: '0.6.0-1' }, { version: '0.5.0-2' }]),
    ).toEqual({ version: '0.6.0-1' });
    expect(latestOf([])).toBeNull();
  });

  it('keeps safe zip file names only', () => {
    expect(safeFilename('cleitext-toolkit-0.6.0-1.zip')).toBe('cleitext-toolkit-0.6.0-1.zip');
    expect(safeFilename('C:\\Users\\x\\Toolkit 1.ZIP')).toBe('toolkit-1.zip');
    expect(safeFilename('../../etc/passwd')).toBeNull();
    expect(safeFilename('a.zip"; x=.zip')).toBeNull();
    expect(safeFilename('.hidden.zip')).toBeNull();
    expect(safeFilename('file.tar.gz')).toBeNull();
    expect(safeFilename(undefined)).toBeNull();
  });

  it('recognises zip archives', () => {
    expect(isZip(Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(30)]))).toBe(true);
    expect(isZip(Buffer.from('<?php echo 1; ?>'.padEnd(40)))).toBe(false);
  });
});
