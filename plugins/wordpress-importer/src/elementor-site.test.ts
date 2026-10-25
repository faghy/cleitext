import { describe, expect, it } from 'vitest';
import type { CxdBlock } from '@cleitext/blocks';
import {
  convertConditions,
  kitToFresco,
  popupSettings,
  themeDefaults,
  themeHeadingFonts,
  withHeadingFonts,
  type ConditionContext,
} from './elementor-site';
import { metaValue, unserialize } from './php';
import { wxrToDocument } from './wxr';

/** PHP's serialize(), as WordPress writes arrays of post meta in its exports. */
function php(value: unknown): string {
  if (value === null || value === undefined) return 'N;';
  if (typeof value === 'boolean') return `b:${value ? 1 : 0};`;
  if (typeof value === 'number') return Number.isInteger(value) ? `i:${value};` : `d:${value};`;
  if (typeof value === 'string') return `s:${Buffer.byteLength(value, 'utf8')}:"${value}";`;
  const entries = Array.isArray(value)
    ? value.map((v, i) => [i, v] as const)
    : Object.entries(value as object);
  return `a:${entries.length}:{${entries.map(([k, v]) => `${typeof k === 'number' ? `i:${k};` : php(k)}${php(v)}`).join('')}}`;
}

describe('PHP serialized meta', () => {
  it('reads arrays, nested values and multibyte strings', () => {
    const value = {
      triggers: { page_load: 'yes', page_load_delay: 2.5 },
      list: ['include/general', 'perché'],
      on: true,
    };
    expect(unserialize(php(value))).toEqual(value);
    expect(metaValue('a:1:{i:0;s:15:"include/general";}')).toEqual(['include/general']);
    expect(metaValue('[{"a":1}]')).toEqual([{ a: 1 }]);
    expect(metaValue('plain')).toBe('plain');
    expect(unserialize('a:1:{i:0;s:99:"short";}')).toBeUndefined();
  });
});

describe('Elementor kit to Fresco', () => {
  it('converts colors, fonts, breakpoints, layout and the theme style', () => {
    const notes: string[] = [];
    const fonts: string[] = [];
    const { kit, info, css } = kitToFresco(
      {
        system_colors: [
          { _id: 'primary', title: 'Primary', color: '#6EC1E4' },
          { _id: 'accent', title: 'Accent', color: '#61CE70' },
        ],
        custom_colors: [{ _id: 'a1b2c3d', title: 'Brand', color: 'rgba(10,20,30,0.5)' }],
        system_typography: [
          {
            _id: 'primary',
            title: 'Primary',
            typography_typography: 'custom',
            typography_font_family: 'Abel',
            typography_font_weight: '600',
            typography_line_height: { unit: 'em', size: 1.2 },
          },
        ],
        custom_typography: [
          {
            _id: 'f00d',
            title: 'Big',
            typography_typography: 'custom',
            typography_font_family: 'Arial',
            typography_font_size: { unit: 'custom', size: 'clamp(2rem, 5vw, 3.5rem)' },
          },
        ],
        viewport_md: 768,
        viewport_lg: 1025,
        container_width: { unit: 'px', size: 1200 },
        space_between_widgets: { column: '16', row: '16', unit: 'px', isLinked: true },
        container_padding: {
          unit: 'px',
          top: '0',
          right: '0',
          bottom: '0',
          left: '0',
          isLinked: true,
        },
        body_background_background: 'classic',
        body_background_color: '#fffaf0',
        body_color: '#333333',
        link_normal_color: '#0055aa',
        __globals__: {
          link_hover_color: 'globals/colors?id=accent',
          h1_typography_typography: 'globals/typography?id=primary',
          button_typography_typography: 'globals/typography?id=primary',
        },
        h2_typography_typography: 'custom',
        h2_typography_font_family: 'Lora',
        h2_typography_font_size: { unit: 'px', size: 36 },
        h2_color: '#222222',
        button_text_color: '#ffffff',
        button_background_color: '#ff6600',
        button_hover_background_color: '#cc5200',
        button_border_radius: {
          unit: 'px',
          top: '4',
          right: '4',
          bottom: '4',
          left: '4',
          isLinked: true,
        },
        button_padding: {
          unit: 'px',
          top: '14',
          right: '28',
          bottom: '14',
          left: '28',
          isLinked: false,
        },
        image_border_radius: { unit: 'px', top: '8', right: '8', bottom: '8', left: '8' },
        form_field_border_color: '#cccccc',
        form_field_focus_border_color: '#0055aa',
        lightbox_color: 'rgba(0,0,0,0.9)',
        page_title_selector: 'h1.entry-title, .hello-title',
        custom_css: 'body { letter-spacing: .01em }',
      },
      {},
      { note: (m) => notes.push(m), font: (f) => fonts.push(f) },
    );
    expect(kit).toMatchObject({
      colors: [
        { id: 'primary', value: '#6EC1E4' },
        { id: 'accent', value: '#61CE70' },
        { id: 'a1b2c3d', title: 'Brand', value: 'rgba(10,20,30,0.5)' },
      ],
      fonts: [
        { id: 'primary', family: 'Abel', weight: '600', line: { size: 1.2, unit: 'em' } },
        { id: 'f00d', family: 'Arial', size: { size: 3.5, unit: 'rem' } },
      ],
      // Elementor's min widths become Fresco's max widths.
      breakpoints: { tablet: 1024, mobile: 767 },
      containerWidth: { size: 1200, unit: 'px' },
      gap: { size: 16, unit: 'px' },
      style: {
        background: '#fffaf0',
        text: '#333333',
        link: '#0055aa',
        linkHover: 'var(--fr-c-accent)',
      },
      theme: {
        texts: {
          h1: { font: 'primary', fontAll: true },
          h2: { family: 'Lora', size: { size: 36, unit: 'px' }, color: '#222222' },
        },
        button: {
          font: 'primary',
          fontAll: true,
          color: '#ffffff',
          background: '#ff6600',
          hoverBackground: '#cc5200',
          radius: { size: 4, unit: 'px' },
          paddingY: { size: 14, unit: 'px' },
          paddingX: { size: 28, unit: 'px' },
        },
        image: { radius: { size: 8, unit: 'px' } },
        field: { borderColor: '#cccccc', focusBorderColor: '#0055aa' },
        lightbox: { background: 'rgba(0,0,0,0.9)' },
      },
    });
    expect(String(kit.titleSelector)).toMatch(/\.entry-title.*\.hello-title$/);
    expect(info).toEqual({
      fontsWithLine: ['primary'],
      fonts: { primary: ['family', 'weight', 'line'], f00d: ['family', 'size'] },
      containerPadding: { top: 0, right: 0, bottom: 0, left: 0, unit: 'px', linked: true },
    });
    expect(css).toBe('body { letter-spacing: .01em }');
    expect(fonts).toEqual(['Abel', 'Arial', 'Lora']);
  });
});

