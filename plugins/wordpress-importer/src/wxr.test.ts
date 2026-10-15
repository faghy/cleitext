import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { wxrToDocument } from './wxr';

// The export of a small WordPress site, shared with the core's import tests,
// which import the transfer document saved next to it.
const fixtures = new URL('../../../apps/server/test/fixtures/wxr/', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, fixtures), 'utf8');

/** Block ids and the export time change at every run: compared without them. */
const stable = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value), (key, v: unknown) =>
    (key === 'id' && typeof v === 'string' && v.startsWith('b_')) || key === 'exportedAt'
      ? undefined
      : v,
  );

describe('WordPress export to transfer document', () => {
  it('gives the document the core import tests use', () => {
    const result = wxrToDocument(read('export.xml'), { locale: 'en' });
    expect(stable(result)).toEqual(stable(JSON.parse(read('export.transfer.json'))));
  });

  it('reports what it cannot convert', () => {
    const { warnings, document } = wxrToDocument(read('export.xml'), {
      locale: 'it',
      authorRole: 'editor',
    });
    expect(warnings.join('\n')).toContain('custom type "product"');
    expect(warnings.join('\n')).toContain('1 pingback(s)');
    expect(document.entries?.every((e) => e.locale === 'it')).toBe(true);
    expect(document.users?.[0]?.role).toBe('editor');
  });
});
