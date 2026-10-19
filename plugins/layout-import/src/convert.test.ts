import {
  createCoreRegistry,
  cxdDocumentSchema,
  validateBlocks,
  type CxdBlock,
} from '@cleitext/blocks';
import { afterEach, describe, expect, it } from 'vitest';
import { convertLayout, imageAddresses, mediaKey, type ImportMaps } from './convert.js';
import { countElements, paragraphs, parseShortcodes, type Code } from './shortcodes.js';
import { blocksHaveLayout, blocksToSource } from './source.js';
import { contentTypeOf, pathOf, readExport } from './wxr.js';

let n = 0;
const newId = () => `n${++n}`;
const maps: ImportMaps = {
  posts: { '12': '/contatti' },
  media: {
    '501': 'https://old.example.com/wp-content/uploads/2020/01/a.jpg',
    '502': 'https://old.example.com/wp-content/uploads/2020/01/b.jpg',
  },
  terms: {
    '29': { taxonomy: 'category', slug: 'influencer' },
    '24': { taxonomy: 'tag', slug: 'corsi' },
  },
  library: {
    'a.jpg': { id: 'm-a', url: '/media/a.jpg' },
    'b.jpg': { id: 'm-b', url: '/media/b.jpg' },
  },
  origin: 'https://old.example.com',
};
const registry = createCoreRegistry();
let last: CxdBlock[] = [];
const convert = (content: string, m: ImportMaps = maps) => {
  const result = convertLayout(content, m, { newId });
  last = result.blocks;
  return result;
};
// Every converted page is a valid document of core blocks.
afterEach(() => {
  const doc = cxdDocumentSchema.parse({ schema: 1, blocks: last });
  expect(validateBlocks(doc, registry)).toEqual([]);
  const walk = (blocks: CxdBlock[]): string[] =>
    blocks.flatMap((b) => [b.type, ...walk(b.children ?? [])]);
  expect(walk(last).filter((t) => !t.startsWith('core/'))).toEqual([]);
  last = [];
});
/** The tree of block types, e.g. [{ group: ['heading', 'paragraph'] }]. */
const types = (blocks: CxdBlock[]): unknown =>
  blocks.map((b) =>
    b.children ? { [b.type.split('/')[1]!]: types(b.children) } : b.type.split('/')[1],
  );
const text = (b: CxdBlock | undefined) =>
  (b?.content ?? [])
    .map((c) => ('type' in c ? c.children.map((x) => x.text).join('') : c.text))
    .join('');
const kinds = (r: { warnings: { kind: string; tag: string }[] }) =>
  r.warnings.map((w) => `${w.kind}:${w.tag}`).sort();

describe('shortcodes', () => {
  it('parse attributes, flags, nesting and self-closing tags', () => {
    const tree = parseShortcodes(
      `[av_one_half first space='no_margin'][av_textblock size="18"]Hi <b>there</b>[/av_textblock][av_hr class='invisible' height='30'][/av_one_half]`,
    );
    expect(tree).toHaveLength(1);
    const col = tree[0] as Code;
    expect(col).toMatchObject({
      tag: 'av_one_half',
      flags: ['first'],
      attrs: { space: 'no_margin' },
    });
    expect(col.children).toHaveLength(2);
  });

  it('leave other shortcodes in the text and read curly quotes', () => {
    const tree = parseShortcodes(
      `[av_textblock]A [gallery ids="1"] B[/av_textblock][av_hr class=’invisible’]`,
    );
    expect((tree[0] as Code).children).toEqual(['A [gallery ids="1"] B']);
    expect((tree[1] as Code).attrs.class).toBe('invisible');
    expect(countElements(`[av_one_half][av_hr][/av_one_half]`)).toBe(2);
  });

  it('make paragraphs of text typed in the classic editor', () => {
    expect(paragraphs('One\nline\n\nTwo')).toBe('<p>One<br>line</p><p>Two</p>');
    expect(paragraphs('<p>Ready</p>')).toBe('<p>Ready</p>');
    // Images out of their paragraphs, captions as figures.
    expect(paragraphs('<p>Look <img src="/a.jpg"> here</p>')).toBe(
      '<p>Look</p><img src="/a.jpg"><p>here</p>',
    );
    expect(paragraphs('[caption id="x"]<img src="/a.jpg"> The sea[/caption]')).toBe(
      '<figure><img src="/a.jpg"><figcaption>The sea</figcaption></figure>',
    );
  });
});