describe('Theme Builder conditions and popups', () => {
  const ctx: ConditionContext = {
    note: () => {},
    entryRef: (id) => (id === 12 ? 'post:12' : undefined),
    term: (taxonomy, id) =>
      id === 5 && (taxonomy === 'category' || taxonomy === '')
        ? { taxonomy: 'category', slug: 'news' }
        : undefined,
    taxonomySlug: (t) => (t === 'post_tag' ? 'tag' : t === 'category' ? 'category' : undefined),
    typeSlug: (t) => (t === 'post' ? 'article' : t === 'portfolio' ? 'portfolio' : undefined),
  };

  it('maps include and exclude rules', () => {
    expect(
      convertConditions(
        [
          'include/general',
          'include/singular/post',
          'include/singular/page/12',
          'include/singular/in_category/5',
          'include/singular/front_page',
          'include/archive/category/5',
          'include/archive/post_tag',
          'include/archive/portfolio_archive',
          'include/archive/search',
          'include/singular/not_found404',
          'exclude/singular/page/12',
          'include/singular/by_author/3',
        ],
        ctx,
      ),
    ).toEqual([
      { mode: 'include', rule: 'all' },
      { mode: 'include', rule: 'type:article' },
      { mode: 'include', rule: { $entry: 'post:12', prefix: 'entry:' } },
      { mode: 'include', rule: 'in-term:category:news' },
      { mode: 'include', rule: 'front' },
      { mode: 'include', rule: 'term:category:news' },
      { mode: 'include', rule: 'taxonomy:tag' },
      { mode: 'include', rule: 'archive-type:portfolio' },
      { mode: 'include', rule: 'search' },
      { mode: 'include', rule: '404' },
      { mode: 'exclude', rule: { $entry: 'post:12', prefix: 'entry:' } },
    ]);
  });

  it('maps popup triggers, timing and layout', () => {
    const notes: string[] = [];
    expect(
      popupSettings(
        {
          width: { unit: 'px', size: 500 },
          horizontal_position: 'right',
          vertical_position: 'bottom',
          entrance_animation: 'slideInUp',
          prevent_close_on_esc_key: 'yes',
          close_automatically: 20,
        },
        {
          triggers: { scrolling: 'yes', scrolling_offset: 40, exit_intent: 'yes' },
          timing: {
            times: 'yes',
            times_times: 1,
            times_period: 'week',
            devices: 'yes',
            devices_devices: ['desktop', 'tablet'],
          },
        },
        { note: (m) => notes.push(m) },
      ),
    ).toEqual({
      trigger: 'scroll',
      scroll: 40,
      frequency: 'days',
      days: 7,
      devices: ['desktop', 'tablet'],
      width: 500,
      position: 'bottom-right',
      overlay: true,
      closeButton: true,
      closeOnOverlay: true,
      closeOnEsc: false,
      preventScroll: false,
      animation: 'slide-up',
      autoClose: 20,
    });
    expect(notes).toEqual(['popups with several triggers keep the first one']);
  });
});

// ---- A whole Elementor site, as WordPress exports it -----------------------------------------

