import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CxdBlock } from '../src/index.js';
import {
  addCss,
  decodeAttr,
  diviCode,
  diviColor,
  diviConditions,
  diviFont,
  diviIcon,
  diviKit,
  diviOptions,
  diviPageCss,
  diviPresets,
  diviToFresco,
  isDiviLayout,
  parseDivi,
  relativeUrl,
  type DiviConditionContext,
  type DiviContext,
} from '../src/divi.js';
import {
  boxShadow,
  cssLength,
  length,
  onDevice,
  responsive,
  sides,
  textShadowCss,
} from '../src/divi/values.js';

/** A synthetic Divi 4 layout with the features of a real restaurant site (no client content). */
const LAYOUT = readFileSync(new URL('./fixtures/divi-layout.txt', import.meta.url), 'utf8');

const ATTACHMENTS: Record<number, string> = {
  11: 'https://old.example/wp-content/uploads/2024/05/a.jpg',
  12: 'https://old.example/wp-content/uploads/2024/05/b.jpg',
};

function context(extra: Partial<DiviContext> = {}) {
  const warnings: string[] = [];
  const fonts = new Set<string>();
  const unconverted: string[] = [];
  const ctx: DiviContext = {
    warn: (m) => warnings.push(m),
    font: (f) => fonts.add(f),
    origin: 'https://old.example',
    mediaByUrl: (url) => (url.includes('plate') ? 'att:1' : undefined),
    attachment: (id) => (ATTACHMENTS[id] ? { ref: `att:${id}`, url: ATTACHMENTS[id]! } : undefined),
    postLink: (id) => (id === 125 ? '/menu/' : undefined),
    menuLocation: (menu) => (menu ? `menu-${menu}` : 'primary'),
    title: 'Our menu',
    unconverted: (type, n) => unconverted.push(`${type}:${n}`),
    ...extra,
  };
  return { ctx, warnings, fonts, unconverted };
}

const all = (blocks: CxdBlock[]): CxdBlock[] =>
  blocks.flatMap((b) => [b, ...all(b.children ?? [])]);
const ofType = (blocks: CxdBlock[], type: string) =>
  all(blocks).filter((b) => b.type === `fresco/${type}`);
const css = (block: CxdBlock) => String(block.attrs._custom_css ?? '');

describe('Divi shortcodes', () => {
  it('reads the tree of a layout, its attributes and the content of modules', () => {
    expect(isDiviLayout(LAYOUT)).toBe(true);
    expect(isDiviLayout('<p>[gallery ids="1"]</p>')).toBe(false);
    const tree = parseDivi(
      'x[et_pb_section a="1"][et_pb_row][et_pb_column type="4_4"][et_pb_text b="say %22hi%22 %91ok%93"]<p>Hi</p>[/et_pb_text][et_pb_split_track id="5" /][/et_pb_column][/et_pb_row][/et_pb_section]',
    );
    expect(tree).toHaveLength(1);
    const text = tree[0]!.children[0]!.children[0]!.children[0]!;
    expect(text.tag).toBe('et_pb_text');
    expect(text.attrs.b).toBe('say "hi" [ok]');
    expect(text.content).toBe('<p>Hi</p>');
    // A self-closing element does not swallow what follows.
    expect(tree[0]!.children[0]!.children[0]!.children[1]!.tag).toBe('et_pb_split_track');
    // Unclosed elements end with their parent.
    const open = parseDivi(
      '[et_pb_section][et_pb_row][et_pb_column]x[/et_pb_section][et_pb_section][/et_pb_section]',
    );
    expect(open).toHaveLength(2);
    expect(decodeAttr('%5c%92')).toBe('\\\\');
    expect(
      diviCode('a<!-- [et_pb_line_break_holder] -->b<!-- [et_pb_br_holder] -->&#91;x&#093;'),
    ).toBe('a\nb<br />[x]');
  });
});