describe('a layout as native blocks', () => {
  it('rebuilds a home page: heading with subheading, columns, a button and a loop left out', () => {
    const home = `[av_one_full first min_height='' padding='0px']
[av_heading heading='La - supposta - conoscenza del Web' tag='h1' style='blockquote modern-quote modern-centered' subheading_active='subheading_below' subheading_size='18' link='manually,http://']
Il retto <strong>sentiero</strong> che conduce al Dadaismo.
[/av_heading]
[/av_one_full][av_one_full first]
[av_masonry_entries link='category,29,31' query_orderby='rand' items='8']
[/av_one_full]
[av_one_third first][av_magazine link='category,29' heading='INFLUENCER'][/av_one_third]
[av_one_third][av_textblock]Corsi[/av_textblock][/av_one_third]
[av_one_third][av_button label='Contact us' link='page,12' size='large' position='center'][/av_one_third]`;
    const r = convert(home);
    expect(types(r.blocks)).toEqual([
      'heading',
      'paragraph',
      {
        // The column that only held a list of posts is gone; the others share the row.
        columns: [{ column: ['paragraph'] }, { column: [{ buttons: ['button'] }] }],
      },
    ]);
    const [heading, sub, columns] = r.blocks;
    expect(heading!.attrs).toEqual({ level: 1, textAlign: 'center' });
    // The empty "manually,http://" link is no link.
    expect(heading!.content).toEqual([{ text: 'La - supposta - conoscenza del Web' }]);
    expect(sub!.attrs).toMatchObject({
      align: 'center',
      style: { typography: { fontSize: '18px' } },
    });
    expect(text(sub)).toBe('Il retto sentiero che conduce al Dadaismo.');
    expect(columns!.children!.map((c) => c.attrs.width)).toEqual([undefined, undefined]);
    const buttons = columns!.children![1]!.children![0]!;
    expect(buttons.attrs).toEqual({ layout: { type: 'flex', justifyContent: 'center' } });
    expect(buttons.children![0]).toMatchObject({
      attrs: { url: '/contatti' },
      content: [{ text: 'Contact us' }],
    });
    expect(kinds(r)).toEqual(['skipped:av_magazine', 'skipped:av_masonry_entries']);
  });

  it('groups column runs into rows: `first` and a full row start a new one', () => {
    const r = convert(
      `[av_one_half first]A[/av_one_half][av_one_half]B[/av_one_half][av_one_half]C[/av_one_half][av_one_fourth first vertical_alignment='av-align-middle' background_color='#ffeeee' padding='10px,20px']D[/av_one_fourth][av_three_fourth]E[/av_three_fourth]`,
    );
    expect(types(r.blocks)).toEqual([
      { columns: [{ column: ['paragraph'] }, { column: ['paragraph'] }] },
      { columns: [{ column: ['paragraph'] }] },
      { columns: [{ column: ['paragraph'] }, { column: ['paragraph'] }] },
    ]);
    const last = r.blocks[2]!.children!;
    expect(last[0]!.attrs).toEqual({
      width: '25%',
      verticalAlignment: 'center',
      style: {
        color: { background: '#ffeeee' },
        spacing: { padding: { top: '10px', right: '20px', bottom: '10px', left: '20px' } },
      },
    });
    expect(last[1]!.attrs.width).toBe('75%');
  });

  it('turns sections into full-width groups and grid rows into columns', () => {
    const r = convert(
      `[av_section min_height='50' padding='large' custom_bg='#112233' attachment='501' id='intro'][av_textblock]Hello[/av_textblock][/av_section]
[av_layout_row mobile='av-fixed-cells'][av_cell_one_third vertical_align='middle' background_color='#fff'][av_gallery ids='501,502,999' columns='2'][/av_cell_one_third][av_cell_two_third][av_textblock]Side[/av_textblock][/av_cell_two_third][/av_layout_row]`,
    );
    expect(types(r.blocks)).toEqual([
      { group: ['paragraph'] },
      { columns: [{ column: [{ gallery: ['image', 'image'] }] }, { column: ['paragraph'] }] },
    ]);
    expect(r.blocks[0]!.attrs).toEqual({
      tagName: 'section',
      align: 'full',
      anchor: 'intro',
      style: {
        color: { background: '#112233' },
        spacing: { padding: { top: '70px', bottom: '70px' } },
      },
      layout: { type: 'constrained' },
    });
    expect(r.blocks[1]!.attrs).toEqual({ align: 'full', isStackedOnMobile: false });
    const cell = r.blocks[1]!.children![0]!;
    expect(cell.attrs).toEqual({
      width: '33.33%',
      verticalAlignment: 'center',
      style: { color: { background: '#fff' } },
    });
    const gallery = cell.children![0]!;
    expect(gallery.attrs).toEqual({ columns: 2, linkTo: 'none' });
    expect(gallery.children!.map((i) => i.attrs)).toEqual([
      { id: 'm-a', url: '/media/a.jpg', alt: '' },
      { id: 'm-b', url: '/media/b.jpg', alt: '' },
    ]);
    expect(kinds(r)).toEqual(['background:av_section', 'media:#999']);
  });

  it('converts headings with colors, levels and the theme options', () => {
    const r = convert(
      `[av_heading heading='Hello' tag='h2' style='blockquote classic-quote' color='custom-color-heading' custom_font='#ff0000' size='40'][/av_heading][av_heading heading='World' tag='h4' style='right' subheading_active='subheading_above']Above[/av_heading]`,
      { ...maps, headings: { color: '#d6322c', uppercase: true } },
    );
    expect(types(r.blocks)).toEqual(['heading', 'paragraph', 'heading']);
    expect(r.blocks[0]).toMatchObject({
      attrs: { level: 2, style: { color: { text: '#ff0000' }, typography: { fontSize: '40px' } } },
      content: [{ text: 'HELLO' }],
    });
    expect(text(r.blocks[1])).toBe('Above');
    expect(r.blocks[2]).toMatchObject({
      attrs: { level: 4, textAlign: 'right', style: { color: { text: '#d6322c' } } },
      content: [{ text: 'WORLD' }],
    });
  });

  it('converts text blocks with rich HTML, colors, other shortcodes and old links', () => {
    const r = convert(
      `[av_textblock font_color='custom' color='#333333' size='17']
<h3>Title</h3>
First <a href="https://old.example.com/about/">about</a>

<ul><li>One</li><li>Two</li></ul>
[contact-form-7 id="5"]
[/av_textblock]`,
    );
    expect(types(r.blocks)).toEqual([
      'heading',
      'paragraph',
      { list: ['list-item', 'list-item'] },
      'paragraph',
    ]);
    expect(r.blocks[1]!.attrs.style).toEqual({
      color: { text: '#333333' },
      typography: { fontSize: '17px' },
    });
    expect(r.blocks[1]!.content).toEqual([
      { text: 'First ' },
      { type: 'link', href: '/about/', children: [{ text: 'about' }] },
    ]);
    expect(kinds(r)).toEqual(['shortcode:contact-form-7']);
  });

  it('converts separators, spacers and buttons', () => {
    const r = convert(
      `[av_hr class='invisible' height='30'][av_hr class='full' custom_border_color='#cccccc'][av_buttonrow alignment='right'][av_buttonrow_item label='One' link='manually,https://example.org' link_target='_blank'][av_buttonrow_item label='Two' link='post_tag,24' color='custom' custom_bg='#000000' custom_font='#ffffff'][/av_buttonrow][av_button_big label='Big' link='category,29']Description[/av_button_big]`,
    );
    expect(types(r.blocks)).toEqual([
      'spacer',
      'separator',
      { buttons: ['button', 'button'] },
      { buttons: ['button'] },
      'paragraph',
    ]);
    expect(r.blocks[0]!.attrs).toEqual({ height: '30px' });
    expect(r.blocks[1]!.attrs).toMatchObject({ className: 'is-style-wide' });
    const [one, two] = r.blocks[2]!.children!;
    expect(one!.attrs).toEqual({
      url: 'https://example.org',
      linkTarget: '_blank',
      rel: 'noopener noreferrer',
    });
    expect(two!.attrs).toEqual({
      url: '/tag/corsi',
      style: { color: { text: '#ffffff', background: '#000000' } },
    });
    expect(r.blocks[3]!.children![0]!.attrs.url).toBe('/category/influencer');
  });

  it('converts images with links, captions and images missing from the library', () => {
    const r = convert(
      `[av_image src='https://old.example.com/wp-content/uploads/a-300x200.jpg' attachment='501' alt='Sea' align='center' link='page,12' caption='yes']The sea[/av_image][av_image src='https://old.example.com/wp-content/uploads/z.png' link='lightbox'][/av_image]`,
    );
    expect(r.blocks[0]!.attrs).toEqual({
      id: 'm-a',
      url: '/media/a.jpg',
      alt: 'Sea',
      align: 'center',
      href: '/contatti',
      caption: [{ text: 'The sea' }],
    });
    // Not in the library: the file on the old site.
    expect(r.blocks[1]!.attrs).toEqual({
      url: 'https://old.example.com/wp-content/uploads/z.png',
      alt: '',
      href: 'https://old.example.com/wp-content/uploads/z.png',
    });
    expect(kinds(r)).toEqual(['media:z.png']);
  });

  it('turns tabs and toggles into headings, sliders into galleries, tables into tables', () => {
    const r = convert(
      `[av_toggle_container][av_toggle title='Q1']Answer one[/av_toggle][av_toggle title='Q2']Answer two[/av_toggle][/av_toggle_container]
[av_slideshow][av_slide id='502' title='Slide']Caption[/av_slide][/av_slideshow]
[av_table caption='Prices'][av_row row_style='x-heading-row'][av_cell]Name[/av_cell][av_cell]Price[/av_cell][/av_row][av_row][av_cell]<strong>Tea</strong>[/av_cell][av_cell]2 €[/av_cell][/av_row][/av_table]
[av_codeblock]&lt;b&gt;x&lt;/b&gt;[/av_codeblock]
[av_video src='https://www.youtube.com/watch?v=abc']`,
    );
    expect(types(r.blocks)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'paragraph',
      { gallery: ['image'] },
      'heading',
      'paragraph',
      'table',
      'code',
      'embed',
    ]);
    expect(text(r.blocks[0])).toBe('Q1');
    const table = r.blocks[7]!;
    expect(table.attrs).toEqual({
      head: [
        {
          cells: [
            { tag: 'th', content: [{ text: 'Name' }] },
            { tag: 'th', content: [{ text: 'Price' }] },
          ],
        },
      ],
      body: [
        {
          cells: [
            { tag: 'td', content: [{ text: 'Tea', marks: ['bold'] }] },
            { tag: 'td', content: [{ text: '2 €' }] },
          ],
        },
      ],
      caption: [{ text: 'Prices' }],
    });
    expect(r.blocks[8]!.content).toEqual([{ text: '<b>x</b>' }]);
    expect(r.blocks[9]!.attrs).toEqual({ url: 'https://www.youtube.com/watch?v=abc' });
    expect(kinds(r)).toEqual(['simplified:av_slideshow', 'simplified:av_toggle_container']);
  });

  it('keeps the texts of boxes, lists, notifications, testimonials and team members', () => {
    const r = convert(
      `[av_icon_box title='Fast' link='page,12']Very fast[/av_icon_box]
[av_iconlist][av_iconlist_item title='One'][/av_iconlist_item][av_iconlist_item title='Two'][/av_iconlist_item][/av_iconlist]
[av_notification title='Note' color='green']Careful[/av_notification]
[av_testimonials][av_testimonial_single name='Ann' subtitle='CEO']Great[/av_testimonial_single][/av_testimonials]
[av_team_member name='Bob' job='Chef' attachment='502'][av_team_icon title='Site' link='https://bob.example'][/av_team_icon][/av_team_member]`,
    );
    expect(types(r.blocks)).toEqual([
      { group: ['heading', 'paragraph'] },
      { list: ['list-item', 'list-item'] },
      { group: ['paragraph', 'paragraph'] },
      { quote: ['paragraph'] },
      { group: ['image', 'heading', 'paragraph', 'paragraph'] },
    ]);
    expect(r.blocks[0]!.children![0]!.content).toEqual([
      { type: 'link', href: '/contatti', children: [{ text: 'Fast' }] },
    ]);
    expect(r.blocks[2]!.attrs.style).toMatchObject({ color: { background: '#e0f1b5' } });
    expect(r.blocks[3]!.attrs.citation).toEqual([{ text: 'Ann, CEO' }]);
  });

  it('keeps the text of unknown shortcodes and reports them', () => {
    const r = convert(
      `[av_unknown_widget title='Hi']Some words[/av_unknown_widget][av_contact email='a@b.c'][av_google_map]`,
    );
    expect(types(r.blocks)).toEqual(['paragraph', 'paragraph']);
    expect(text(r.blocks[1])).toBe('Some words');
    expect(kinds(r)).toEqual([
      'skipped:av_contact',
      'skipped:av_google_map',
      'unknown:av_unknown_widget',
    ]);
  });

  it('lists the images a layout uses', () => {
    expect(
      imageAddresses(
        `[av_image src='https://x/y-150x150.jpg'][av_gallery ids='501,502'][av_textblock]<img src="/c.png">[/av_textblock]`,
        maps,
      ).sort(),
    ).toEqual([
      '/c.png',
      'https://old.example.com/wp-content/uploads/2020/01/a.jpg',
      'https://old.example.com/wp-content/uploads/2020/01/b.jpg',
      'https://x/y-150x150.jpg',
    ]);
    expect(mediaKey('https://x/uploads/My%20Photo-1024x768.JPG?v=1')).toBe('my photo.jpg');
    expect(mediaKey('/a/b-scaled.jpg')).toBe('b.jpg');
  });
});