const meta = (key: string, value: string) =>
  `<wp:postmeta><wp:meta_key>${key}</wp:meta_key><wp:meta_value><![CDATA[${value}]]></wp:meta_value></wp:postmeta>`;

const item = (fields: {
  id: number;
  title: string;
  type: string;
  name?: string;
  status?: string;
  content?: string;
  date?: string;
  metas?: string;
  link?: string;
}) => `<item><title>${fields.title}</title>${fields.link ? `<link>${fields.link}</link>` : ''}<dc:creator>ann</dc:creator>
<wp:post_id>${fields.id}</wp:post_id><wp:post_date_gmt>${fields.date ?? '2026-01-01 10:00:00'}</wp:post_date_gmt><wp:post_name>${fields.name ?? `p${fields.id}`}</wp:post_name>
<wp:post_type>${fields.type}</wp:post_type><wp:status>${fields.status ?? 'publish'}</wp:status><content:encoded><![CDATA[${fields.content ?? ''}]]></content:encoded>${fields.metas ?? ''}</item>`;

const builder = (elements: unknown[]) =>
  meta('_elementor_edit_mode', 'builder') + meta('_elementor_data', JSON.stringify(elements));

const heading = (title: string) => ({
  id: `h${title.length}`,
  elType: 'widget',
  widgetType: 'heading',
  settings: { title },
});

const site = `<?xml version="1.0"?>
<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Studio</title><link>https://studio.example</link><wp:wxr_version>1.2</wp:wxr_version><wp:base_blog_url>https://studio.example</wp:base_blog_url>
<wp:author><wp:author_id>1</wp:author_id><wp:author_login>ann</wp:author_login><wp:author_email>ann@studio.example</wp:author_email></wp:author>
<wp:category><wp:term_id>5</wp:term_id><wp:category_nicename>news</wp:category_nicename><wp:category_parent></wp:category_parent><wp:cat_name>News</wp:cat_name></wp:category>
<wp:term><wp:term_id>9</wp:term_id><wp:term_taxonomy>nav_menu</wp:term_taxonomy><wp:term_slug>main-menu</wp:term_slug><wp:term_name>Main menu</wp:term_name></wp:term>
${item({ id: 3, title: 'Logo', type: 'attachment', metas: '' }).replace('</item>', '<wp:attachment_url>https://studio.example/wp-content/uploads/logo.png</wp:attachment_url></item>')}
${item({ id: 4, title: 'Brand Sans', type: 'attachment' }).replace('</item>', '<wp:attachment_url>https://studio.example/wp-content/uploads/brand.woff2</wp:attachment_url></item>')}
${item({
  id: 2,
  title: 'Default Kit',
  type: 'elementor_library',
  metas:
    meta('_elementor_template_type', 'kit') +
    meta(
      '_elementor_page_settings',
      php({
        system_colors: [{ _id: 'primary', title: 'Primary', color: '#123456' }],
        system_typography: [
          {
            _id: 'primary',
            title: 'Primary',
            typography_typography: 'custom',
            typography_font_family: 'Abel',
            typography_font_weight: '700',
          },
        ],
        viewport_tablet: 1000,
        viewport_mobile: 700,
        custom_css: '.site { color: red }',
      }),
    ),
})}
${item({ id: 1, title: 'Old Kit', type: 'elementor_library', date: '2020-01-01 10:00:00', metas: meta('_elementor_template_type', 'kit') + meta('_elementor_page_settings', php({ system_colors: [{ _id: 'primary', title: 'Primary', color: '#999999' }] })) })}
${item({
  id: 20,
  title: 'Site header',
  type: 'elementor_library',
  metas:
    meta('_elementor_template_type', 'header') +
    meta('_elementor_conditions', php(['include/general', 'exclude/singular/page/30'])) +
    builder([
      {
        id: 'c',
        elType: 'container',
        settings: { flex_direction: 'row' },
        elements: [
          {
            id: 'l',
            elType: 'widget',
            widgetType: 'theme-site-logo',
            settings: {
              image: { id: 3, url: 'https://studio.example/wp-content/uploads/logo.png' },
            },
          },
          { id: 'm', elType: 'widget', widgetType: 'nav-menu', settings: { menu: 'main-menu' } },
        ],
      },
    ]),
})}
${item({
  id: 21,
  title: 'Newsletter',
  type: 'elementor_library',
  metas:
    meta('_elementor_template_type', 'popup') +
    meta('_elementor_conditions', php(['include/singular/post'])) +
    meta(
      '_elementor_popup_display_settings',
      php({ triggers: { page_load: 'yes', page_load_delay: 5 }, timing: {} }),
    ) +
    meta('_elementor_page_settings', php({ width: { unit: 'px', size: 480 } })) +
    builder([heading('Join us')]),
})}
${item({ id: 22, title: 'Promo', type: 'elementor_library', metas: meta('_elementor_template_type', 'widget') + builder([heading('Global promo')]) })}
${item({ id: 23, title: 'Product page', type: 'elementor_library', metas: meta('_elementor_template_type', 'product') + builder([]) })}
${item({
  id: 30,
  title: 'Home',
  type: 'page',
  link: 'https://studio.example/',
  name: 'home',
  content: '<p>Fallback</p>',
  metas:
    meta('_wp_page_template', 'elementor_canvas') +
    meta(
      '_elementor_page_settings',
      php({ hide_title: 'yes', custom_css: 'selector h1 { margin: 0 }' }),
    ) +
    builder([
      heading('Welcome'),
      { id: 'g', elType: 'widget', widgetType: 'global', templateID: 22, settings: [] },
      {
        id: 'b',
        elType: 'widget',
        widgetType: 'button',
        settings: {
          text: 'Subscribe',
          __dynamic__: {
            link: '[elementor-tag id="x" name="popup" settings="%7B%22popup%22%3A%2221%22%7D"]',
          },
          typography_typography: 'custom',
          typography_font_family: 'Karla',
        },
      },
    ]),
})}
${item({ id: 31, title: 'Launch', type: 'e-landing-page', link: 'https://studio.example/launch/', name: 'launch', metas: builder([heading('Launch day')]) })}
${item({
  id: 40,
  title: 'Analytics',
  type: 'elementor_snippet',
  content: '<script>console.log(1)</script>',
  metas:
    meta('_elementor_location', 'elementor_body_end') +
    meta('_elementor_conditions', php(['include/general'])),
})}
${item({
  id: 41,
  title: 'Brand Sans',
  type: 'elementor_font',
  metas: meta(
    'elementor_font_files',
    php([
      {
        font_weight: '400',
        font_style: 'normal',
        woff2: { id: 4, url: 'https://studio.example/wp-content/uploads/brand.woff2' },
      },
    ]),
  ),
})}
${item({ id: 50, title: 'Header', type: 'nav_menu_item', metas: meta('_menu_item_type', 'custom') + meta('_menu_item_url', 'https://studio.example/') + meta('_menu_item_menu_item_parent', '0') }).replace('</item>', '<category domain="nav_menu" nicename="main-menu"><![CDATA[Main menu]]></category></item>')}
</channel></rss>`;