describe('Divi values', () => {
  it('reads sizes, sides, colors, fonts and per-device values', () => {
    expect(length('48px')).toEqual({ size: 48, unit: 'px' });
    expect(length('12pt')).toEqual({ size: 16, unit: 'px' });
    expect(length('1.5')).toEqual({ size: 1.5, unit: 'px' });
    expect(length('3ch')).toBeUndefined();
    expect(cssLength('0px')).toBe('0');
    expect(cssLength('auto')).toBe('auto');
    expect(cssLength('calc(100% - 20px)')).toBe('calc(100% - 20px)');
    expect(cssLength('url(x)')).toBeUndefined();
    expect(sides('10px||2vw||false|false')).toEqual(['10px', undefined, '2vw', undefined]);
    expect(diviColor('RGBA(255,255,255,0)')).toBe('rgba(255,255,255,0)');
    expect(diviColor('gcid-f21ab52a-d63f-40b6-ad39-d8d97e171d76')).toBe(
      'var(--fr-c-gcid-f21ab52a)',
    );
    expect(diviColor('var(--gcid-primary-color)')).toBe('var(--fr-c-gcid-primary)');
    expect(diviColor('red;}')).toBeUndefined();
    expect(diviFont('Playfair Display|700|on|on|on|on|on||')).toEqual({
      family: 'Playfair Display',
      weight: '700',
      italic: true,
      uppercase: true,
      underline: true,
      smallCaps: true,
      lineThrough: true,
    });
    expect(diviFont('Default|on|||')).toEqual({ weight: '700' });
    expect(diviFont('--et_global_heading_font|--et_global_heading_font_weight')).toEqual({
      global: 'primary',
    });
    expect(diviFont('--et_global_body_font||')).toEqual({ global: 'text' });
    const attrs = {
      size: '20px',
      size_tablet: '18px',
      size_phone: '',
      size_last_edited: 'on|tablet',
    };
    expect(responsive(attrs, 'size')).toEqual({
      desktop: '20px',
      tablet: '18px',
      phone: undefined,
    });
    expect(onDevice(attrs, 'size', 'phone')).toBe('18px');
    // Without the responsive switch on, tablet and phone values are Divi's leftovers.
    expect(onDevice({ ...attrs, size_last_edited: 'off|desktop' }, 'size', 'tablet')).toBe('20px');
  });

  it('reads the box shadow presets with their changes, and text shadows', () => {
    expect(boxShadow({ box_shadow_style: 'preset1' })).toEqual({
      x: 0,
      y: 2,
      blur: 18,
      spread: 0,
      color: 'rgba(0,0,0,0.3)',
    });
    expect(boxShadow({ box_shadow_style: 'preset6' })?.inset).toBe(true);
    expect(
      boxShadow(
        {
          box_shadow_style: 'preset7',
          box_shadow_spread: '2px',
          box_shadow_spread__hover: '6px',
          box_shadow_spread__hover_enabled: 'on|hover',
          box_shadow_position: 'outer',
          box_shadow_blur: '1em',
        },
        '',
        'desktop',
        true,
      ),
    ).toEqual({ x: 10, y: 10, blur: 16, spread: 6, color: 'rgba(0,0,0,0.3)' });
    expect(boxShadow({ box_shadow_style: 'none' })).toBeUndefined();
    expect(
      textShadowCss(
        { title_text_shadow_style: 'preset3', title_text_shadow_color: '#000' },
        'title',
      ),
    ).toBe('0em 0em 0.3em #000');
  });

  it('keeps links to the old site as paths of this one', () => {
    expect(relativeUrl('https://old.example/menu/', 'https://old.example')).toBe('/menu/');
    expect(relativeUrl('https://old.example', 'https://old.example')).toBe('/');
    expect(relativeUrl('https://other.example/x', 'https://old.example')).toBe(
      'https://other.example/x',
    );
    expect(relativeUrl('https://old.examplex/x', 'https://old.example')).toBe(
      'https://old.examplex/x',
    );
    expect(relativeUrl('/x', '')).toBe('/x');
  });

  it("matches Divi's icons to Font Awesome", () => {
    expect(diviIcon('&#xe081;||divi||400')).toEqual({ set: 'solid', name: 'location-dot' });
    expect(diviIcon('&#xe065;||divi||400')).toEqual({ set: 'solid', name: 'comment' });
    expect(diviIcon('&#xe010;||divi||400')).toEqual({ set: 'regular', name: 'envelope' });
    expect(diviIcon('&#xe093;||divi||400')).toEqual({ set: 'brands', name: 'facebook-f' });
    expect(diviIcon('&#xf2e7;||fa||900')).toEqual({ set: 'solid', name: 'utensils' });
    expect(diviIcon('&#xf1ad;||fa||400')).toEqual({ set: 'regular', name: 'building' });
    expect(diviIcon('&#xf09a;||fa||400')).toEqual({ set: 'brands', name: 'facebook' });
    expect(diviIcon('&#61589;||fa||900')).toEqual({ set: 'solid', name: 'phone' });
    expect(diviIcon('$')).toEqual({ set: 'solid', name: 'arrow-right' });
    expect(diviIcon('%%42%%')).toBeUndefined();
    expect(diviIcon('&#xffff;||fa||900')).toBeUndefined();
    expect(diviIcon('&#xe9ff;||divi||400')).toBeUndefined();
    expect(diviIcon('')).toBeUndefined();
  });
});

