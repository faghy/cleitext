/**
 * A real Divi site (Divi 4.27), when its export is on this computer: it is
 * a client's site, so its files are not part of the repository and the test
 * is skipped elsewhere. The synthetic tests (`divi-site.test.ts`) cover the
 * same features.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CxdBlock } from '@cleitext/blocks';
import { diviOptions } from '@cleitext/blocks/divi';
import { wxrToDocument } from './wxr';

const SITE = join(import.meta.dirname, '../../../../SITI/ilpescepazzo.it/original');
const present = existsSync(join(SITE, 'ilpp.wxr.xml')) && existsSync(join(SITE, 'et_divi.json'));

const types = (blocks: CxdBlock[]): string[] =>
  blocks.flatMap((b) => [b.type, ...types(b.children ?? [])]);

describe.skipIf(!present)('a real Divi site', () => {
  it('imports its pages, Theme Builder and kit', () => {
    const xml = readFileSync(join(SITE, 'ilpp.wxr.xml'), 'utf8');
    const options = diviOptions(JSON.parse(readFileSync(join(SITE, 'et_divi.json'), 'utf8')));
    const { document, warnings } = wxrToDocument(xml, { locale: 'it', diviOptions: options });
    if (process.env.DIVI_DUMP) {
      writeFileSync(process.env.DIVI_DUMP, JSON.stringify({ document, warnings }, null, 1));
    }
    const pages = (document.entries ?? []).filter((e) => e.type === 'page');
    const fresco = pages.filter((e) => e.document?.editor?.id === 'fresco');
    expect(fresco.map((e) => e.slug).sort()).toEqual(
      expect.arrayContaining([
        'ristorante-a-varazze-il-pesce-pazzo',
        'menu-il-pesce-pazzo',
        'eventi',
        'menu-san-valentino',
        'carta-dei-vini',
        'home',
      ]),
    );
    const templates = (document.entries ?? []).filter((e) => e.type === 'fresco_template');
    const all = [...fresco, ...templates].flatMap((e) => types(e.document!.blocks as CxdBlock[]));
    for (const type of [
      'text',
      'heading',
      'image',
      'button',
      'icon-box',
      'image-box',
      'spacer',
      'gallery',
      'icon',
      'container',
    ]) {
      expect(all).toContain(`fresco/${type}`);
    }
    // No module was left without a counterpart.
    expect(warnings.filter((w) => w.includes('no Fresco counterpart'))).toEqual([]);
    const kinds = templates.map(
      (t) => (t.document?.editor?.data as { template: { kind: string } }).template.kind,
    );
    expect(kinds).toEqual(expect.arrayContaining(['header', 'footer', 'section']));
    const fr = (
      document.plugins as Record<
        string,
        { kit: { colors: { id: string }[]; googleFonts: string[] }; locations?: object }
      >
    ).fresco!;
    expect(fr.kit.colors.map((c) => c.id)).toContain('gcid-f21ab52a');
    expect(fr.kit.googleFonts).toEqual(
      expect.arrayContaining(['Cabin', 'Playfair Display', 'Shrikhand']),
    );
    expect(Object.keys(fr.locations ?? {})).toEqual(expect.arrayContaining(['header', 'footer']));
  });
});