describe('An Elementor site in a WordPress export', () => {
  const { document, warnings } = wxrToDocument(site, { locale: 'en' });
  const entry = (ref: string) => document.entries!.find((e) => e.ref === ref)!;

  it('turns the Theme Builder templates and popups into Fresco Pro templates', () => {
    const header = entry('post:20');
    expect(header).toMatchObject({
      type: 'fresco_template',
      title: 'Site header',
      status: 'published',
    });
    expect(header.document.editor).toEqual({
      id: 'fresco',
      data: {
        template: {
          kind: 'header',
          conditions: [
            { mode: 'include', rule: 'all' },
            { mode: 'exclude', rule: { $entry: 'post:30', prefix: 'entry:' } },
          ],
        },
      },
    });
    const [logo, menu] = (header.document.blocks[0] as CxdBlock).children!;
    expect(logo).toMatchObject({ type: 'fresco-pro/site-logo', attrs: { logo: { id: 'att:3' } } });
    expect(menu).toMatchObject({ type: 'fresco/nav-menu', attrs: { location: 'main-menu' } });
    // The menu the widget shows gets that location.
    expect(document.menus).toEqual([
      expect.objectContaining({ name: 'Main menu', location: 'main-menu' }),
    ]);

    const popup = entry('post:21');
    expect(popup.document.editor?.data).toMatchObject({
      template: { kind: 'popup', conditions: [{ mode: 'include', rule: 'type:article' }] },
      popup: { trigger: 'load', delay: 5, width: 480, frequency: 'always' },
    });
    expect(entry('post:22').document.editor?.data).toMatchObject({ template: { kind: 'section' } });
    // Templates of other kinds (shop) are reported, the kit is not a template.
    expect(document.entries!.some((e) => e.ref === 'post:23' || e.ref === 'post:2')).toBe(false);
    const report = warnings.join('\n');
    expect(report).toContain('3 Elementor template(s) (1 header, 1 popup, 1 section)');
    expect(report).toContain('type "product"');
  });

  it('keeps page settings, global widgets and popup links on pages', () => {
    const home = entry('post:30');
    expect(home.document.editor).toEqual({
      id: 'fresco',
      data: { layout: 'canvas', hideTitle: true, customCss: 'selector h1 { margin: 0 }' },
    });
    const [title, global, button] = (home.document.blocks[0] as CxdBlock).children!;
    expect(title!.type).toBe('fresco/heading');
    expect(global).toMatchObject({
      type: 'fresco-pro/template',
      attrs: { template: { $entry: 'post:22' } },
    });
    expect(button!.attrs.__dynamic).toEqual({
      link: { tag: 'popup', key: { $entry: 'post:21' }, kind: 'url' },
    });
    // Landing pages are pages.
    expect(entry('post:31')).toMatchObject({ type: 'page', slug: 'launch' });
  });

  it('gives Fresco the kit and Fresco Pro the site CSS, custom code and fonts', () => {
    expect(document.plugins?.fresco).toEqual({
      kit: {
        colors: [{ id: 'primary', title: 'Primary', value: '#123456' }],
        fonts: [{ id: 'primary', title: 'Primary', family: 'Abel', weight: '700' }],
        breakpoints: { tablet: 1000, mobile: 700 },
        themeColors: false,
        themeFonts: false,
        googleFonts: ['Abel', 'Karla'],
      },
    });
    expect(document.plugins?.['fresco-pro']).toEqual({
      css: '.site { color: red }',
      snippets: [
        {
          id: 'elementor-1',
          name: 'Analytics',
          location: 'body_end',
          code: '<script>console.log(1)</script>',
          enabled: true,
          conditions: [{ mode: 'include', rule: 'all' }],
        },
      ],
      fonts: [
        {
          family: 'Brand Sans',
          fallback: 'sans-serif',
          files: [
            {
              id: 'att:4',
              url: 'https://studio.example/wp-content/uploads/brand.woff2',
              weight: '400',
              style: 'normal',
            },
          ],
        },
      ],
    });
  });
});

