import { describe, expect, it } from 'vitest';
import { metasliderIds } from './metaslider';
import { wxrToDocument } from './wxr';

/** Converted data, read loosely (its shape is Diorama's). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

const cdata = (v: string) => `<![CDATA[${v}]]>`;
const meta = (key: string, value: string) =>
  `<wp:postmeta><wp:meta_key>${key}</wp:meta_key><wp:meta_value>${cdata(value)}</wp:meta_value></wp:postmeta>`;
const item = (id: number, type: string, slug: string, body: string, extra = '', order = 0) =>
  `<item><title>${slug}</title><link>https://shop.example/${slug}/</link><dc:creator>ann</dc:creator><wp:post_id>${id}</wp:post_id><wp:post_name>${slug}</wp:post_name><wp:status>publish</wp:status><wp:post_type>${type}</wp:post_type><wp:menu_order>${order}</wp:menu_order><wp:post_date_gmt>2026-01-02 10:00:00</wp:post_date_gmt><content:encoded>${cdata(body)}</content:encoded>${extra}</item>`;
const term = (slider: number) =>
  `<category domain="ml-slider" nicename="${slider}"><![CDATA[${slider}]]></category>`;
/** MetaSlider's settings, serialized as PHP does. */
const settings = (values: Record<string, string>) =>
  `a:${Object.keys(values).length}:{${Object.entries(values)
    .map(([k, v]) => `s:${k.length}:"${k}";s:${v.length}:"${v}";`)
    .join('')}}`;

const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Shop</title><link>https://shop.example</link><wp:wxr_version>1.2</wp:wxr_version><wp:base_blog_url>https://shop.example</wp:base_blog_url>
<wp:author><wp:author_id>1</wp:author_id><wp:author_login>ann</wp:author_login><wp:author_email>ann@example.com</wp:author_email><wp:author_display_name>Ann</wp:author_display_name></wp:author>
${item(10, 'attachment', 'lemon', '', `<wp:attachment_url>https://shop.example/wp-content/uploads/lemon.jpg</wp:attachment_url><excerpt:encoded>${cdata('Lemons of the coast')}</excerpt:encoded>${meta('_wp_attachment_image_alt', 'A lemon')}`)}
${item(11, 'attachment', 'orange', '', '<wp:attachment_url>https://shop.example/wp-content/uploads/orange.jpg</wp:attachment_url>')}
${item(20, 'ml-slider', 'new-slideshow', '', meta('ml-slider_settings', settings({ type: 'flex', width: '600', height: '408', delay: '4000', effect: 'slide', navigation: 'false', links: 'true', hoverPause: 'true', animationSpeed: '700', autoPlay: 'true', fullWidth: 'false' })))}
${item(21, 'ml-slide', 'slider-20-image', '', term(20) + meta('ml-slider_type', 'image') + meta('_thumbnail_id', '10') + meta('ml-slider_inherit_image_caption', '1') + meta('ml-slider_inherit_image_alt', '1') + meta('ml-slider_url', 'https://shop.example/lemons/') + meta('ml-slider_new_window', 'true'), 1)}
${item(22, 'ml-slide', 'slider-20-image-2', '', `${term(20)}${meta('ml-slider_type', 'image')}${meta('_thumbnail_id', '11')}<excerpt:encoded>${cdata('Oranges')}</excerpt:encoded>`, 0)}
${item(23, 'ml-slide', 'slider-20-video', '', term(20) + meta('ml-slider_type', 'vimeo'), 2)}
${item(24, 'ml-slide', 'slider-20-broken', '', term(20) + meta('ml-slider_type', 'image'), 3)}
${item(30, 'ml-slider', 'old-one', '', meta('ml-slider_settings', settings({ type: 'nivo', effect: 'sliceDown' })))}
${item(40, 'page', 'home', '<p>Welcome</p>\n[metaslider id="20"]')}
</channel></rss>`;

describe('MetaSlider', () => {
  const { document, warnings } = wxrToDocument(xml, { locale: 'en' });
  const sliders = (
    document.plugins as {
      diorama: {
        sliders: { alias: string; title: string; used: boolean; data: Loose }[];
      };
    }
  ).diorama.sliders;

  it("becomes Diorama's sliders, the ones pages show first", () => {
    expect(sliders.map((s) => [s.alias, s.used])).toEqual([
      ['metaslider-20', true],
      ['metaslider-30', false],
    ]);
    const first = sliders[0]!.data;
    expect(first).toMatchObject({
      layout: 'auto',
      maxWidth: 600,
      size: { base: { height: 408 }, mobile: { height: 265 } },
      transition: { effect: 'slide-left', duration: 700 },
      autoplay: { enabled: true, delay: 4000, pauseOnHover: true },
      navigation: { arrows: true, bullets: false },
    });
    expect(sliders[1]!.data.transition.effect).toBe('crossfade');
  });

  it('keeps the slides in their order, with picture, caption, alternative text and link', () => {
    const slides = sliders[0]!.data.slides as Loose[];
    expect(slides).toHaveLength(2);
    expect(slides[0]!.background.image).toEqual({
      id: 'att:11',
      url: 'https://shop.example/wp-content/uploads/orange.jpg',
    });
    expect(slides[0]!.layers[0].content.text).toBe('Oranges');
    // The media library's caption and alternative text, as MetaSlider was told.
    expect(slides[1]!.layers[0].content.text).toBe('Lemons of the coast');
    expect(slides[1]!.background.alt).toBe('A lemon');
    expect(slides[1]!.link).toEqual({ kind: 'url', value: '/lemons/', newTab: true });
  });

  it('is not content, and the report says what was left out', () => {
    expect(document.entries!.some((e) => /slide/.test(e.slug))).toBe(false);
    expect(warnings).toEqual(
      expect.arrayContaining([
        '2 MetaSlider slider(s) were converted for Diorama (1 flex, 1 nivo), with their pictures, captions, links, effect, timing and navigation: activate Diorama before importing to keep them.',
        "1 MetaSlider slider(s) are not shown by any imported content (they may be in a theme's options or a widget): old-one.",
        '1 MetaSlider slide(s) of the kind "vimeo" were left out: Diorama has no counterpart yet.',
        '1 MetaSlider slide(s) were left out: their picture is not in the export.',
      ]),
    );
  });

  it('finds the sliders a text shows', () => {
    expect(
      metasliderIds(
        '[metaslider id=5] [ml-slider id="6"] <!-- wp:metaslider/slider {"slideshowId":7} /-->',
      ),
    ).toEqual([5, 6, 7]);
  });
});