describe('Divi layouts', () => {
  const { ctx, warnings, fonts, unconverted } = context();
  const blocks = diviToFresco(LAYOUT, ctx)!;

  it('lays out sections, specialty columns and inner rows as Divi does', () => {
    expect(blocks).toHaveLength(4);
    const [header] = blocks;
    // The specialty section: a gradient with a sharp line, no padding, Divi's white otherwise.
    expect(header!.attrs).toMatchObject({
      content_width: 'full',
      align_items: 'center',
      background_type: 'gradient',
      background_color: '#102a43',
      background_color_b: '#ffffff',
      background_stop: { size: 50, unit: '%' },
      background_stop_b: { size: 50, unit: '%' },
      background_angle: { size: 180, unit: 'deg' },
      _padding: { top: 0, right: 0, bottom: 0, left: 0, unit: 'px', linked: true },
    });
    // Its columns are in a row of the section's inner width, without gutters (gutter 1).
    const row = header!.children![0]!;
    expect(row.attrs).toMatchObject({
      flex_direction: 'row',
      'flex_direction@tablet': 'column',
      gap: { size: 0, unit: '%' },
      align_items: 'stretch',
      width: { size: 90, unit: '%' },
      'width@mobile': { size: 100, unit: '%' },
      _max_width: { size: 100, unit: '%' },
    });
    const [image, text] = row.children!;
    expect(image!.attrs).toMatchObject({
      width: { size: 33.333, unit: '%' },
      'width@tablet': { size: 100, unit: '%' },
      background_image: {
        id: null,
        url: 'https://old.example/wp-content/uploads/2024/05/harbour.jpg',
      },
      background_size: 'cover',
      background_attachment: 'fixed',
    });
    expect(text!.attrs).toMatchObject({ background_color: '#ffffff' });
    // The inner row: its own padding per device (mixed units: CSS), shadow and stacking.
    const inner = text!.children![0]!;
    expect(inner.attrs).toMatchObject({
      _z_index: 10,
      min_height: { size: 468, unit: 'px' },
      shadow: { x: 0, y: 32, blur: 48, spread: -32, color: 'rgba(0,0,0,0.16)' },
    });
    expect(css(inner)).toContain('selector{padding:30px 60px 6vw 60px}');
    expect(css(inner)).toContain('@media (max-width:980px){selector{padding:30px 40px 8vw 40px}}');
    expect(css(inner)).toContain('@media (max-width:767px){selector{padding:30px 20px 8vw 20px}}');
    expect(inner.children![0]!.attrs._padding).toMatchObject({ top: 30, unit: 'px' });
    // The spacer of the first column: its height per device.
    const [spacer] = ofType([image!], 'spacer');
    expect(spacer!.attrs).toMatchObject({
      space: { size: 0, unit: 'px' },
      'space@tablet': { size: 20, unit: 'vw' },
      'space@mobile': { size: 300, unit: 'px' },
    });
  });

  it('gives rows Divi’s width, gutters and spacing', () => {
    const rows = blocks[1]!.children!;
    expect(rows[0]!.attrs).toMatchObject({
      width: { size: 80, unit: '%' },
      _max_width: { size: 1080, unit: 'px' },
      gap: { size: 5.5, unit: '%' },
      'gap@tablet': { size: 30, unit: 'px' },
      align_items: 'stretch',
    });
    // The row's top margin collapses through the section (no padding at its top), as in Divi.
    expect(rows[0]!.attrs._margin).toBeUndefined();
    expect(blocks[1]!.attrs._margin).toMatchObject({ top: 10, unit: 'vw' });
    const [left, right] = rows[0]!.children!;
    expect(left!.attrs.width).toEqual({ size: 36.7, unit: '%' });
    expect(right!.attrs.width).toEqual({ size: 57.8, unit: '%' });
    expect(right!.attrs.shadow).toMatchObject({ x: 80, y: 80, blur: 0, color: '#102a43' });
    // Hidden on phones, its id and classes.
    expect(rows[1]!.attrs).toMatchObject({
      _hide_mobile: true,
      _css_id: 'cards',
      _css_classes: 'three cards',
      align_items: 'flex-start',
    });
    expect(rows[1]!.children![0]!.attrs).toMatchObject({
      width: { size: 29.667, unit: '%' },
      border_style: 'solid',
      border_color: 'rgba(0,0,0,0)',
    });
    // Modules but the last have Divi's space under them.
    const [heading, icon] = ofType([left!], 'heading').concat(ofType([left!], 'icon'));
    expect(heading!.attrs._margin).toMatchObject({ bottom: 7.493, unit: '%' });
    expect(heading!.attrs['_margin@tablet']).toMatchObject({ bottom: 30, unit: 'px' });
    expect(icon!.attrs._margin).toMatchObject({ bottom: 7.493 });
  });

  it('converts texts with their fonts, colors and headings', () => {
    const [text] = ofType(blocks, 'text');
    expect(text!.attrs).toMatchObject({
      typography_family: 'Cabin',
      typography_size: { size: 16, unit: 'px' },
      'typography_size@tablet': { size: 15, unit: 'px' },
      'typography_size@mobile': { size: 14, unit: 'px' },
      typography_line: { size: 1.8, unit: 'em' },
      color: 'rgba(85,101,112,0.8)',
      align: 'justify',
      _max_width: { size: 36, unit: 'vw' },
      '_max_width@tablet': { size: 90, unit: '%' },
      '_max_width@mobile': { size: 100, unit: '%' },
      _padding: { left: 10, unit: 'px' },
      _margin: { bottom: 2, unit: 'vw' },
    });
    const rules = css(text!);
    expect(rules).toContain(
      'selector .fr-text__body h1{font-family:"Playfair Display";font-weight:700;font-size:10vw;color:#102a43}',
    );
    expect(rules).toContain(
      'selector .fr-text__body h2{font-size:48px;color:var(--fr-c-gcid-f21ab52a)}',
    );
    expect(rules).toContain(
      'selector .fr-text__body h3{font-family:"Cabin";font-weight:700;text-transform:uppercase;font-size:13px;line-height:1.4em;letter-spacing:3px;color:#bd8f52}',
    );
    expect(rules).toContain('selector{margin-left:auto;margin-right:auto}');
    expect(rules).toContain('list-style-type:disc');
    expect([...fonts]).toEqual(expect.arrayContaining(['Cabin', 'Playfair Display', 'Shrikhand']));
  });

  it('converts buttons with Divi’s look, their own style, hover and shadows', () => {
    const [book, menuButton, plain] = ofType(blocks, 'button');
    expect(book!.attrs).toMatchObject({
      text: 'Book now',
      link: { url: '/menu/', newTab: true },
      align: 'left',
      'align@mobile': 'center',
      typography_size: { size: 13, unit: 'px' },
      typography_family: 'Cabin',
      typography_weight: '600',
      typography_transform: 'uppercase',
      typography_letter: { size: 2, unit: 'px' },
      typography_line: { size: 1.7, unit: 'em' },
      text_color: 'var(--fr-c-gcid-b847f424)',
      background_color: 'var(--fr-c-gcid-f21ab52a)',
      border_width: { top: 2, unit: 'px' },
      border_color: '#102A43',
      border_radius: { top: 0 },
      border_hover_color: '#d1d1d1',
      padding: { top: 16, right: 24, bottom: 16, left: 24, unit: 'px' },
      shadow: { x: 0, y: 0, blur: 0, spread: 2, color: '#ffffff', inset: true },
      shadow_hover: { spread: 6, inset: true },
    });
    expect(book!.attrs.icon).toBeUndefined();
    // The fullwidth header's button.
    expect(menuButton!.attrs).toMatchObject({ text: 'Menu', text_color: '#ffffff' });
    // Without a style of its own: Divi's default button; a dynamic link to a page.
    expect(plain!.attrs).toMatchObject({
      link: { url: '/menu/' },
      typography_size: { size: 20, unit: 'px' },
      background_color: 'transparent',
      text_color: '#2ea3f2',
      border_radius: { top: 3, unit: 'px' },
      padding: { top: 0.3, right: 1, unit: 'em' },
    });
  });

  it('converts headings, icons and images', () => {
    const [heading] = ofType(blocks, 'heading');
    expect(heading!.attrs).toMatchObject({
      title: 'Caught and cooked',
      tag: 'h2',
      title_typography_family: 'Shrikhand',
      title_typography_size: { size: 40, unit: 'px' },
      'title_typography_size@mobile': { size: 28, unit: 'px' },
      title_typography_weight: '500',
      title_color: '#102A43',
      align: 'center',
    });
    const [utensils, building] = ofType(blocks, 'icon');
    expect(utensils!.attrs).toMatchObject({
      icon: { set: 'solid', name: 'utensils' },
      primary_color: '#cd582f',
      size: { size: 38, unit: 'px' },
      align: 'center',
    });
    expect(building!.attrs).toMatchObject({
      icon: { set: 'regular', name: 'building' },
      link: { url: '/about/' },
    });
    const [plate, logo] = ofType(blocks, 'image');
    expect(plate!.attrs).toMatchObject({
      image: { id: 'att:1', alt: 'A plate' },
      align: 'left',
      image_shadow: { y: 80, blur: 80, spread: -32, color: 'rgba(16,42,67,0.32)' },
      image_border_style: 'solid',
      image_border_width: { top: 2, unit: 'px' },
      image_border_radius: { top: 8, unit: 'px' },
    });
    // Margins of mixed units (its own in vw, Divi's space under it in %) are CSS.
    expect(css(plate!)).toContain(
      'selector{margin:0 -10vw 4.758% 0}@media (max-width:980px){selector{margin:0 -10vw 30px 0}}',
    );
    // Its negative margin takes it past its column, as in Divi.
    expect(css(plate!)).toContain('.fr-container__in > selector.fr-e{max-width:none}');
    expect(logo!.attrs).toMatchObject({
      align: 'center',
      link_to: 'file',
      max_width: { size: 60, unit: '%' },
      'max_width@mobile': { size: 50, unit: '%' },
    });
    expect(logo!.attrs._margin).toBeUndefined();
  });

  it('converts blurbs with icons or images', () => {
    const [phone, circle] = ofType(blocks, 'icon-box');
    expect(phone!.attrs).toMatchObject({
      title: 'Phone',
      description: '+39 000 000 000\nEvery day',
      icon: { set: 'solid', name: 'comment' },
      view: 'stacked',
      shape: 'circle',
      icon_primary_color: '#f3ebdd',
      icon_secondary_color: 'var(--fr-c-gcid-f21ab52a)',
      icon_size: { size: 16, unit: 'px' },
      icon_padding: { size: 8, unit: 'px' },
      icon_radius: { top: 100, unit: '%' },
      position: 'left',
      align: 'left',
      title_typography_size: { size: 12, unit: 'px' },
      title_color: '#e2f4fa',
      description_typography_weight: '700',
      description_color: '#ffffff',
    });
    expect(css(phone!)).toContain('selector .fr-box{max-width:1100px;');
    expect(circle!.attrs).toMatchObject({
      view: 'framed',
      icon_primary_color: '#102a43',
      icon_secondary_color: '#bd8f52',
      icon_size: { size: 46, unit: 'px' },
      icon_padding: { size: 25, unit: 'px' },
    });
    const [team] = ofType(blocks, 'image-box');
    expect(team!.attrs).toMatchObject({
      title: 'Our team',
      description: 'Young and bold.',
      image: { url: 'https://old.example/wp-content/uploads/2024/05/heart.png', alt: 'Heart' },
      position: 'top',
      align: 'center',
    });
    expect(css(team!)).toContain('selector .fr-box__media{width:auto}');
  });

  it('converts dividers, galleries, menus, code and the post title', () => {
    const [line] = ofType(blocks, 'divider');
    expect(line!.attrs).toMatchObject({
      style: 'dashed',
      color: '#bd8f52',
      weight: { size: 2, unit: 'px' },
    });
    expect(css(line!)).toContain('selector{padding-top:19px;padding-bottom:19px}');
    const [grid] = ofType(blocks, 'gallery');
    expect(grid!.attrs).toMatchObject({
      images: [
        { id: 'att:11', url: ATTACHMENTS[11] },
        { id: 'att:12', url: ATTACHMENTS[12] },
      ],
      columns: 4,
      ratio: '38/27',
      _css_classes: 'col-width disable-lightbox',
    });
    expect(grid!.attrs.captions).toBeUndefined();
    const [slider] = ofType(blocks, 'image-carousel');
    expect(slider!.attrs).toMatchObject({ per_view: 1, autoplay: true, interval: 4000 });
    const [menu] = ofType(blocks, 'nav-menu');
    expect(menu!.attrs).toMatchObject({
      location: 'primary',
      align: 'center',
      toggle: 'tablet',
      typography_family: 'Playfair Display',
      typography_size: { size: 23, unit: 'px' },
      link_color: '#FFFFFF',
      current_color: 'var(--fr-c-gcid-b847f424)',
      sub_bg: '#102a43',
      mobile_bg: '#002D4C',
      toggle_color: '#ffffff',
      toggle_size: { size: 55, unit: 'px' },
    });
    const menuBox = all(blocks).find((b) => b.children?.includes(menu!))!;
    expect(menuBox.attrs).toMatchObject({
      flex_direction: 'column',
      background_color: 'rgba(255,255,255,0)',
    });
    expect(menuBox.children![0]!.attrs).toMatchObject({ link_to: 'custom', link: { url: '/' } });
    const [fullCode, code] = ofType(blocks, 'html');
    expect(fullCode!.attrs.code).toBe('<div class="note">[x]</div>');
    expect(code!.attrs.code).toContain('<iframe');
    expect(css(code!)).toContain('selector iframe{max-width:100%}');
    const title = ofType(blocks, 'heading').find((h) => h.attrs.title === 'Our menu')!;
    expect(title.attrs).toMatchObject({
      tag: 'h1',
      title_color: '#cd582f',
      title_typography_letter: { size: 4, unit: 'px' },
      align: 'center',
    });
    expect(css(title)).toContain('text-shadow:0.08em 0.08em 0em rgba(0,0,0,0.4)');
  });

  it('converts fullwidth sections, dividers, backgrounds and animations', () => {
    const full = blocks[2]!;
    expect(full.attrs).toMatchObject({
      shape_bottom: 'waves-layered',
      shape_bottom_color: '#FFFFFF',
      shape_bottom_height: { size: 120, unit: 'px' },
      shape_bottom_flip: true,
      shape_top: 'curve',
      shape_top_front: true,
    });
    expect(full.attrs.align_items).toBeUndefined();
    const header = full.children![0]!;
    expect(header.attrs).toMatchObject({
      background_color: '#002D4C',
      min_height: { size: 100, unit: 'vh' },
      _padding: { top: 0, bottom: 0 },
    });
    expect(ofType([header], 'heading').map((h) => h.attrs.title)).toEqual([
      'Welcome aboard',
      'Since 2006',
    ]);
    const sea = blocks[3]!;
    expect(sea.attrs).toMatchObject({
      background_image: { url: 'https://old.example/wp-content/uploads/2024/05/sea.jpg' },
      background_position: 'top left',
      background_size: 'contain',
      background_repeat: 'repeat',
      background_attachment: 'fixed',
      _animation: 'fade-up',
      _animation_delay: 200,
    });
  });

  it('keeps the text of modules without a counterpart and reports them', () => {
    const testimonial = ofType(blocks, 'text').find((t) =>
      String(t.attrs.content).includes('Lovely'),
    );
    expect(testimonial).toBeDefined();
    expect(unconverted).toEqual(['et_pb_testimonial:1']);
    expect(warnings).toContain(
      '1 Divi module(s) "et_pb_testimonial" have no Fresco counterpart yet: their text was kept.',
    );
    expect(warnings.some((w) => w.startsWith('inline formatting inside blurb texts'))).toBe(true);
    // Disabled modules are left out.
    expect(ofType(blocks, 'text').some((t) => String(t.attrs.content).includes('Hidden'))).toBe(
      false,
    );
  });

  it('applies module presets under the module’s own settings', () => {
    const { ctx: presetCtx } = context({
      presets: diviPresets({
        builder_global_presets_ng: {
          et_pb_text: {
            default: 'p1',
            presets: { p1: { settings: { text_text_color: '#123456', text_font_size: '20px' } } },
          },
        },
      }),
    });
    const out = diviToFresco(
      '[et_pb_section][et_pb_row][et_pb_column type="4_4"][et_pb_text _module_preset="default" text_font_size="12px"]x[/et_pb_text][/et_pb_column][/et_pb_row][/et_pb_section]',
      presetCtx,
    )!;
    expect(ofType(out, 'text')[0]!.attrs).toMatchObject({
      color: '#123456',
      typography_size: { size: 12, unit: 'px' },
    });
  });

  it('wraps rows and modules found alone (library items) in sections', () => {
    const { ctx: c2 } = context();
    const row = diviToFresco(
      '[et_pb_row][et_pb_column type="4_4"][et_pb_text]Row[/et_pb_text][/et_pb_column][/et_pb_row]',
      c2,
    )!;
    expect(row[0]!.type).toBe('fresco/container');
    expect(ofType(row, 'text')).toHaveLength(1);
    const module = diviToFresco(
      '[et_pb_button button_text="Go" button_url="#"][/et_pb_button]',
      c2,
    )!;
    expect(ofType(module, 'button')[0]!.attrs.text).toBe('Go');
    expect(diviToFresco('<p>No Divi here</p>', c2)).toBeNull();
    expect(diviToFresco('[et_pb_column]x[/et_pb_column]', c2)).toBeNull();
  });

  it('handles gradients, quarters and more', () => {
    const { ctx: c3, warnings: w3 } = context();
    const out = diviToFresco(
      '[et_pb_section use_background_color_gradient="on" background_color_gradient_stops="#000 0%|#111 50%|#222 100%" background_color="#fff"]' +
        '[et_pb_row use_custom_gutter="on" gutter_width="4" background_image="https://old.example/a.jpg" use_background_color_gradient="on" background_color_gradient_overlays_image="on" background_color_gradient_start="#000000" background_color_gradient_end="#ffffff"]' +
        '[et_pb_column type="1_4"][et_pb_text]a[/et_pb_text][/et_pb_column][et_pb_column type="1_4"][/et_pb_column][et_pb_column type="1_4"][/et_pb_column][et_pb_column type="1_4"][/et_pb_column][/et_pb_row]' +
        '[et_pb_row background_image="https://old.example/b.jpg" use_background_color_gradient="on" background_color_gradient_type="circular" background_color_gradient_stops="#000 0%|#fff 100%" background_color="#eee"][et_pb_column type="4_4"][et_pb_text text_orientation="right" background_layout="dark" transform_translate="10px|5px" transform_scale="110%|" transform_rotate="||45deg" positioning="absolute" position_origin_a="bottom_right" vertical_offset="10px" horizontal_offset="5%" custom_css_main_element="color: red;||font-size: 2em;" custom_css_free="a{}" sticky_position="top" height="200px" max_height="300px" overflow-x="hidden" overflow_x="hidden"]b[/et_pb_text][/et_pb_column][/et_pb_row]' +
        '[/et_pb_section]',
      c3,
    )!;
    const section = out[0]!;
    expect(css(section)).toContain('linear-gradient(180deg,#000 0%,#111 50%,#222 100%)');
    expect(css(section)).toContain('selector{background-color:#fff}');
    const [quarters, gradientRow] = section.children!;
    expect(quarters!.attrs).toMatchObject({
      gap: { size: 8, unit: '%' },
      'flex_direction@tablet': 'row',
      'flex_wrap@tablet': 'wrap',
      overlay_bg_type: 'gradient',
      overlay_bg_color: '#000000',
      overlay_bg_color_b: '#ffffff',
      background_image: { url: 'https://old.example/a.jpg' },
    });
    expect(quarters!.children![0]!.attrs.width).toEqual({ size: 19, unit: '%' });
    expect(css(gradientRow!)).toContain(
      'url("https://old.example/b.jpg"),radial-gradient(circle at center center,#000 0%,#fff 100%)',
    );
    const [text] = ofType([gradientRow!], 'text');
    expect(text!.attrs).toMatchObject({
      align: 'right',
      color: '#ffffff',
      _position: 'absolute',
      _offset_right: { size: 5, unit: '%' },
      _offset_bottom: { size: 10, unit: 'px' },
    });
    expect(css(text!)).toContain(
      'selector{transform:translate(10px,5px) scale(1.1,1.1) rotateZ(45deg)}',
    );
    expect(css(text!)).toContain('selector{color: red;\nfont-size: 2em;}');
    expect(css(text!)).toContain('selector{height:200px;max-height:300px}');
    expect(css(text!)).toContain('overflow-x:hidden');
    expect(w3).toContain('custom CSS of a module\'s part ("free") was left out.');
    expect(w3).toContain('sticky elements were imported as not sticky.');
  });

  it('reports dynamic content it cannot show, and keeps what it can', () => {
    const { ctx: c4, warnings: w4 } = context();
    const encode = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64');
    const out = diviToFresco(
      `[et_pb_section][et_pb_row][et_pb_column type="4_4"][et_pb_heading title="@ET-DC@${encode({ dynamic: true, content: 'post_title', settings: { before: '« ', after: ' »' } })}@"][/et_pb_heading][et_pb_button button_text="@ET-DC@${encode({ dynamic: true, content: 'post_date', settings: {} })}@" button_url="@ET-DC@${encode({ dynamic: true, content: 'custom_url', settings: { url: 'https://x.example/' } })}@"][/et_pb_button][et_pb_button button_url="@ET-DC@abcd@"][/et_pb_button][/et_pb_column][/et_pb_row][/et_pb_section]`,
      c4,
    )!;
    expect(ofType(out, 'heading')[0]!.attrs.title).toBe('« Our menu »');
    const [first, second] = ofType(out, 'button');
    expect(first!.attrs).toMatchObject({ text: 'Click here', link: { url: 'https://x.example/' } });
    expect(second!.attrs.link).toEqual({ url: '#' });
    expect(w4).toContain('the dynamic content "post_date" was left out.');
  });
});