describe('pages imported with the shortcodes as text', () => {
  it('rebuild the shortcode text from the blocks and convert it', () => {
    const imported: CxdBlock[] = [
      {
        id: '1',
        type: 'core/paragraph',
        v: 1,
        attrs: {},
        content: [
          {
            text: '[av_one_half first][av_heading heading=’Hi’ tag=’h2’][/av_heading]\n[av_textblock]',
          },
        ],
      },
      {
        id: '2',
        type: 'core/paragraph',
        v: 1,
        attrs: {},
        content: [{ text: 'Hello ' }, { text: 'world', marks: ['bold'] }],
      },
      {
        id: '3',
        type: 'core/list',
        v: 1,
        attrs: {},
        children: [{ id: '4', type: 'core/list-item', v: 1, attrs: {}, content: [{ text: 'A' }] }],
      },
      {
        id: '5',
        type: 'core/paragraph',
        v: 1,
        attrs: {},
        content: [
          {
            text: '[/av_textblock][/av_one_half][av_one_half][av_button label="Go" link="manually,/x"][/av_one_half]',
          },
        ],
      },
    ];
    expect(blocksHaveLayout(imported)).toBe(true);
    expect(blocksHaveLayout([imported[1]!])).toBe(false);
    const source = blocksToSource(imported);
    expect(source).toContain('[av_button label="Go" link="manually,/x"]');
    const r = convert(source, {});
    expect(types(r.blocks)).toEqual([
      {
        columns: [
          { column: ['heading', 'paragraph', { list: ['list-item'] }] },
          { column: [{ buttons: ['button'] }] },
        ],
      },
    ]);
    expect(r.blocks[0]!.children![0]!.children![1]!.content).toEqual([
      { text: 'Hello ' },
      { text: 'world', marks: ['bold'] },
    ]);
    expect(r.blocks[0]!.children![1]!.children![0]!.children![0]!.attrs.url).toBe('/x');
  });
});