describe('Spam protection for imported forms', () => {
  const form = {
    id: 'f',
    elType: 'widget',
    widgetType: 'form',
    settings: {
      form_fields: [
        { _id: 'a', custom_id: 'name', field_type: 'text', field_label: 'Name' },
        { _id: 'b', custom_id: 'captcha', field_type: 'recaptcha_v3' },
      ],
    },
  };
  const page = (forms: unknown[]) =>
    site.replace(
      '</channel>',
      `${item({ id: 90, title: 'Contact', type: 'page', name: 'contact', metas: builder(forms) })}</channel>`,
    );
  const formsOf = (blocks: CxdBlock[]): CxdBlock[] =>
    blocks.flatMap((b) => [
      ...(b.type === 'fresco-pro/form' ? [b] : []),
      ...formsOf(b.children ?? []),
    ]);

  it('gives every form Turnstile when asked, and says how many', () => {
    const { document, warnings } = wxrToDocument(page([form, { ...form, id: 'g' }]), {
      locale: 'en',
      formCaptcha: 'turnstile',
    });
    const contact = document.entries!.find((e) => e.title === 'Contact')!;
    const forms = formsOf(contact.document!.blocks as CxdBlock[]);
    expect(forms.map((f) => f.attrs.captcha)).toEqual(['turnstile', 'turnstile']);
    // The reCAPTCHA field is left out either way.
    expect((forms[0]!.attrs.fields as unknown[]).length).toBe(1);
    expect(warnings).toContain(
      "2 form(s) protected with Turnstile: add the site and secret keys in Fresco Pro → Forms → Spam protection (without them the Captcha plugin's keys are used).",
    );
  });

  it('gives every form the site captcha when asked', () => {
    const { document, warnings } = wxrToDocument(page([form]), {
      locale: 'en',
      formCaptcha: 'site',
    });
    const contact = document.entries!.find((e) => e.title === 'Contact')!;
    expect(formsOf(contact.document!.blocks as CxdBlock[])[0]!.attrs.captcha).toBe('site');
    expect(warnings).toContain(
      '1 form(s) protected with the site captcha: activate the Captcha plugin and set its keys in Settings → Captcha.',
    );
  });

  it('leaves forms as they were by default', () => {
    const { document, warnings } = wxrToDocument(page([form]), { locale: 'en' });
    const contact = document.entries!.find((e) => e.title === 'Contact')!;
    expect(formsOf(contact.document!.blocks as CxdBlock[])[0]!.attrs.captcha).toBeUndefined();
    expect(warnings.join('\n')).not.toContain('Turnstile');
  });
});

describe('Elementor breakpoints', () => {
  it('imports the extra breakpoints the kit has on, with their values or the defaults', () => {
    const notes: string[] = [];
    const { kit } = kitToFresco(
      {
        viewport_tablet: 1000,
        viewport_mobile: 700,
        viewport_laptop: 1300,
        viewport_widescreen: 2000,
        // Off in the kit: not imported.
        viewport_mobile_extra: 850,
        active_breakpoints: [
          'viewport_mobile',
          'viewport_tablet',
          'viewport_tablet_extra',
          'viewport_laptop',
          'viewport_widescreen',
        ],
      },
      {},
      { note: (m) => notes.push(m), font: () => undefined },
    );
    expect(kit.breakpoints).toEqual({
      tablet: 1000,
      mobile: 700,
      tablet_extra: 1200,
      laptop: 1300,
      widescreen: 2000,
    });
    expect(notes.join(' ')).not.toContain('breakpoints');
  });

  it('keeps every device of a popup rule', () => {
    const popup = (devices: string[]) =>
      popupSettings(
        {},
        { timing: { devices: 'yes', devices_devices: devices } },
        { note: () => undefined },
      );
    expect(popup(['desktop', 'laptop', 'mobile_extra'])).toMatchObject({
      devices: ['desktop', 'laptop', 'mobile_extra'],
      allDevices: true,
    });
    expect(popup(['desktop', 'tablet']).allDevices).toBeUndefined();
  });
});