describe('Divi layouts, as WordPress draws them', () => {
  const convert = (layout: string) => diviToFresco(layout, context().ctx)!;
  const row = (attrs = '', content = '[et_pb_text]<p>x</p>[/et_pb_text]') =>
    `[et_pb_row${attrs}][et_pb_column type="4_4"]${content}[/et_pb_column][/et_pb_row]`;

  it('gives full-width sections shares of the page, not of the content box', () => {
    const [plain, narrow] = convert(
      `[et_pb_section custom_padding="2%||||"]${row()}[/et_pb_section]` +
        `[et_pb_section width="80%"]${row()}[/et_pb_section]`,
    );
    expect(css(plain!)).toContain('selector{padding:2vw 0 4vw 0}');
    expect(css(plain!)).toContain('@media (max-width:980px){selector{padding:2vw 0 50px 0}}');
    expect(narrow!.attrs._padding).toMatchObject({ top: 4, bottom: 4, unit: '%' });
  });

  it('moves the top margin of a first row through a section without top padding', () => {
    const [section] = convert(
      `[et_pb_section custom_padding="0px||0px|||"]${row(' custom_margin="10vw||||false|false"')}${row(' custom_margin="5px||||"')}[/et_pb_section]`,
    );
    expect(section!.attrs._margin).toMatchObject({ top: 10, unit: 'vw' });
    const [first, second] = section!.children!;
    expect(first!.attrs._margin).toBeUndefined();
    expect(second!.attrs._margin).toMatchObject({ top: 5, unit: 'px' });
    // With padding at its top, it stays in the section.
    const [padded] = convert(`[et_pb_section]${row(' custom_margin="10vw||||"')}[/et_pb_section]`);
    expect(padded!.attrs._margin).toBeUndefined();
    expect(padded!.children![0]!.attrs._margin).toMatchObject({ top: 10, unit: 'vw' });
    // Nor with a border at its top.
    const [bordered] = convert(
      `[et_pb_section custom_padding="0px||0px||" border_width_all="2px"]${row(' custom_margin="10px||||"')}[/et_pb_section]`,
    );
    expect(bordered!.children![0]!.attrs._margin).toMatchObject({ top: 10, unit: 'px' });
  });

  it('adds up the margins that collapse, per device and across units', () => {
    const [pulled, sum, larger, smaller, devices] = convert(
      `[et_pb_section custom_padding="0px||0px||" custom_margin="-148px||||"]${row(' custom_margin="10vw||||"')}[/et_pb_section]` +
        `[et_pb_section custom_padding="0px||||" custom_margin="-40px||||"]${row(' custom_margin="10px||||"')}[/et_pb_section]` +
        `[et_pb_section custom_padding="0px||||" custom_margin="20px||||"]${row(' custom_margin="2vw||||"')}[/et_pb_section]` +
        `[et_pb_section custom_padding="0px||||" custom_margin="-20px||||"]${row(' custom_margin="-2vw||||"')}[/et_pb_section]` +
        `[et_pb_section custom_padding="0px||||" custom_margin_tablet="||||" custom_margin_last_edited="on|tablet"]${row(' custom_margin="40px||||" custom_margin_tablet="20px||||" custom_margin_phone="0px||||" custom_margin_last_edited="on|phone"')}[/et_pb_section]`,
    );
    expect(css(pulled!)).toContain('selector{margin:calc(-148px + 10vw) 0 0 0}');
    // Drawn over the section above it, as Divi's later sections are.
    expect(pulled!.attrs._z_index).toBe(1);
    expect(sum!.attrs._margin).toMatchObject({ top: -30, unit: 'px' });
    expect(sum!.attrs._z_index).toBe(1);
    expect(css(larger!)).toContain('selector{margin:max(20px, 2vw) 0 0 0}');
    expect(larger!.attrs._z_index).toBeUndefined();
    expect(css(smaller!)).toContain('selector{margin:min(-20px, -2vw) 0 0 0}');
    expect(devices!.attrs).toMatchObject({
      _margin: { top: 40, unit: 'px' },
      '_margin@tablet': { top: 20, unit: 'px' },
      '_margin@mobile': { top: 0, unit: 'px' },
    });
    expect(devices!.children![0]!.attrs._margin).toBeUndefined();
  });

  it('keeps 30px above and under inner rows on every device', () => {
    const [section] = convert(
      `[et_pb_section specialty="on"][et_pb_column type="1_2"][et_pb_text]a[/et_pb_text][/et_pb_column][et_pb_column type="1_2" specialty_columns="2"][et_pb_row_inner][et_pb_column_inner saved_specialty_column_type="1_2"][et_pb_text]b[/et_pb_text][/et_pb_column_inner][/et_pb_row_inner][/et_pb_column][/et_pb_section]`,
    );
    const inner = all([section!]).find(
      (b) =>
        b.children?.length === 1 && b.attrs['flex_direction@tablet'] === 'column' && !b.attrs.width,
    );
    expect(inner!.attrs._padding).toMatchObject({ top: 30, bottom: 30, unit: 'px' });
  });

  it('breaks headings where they fill up, with Divi’s space under them', () => {
    const blocks = convert(
      `[et_pb_section]${row('', '[et_pb_text]<h2>A long title</h2>[/et_pb_text][et_pb_heading title="Values" title_level="h3"][/et_pb_heading][et_pb_blurb title="Phone"]<p>1</p>[/et_pb_blurb][et_pb_post_title meta="off"][/et_pb_post_title]')}[/et_pb_section]` +
        '[et_pb_section fullwidth="on"][et_pb_fullwidth_header title="Hi"][/et_pb_fullwidth_header][/et_pb_section]',
    );
    expect(css(ofType(blocks, 'text')[0]!)).toContain('line-height:1em;text-wrap:wrap}');
    const [heading, postTitle, header] = ofType(blocks, 'heading');
    expect(css(heading!)).toContain(
      'selector .fr-heading__title{padding-bottom:10px;text-wrap:wrap}',
    );
    expect(css(postTitle!)).toContain('text-wrap:wrap');
    expect(css(header!)).toContain('selector .fr-heading__title{text-wrap:wrap}');
    expect(css(ofType(blocks, 'image-box')[0]!)).toContain(
      'selector .fr-box__title{text-wrap:wrap}',
    );
  });

  it('draws Divi’s hollow curves as Fresco’s inverted ones', () => {
    const [section] = convert(
      `[et_pb_section bottom_divider_style="curve" bottom_divider_color="#002D4C" bottom_divider_arrangement="above_content" bottom_divider_height_phone="41px" bottom_divider_height_last_edited="on|phone" top_divider_style="curve2"]${row()}[/et_pb_section]`,
    );
    expect(section!.attrs).toMatchObject({
      shape_bottom: 'curve',
      shape_bottom_negative: true,
      shape_bottom_front: true,
      shape_bottom_color: '#002D4C',
      shape_bottom_height: { size: 100, unit: 'px' },
      'shape_bottom_height@mobile': { size: 41, unit: 'px' },
      shape_top: 'curve-asymmetrical',
      shape_top_negative: true,
    });
  });
});

