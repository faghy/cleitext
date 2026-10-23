/**
 * Shortcodes standing alone (e.g. a booking widget's `[kross-booking]`) are
 * kept as placeholders that active plugins turn into their blocks on import
 * (`import.shortcode`, plugin API 1.36): in post content, and in Elementor's
 * shortcode, text and HTML widgets, inside a plugin block element of Fresco.
 */
import type { CxdBlock } from '@cleitext/blocks';
import { describe, expect, it } from 'vitest';
import { elementorToFresco, type ElementorContext } from '@cleitext/blocks/elementor';
import { wxrToDocument } from './wxr';

const context = (notes: string[] = []): ElementorContext => ({
  mediaRef: () => undefined,
  warn: (m) => notes.push(m),
});

const widget = (widgetType: string, settings: Record<string, unknown>) => ({
  id: `w${Math.random().toString(36).slice(2, 7)}`,
  elType: 'widget',
  widgetType,
  settings,
  elements: [],
});

/** The widgets of a page made of one container. */
function convert(widgets: unknown[], notes?: string[]): CxdBlock[] {
  const blocks = elementorToFresco(
    JSON.stringify([{ id: 'c1', elType: 'container', settings: {}, elements: widgets }]),
    context(notes),
  );
  return blocks![0]!.children!;
}

const shortcode = (block: CxdBlock) =>
  block.attrs.shortcode as { tag: string; attrs: Record<string, string> };

describe('Elementor widgets with a shortcode', () => {
  it('the shortcode widget becomes a placeholder inside a plugin block element', () => {
    const notes: string[] = [];
    const [block, ...rest] = convert(
      [
        widget('shortcode', {
          shortcode: '[kross-booking lang=\'en\' id="4"]',
          _margin: { unit: 'px', top: '20', right: '0', bottom: '20', left: '0', isLinked: false },
          _element_id: 'booking',
        }),
      ],
      notes,
    );
    expect(rest).toEqual([]);
    expect(block!.type).toBe('core/imported');
    expect(shortcode(block!)).toEqual({
      tag: 'kross-booking',
      attrs: { lang: 'en', id: '4' },
      content: null,
      text: '[kross-booking lang=\'en\' id="4"]',
    });
    // The widget's Advanced settings go to the element holding the plugin's block.
    expect(block!.attrs.wrap).toMatchObject({
      type: 'fresco/block',
      attrs: { _css_id: 'booking', _margin: expect.anything() },
    });
    // Without a plugin for it: the text widget it was.
    const [fallback] = block!.attrs.fallback as CxdBlock[];
    expect(fallback).toMatchObject({
      type: 'fresco/text',
      attrs: { content: '<p>[kross-booking lang=\'en\' id="4"]</p>', _css_id: 'booking' },
    });
    expect(notes.join('\n')).not.toContain('shortcodes were kept as text');
  });

  it('a text widget is split around it, the rest stays text', () => {
    const blocks = convert([
      widget('text-editor', {
        editor:
          '<p>Choose your dates:</p>\n<p>[kross-booking id="0" url="/prenota"]</p>\n<p>Questions? Call us.</p>',
        _element_id: 'book',
      }),
    ]);
    expect(blocks.map((b) => b.type)).toEqual(['fresco/text', 'core/imported', 'fresco/text']);
    expect(blocks[0]!.attrs).toMatchObject({
      content: '<p>Choose your dates:</p>',
      _css_id: 'book',
    });
    expect(shortcode(blocks[1]!).attrs).toEqual({ id: '0', url: '/prenota' });
    expect(blocks[2]!.attrs.content).toBe('<p>Questions? Call us.</p>');
    // One element keeps the CSS id.
    expect(blocks[2]!.attrs._css_id).toBeUndefined();
    expect(new Set(blocks.map((b) => b.id)).size).toBe(3);
  });

  it('an HTML widget too; a shortcode inside a sentence stays', () => {
    const [html] = convert([widget('html', { html: '[kross-booking]' })]);
    expect(html!.type).toBe('core/imported');
    expect((html!.attrs.fallback as CxdBlock[])[0]).toMatchObject({
      type: 'fresco/html',
      attrs: { code: '[kross-booking]' },
    });
    const [text] = convert([widget('text-editor', { editor: '<p>Book [kross-booking] now</p>' })]);
    expect(text!.type).toBe('fresco/text');
  });

  it('a shortcode widget without a shortcode stays text, with a note', () => {
    const notes: string[] = [];
    const [text] = convert([widget('shortcode', { shortcode: 'Book now' })], notes);
    expect(text!.type).toBe('fresco/text');
    expect(notes.join('\n')).toContain('shortcodes were kept as text');
  });
});

describe('post content with a shortcode', () => {
  it('becomes a placeholder; the report speaks only of shortcodes inside text', () => {
    const item = (id: number, content: string) =>
      `<item><title>Page ${id}</title><link>https://hotel.example/p${id}/</link><wp:post_id>${id}</wp:post_id><wp:post_name>p${id}</wp:post_name><wp:post_type>page</wp:post_type><wp:status>publish</wp:status><content:encoded><![CDATA[${content}]]></content:encoded></item>`;
    const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Hotel</title><link>https://hotel.example</link><wp:wxr_version>1.2</wp:wxr_version>
${item(1, '<p>Book your room.</p>\n\n[kross-booking id="3" lang="it"]')}
${item(2, 'Call us or use [contact-form] below.')}
</channel></rss>`;
    const { document, warnings } = wxrToDocument(xml, { locale: 'it' });
    const blocks = document.entries!.find((e) => e.ref === 'post:1')!.document.blocks as CxdBlock[];
    expect(blocks.map((b) => b.type)).toEqual(['core/paragraph', 'core/imported']);
    expect(shortcode(blocks[1]!)).toMatchObject({
      tag: 'kross-booking',
      attrs: { id: '3', lang: 'it' },
    });
    expect(warnings).not.toContain('Page 1: contains shortcodes, left as text.');
    expect(warnings).toContain('Page 2: contains shortcodes, left as text.');
  });
});