describe('Links of Elementor widgets to the old site', () => {
  it('become paths of this site, as menus do', () => {
    const page = site.replace(
      '</channel>',
      `${item({
        id: 91,
        title: 'Links',
        type: 'page',
        name: 'links',
        metas: builder([
          {
            id: 'b1',
            elType: 'widget',
            widgetType: 'button',
            settings: { text: 'Contact', link: { url: 'https://studio.example/contact/' } },
          },
          {
            id: 'b2',
            elType: 'widget',
            widgetType: 'button',
            settings: { text: 'Out', link: { url: 'https://elsewhere.example/' } },
          },
        ]),
      })}</channel>`,
    );
    const { document } = wxrToDocument(page, { locale: 'en' });
    const links = document.entries!.find((e) => e.title === 'Links')!;
    const buttons = (links.document!.blocks as CxdBlock[])[0]!.children!;
    expect(buttons.map((b) => (b.attrs.link as { url: string }).url)).toEqual([
      '/contact/',
      'https://elsewhere.example/',
    ]);
  });
});

describe('A theme’s Elementor kit (cimoneoutdoor.com)', () => {
  const themeKit = {
    system_colors: [
      { _id: 'primary', title: 'Primary', color: '#e36b28' },
      { _id: 'primary_hover', title: 'Primary hover', color: '#c55515' },
    ],
    // The theme's own system fonts: no "primary".
    system_typography: [
      {
        _id: 'heading_title',
        title: 'Heading Title',
        typography_typography: 'custom',
        typography_font_family: 'Rubik',
        typography_font_weight: '800',
        typography_text_transform: 'uppercase',
        typography_font_size: { unit: 'px', size: 48 },
        typography_font_size_tablet: { unit: 'px', size: 32 },
        typography_font_size_mobile: { unit: 'px', size: 26 },
        typography_line_height: { unit: 'px', size: 48 },
        typography_line_height_tablet: { unit: 'px', size: 32 },
        typography_line_height_mobile: { unit: 'px', size: 26 },
      },
      {
        _id: 'heading_sub',
        title: 'Heading Sub',
        typography_typography: 'custom',
        typography_font_family: 'Inter',
        typography_font_weight: '700',
        typography_font_size: { unit: 'px', size: 12 },
        typography_letter_spacing: { unit: 'px', size: 3.5 },
        typography_letter_spacing_mobile: { unit: 'px', size: 2 },
        typography_word_spacing: { unit: 'em', size: 0.1 },
        typography_text_decoration: 'underline',
      },
    ],
  };

  it('keeps ids with hyphens, letter spacing and the values of tablets and phones', () => {
    const { kit, info } = kitToFresco(themeKit, {}, { note: () => {}, font: () => {} });
    expect(kit.colors).toEqual([
      { id: 'primary', title: 'Primary', value: '#e36b28' },
      { id: 'primary-hover', title: 'Primary hover', value: '#c55515' },
    ]);
    expect(kit.fonts).toEqual([
      {
        id: 'heading-title',
        title: 'Heading Title',
        family: 'Rubik',
        weight: '800',
        size: { size: 48, unit: 'px' },
        line: { size: 48, unit: 'px' },
        transform: 'uppercase',
        devices: {
          tablet: { size: { size: 32, unit: 'px' }, line: { size: 32, unit: 'px' } },
          mobile: { size: { size: 26, unit: 'px' }, line: { size: 26, unit: 'px' } },
        },
      },
      {
        id: 'heading-sub',
        title: 'Heading Sub',
        family: 'Inter',
        weight: '700',
        size: { size: 12, unit: 'px' },
        letter: { size: 3.5, unit: 'px' },
        word: { size: 0.1, unit: 'em' },
        decoration: 'underline',
        devices: { mobile: { letter: { size: 2, unit: 'px' } } },
      },
    ]);
    expect(info.fonts).toEqual({
      'heading-title': ['family', 'weight', 'size', 'line', 'transform'],
      'heading-sub': ['family', 'weight', 'size', 'letter', 'word', 'decoration'],
    });
  });

  it('reads the theme’s heading fonts from the global styles and the additional CSS', () => {
    const fonts = themeHeadingFonts(
      `/* theme */ h1, body h2 { font-family: "Rubik", sans-serif; font-weight: 800 !important }
       @media (max-width: 600px) { h2 { font-family: Arial } }
       .site h3 { font-family: Lora } h4 { font-weight: bold }`,
      {
        styles: {
          elements: {
            heading: { typography: { fontFamily: 'Karla', fontWeight: '600' } },
            h6: { typography: { fontFamily: 'var:preset|font-family|serif' } },
          },
        },
      },
    );
    expect(fonts).toEqual({
      h1: { family: 'Rubik', weight: '800' },
      h2: { family: 'Rubik', weight: '800' },
      h3: { family: 'Karla', weight: '600' },
      h4: { family: 'Karla', weight: '700' },
      h5: { family: 'Karla', weight: '600' },
      h6: { family: 'Karla', weight: '600' },
    });
    const loaded: string[] = [];
    const kit = withHeadingFonts(
      { theme: { texts: { h1: { font: 'heading-title' }, h2: { weight: '900' } } } },
      fonts,
      (f) => loaded.push(f),
    );
    expect(kit.theme).toEqual({
      texts: {
        // A global font of the kit's own theme style wins.
        h1: { font: 'heading-title' },
        h2: { family: 'Rubik', weight: '900' },
        h3: { family: 'Karla', weight: '600' },
        h4: { family: 'Karla', weight: '700' },
        h5: { family: 'Karla', weight: '600' },
        h6: { family: 'Karla', weight: '600' },
      },
    });
    expect(loaded).toContain('Rubik');
  });

  it('imports pages as WordPress showed them', () => {
    const wxr = `<?xml version="1.0"?>
<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Cimone</title><link>https://cimone.example</link><wp:wxr_version>1.2</wp:wxr_version><wp:base_blog_url>https://cimone.example</wp:base_blog_url>
<wp:author><wp:author_id>1</wp:author_id><wp:author_login>ann</wp:author_login><wp:author_email>ann@cimone.example</wp:author_email></wp:author>
${item({
  id: 5,
  title: 'Fire',
  type: 'attachment',
  metas: meta(
    '_wp_attachment_metadata',
    php({
      width: 2000,
      height: 1500,
      file: '2025/01/fire.jpg',
      sizes: { 'activland-post-grid': { file: 'fire-820x580.jpg', width: 820, height: 580 } },
    }),
  ),
}).replace(
  '</item>',
  '<wp:attachment_url>https://cimone.example/wp-content/uploads/2025/01/fire.jpg</wp:attachment_url></item>',
)}
${item({ id: 6, title: 'Shape', type: 'attachment' }).replace('</item>', '<wp:attachment_url>https://cimone.example/wp-content/uploads/custom-1.svg</wp:attachment_url></item>')}
${item({ id: 2, title: 'Kit', type: 'elementor_library', metas: meta('_elementor_template_type', 'kit') + meta('_elementor_page_settings', php(themeKit)) })}
${item({ id: 7, title: 'activland-child', type: 'custom_css', content: 'h2 { font-family: Rubik; font-weight: 800 }' })}
${item({
  id: 30,
  title: 'Corsi',
  type: 'page',
  metas: builder([
    {
      id: 's',
      elType: 'container',
      settings: { shape_divider_bottom: 'custom-shape-1' },
      elements: [
        {
          id: 'h',
          elType: 'widget',
          widgetType: 'heading',
          settings: {
            title:
              'Corso\nbase 🔥 <img class="emoji" alt="🔥" src="https://s.w.org/images/core/emoji/15.0.3/svg/1f525.svg">',
            __globals__: {
              title_color: 'globals/colors?id=primary_hover',
              typography_typography: 'globals/typography?id=heading_title',
            },
          },
        },
        { id: 'p', elType: 'widget', widgetType: 'heading', settings: { title: 'Plain' } },
        {
          id: 'i',
          elType: 'widget',
          widgetType: 'image',
          settings: {
            image: { id: 5, url: 'https://cimone.example/wp-content/uploads/2025/01/fire.jpg' },
            image_size: 'activland-post-grid',
            custom_css: 'selector img { border-radius: 4px }',
          },
        },
      ],
    },
  ]),
})}
${item({ id: 31, title: 'News', type: 'post', content: '<p>Hot <img class="emoji" alt="🔥" src="https://s.w.org/images/core/emoji/15.0.3/svg/1f525.svg"> news</p>' })}
</channel></rss>`;
    const { document } = wxrToDocument(wxr, { locale: 'it' });
    const page = document.entries!.find((e) => e.ref === 'post:30')!;
    const section = page.document.blocks[0] as CxdBlock;
    const [title, plain, image] = section.children!;
    expect(title!.attrs).toMatchObject({
      title: 'Corso base 🔥 🔥',
      title_color: 'var(--fr-c-primary-hover)',
      title_typography_global: 'heading-title',
      title_typography_global_all: true,
    });
    expect(plain!.attrs.title_theme_font).toBe(true);
    expect(image!.attrs).toMatchObject({
      width: { size: 820, unit: 'px' },
      aspect_ratio: '820/580',
      object_fit: 'cover',
      _custom_css_imported: true,
    });
    expect(section.attrs).toMatchObject({
      shape_bottom: 'custom',
      shape_bottom_svg: {
        id: 'att:6',
        url: 'https://cimone.example/wp-content/uploads/custom-1.svg',
      },
    });
    const kit = (document.plugins?.fresco as { kit: Record<string, unknown> }).kit;
    expect(kit.theme).toMatchObject({ texts: { h2: { family: 'Rubik', weight: '800' } } });
    const post = document.entries!.find((e) => e.ref === 'post:31')!;
    expect(JSON.stringify(post.document.blocks)).toContain('Hot 🔥 news');
    expect(JSON.stringify(post.document.blocks)).not.toContain('s.w.org');
  });
});