describe('a page’s custom CSS', () => {
  it('gives galleries the columns Divi’s CSS gave them, and returns the rest', () => {
    const { ctx } = context();
    const blocks = diviToFresco(
      '[et_pb_section][et_pb_row][et_pb_column type="4_4"][et_pb_gallery gallery_ids="11" module_class="col-width"][/et_pb_gallery][/et_pb_column][/et_pb_row][/et_pb_section]',
      ctx,
    )!;
    const rest = diviPageCss(
      blocks,
      `/** Desktop **/
@media (min-width: 981px){ .col-width .et_pb_gallery_item { width: 16.66% !important; clear: none !important; } }
@media (max-width: 980px){ .col-width .et_pb_gallery_item { width: 25% !important; } }
@media (max-width: 767px){ .col-width .et_pb_gallery_item { width: 33.33% !important; } }
@media (max-width: 479px){ .col-width .et_pb_gallery_item { width: 50% !important; } }
.disable-lightbox a { pointer-events: none; }`,
    );
    expect(ofType(blocks, 'gallery')[0]!.attrs).toMatchObject({
      columns: 6,
      'columns@tablet': 4,
      'columns@mobile': 3,
    });
    expect(rest).toBe('.disable-lightbox a { pointer-events: none; }');
    expect(diviPageCss(blocks, '.x{color:red}')).toBe('.x{color:red}');
    const out: Record<string, unknown> = {};
    addCss(out, '');
    addCss(out, 'a{}');
    addCss(out, 'b{}');
    expect(out._custom_css).toBe('a{}\nb{}');
  });
});

