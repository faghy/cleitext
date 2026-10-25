import type { TransferMenuItem } from '@cleitext/blocks/transfer';
import { describe, expect, it } from 'vitest';
import { switcherMenuLink } from './languages';
import { wxrToDocument } from './wxr';

/** A menu with a page and Polylang's language switcher (a custom link to `#pll_switcher`). */
const wxr = (options: string) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wfw="http://wellformedweb.org/CommentAPI/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Old</title><link>https://old.example.com</link><wp:wxr_version>1.2</wp:wxr_version><wp:base_site_url>https://old.example.com</wp:base_site_url>
<wp:term><wp:term_id>5</wp:term_id><wp:term_taxonomy>nav_menu</wp:term_taxonomy><wp:term_slug>main</wp:term_slug><wp:term_name><![CDATA[Main]]></wp:term_name></wp:term>
<item><title>Contact</title><link>https://old.example.com/contact/</link><dc:creator><![CDATA[admin]]></dc:creator>
<content:encoded><![CDATA[<p>Write to us.</p>]]></content:encoded>
<wp:post_id>9</wp:post_id><wp:post_date>2025-04-15 10:00:00</wp:post_date><wp:post_date_gmt>2025-04-15 10:00:00</wp:post_date_gmt>
<wp:post_name>contact</wp:post_name><wp:status>publish</wp:status><wp:post_type>page</wp:post_type></item>
<item><title>Languages</title><link>https://old.example.com/?p=20</link><dc:creator><![CDATA[admin]]></dc:creator>
<content:encoded><![CDATA[]]></content:encoded>
<wp:post_id>20</wp:post_id><wp:post_date>2025-04-15 10:00:00</wp:post_date><wp:post_date_gmt>2025-04-15 10:00:00</wp:post_date_gmt>
<wp:post_name>languages</wp:post_name><wp:status>publish</wp:status><wp:menu_order>2</wp:menu_order><wp:post_type>nav_menu_item</wp:post_type>
<category domain="nav_menu" nicename="main"><![CDATA[Main]]></category>
<wp:postmeta><wp:meta_key>_menu_item_type</wp:meta_key><wp:meta_value><![CDATA[custom]]></wp:meta_value></wp:postmeta>
<wp:postmeta><wp:meta_key>_menu_item_menu_item_parent</wp:meta_key><wp:meta_value><![CDATA[0]]></wp:meta_value></wp:postmeta>
<wp:postmeta><wp:meta_key>_menu_item_url</wp:meta_key><wp:meta_value><![CDATA[#pll_switcher]]></wp:meta_value></wp:postmeta>
<wp:postmeta><wp:meta_key>_pll_menu_item</wp:meta_key><wp:meta_value><![CDATA[${options}]]></wp:meta_value></wp:postmeta>
</item>
<item><title></title><link>https://old.example.com/?p=21</link><dc:creator><![CDATA[admin]]></dc:creator>
<content:encoded><![CDATA[]]></content:encoded>
<wp:post_id>21</wp:post_id><wp:post_date>2025-04-15 10:00:00</wp:post_date><wp:post_date_gmt>2025-04-15 10:00:00</wp:post_date_gmt>
<wp:post_name>21</wp:post_name><wp:status>publish</wp:status><wp:menu_order>1</wp:menu_order><wp:post_type>nav_menu_item</wp:post_type>
<category domain="nav_menu" nicename="main"><![CDATA[Main]]></category>
<wp:postmeta><wp:meta_key>_menu_item_type</wp:meta_key><wp:meta_value><![CDATA[post_type]]></wp:meta_value></wp:postmeta>
<wp:postmeta><wp:meta_key>_menu_item_object</wp:meta_key><wp:meta_value><![CDATA[page]]></wp:meta_value></wp:postmeta>
<wp:postmeta><wp:meta_key>_menu_item_object_id</wp:meta_key><wp:meta_value><![CDATA[9]]></wp:meta_value></wp:postmeta>
<wp:postmeta><wp:meta_key>_menu_item_menu_item_parent</wp:meta_key><wp:meta_value><![CDATA[0]]></wp:meta_value></wp:postmeta>
</item>
</channel></rss>`;

describe('Polylang’s language switcher in menus (1.29.0)', () => {
  it('becomes Multilingual’s switcher link, with the same choices', () => {
    const options =
      'a:6:{s:22:"hide_if_no_translation";i:1;s:12:"hide_current";i:1;s:10:"force_home";i:0;s:10:"show_flags";i:1;s:10:"show_names";i:0;s:8:"dropdown";i:0;}';
    const { document, warnings } = wxrToDocument(wxr(options), { locale: 'en' });
    const items = document.menus![0]!.items as TransferMenuItem[];
    expect(items.map((i) => [i.kind, i.label])).toEqual([
      ['entry', null],
      ['url', 'Languages'],
    ]);
    expect(items[1]!.url).toBe(
      '#language-switcher?style=inline&names=code&current=hide&untranslated=hide',
    );
    expect(warnings.join('\n')).toContain(
      "Polylang's language switcher in menus became Multilingual's (1×)",
    );
  });

  it('keeps a dropdown, names and the other languages by default', () => {
    expect(
      switcherMenuLink('#pll_switcher', {
        dropdown: 1,
        show_names: 1,
        hide_current: 0,
        hide_if_no_translation: 0,
      }),
    ).toBe('#language-switcher?style=dropdown');
    expect(switcherMenuLink('#pll_switcher', undefined)).toBe('#language-switcher?style=inline');
    expect(switcherMenuLink('/about', {})).toBeNull();
  });
});