describe("Elementor's default colors and fonts turned off (bolognaolistica.com)", () => {
  // A kit never set up: Elementor's own colors, the primary font of an old scheme.
  const stockKit = {
    system_colors: [
      { _id: 'primary', title: 'Principale', color: '#6EC1E4' },
      { _id: 'secondary', title: 'Secondario', color: '#54595F' },
      { _id: 'text', title: 'Testo', color: '#7A7A7A' },
      { _id: 'accent', title: 'In risalto', color: '#61CE70' },
    ],
    custom_colors: [{ _id: '3503e0b', title: 'Colore salvato #5', color: '#4054B2' }],
    system_typography: [
      {
        _id: 'primary',
        title: 'Intestazione Principale',
        typography_typography: 'custom',
        typography_font_family: 'Architects Daughter',
        typography_font_weight: '600',
        typography_font_size: { unit: 'px', size: 40 },
      },
    ],
  };
  const export_ = (kit: Record<string, unknown>, extra = '') => `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Olistica</title><link>https://olistica.example</link><wp:wxr_version>1.2</wp:wxr_version><wp:base_blog_url>https://olistica.example</wp:base_blog_url>
<wp:author><wp:author_id>1</wp:author_id><wp:author_login>ann</wp:author_login><wp:author_email>ann@olistica.example</wp:author_email></wp:author>
${item({ id: 2, title: 'Default Kit', type: 'elementor_library', metas: meta('_elementor_template_type', 'kit') + meta('_elementor_page_settings', php(kit)) })}
${item({ id: 30, title: 'Corsi', type: 'page', name: 'corsi', metas: builder([heading('Corsi')]) })}
${extra}
</channel></rss>`;
  const importOf = (xml: string, elementorDefaults?: 'auto' | 'kit' | 'theme') => {
    const { document, warnings } = wxrToDocument(xml, {
      locale: 'it',
      ...(elementorDefaults ? { elementorDefaults } : {}),
    });
    const kit = (document.plugins?.fresco as { kit: Record<string, unknown> }).kit;
    const title = (
      document.entries!.find((e) => e.ref === 'post:30')!.document.blocks[0] as CxdBlock
    ).children![0]!;
    return { kit, title, warnings };
  };

  it('leaves colors and fonts to the theme when the kit still has Elementor’s colors', () => {
    const { kit, title, warnings } = importOf(export_(stockKit));
    expect(kit).toMatchObject({ themeColors: true, themeFonts: true });
    // The kit's global colors and fonts stay, for the widgets that choose them.
    expect(kit.colors).toContainEqual({ id: 'primary', title: 'Principale', value: '#6EC1E4' });
    expect(kit.colors).toContainEqual({
      id: '3503e0b',
      title: 'Colore salvato #5',
      value: '#4054B2',
    });
    expect(kit.fonts).toContainEqual(
      expect.objectContaining({ id: 'primary', family: 'Architects Daughter' }),
    );
    // The heading gets no default font of the kit.
    expect(title.attrs.title_typography_global).toBeUndefined();
    expect(warnings.join('\n')).toContain('taken to be off');
  });

  it('follows the choice made in the import', () => {
    const kit = importOf(export_(stockKit), 'kit');
    expect(kit.kit).toMatchObject({ themeColors: false, themeFonts: false });
    expect(kit.title.attrs.title_typography_global).toBe('primary');
    expect(kit.warnings.join('\n')).not.toContain('default colors and fonts');
    const own = { ...stockKit, system_colors: [{ _id: 'primary', title: 'P', color: '#c2410c' }] };
    expect(importOf(export_(own)).kit).toMatchObject({ themeColors: false, themeFonts: false });
    const theme = importOf(export_(own), 'theme');
    expect(theme.kit).toMatchObject({ themeColors: true, themeFonts: true });
    expect(theme.warnings.join('\n')).toContain('were off, as chosen');
  });

  it('guesses only for kits never set up, and never with Hello', () => {
    const settings = stockKit as Record<string, unknown>;
    expect(themeDefaults(settings, 'auto', false)).toBe(true);
    expect(themeDefaults(settings, 'auto', true)).toBe(false);
    expect(themeDefaults(settings, 'theme', true)).toBe(true);
    expect(themeDefaults(settings, 'kit', false)).toBe(false);
    expect(themeDefaults({}, 'auto', false)).toBe(false);
    const changed = {
      system_colors: stockKit.system_colors.map((c) =>
        c._id === 'accent' ? { ...c, color: '#f77f2e' } : c,
      ),
    };
    expect(themeDefaults(changed, 'auto', false)).toBe(false);
    // An export of a site with Hello: the kit is its style.
    const hello = importOf(
      export_(
        stockKit,
        item({ id: 60, title: 'hello-elementor', type: 'custom_css', content: 'a{}' }),
      ),
    );
    expect(hello.kit).toMatchObject({ themeColors: false });
  });
});