describe('Divi theme options', () => {
  const OPTIONS = {
    accent_color: '#cd582f',
    font_color: '#555555',
    header_color: '#102a43',
    link_color: '#0000ee',
    heading_font: 'Playfair Display',
    body_font: 'none',
    body_font_size: '15',
    body_header_size: '40',
    body_header_style: 'bold|uppercase|italic',
    body_header_spacing: '1',
    tablet_header_font_size: '30',
    tablet_body_font_size: '14',
    content_width: '1200',
    gutter_width: '2',
    all_buttons_font_size: '16',
    all_buttons_text_color: '#ffffff',
    all_buttons_bg_color: '#cd582f',
    all_buttons_border_width: '0',
    all_buttons_border_color: '#cd582f',
    all_buttons_border_radius: '20',
    all_buttons_spacing: '1',
    all_buttons_font: 'Cabin|700|||',
    et_global_colors: {
      'gcid-f21ab52a-d63f-40b6-ad39-d8d97e171d76': { color: '#cd582f', active: 'yes' },
      'gcid-b847f424-2dd2-4c68-93ef-acff44bfd0eb': {
        color: '#f3ebdd',
        active: 'yes',
        label: 'Sand',
      },
      'gcid-00000000-off': { color: '#000000', active: 'no' },
      'gcid-11111111-var': { color: 'var(--x)' },
    },
  };

  it('finds the options in their files', () => {
    expect(diviOptions(OPTIONS)).toBe(OPTIONS);
    expect(diviOptions({ context: 'epanel', data: { et_divi: OPTIONS } })).toBe(OPTIONS);
    const merged = diviOptions({
      et_divi: { divi_logo: '' },
      et_global_data: { global_colors: { 'gcid-22222222-x': { color: '#222222' } } },
    })!;
    expect(merged.et_global_colors).toEqual({ 'gcid-22222222-x': { color: '#222222' } });
    expect(diviOptions({ nothing: true })).toBeNull();
    expect(diviOptions(null)).toBeNull();
  });

  it('become Fresco’s kit, and the layout pages need', () => {
    const fonts: string[] = [];
    const { kit, layout, colors } = diviKit(OPTIONS, (f) => fonts.push(f));
    expect(kit.colors).toEqual([
      { id: 'primary', title: 'Headings', value: '#102a43' },
      { id: 'secondary', title: 'Secondary accent', value: '#cd582f' },
      { id: 'text', title: 'Text', value: '#555555' },
      { id: 'accent', title: 'Accent', value: '#cd582f' },
      { id: 'gcid-f21ab52a', title: 'Global color 1', value: '#cd582f' },
      { id: 'gcid-b847f424', title: 'Sand', value: '#f3ebdd' },
    ]);
    expect(colors['gcid-f21ab52a-d63f-40b6-ad39-d8d97e171d76']).toBe('gcid-f21ab52a');
    expect(fonts).toEqual(['Playfair Display', 'Open Sans']);
    expect(kit.breakpoints).toEqual({ tablet: 980, mobile: 767 });
    expect(kit.containerWidth).toEqual({ size: 1200, unit: 'px' });
    const texts = (kit.theme as { texts: Record<string, Record<string, unknown>> }).texts;
    expect(texts.h1).toMatchObject({
      family: 'Playfair Display',
      weight: '700',
      size: { size: 40, unit: 'px' },
      transform: 'uppercase',
      style: 'italic',
      letter: { size: 1, unit: 'px' },
      devices: { tablet: { size: { size: 30, unit: 'px' } } },
    });
    expect(texts.h2!.size).toEqual({ size: 34, unit: 'px' });
    expect(texts.body).toMatchObject({
      size: { size: 15, unit: 'px' },
      devices: { tablet: { size: { size: 14, unit: 'px' } } },
    });
    expect(layout).toMatchObject({
      contentWidth: 1200,
      gutter: 2,
      accent: '#cd582f',
      button: {
        size: { size: 16, unit: 'px' },
        color: '#ffffff',
        background: '#cd582f',
        radius: { size: 20, unit: 'px' },
        spacing: { size: 1, unit: 'px' },
        font: { family: 'Cabin', weight: '700' },
      },
    });
    // Without options: Divi's own defaults.
    const plain = diviKit(null, () => undefined);
    expect(plain.layout).toEqual({
      contentWidth: 1080,
      gutter: 3,
      sectionPadding: 4,
      rowPadding: 2,
      accent: '#2ea3f2',
    });
    // Theme buttons reach buttons without their own style.
    const { ctx } = context({ layout });
    const out = diviToFresco('[et_pb_button button_text="Go"][/et_pb_button]', ctx)!;
    expect(ofType(out, 'button')[0]!.attrs).toMatchObject({
      typography_size: { size: 16, unit: 'px' },
      typography_family: 'Cabin',
      text_color: '#ffffff',
      background_color: '#cd582f',
      border_radius: { top: 20 },
    });
  });

  it('read presets from options and layout files', () => {
    expect(
      diviPresets({
        presets: {
          et_pb_button: {
            default: 'a',
            presets: { a: { settings: { button_text_size: 14, x: {} } } },
          },
          other: {},
        },
      }),
    ).toEqual({
      et_pb_button: { default: 'a', presets: { a: { settings: { button_text_size: '14' } } } },
    });
  });
});

