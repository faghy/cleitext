/**
 * Fresco, wave 3 of the Elementor parity: the templates library (search,
 * files), images dropped from the desktop, the free Floating buttons and Link
 * in bio, the Element manager and Safe mode.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { setIconData, type IconData } from '../src/core/icons.js';
import { elementCss, withDefaults } from '../src/core/css.js';
import { extensions } from '../src/core/extensions.js';
import {
  DEFAULT_BREAKPOINTS,
  type ElementDefinition,
  type FrescoNode,
  type RenderContext,
} from '../src/core/model.js';
import { getElement, registerElement, unregisterElement } from '../src/core/registry.js';
import { elementUsage } from '../src/element-manager.js';
import {
  isFrescoElement,
  normalizeElementManager,
  offered,
  REPLACED_BY_FREE,
} from '../src/editor/availability.js';
import {
  hasFiles,
  imageFiles,
  imageNode,
  insertImages,
  mediaValue,
} from '../src/editor/file-drop.js';
import { parseTemplateFile, searchTemplates, templateFile } from '../src/editor/library.js';
import { createStore } from '../src/editor/store.js';
import { contactHref, floatingButtons, linkInBio } from '../src/elements/contact.js';
import { registerFreeElements } from '../src/elements/index.js';
import icons from '../src/public/icons.json';

const context: RenderContext = {
  media: new Map(),
  locale: 'en',
  editing: false,
  site: { title: '', tagline: '', home: '/' },
};
const node = (type: string, attrs: Record<string, unknown> = {}, id = 'n1'): FrescoNode => ({
  id,
  type,
  v: 1,
  attrs,
});
const html = (definition: ElementDefinition, attrs: Record<string, unknown>, editing = false) =>
  renderToStaticMarkup(
    <>
      {definition.render({
        node: node(definition.type, attrs),
        settings: withDefaults(definition, attrs),
        context: { ...context, editing },
      })}
    </>,
  );
const media = (id: string) => ({
  id,
  url: `/media/${id}.jpg`,
  mime: 'image/jpeg',
  alt: id === 'a' ? 'A cat' : '',
});

beforeAll(() => {
  setIconData(icons as unknown as IconData);
  registerFreeElements();
});

describe('templates library', () => {
  const list = [{ title: 'Hero with video' }, { title: 'Pricing table' }, { title: 'Team – Hero' }];
  it('finds templates by every word of their title, in any case and order', () => {
    expect(searchTemplates(list, '')).toBe(list);
    expect(searchTemplates(list, 'hero').map((x) => x.title)).toEqual([
      'Hero with video',
      'Team – Hero',
    ]);
    expect(searchTemplates(list, 'HERO team').map((x) => x.title)).toEqual(['Team – Hero']);
    expect(searchTemplates(list, 'footer')).toEqual([]);
  });

  it('exports a template as a file it imports again', () => {
    const blocks = [node('fresco/heading', { title: 'Hi' })];
    const file = templateFile({ title: 'Mine', kind: 'section', blocks });
    const back = parseTemplateFile(JSON.stringify(file));
    expect(back).toEqual({
      format: 'fresco-template',
      version: 1,
      title: 'Mine',
      kind: 'section',
      blocks,
    });
    expect(() => parseTemplateFile('{"format":"other"}')).toThrow();
  });

  it('has an empty hook for remote libraries', () => {
    expect(extensions().librarySources).toEqual([]);
  });
});

describe('images dropped from the desktop', () => {
  const file = (name: string, type: string) => new File(['x'], name, { type });

  it('keeps the image files of a drop', () => {
    expect(
      imageFiles([
        file('a.jpg', 'image/jpeg'),
        file('b.pdf', 'application/pdf'),
        file('c.png', 'image/png'),
      ]).map((f) => f.name),
    ).toEqual(['a.jpg', 'c.png']);
    expect(
      imageFiles(Array.from({ length: 30 }, (_, i) => file(`${i}.png`, 'image/png'))),
    ).toHaveLength(20);
    expect(hasFiles({ types: ['Files'] } as unknown as DataTransfer)).toBe(true);
    expect(hasFiles({ types: ['text/plain'] } as unknown as DataTransfer)).toBe(false);
    expect(hasFiles(null)).toBe(false);
  });

  it('makes Image elements of uploaded files', () => {
    expect(mediaValue(media('a'))).toEqual({ id: 'a', url: '/media/a.jpg', alt: 'A cat' });
    expect(mediaValue(media('b'))).toEqual({ id: 'b', url: '/media/b.jpg' });
    const made = imageNode(media('a'));
    expect(made.type).toBe('fresco/image');
    expect(made.attrs.image).toEqual({ id: 'a', url: '/media/a.jpg', alt: 'A cat' });
  });

  it('inserts them in a new container at the top, or where they were dropped', () => {
    const store = createStore({
      blocks: [{ ...node('fresco/container', {}, 'box'), children: [] }],
      page: {},
      readOnly: false,
    });
    insertImages(store, [media('a'), media('b')], { parent: null, index: 1 });
    const top = store.get().blocks;
    expect(top).toHaveLength(2);
    expect(top[1]!.type).toBe('fresco/container');
    expect(top[1]!.children!.map((c) => c.attrs.image)).toEqual([
      { id: 'a', url: '/media/a.jpg', alt: 'A cat' },
      { id: 'b', url: '/media/b.jpg' },
    ]);
    insertImages(store, [media('c')], { parent: 'box', index: 0 });
    expect(store.get().blocks[0]!.children![0]!.attrs.image).toEqual({
      id: 'c',
      url: '/media/c.jpg',
    });
    expect(store.get().selected).toBe(store.get().blocks[0]!.children![0]!.id);
    // One step each, as one drop.
    store.actions.undo();
    expect(store.get().blocks[0]!.children).toEqual([]);
  });
});

describe('Floating buttons and Link in bio (free)', () => {
  it('opens each kind of contact, and refuses values that do not fit', () => {
    expect(contactHref('whatsapp', '+39 333 123 4567', 'Hello there')).toBe(
      'https://wa.me/393331234567?text=Hello%20there',
    );
    expect(contactHref('phone', '+39 (02) 1234')).toBe('tel:+39021234');
    expect(contactHref('sms', '333 1234', 'Hi')).toBe('sms:3331234?body=Hi');
    expect(contactHref('email', 'me@example.com')).toBe('mailto:me@example.com');
    expect(contactHref('email', 'not an email')).toBeNull();
    expect(contactHref('telegram', '@cleitext')).toBe('https://t.me/cleitext');
    expect(contactHref('map', 'Via Roma 1, Milano')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Via%20Roma%201%2C%20Milano',
    );
    expect(contactHref('link', 'javascript:alert(1)')).toBeNull();
    expect(contactHref('link', '/contact')).toBe('/contact');
    expect(contactHref('whatsapp', '')).toBeNull();
  });

  it('draws the buttons, fixed to the window on the page and in place in the editor', () => {
    const page = html(floatingButtons, {});
    expect(page).toContain('data-fr-handler="floating-buttons"');
    expect(page).toContain('class="fr-fab fr-fab--bottom-right fr-fab--circle"');
    expect(page).toContain('href="https://wa.me/393331234567"');
    expect(page).toContain('--fr-fab-color:#25d366');
    expect(html(floatingButtons, {}, true)).toContain('fr-fab--editing');
    // Shown after a delay: hidden until the script shows it.
    expect(html(floatingButtons, { delay: 3 })).toMatch(
      /data-fr-fab-delay="3"[^>]*>\s*<div class="fr-fab[^"]*" hidden/,
    );
  });

  it('opens several buttons from one, or a chat box', () => {
    const buttons = [
      { _id: 'a', kind: 'whatsapp', value: '333', label: 'Chat' },
      { _id: 'b', kind: 'email', value: 'a@b.it', label: 'Mail' },
    ];
    const menu = html(floatingButtons, { buttons, mode: 'menu' });
    expect(menu).toContain('fr-fab--menu');
    expect(menu).toContain('aria-controls="fr-fab-n1"');
    expect(menu).toMatch(/<div class="fr-fab__items" id="fr-fab-n1" hidden/);
    const chat = html(floatingButtons, {
      buttons,
      mode: 'chat',
      chat_name: 'Ada',
      chat_message: 'Hello!',
      chat_cta: 'Write to us',
    });
    expect(chat).toContain('fr-fab--chat');
    expect(chat).toContain('<strong>Ada</strong>');
    expect(chat).toContain('Hello!');
    expect(chat).toMatch(/class="fr-fab__cta" href="https:\/\/wa.me\/333"/);
    expect(chat).toContain('Write to us');
  });

  it('has the settings of Fresco Pro’s elements of the same name', () => {
    const keys = (d: ElementDefinition) => d.controls.map((c) => c.name);
    for (const name of [
      'buttons',
      'mode',
      'position',
      'show_labels',
      'delay',
      'hide_mobile',
      'size',
      'offset',
      'official',
      'color',
    ]) {
      expect(keys(floatingButtons)).toContain(name);
    }
    for (const name of [
      'photo',
      'name',
      'bio',
      'links',
      'social',
      'width',
      'button_bg',
      'button_color',
      'button_radius',
    ]) {
      expect(keys(linkInBio)).toContain(name);
    }
    const css = elementCss(
      floatingButtons,
      node(floatingButtons.type, { size: { size: 64, unit: 'px' } }),
      DEFAULT_BREAKPOINTS,
    );
    expect(css).toContain('--fr-fab-size:64px');
  });

  it('draws the link in bio, with a cover picture and outlined links', () => {
    const page = html(linkInBio, {
      layout: 'cover',
      cover: { id: null, url: '/media/cover.jpg' },
      button_style: 'outline',
      links: [{ _id: 'a', label: 'Site', link: { url: 'https://example.com' } }],
      social: [
        { _id: 's', url: 'javascript:x' },
        { _id: 't', url: 'https://instagram.com/me' },
      ],
    });
    expect(page).toContain('class="fr-bio fr-bio--cover fr-bio--outline"');
    expect(page).toContain('fr-bio__cover');
    expect(page).toContain('href="https://example.com"');
    expect(page).not.toContain('javascript:');
    expect(page).toContain('href="https://instagram.com/me"');
  });
});

describe('Element manager and Safe mode', () => {
  it('keeps only element types, never the container', () => {
    expect(
      normalizeElementManager({
        disabled: [
          'fresco/counter',
          'fresco/counter',
          'fresco/container',
          'bad',
          42,
          'shop/products',
        ],
      }),
    ).toEqual({ disabled: ['fresco/counter', 'shop/products'] });
    expect(normalizeElementManager(null)).toEqual({ disabled: [] });
  });

  it('offers neither switched off elements nor, in Safe mode, those of other plugins', () => {
    const options = { disabled: ['fresco/counter'], safeMode: false };
    expect(offered({ type: 'fresco/heading' }, options)).toBe(true);
    expect(offered({ type: 'fresco/counter' }, options)).toBe(false);
    expect(offered({ type: 'fresco/heading', hidden: true }, options)).toBe(false);
    expect(offered({ type: 'fresco/block:shop/products' }, options)).toBe(true);
    const safe = { disabled: [], safeMode: true };
    expect(offered({ type: 'fresco/block:shop/products' }, safe)).toBe(false);
    expect(offered({ type: 'fresco-pro/form' }, safe)).toBe(true);
    expect(isFrescoElement('vitality/hero')).toBe(false);
  });

  it('offers the free Floating buttons and Link in bio instead of Fresco Pro’s', () => {
    for (const [pro, free] of Object.entries(REPLACED_BY_FREE)) {
      expect(getElement(free)).toBeDefined();
      const definition = { ...getElement(free)!, type: pro, pro: true };
      registerElement(definition);
      try {
        expect(offered(definition, { disabled: [], safeMode: false })).toBe(false);
        // A Pro page keeps its element: it is still registered (drawn and edited by Fresco Pro).
        expect(getElement(pro)).toBe(definition);
      } finally {
        unregisterElement(pro);
      }
    }
  });

  it('counts the elements of the site’s documents', () => {
    const usage = elementUsage([
      {
        document: {
          blocks: [
            {
              type: 'fresco/container',
              children: [{ type: 'fresco/heading' }, { type: 'fresco/heading' }],
            },
          ],
        },
      },
      {
        document: {
          blocks: [
            { type: 'fresco/heading' },
            { type: 'fresco/block', children: [{ type: 'shop/products' }] },
          ],
        },
      },
      { document: null },
    ] as never);
    expect(usage.documents).toBe(2);
    expect(usage.types['fresco/heading']).toEqual({ elements: 3, documents: 2 });
    expect(usage.types['fresco/container']).toEqual({ elements: 1, documents: 1 });
    expect(usage.types['shop/products']).toEqual({ elements: 1, documents: 1 });
  });
});
