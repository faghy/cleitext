import type { CxdBlock } from '@cleitext/plugin-sdk';
import { describe, expect, it } from 'vitest';
import { contentBox, defaultSlide, defaultSlider, normalizeSlider } from '../src/model/normalize';
import type { SliderRecord } from '../src/model/types';
import {
  addLayer,
  cloneSlide,
  duplicateLayer,
  findLayer,
  moveLayer,
  removeLayer,
} from '../src/studio/ops';
import {
  blockFromShortcode,
  exportSliders,
  importedSliders,
  parseShortcode,
  replaceShortcodes,
} from '../src/transfer';
import { sample } from './fixtures';

const PAGE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('the shortcode', () => {
  it('reads [diorama] with any quotes', () => {
    expect(parseShortcode('[diorama id="abc"]')).toEqual({ id: 'abc' });
    expect(parseShortcode(" [diorama alias='home' ] ")).toEqual({ alias: 'home' });
    expect(parseShortcode('[diorama alias=home]')).toEqual({ alias: 'home' });
    expect(parseShortcode('See [diorama id="x"] here')).toBeNull();
    expect(parseShortcode('[metaslider id="3"]')).toBeNull();
  });

  it('becomes the slider block where it stands alone', () => {
    const blocks: CxdBlock[] = [
      {
        id: 'p1',
        type: 'core/paragraph',
        v: 1,
        attrs: {},
        content: [{ text: '[diorama alias="home"]' }],
      },
      {
        id: 'p2',
        type: 'core/paragraph',
        v: 1,
        attrs: {},
        content: [{ text: 'Text with [diorama id="1"] inside' }],
      },
      {
        id: 'g',
        type: 'core/group',
        v: 1,
        attrs: {},
        children: [
          { id: 's1', type: 'core/shortcode', v: 1, attrs: { text: '[diorama id="xyz"]' } },
        ],
      },
    ];
    const out = replaceShortcodes(blocks);
    expect(out[0]).toEqual({
      id: 'p1',
      type: 'diorama/slider',
      v: 1,
      attrs: { slider: 'home', alias: 'home' },
    });
    expect(out[1]).toBe(blocks[1]);
    expect(out[2]!.children![0]).toMatchObject({
      type: 'diorama/slider',
      attrs: { slider: 'xyz' },
    });
    const plain: CxdBlock[] = [
      { id: 'x', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Hi' }] },
    ];
    expect(replaceShortcodes(plain)).toBe(plain);
    expect(blockFromShortcode({}, 'b')).toBeNull();
  });
});

describe('export and import', () => {
  it('writes entries as references the import resolves, and media as objects', () => {
    const data = sample();
    data.slides[0]!.layers[0]!.children[2]!.content.link = {
      kind: 'page',
      value: '/about',
      entryId: PAGE,
    };
    const record: SliderRecord = {
      id: '1',
      title: 'Home',
      alias: 'home',
      data,
      createdAt: '',
      updatedAt: '',
    };
    const out = exportSliders([record]);
    const json = JSON.stringify(out);
    expect(json).toContain(`"entryId":{"$entry":"${PAGE}","prefix":""}`);
    expect(json).toContain(
      '"image":{"id":"11111111-2222-4333-8444-555555555555","url":"/media/site/beach.jpg"}',
    );
    // The import gives back what the core resolved: here the same entry's new id.
    const back = importedSliders(
      JSON.parse(json.replace(`{"$entry":"${PAGE}","prefix":""}`, `"${PAGE}"`)),
    );
    expect(back).toHaveLength(1);
    const again = normalizeSlider(back[0]!.data);
    expect(again.slides[0]!.layers[0]!.children[2]!.content.link).toEqual({
      kind: 'page',
      value: '/about',
      entryId: PAGE,
    });
    expect(importedSliders({ sliders: [{ title: 'no data' }] })).toEqual([]);
    expect(importedSliders(null)).toEqual([]);
  });
});

describe('the editor’s changes', () => {
  it('adds, finds, duplicates, moves and removes layers without changing the old slider', () => {
    const slider = normalizeSlider(
      defaultSlider({ slides: [defaultSlide({ layers: [contentBox({ heading: 'A' })] })] }),
    );
    const box = slider.slides[0]!.layers[0]!;
    const withText = addLayer(slider, 0, { ...box.children[0]!, id: 'newtext' }, box.id);
    expect(slider.slides[0]!.layers[0]!.children).toHaveLength(1);
    expect(findLayer(withText.slides[0], 'newtext')?.parent?.id).toBe(box.id);
    const { slider: copied, id } = duplicateLayer(withText, 0, box.id);
    expect(copied.slides[0]!.layers).toHaveLength(2);
    expect(id).not.toBe(box.id);
    expect(copied.slides[0]!.layers[1]!.children.map((c) => c.id)).not.toContain('newtext');
    const moved = moveLayer(copied, 0, id!, -1);
    expect(moved.slides[0]!.layers[0]!.id).toBe(id);
    const removed = removeLayer(moved, 0, 'newtext');
    expect(findLayer(removed.slides[0], 'newtext')).toBeNull();
    const clone = cloneSlide(slider.slides[0]!);
    expect(clone.id).not.toBe(slider.slides[0]!.id);
    expect(clone.layers[0]!.children[0]!.id).not.toBe(box.children[0]!.id);
  });
});