describe('the WordPress export', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>Old</title>
  <link>https://old.example.com</link>
  <wp:base_blog_url>https://old.example.com</wp:base_blog_url>
  <wp:category><wp:term_id>29</wp:term_id><wp:category_nicename><![CDATA[influencer]]></wp:category_nicename></wp:category>
  <wp:tag><wp:term_id>24</wp:term_id><wp:tag_slug><![CDATA[corsi]]></wp:tag_slug></wp:tag>
  <item>
    <title><![CDATA[Home &amp; more]]></title>
    <link>https://old.example.com/home/</link>
    <content:encoded><![CDATA[[av_one_full first][av_textblock]Hi[/av_textblock][/av_one_full]]]></content:encoded>
    <wp:post_id>12</wp:post_id>
    <wp:post_name><![CDATA[home]]></wp:post_name>
    <wp:status><![CDATA[publish]]></wp:status>
    <wp:post_type><![CDATA[page]]></wp:post_type>
  </item>
  <item>
    <title>Plain</title>
    <link>https://old.example.com/?p=13</link>
    <content:encoded><![CDATA[Just text]]></content:encoded>
    <wp:post_id>13</wp:post_id>
    <wp:post_name>plain</wp:post_name>
    <wp:status>publish</wp:status>
    <wp:post_type>post</wp:post_type>
  </item>
  <item>
    <title>a.jpg</title>
    <wp:post_id>501</wp:post_id>
    <wp:post_type>attachment</wp:post_type>
    <wp:attachment_url><![CDATA[https://old.example.com/wp-content/uploads/a.jpg]]></wp:attachment_url>
  </item>
</channel>
</rss>`;

  it('is read with its layouts and the ids of the old site', () => {
    const file = readExport(xml);
    expect(file.entries).toEqual([
      {
        id: '12',
        wpType: 'page',
        type: 'page',
        slug: 'home',
        title: 'Home & more',
        status: 'publish',
        content: '[av_one_full first][av_textblock]Hi[/av_textblock][/av_one_full]',
        elements: 2,
      },
    ]);
    expect(file.maps).toEqual({
      posts: { '12': '/home' },
      media: { '501': 'https://old.example.com/wp-content/uploads/a.jpg' },
      terms: {
        '29': { taxonomy: 'category', slug: 'influencer' },
        '24': { taxonomy: 'tag', slug: 'corsi' },
      },
      origin: 'https://old.example.com',
    });
  });

  it('maps addresses and types', () => {
    expect(pathOf('https://x.com/a/b/')).toBe('/a/b');
    expect(pathOf('https://x.com/?page_id=3')).toBeNull();
    expect(contentTypeOf('post')).toBe('article');
    expect(contentTypeOf('portfolio')).toBe('portfolio');
    expect(contentTypeOf('Bad Type')).toBeNull();
  });
});

describe('boxes left empty', () => {
  it('drops columns that only held skipped elements', () => {
    last = convertLayout(
      "[av_one_half first][av_magazine link='category'][/av_one_half][av_one_half][av_textblock]Kept[/av_textblock][/av_one_half][av_one_third first][av_blog][/av_one_third][av_one_third][av_blog][/av_one_third][av_one_third][av_textblock]A[/av_textblock][/av_one_third]",
    ).blocks;
    expect(last.map((b) => b.type)).toEqual(['core/paragraph', 'core/paragraph']);
  });
});