describe('Theme Builder conditions', () => {
  const ctx: DiviConditionContext = {
    note: (t) => notes.push(t),
    entryRef: (id) => (id === 12 ? 'post:12' : undefined),
    term: (taxonomy, id) =>
      id === 5
        ? { taxonomy: taxonomy === 'category' ? 'category' : taxonomy, slug: 'news' }
        : undefined,
    taxonomySlug: (t) => (t === 'category' ? 'category' : undefined),
    typeSlug: (t) => (t === 'project' ? 'project' : undefined),
  };
  const notes: string[] = [];

  it('become Fresco Pro’s rules', () => {
    expect(
      diviConditions(
        [
          'singular:post_type:page:all',
          'singular:post_type:post:id:12',
          'singular:post_type:project:all',
          'singular:taxonomy:category:term:id:5',
          'archive:all',
          'archive:taxonomy:category:all',
          'archive:taxonomy:category:term:id:5',
          'archive:post_type:post',
          'homepage',
          'search',
          '404',
          'singular',
        ],
        ['singular:post_type:page:id:12'],
        false,
        ctx,
      ),
    ).toEqual([
      { mode: 'include', rule: 'type:page' },
      { mode: 'include', rule: { $entry: 'post:12', prefix: 'entry:' } },
      { mode: 'include', rule: 'type:project' },
      { mode: 'include', rule: 'in-term:category:news' },
      { mode: 'include', rule: 'archive' },
      { mode: 'include', rule: 'taxonomy:category' },
      { mode: 'include', rule: 'term:category:news' },
      { mode: 'include', rule: 'archive-type:article' },
      { mode: 'include', rule: 'front' },
      { mode: 'include', rule: 'search' },
      { mode: 'include', rule: '404' },
      { mode: 'include', rule: 'singular' },
      { mode: 'exclude', rule: { $entry: 'post:12', prefix: 'entry:' } },
    ]);
    expect(diviConditions(['homepage'], [], true, ctx)).toEqual([{ mode: 'include', rule: 'all' }]);
    for (const rule of [
      'archive:user:id:1',
      'singular:post_type:nothing:all',
      'singular:post_type:page:id:99',
      'singular:post_type:page:children:id:12',
      'singular:taxonomy:category:term:id:9',
      'archive:post_type:nothing',
      'archive:taxonomy:nothing:all',
      'archive:taxonomy:category:term:id:9',
      'archive:taxonomy:category:other',
      'singular:other',
      'woocommerce',
    ]) {
      expect(diviConditions([rule], [], false, ctx)).toEqual([]);
    }
    expect(notes[0]).toBe(
      'the template condition "archive:user:id:1" has no counterpart and was left out',
    );
  });
});
