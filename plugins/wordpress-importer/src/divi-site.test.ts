import { describe, expect, it } from 'vitest';
import type { CxdBlock } from '@cleitext/blocks';
import { wxrToDocument } from './wxr';

const cdata = (v: string) => `<![CDATA[${v}]]>`;
const meta = (key: string, value: string) =>
  `<wp:postmeta><wp:meta_key>${key}</wp:meta_key><wp:meta_value>${cdata(value)}</wp:meta_value></wp:postmeta>`;
const item = (
  id: number,
  type: string,
  slug: string,
  body: string,
  extra = '',
  status = 'publish',
) =>
  `<item><title>${slug}</title><link>https://bistro.example/${slug}/</link><dc:creator>ann</dc:creator><wp:post_id>${id}</wp:post_id><wp:post_name>${slug}</wp:post_name><wp:status>${status}</wp:status><wp:post_type>${type}</wp:post_type><wp:post_date_gmt>2026-01-02 10:00:00</wp:post_date_gmt><content:encoded>${cdata(body)}</content:encoded>${extra}</item>`;

/** A small Divi site: a page, the Theme Builder (header, footer, templates), the Library and a menu. */
const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Bistro</title><link>https://bistro.example</link><wp:wxr_version>1.2</wp:wxr_version><wp:base_blog_url>https://bistro.example</wp:base_blog_url>
<wp:author><wp:author_id>1</wp:author_id><wp:author_login>ann</wp:author_login><wp:author_email>ann@example.com</wp:author_email><wp:author_display_name>Ann</wp:author_display_name></wp:author>
<wp:term><wp:term_id>7</wp:term_id><wp:term_taxonomy>nav_menu</wp:term_taxonomy><wp:term_slug>main</wp:term_slug><wp:term_name>Main</wp:term_name></wp:term>
${item(10, 'attachment', 'logo', '', '<wp:attachment_url>https://bistro.example/wp-content/uploads/logo.png</wp:attachment_url>')}
${item(11, 'attachment', 'dish', '', '<wp:attachment_url>https://bistro.example/wp-content/uploads/dish.jpg</wp:attachment_url>')}
${item(
  20,
  'page',
  'home',
  '[et_pb_section][et_pb_row][et_pb_column type="1_2"][et_pb_text text_text_color="gcid-f21ab52a-d63f-40b6-ad39-d8d97e171d76" inline_fonts="Shrikhand"]<h2>Welcome</h2>[/et_pb_text][et_pb_button button_text="Menu" button_url="https://bistro.example/menu/"][/et_pb_button][/et_pb_column][et_pb_column type="1_2"][et_pb_image src="https://bistro.example/wp-content/uploads/dish-300x200.jpg"][/et_pb_image][et_pb_gallery gallery_ids="10,11" module_class="six"][/et_pb_gallery][/et_pb_column][/et_pb_row][/et_pb_section]',
  meta('_et_pb_use_builder', 'on') +
    meta('_et_pb_gutter_width', '2') +
    meta(
      '_et_pb_custom_css',
      '@media (min-width: 981px){ .six .et_pb_gallery_item { width: 50% } }\n.x { color: red }',
    ),
)}
${item(21, 'page', 'plain', '<p>No builder [et_pb_text]</p>')}
${item(
  30,
  'et_header_layout',
  'theme-builder-layout',
  '[et_pb_section][et_pb_row][et_pb_column type="4_4"][et_pb_menu menu_style="centered" logo="https://bistro.example/wp-content/uploads/logo.png"][/et_pb_menu][/et_pb_column][/et_pb_row][/et_pb_section]',
)}
${item(
  31,
  'et_footer_layout',
  'theme-builder-layout-2',
  '[et_pb_section bottom_divider_style="waves2"][et_pb_row][et_pb_column type="4_4"][et_pb_blurb title="Phone" use_icon="on" font_icon="&#xe090;||divi||400"]<p>+39 000</p>[/et_pb_blurb][/et_pb_column][/et_pb_row][/et_pb_section]',
)}
${item(32, 'et_header_layout', 'unused-header', '[et_pb_section][/et_pb_section]')}
${item(33, 'et_body_layout', 'body', '[et_pb_section][et_pb_row][et_pb_column type="4_4"][et_pb_post_title][/et_pb_post_title][/et_pb_column][/et_pb_row][/et_pb_section]')}
${item(40, 'et_template', 'default', '', meta('_et_default', '1') + meta('_et_enabled', '1') + meta('_et_header_layout_id', '30') + meta('_et_header_layout_enabled', '1') + meta('_et_footer_layout_id', '0') + meta('_et_footer_layout_enabled', '0'))}
${item(41, 'et_template', 'pages', '', meta('_et_default', '0') + meta('_et_enabled', '1') + meta('_et_use_on', 'singular:post_type:page:all') + meta('_et_use_on', 'archive:author:all') + meta('_et_exclude_from', 'singular:post_type:page:id:21') + meta('_et_header_layout_id', '30') + meta('_et_footer_layout_id', '31') + meta('_et_body_layout_id', '33'))}
${item(42, 'et_template', 'old', '', meta('_et_default', '0') + meta('_et_enabled', '1') + meta('_et_theme_builder_marked_as_unused', '2026-01-01') + meta('_et_header_layout_id', '32'))}
${item(43, 'et_template', 'off', '', meta('_et_enabled', '0') + meta('_et_header_layout_id', '32'))}
${item(50, 'et_pb_layout', 'saved-row', '[et_pb_row][et_pb_column type="4_4"][et_pb_text]Saved[/et_pb_text][/et_pb_column][/et_pb_row]', '<category domain="scope" nicename="global"><![CDATA[global]]></category><category domain="layout_type" nicename="row"><![CDATA[row]]></category>')}
${item(51, 'et_pb_layout', 'empty', '')}
${item(60, 'nav_menu_item', 'm1', '', `<category domain="nav_menu" nicename="main"><![CDATA[Main]]></category>${meta('_menu_item_type', 'post_type')}${meta('_menu_item_object', 'page')}${meta('_menu_item_object_id', '20')}${meta('_menu_item_menu_item_parent', '0')}`)}
</channel></rss>`;

const types = (blocks: CxdBlock[]): string[] =>
  blocks.flatMap((b) => [b.type, ...types(b.children ?? [])]);
const find = (blocks: CxdBlock[], type: string): CxdBlock[] =>
  blocks.flatMap((b) => [...(b.type === type ? [b] : []), ...find(b.children ?? [], type)]);

const OPTIONS = {
  accent_color: '#cd582f',
  et_global_colors: {
    'gcid-f21ab52a-d63f-40b6-ad39-d8d97e171d76': { color: '#cd582f', active: 'yes' },
  },
};

describe('a Divi site', () => {
  it('imports pages built with Divi as Fresco pages', () => {
    const { document, warnings } = wxrToDocument(xml, { locale: 'en', diviOptions: OPTIONS });
    const home = document.entries!.find((e) => e.slug === 'home')!;
    expect(home.document!.editor).toEqual({
      id: 'fresco',
      data: { layout: 'full', flush: true, hideTitle: true, customCss: '.x { color: red }' },
    });
    const blocks = home.document!.blocks as CxdBlock[];
    expect(types(blocks)).toEqual(
      expect.arrayContaining(['fresco/text', 'fresco/button', 'fresco/image', 'fresco/gallery']),
    );
    // Gutter 2 (the page's own), the old site's links as paths, media by address and id.
    expect(blocks[0]!.children![0]!.attrs.gap).toEqual({ size: 3, unit: '%' });
    expect(find(blocks, 'fresco/button')[0]!.attrs.link).toEqual({ url: '/menu/' });
    expect(find(blocks, 'fresco/image')[0]!.attrs.image).toEqual({
      id: 'att:11',
      url: 'https://bistro.example/wp-content/uploads/dish-300x200.jpg',
    });
    expect(find(blocks, 'fresco/gallery')[0]!.attrs).toMatchObject({
      columns: 2,
      images: [
        { id: 'att:10', url: 'https://bistro.example/wp-content/uploads/logo.png' },
        { id: 'att:11', url: 'https://bistro.example/wp-content/uploads/dish.jpg' },
      ],
    });
    // Pages without the builder stay as they were.
    const plain = document.entries!.find((e) => e.slug === 'plain')!;
    expect(plain.document!.editor).toBeUndefined();
    expect(warnings).toContain(
      '1 page(s) built with Divi were imported as Fresco pages: activate the Fresco plugin to show and edit them.',
    );
    // Divi's records are not content.
    expect(warnings.join(' ')).not.toContain('custom type "et_');
  });

  it('imports the Theme Builder and the Library as Fresco Pro templates', () => {
    const { document, warnings } = wxrToDocument(xml, { locale: 'en', diviOptions: OPTIONS });
    const templates = document.entries!.filter((e) => e.type === 'fresco_template');
    const data = (slug: string) =>
      (
        templates.find((t) => t.slug === slug)?.document?.editor?.data as {
          template: { kind: string; conditions: unknown[] };
        }
      )?.template;
    expect(data('theme-builder-layout')).toEqual({
      kind: 'header',
      conditions: [
        { mode: 'include', rule: 'all' },
        { mode: 'include', rule: 'type:page' },
        { mode: 'exclude', rule: { $entry: 'post:21', prefix: 'entry:' } },
      ],
    });
    expect(data('theme-builder-layout-2')?.kind).toBe('footer');
    expect(data('body')?.kind).toBe('single');
    expect(data('saved-row')).toEqual({ kind: 'section', conditions: [] });
    // Layouts of templates shown nowhere, and empty ones, are left out.
    expect(data('unused-header')).toBeUndefined();
    expect(data('empty')).toBeUndefined();
    expect(templates.find((t) => t.slug === 'theme-builder-layout')!.title).toBe('Header (Divi)');
    expect(warnings).toEqual(
      expect.arrayContaining([
        '4 Divi Theme Builder layout(s) and Library item(s) (1 header, 1 footer, 1 single, 1 section) were imported as Fresco Pro templates: Fresco Pro must be active when importing to keep them. Without it, Fresco shows the header and footer in the theme’s place.',
        '1 global Divi module(s) are kept in each page that uses them, and in the templates.',
        'Some Divi templates hid the theme’s header, body or footer: check those pages after the import.',
        'Divi Theme Builder: the template condition "archive:author:all" has no counterpart and was left out.',
      ]),
    );
  });

  it('gives Fresco the kit, the menu’s location and the header and footer without Fresco Pro', () => {
    const { document } = wxrToDocument(xml, { locale: 'en', diviOptions: OPTIONS });
    const fresco = document.plugins!.fresco as {
      kit: { colors: { id: string; value: string }[]; googleFonts: string[] };
      locations: Record<string, { ref: string; rules: unknown[]; blocks: CxdBlock[] }>;
    };
    expect(fresco.kit.colors).toContainEqual({
      id: 'gcid-f21ab52a',
      title: 'Global color 1',
      value: '#cd582f',
    });
    expect(fresco.kit.googleFonts).toEqual(expect.arrayContaining(['Open Sans', 'Shrikhand']));
    expect(fresco.locations.header!.ref).toBe('post:30');
    expect(fresco.locations.footer!.ref).toBe('post:31');
    expect(types(fresco.locations.header!.blocks)).toContain('fresco/nav-menu');
    // The menu shown by the header's menu module (the site's main menu).
    expect(document.menus).toEqual([
      expect.objectContaining({ name: 'Main', location: 'primary' }),
    ]);
  });

  it('tells when Divi’s theme options were not uploaded', () => {
    const { warnings } = wxrToDocument(xml, { locale: 'en' });
    expect(warnings).toContain(
      'The Divi pages use global colors, but Divi’s theme options were not uploaded with the export: upload et_divi.json too to bring their values (and the site’s fonts and layout).',
    );
    const plain = xml.replace(/gcid-[0-9a-f-]+/g, '#123456');
    expect(wxrToDocument(plain, { locale: 'en' }).warnings).toContain(
      'Divi’s theme options were not uploaded with the export: Divi’s default fonts and colors were used.',
    );
  });
});
