/**
 * The language switcher of Multilingual 1.6.0: the component in each mode,
 * its accessibility, languages without a translation, the menus, the block
 * and the conversion of WPML's and Polylang's switchers.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { flagCountry, flagSvg } from '../src/switcher/flags';
import {
  blockFromShortcode,
  blockFromText,
  blockFromWordPress,
  replaceShortcodes,
} from '../src/switcher/convert';
import { switcherLink, withSwitcher, type MenuItemView } from '../src/switcher/menus';
import {
  DEFAULT_SETTINGS,
  labelOf,
  normalizeSettings,
  resolveLook,
  type SwitcherLocale,
  type SwitcherLook,
} from '../src/switcher/options';
import { SwitcherView } from '../src/switcher/view';
import plugin from '../src/server';

const LOCALES: SwitcherLocale[] = [
  { code: 'en', name: 'English', url: '/about', current: true, translated: true },
  { code: 'it', name: 'Italiano', url: '/it/chi-siamo', current: false, translated: true },
  { code: 'de', name: 'Deutsch', url: '/de', current: false, translated: false },
];

const look = (over: Partial<SwitcherLook> = {}): SwitcherLook => ({
  style: 'inline',
  names: 'native',
  flags: false,
  showCurrent: true,
  untranslated: 'home',
  ...over,
});

const html = (over: Partial<SwitcherLook> = {}, pageLocale = 'en', locales = LOCALES) =>
  renderToStaticMarkup(
    <SwitcherView locales={locales} look={look(over)} pageLocale={pageLocale} placement="block" />,
  );

describe('the switcher component', () => {
  it('lists the languages side by side, accessible', () => {
    const out = html();
    expect(out).toContain(
      '<nav class="ml-switcher ml-switcher--inline ml-switcher--at-block" aria-label="Languages">',
    );
    expect(out).toContain(
      '<a href="/about" hrefLang="en" lang="en" aria-current="true"><span class="ml-switcher__name">English</span></a>',
    );
    expect(out).toContain('<a href="/it/chi-siamo" hrefLang="it" lang="it">');
    // German has no translation: its home page.
    expect(out).toContain(
      '<li class="ml-switcher__item is-untranslated"><a href="/de" hrefLang="de" lang="de">',
    );
  });

  it('labels the navigation in the page’s language', () => {
    expect(html({}, 'it')).toContain('aria-label="Lingue"');
  });

  it('lists them one under the other', () => {
    expect(html({ style: 'list' })).toContain('ml-switcher--list');
  });

  it('opens a dropdown from the page’s language, listing the others', () => {
    const out = html({ style: 'dropdown' });
    expect(out).toContain('<details class="ml-switcher__dropdown">');
    expect(out).toMatch(
      /<summary class="ml-switcher__toggle" aria-label="Language: English" lang="en">/,
    );
    const list = out.slice(out.indexOf('<ul'));
    expect(list).not.toContain('hrefLang="en"');
    expect(list).toContain('hrefLang="it"');
  });

  it('shows codes, with the full name for screen readers', () => {
    const out = html({ names: 'code' });
    expect(out).toContain(
      '<span class="ml-switcher__name" aria-hidden="true">IT</span><span class="ml-switcher__sr">Italiano</span>',
    );
  });

  it('names the languages in the page’s language', () => {
    expect(html({ names: 'translated' }, 'it')).toContain('>Tedesco<');
    expect(labelOf(LOCALES[2]!, 'translated', 'en').text).toBe('German');
  });

  it('draws SVG flags hidden from screen readers, never emoji', () => {
    const out = html({ flags: true });
    expect(out).toContain('<svg class="ml-switcher__flag" viewBox="0 0 20 15"');
    expect(out).toContain('aria-hidden="true"');
    expect(out).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
    expect(flagCountry('pt-BR')).toBe('BR');
    expect(flagCountry('en')).toBe('GB');
    expect(flagSvg('xx')).toBeNull();
  });

  it('leaves out the page’s language when asked', () => {
    expect(html({ showCurrent: false })).not.toContain('hrefLang="en"');
  });

  it('hides the languages without a translation when asked, never the page’s', () => {
    const out = html({ untranslated: 'hide' });
    expect(out).not.toContain('hrefLang="de"');
    expect(out).toContain('hrefLang="en"');
  });

  it('shows nothing with one language left to show', () => {
    expect(html({ untranslated: 'hide' }, 'en', [LOCALES[0]!, LOCALES[2]!])).toBe('');
    expect(html({}, 'en', [LOCALES[0]!])).toBe('');
  });
});

describe('settings and looks', () => {
  it('checks stored settings', () => {
    expect(normalizeSettings({ style: 'grid', flags: 'yes', menuLocation: 'primary' })).toEqual({
      ...DEFAULT_SETTINGS,
      menuLocation: 'primary',
    });
    expect(normalizeSettings({ menuLocation: '<x>' }).menuLocation).toBe('');
  });

  it('a block keeps the settings unless it chooses', () => {
    const settings = { ...DEFAULT_SETTINGS, style: 'list' as const };
    expect(resolveLook(settings, {}).style).toBe('list');
    expect(resolveLook(settings, { style: 'inline', flags: 'no' })).toMatchObject({
      style: 'inline',
      flags: false,
    });
  });

  it('a theme’s place follows the theme’s hint, unless the settings apply everywhere', () => {
    const hint = { style: 'inline', names: 'code', flags: false };
    expect(resolveLook(DEFAULT_SETTINGS, { placement: 'header', hint })).toMatchObject({
      style: 'inline',
      names: 'code',
      flags: false,
    });
    expect(
      resolveLook({ ...DEFAULT_SETTINGS, themeLook: 'site' }, { placement: 'header', hint }),
    ).toMatchObject({ style: 'dropdown', names: 'native', flags: true });
    // A theme cannot choose for the bottom of the page.
    expect(resolveLook(DEFAULT_SETTINGS, { placement: 'floating', hint }).style).toBe('dropdown');
  });
});

describe('menus', () => {
  const page: MenuItemView = {
    id: 'p',
    label: 'About',
    url: '/about',
    current: true,
    children: [],
  };

  it('add the languages to the chosen location, as one item with the others under it', () => {
    const menus = withSwitcher(
      { primary: [page] },
      LOCALES,
      { ...DEFAULT_SETTINGS, menuLocation: 'primary' },
      'en',
    );
    expect(menus.primary).toHaveLength(2);
    expect(menus.primary![1]).toMatchObject({
      label: 'English',
      url: '/about',
      current: false,
      children: [
        { label: 'Italiano', url: '/it/chi-siamo' },
        { label: 'Deutsch', url: '/de' },
      ],
    });
  });

  it('put one item per language at the start, and create the menu of an empty location', () => {
    const menus = withSwitcher(
      {},
      LOCALES,
      { ...DEFAULT_SETTINGS, menuLocation: 'top', menuPosition: 'start', menuStyle: 'inline' },
      'en',
    );
    expect(menus.top!.map((i) => i.label)).toEqual(['English', 'Italiano', 'Deutsch']);
    expect(new Set(menus.top!.map((i) => i.id)).size).toBe(3);
  });

  it('replace switcher links (and Polylang’s) with the languages, with their own choices', () => {
    const link = (url: string): MenuItemView => ({
      id: url,
      label: 'Languages',
      url,
      current: false,
      children: [],
    });
    const menus = withSwitcher(
      {
        primary: [page, link('#language-switcher?style=inline&names=code&current=hide')],
        footer: [link('#pll_switcher')],
      },
      LOCALES,
      DEFAULT_SETTINGS,
      'en',
    );
    expect(menus.primary!.map((i) => i.label)).toEqual(['About', 'IT', 'DE']);
    expect(menus.footer![0]!.children.map((i) => i.label)).toEqual(['Italiano', 'Deutsch']);
    expect(switcherLink('/about', DEFAULT_SETTINGS)).toBeNull();
  });

  it('drop switcher links on sites with one language', () => {
    const menus = withSwitcher(
      { primary: [page, { ...page, id: 'x', url: '#language-switcher' }] },
      [LOCALES[0]!],
      DEFAULT_SETTINGS,
      'en',
    );
    expect(menus.primary!.map((i) => i.id)).toEqual(['p']);
  });
});

describe('conversion of other switchers', () => {
  it('turns WPML’s shortcodes into the block', () => {
    expect(blockFromShortcode('wpml_language_selector_widget', {})).toMatchObject({
      type: 'multilingual/language-switcher',
      attrs: { style: 'dropdown' },
    });
    expect(
      blockFromShortcode('wpml_language_switcher', {
        type: 'custom',
        flags: '1',
        native: '0',
        translated: '1',
        link_current: '0',
      })!.attrs,
    ).toEqual({ style: 'inline', flags: 'yes', names: 'translated', showCurrent: 'no' });
    expect(blockFromShortcode('wpml_language_selector_footer', {})!.attrs).toEqual({
      style: 'inline',
    });
  });

  it('turns Polylang’s options into the block', () => {
    expect(
      blockFromShortcode('polylang_langswitcher', {
        dropdown: '0',
        show_names: '0',
        show_flags: '1',
        hide_current: '1',
        hide_if_no_translation: '1',
      })!.attrs,
    ).toEqual({
      style: 'inline',
      flags: 'yes',
      names: 'code',
      showCurrent: 'no',
      untranslated: 'hide',
    });
    expect(blockFromWordPress('polylang/language-switcher', { dropdown: true })!.attrs).toEqual({
      style: 'dropdown',
    });
    expect(
      blockFromWordPress('core/legacy-widget', { idBase: 'icl_lang_sel_widget' })!.attrs,
    ).toEqual({ style: 'dropdown' });
    expect(blockFromWordPress('wpml/language-switcher', {})).not.toBeNull();
    expect(blockFromWordPress('core/legacy-widget', { idBase: 'search' })).toBeNull();
  });

  it('reads [language_switcher] with its options, and nothing else', () => {
    expect(
      blockFromText('[language_switcher style="list" names=code flags="no" current="hide"]')!.attrs,
    ).toEqual({
      style: 'list',
      names: 'code',
      flags: 'no',
      showCurrent: 'no',
    });
    expect(blockFromText('[gallery ids="1"]')).toBeNull();
    expect(blockFromText('See [language_switcher] here')).toBeNull();
    expect(blockFromShortcode('contact-form-7', {})).toBeNull();
  });

  it('replaces a paragraph holding only the shortcode, nested ones too', () => {
    const paragraph = (text: string) => ({
      id: text,
      type: 'core/paragraph',
      v: 1,
      attrs: {},
      content: [{ text }],
    });
    const blocks = [
      paragraph('Hello'),
      {
        id: 'g',
        type: 'core/group',
        v: 1,
        attrs: {},
        children: [paragraph('[language_switcher]')],
      },
    ];
    const out = replaceShortcodes(blocks as never);
    expect(out[0]).toBe(blocks[0]);
    expect(out[1]!.children![0]).toMatchObject({
      id: '[language_switcher]',
      type: 'multilingual/language-switcher',
    });
    const none = [paragraph('Hello')];
    expect(replaceShortcodes(none as never)).toBe(none);
  });
});

describe('the block', () => {
  interface Def {
    type: string;
    wrapper?: boolean;
    render(props: Record<string, unknown>): unknown;
  }
  const found = new Map<string, Def>();
  const filters = new Map<string, (...args: unknown[]) => unknown>();
  const provided: { switcher?: { block: string } }[] = [];
  (plugin as unknown as { setup(ctx: unknown): void }).setup({
    languages: { provide: (p: { switcher?: { block: string } }) => provided.push(p) },
    hooks: { on: () => {}, filter: (name: string, fn: () => unknown) => filters.set(name, fn) },
    assets: { enqueue: () => {} },
    blocks: { register: (def: Def) => found.set(def.type, def) },
    routes: { api: () => {}, public: () => {} },
    storage: { get: async () => null, set: async () => {} },
  });
  const block = found.get('multilingual/language-switcher')!;
  const render = (attrs: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      block.render({
        attrs,
        data: { ...DEFAULT_SETTINGS, style: 'inline', flags: false },
        block: { id: 'b' },
        context: { locale: 'en', page: { locales: LOCALES }, ...extra },
      }) as never,
    );

  it('is the site’s switcher, rendered inside the page', () => {
    expect(provided[0]!.switcher).toEqual({ block: 'multilingual/language-switcher' });
    expect(block.wrapper).toBe(false);
  });

  it('renders the switcher with the block’s choices and alignment', () => {
    const out = render({ style: 'list', align: 'center' });
    expect(out).toContain('ml-switcher--list');
    expect(out).toContain('ml-switcher--align-center');
  });

  it('follows a theme’s place and hint', () => {
    const out = render({ placement: 'header', hint: { style: 'dropdown' }, className: 'zn-lang' });
    expect(out).toContain('ml-switcher--dropdown');
    expect(out).toContain('ml-switcher--at-header');
    expect(out).toContain('zn-lang');
  });

  it('shows a placeholder in an editor’s preview on a site with one language', () => {
    expect(render({}, { preview: true, page: {} })).toContain('ml-switcher-placeholder');
    expect(render({}, { page: {} })).toBe('');
  });

  it('turns shortcodes and WordPress blocks into itself on import', async () => {
    const shortcode = filters.get('import.shortcode')!;
    expect(await shortcode(null, { tag: 'wpml_language_selector_widget', attrs: {} })).toHaveLength(
      1,
    );
    expect(await shortcode(null, { tag: 'other', attrs: {} })).toBeNull();
    const wpBlock = filters.get('import.block')!;
    expect(await wpBlock(null, { name: 'polylang/language-switcher', attrs: {} })).toHaveLength(1);
  });

  it('adds itself at the bottom of the page only when chosen', async () => {
    const locations = filters.get('render.locations')!;
    expect(await locations({}, { siteId: 's' })).toEqual({});
  });
});
