/**
 * Ready-made sliders, and the slider of the fast path. Templates use only
 * gradients, shapes and icons drawn by Diorama: no stock photos. Pictures
 * are the user's own, chosen in the editor (an image layer shows where one
 * goes until then).
 */
import {
  contentBox,
  defaultLayer,
  defaultMotion,
  defaultSlide,
  defaultSlider,
  defaultStyle,
  normalizeSlider,
} from './normalize';
import type {
  Anchor,
  Background,
  Layer,
  LayerPos,
  LayerStyle,
  LayerType,
  Link,
  MediaRef,
  MotionId,
  Slide,
  SliderData,
} from './types';

interface LayerSpec {
  text?: string;
  tag?: Layer['content']['tag'];
  icon?: string;
  shape?: Layer['content']['shape'];
  link?: Link;
  pos?: Partial<LayerPos>;
  style?: Partial<LayerStyle>;
  mobile?: { pos?: Partial<LayerPos>; style?: Partial<LayerStyle> };
  enter?: MotionId;
  delay?: number;
  hover?: Layer['motion']['hover'];
  name?: string;
  hide?: Partial<Layer['hide']>;
  children?: Layer[];
}

function layer(type: LayerType, spec: LayerSpec = {}): Layer {
  const base = defaultLayer(type);
  return {
    ...base,
    name: spec.name ?? '',
    content: {
      ...base.content,
      ...(spec.text !== undefined ? { text: spec.text } : {}),
      ...(spec.tag ? { tag: spec.tag } : {}),
      ...(spec.icon ? { icon: spec.icon } : {}),
      ...(spec.shape ? { shape: spec.shape } : {}),
      ...(spec.link ? { link: spec.link } : {}),
    },
    style: {
      base: { ...defaultStyle(type), ...spec.style },
      ...(spec.mobile?.style ? { mobile: spec.mobile.style } : {}),
    },
    pos: {
      base: { ...base.pos.base, ...spec.pos },
      ...(spec.mobile?.pos ? { mobile: spec.mobile.pos } : {}),
    },
    hide: { ...base.hide, ...spec.hide },
    motion: {
      in: defaultMotion(spec.enter ?? base.motion.in.preset, spec.delay ?? 0),
      out: null,
      hover: spec.hover ?? base.motion.hover,
    },
    children: spec.children ?? [],
  };
}

function box(
  place: { anchor: Anchor; x: number; y: number; w?: number },
  children: Layer[],
  style: Partial<LayerStyle> = {},
): Layer {
  return layer('box', {
    name: 'Content',
    pos: { anchor: place.anchor, x: place.x, y: place.y, w: place.w ?? 60 },
    style: {
      textAlign: place.anchor.includes('l')
        ? 'left'
        : place.anchor.includes('r')
          ? 'right'
          : 'center',
      ...style,
    },
    enter: 'none',
    children,
  });
}

const gradient = (
  from: string,
  to: string,
  angle = 135,
  type: 'linear' | 'radial' = 'linear',
): Background => ({
  ...defaultSlide().background,
  kind: 'gradient',
  gradient: { type, angle, from, to },
});

const slide = (background: Background, layers: Layer[], extra: Partial<Slide> = {}): Slide =>
  defaultSlide({ background, layers, ...extra });

const button = (text: string, link: Link, style: Partial<LayerStyle> = {}, delay = 500) =>
  layer('button', { text, link, style, delay, hover: 'lift' });
const heading = (
  text: string,
  style: Partial<LayerStyle> = {},
  delay = 100,
  tag: Layer['content']['tag'] = 'h2',
) => layer('heading', { text, style, delay, tag });
const para = (text: string, style: Partial<LayerStyle> = {}, delay = 300) =>
  layer('text', { text, style, delay });
const eyebrow = (text: string, color = '#ffffffcc') =>
  para(text, { fontSize: 14, fontWeight: 700, letterSpacing: 0.18, uppercase: true, color }, 0);

const NONE: Link = { kind: 'none', value: '' };
const below: Link = { kind: 'scroll', value: '' };

export interface Template {
  id: string;
  name: string;
  description: string;
  /** Colours of the thumbnail in the gallery. */
  swatch: [string, string];
  build: () => SliderData;
}

export const TEMPLATES: readonly Template[] = [
  {
    id: 'hero-cta',
    name: 'Hero with a call to action',
    description: 'One bold scene with a headline and a button: the top of a home page.',
    swatch: ['#1e1b4b', '#7c3aed'],
    build: () =>
      defaultSlider({
        type: 'hero',
        layout: 'fullscreen',
        slides: [
          slide(gradient('#1e1b4b', '#7c3aed', 125), [
            layer('shape', {
              shape: 'circle',
              pos: { x: 86, y: 18, w: 26, h: 46 },
              style: { background: '#a78bfa33' },
              enter: 'zoom-in',
              name: 'Circle',
            }),
            layer('shape', {
              shape: 'blob',
              pos: { x: 10, y: 88, w: 30, h: 40 },
              style: { background: '#f472b626' },
              enter: 'zoom-in',
              delay: 200,
              name: 'Blob',
            }),
            box({ anchor: 'c', x: 50, y: 50, w: 70 }, [
              eyebrow('New this season'),
              heading(
                'Make something people remember',
                { fontSize: 68, fontWeight: 800 },
                150,
                'h1',
              ),
              para(
                'A short promise in plain words: what you offer, for whom, and why it is worth a click.',
                { fontSize: 21, color: '#e9e5ffee' },
              ),
              button('Get started', below, { background: '#ffffff', color: '#312e81' }),
            ]),
          ]),
        ],
      }),
  },
  {
    id: 'restaurant',
    name: 'Restaurant',
    description: 'Warm slides for a menu, bookings by phone and private dinners.',
    swatch: ['#3b1d0b', '#c2410c'],
    build: () =>
      defaultSlider({
        transition: { effect: 'crossfade', duration: 1200, easing: 'ease-in-out' },
        slides: [
          slide(
            gradient('#2a1405', '#b45309', 160),
            [
              box({ anchor: 'l', x: 8, y: 50, w: 56 }, [
                layer('icon', {
                  icon: 'cup',
                  style: { fontSize: 40, color: '#fcd34d' },
                  enter: 'zoom-in',
                }),
                heading('Fresh fish, handmade pasta', {
                  fontFamily: 'serif',
                  fontSize: 64,
                  fontWeight: 600,
                }),
                para('Lunch and dinner by the harbour, every day but Monday.', { fontSize: 21 }),
                button(
                  'Book a table',
                  { kind: 'phone', value: '+390000000000' },
                  { background: '#fcd34d', color: '#3b1d0b' },
                ),
              ]),
            ],
            { name: 'Welcome', kenBurns: 'zoom-in' },
          ),
          slide(
            gradient('#1c1917', '#78350f', 200),
            [
              box({ anchor: 'c', x: 50, y: 50, w: 64 }, [
                eyebrow('Tonight', '#fcd34d'),
                heading('The chef’s tasting menu', {
                  fontFamily: 'serif',
                  fontSize: 60,
                  fontWeight: 600,
                }),
                para('Five courses from the morning’s catch, with wines from the hills.', {
                  fontSize: 21,
                }),
                button('See the menu', NONE, {
                  background: 'transparent',
                  color: '#ffffff',
                  borderWidth: 2,
                  borderColor: '#ffffff',
                }),
              ]),
            ],
            { name: 'Menu', kenBurns: 'pan' },
          ),
          slide(
            gradient('#431407', '#9a3412', 110),
            [
              box({ anchor: 'r', x: 92, y: 50, w: 52 }, [
                heading('Private dinners and parties', {
                  fontFamily: 'serif',
                  fontSize: 56,
                  fontWeight: 600,
                }),
                para('A room of your own for up to 40 guests.', { fontSize: 21 }),
                button(
                  'Write to us',
                  { kind: 'email', value: 'info@example.com' },
                  { background: '#fcd34d', color: '#3b1d0b' },
                ),
              ]),
            ],
            { name: 'Events', kenBurns: 'zoom-out' },
          ),
        ],
      }),
  },
  {
    id: 'shop-promo',
    name: 'Shop sale',
    description: 'A loud promotion with a big discount and a button to the shop.',
    swatch: ['#be185d', '#f97316'],
    build: () =>
      defaultSlider({
        layout: 'auto',
        maxWidth: 1280,
        size: { base: { height: 520, offset: 0 }, mobile: { height: 560 } },
        slides: [
          slide(gradient('#be185d', '#f97316', 120), [
            layer('shape', {
              shape: 'circle',
              pos: { x: 78, y: 50, w: 34, h: 74 },
              style: { background: '#ffffff26' },
              enter: 'zoom-out',
              name: 'Circle',
              hide: { mobile: true },
            }),
            layer('heading', {
              text: '-30%',
              tag: 'p',
              pos: { x: 78, y: 50, w: 0, anchor: 'c' },
              style: { fontSize: 150, fontWeight: 900, lineHeight: 1, letterSpacing: -0.04 },
              enter: 'zoom-in',
              delay: 300,
              name: 'Discount',
              mobile: { pos: { x: 50, y: 20, anchor: 'c' }, style: { fontSize: 96 } },
            }),
            box({ anchor: 'l', x: 7, y: 50, w: 50 }, [
              layer('icon', { icon: 'tag', style: { fontSize: 36 }, enter: 'fade' }),
              heading('Autumn sale', { fontSize: 64, fontWeight: 800 }),
              para('On every coat, scarf and boot until Sunday.', { fontSize: 21 }),
              button(
                'Shop now',
                { kind: 'url', value: '/shop' },
                { background: '#111827', color: '#ffffff' },
              ),
            ]),
          ]),
          slide(gradient('#0f766e', '#22c55e', 120), [
            box({ anchor: 'c', x: 50, y: 50, w: 64 }, [
              layer('icon', { icon: 'gift', style: { fontSize: 44 }, enter: 'zoom-in' }),
              heading('Free shipping over €50', { fontSize: 58, fontWeight: 800 }),
              button(
                'Discover the new arrivals',
                { kind: 'url', value: '/shop' },
                { background: '#ffffff', color: '#065f46' },
              ),
            ]),
          ]),
        ],
      }),
  },
  {
    id: 'testimonials',
    name: 'Testimonials',
    description: 'What your customers say, one quote at a time.',
    swatch: ['#0f172a', '#334155'],
    build: () => {
      const quote = (q: string, who: string, role: string) =>
        slide(
          gradient('#0f172a', '#1e293b', 180),
          [
            box({ anchor: 'c', x: 50, y: 50, w: 72 }, [
              layer('icon', {
                icon: 'quote',
                style: { fontSize: 44, color: '#38bdf8' },
                enter: 'zoom-in',
              }),
              para(q, { fontFamily: 'serif', fontSize: 34, italic: true, lineHeight: 1.35 }, 150),
              para(who, { fontSize: 18, fontWeight: 700 }, 400),
              para(role, { fontSize: 15, color: '#94a3b8' }, 450),
            ]),
          ],
          { name: who },
        );
      return defaultSlider({
        layout: 'auto',
        maxWidth: 1100,
        size: { base: { height: 460, offset: 0 }, mobile: { height: 520 } },
        transition: { effect: 'crossfade', duration: 900, easing: 'ease-in-out' },
        navigation: {
          ...defaultSlider().navigation,
          arrows: false,
          style: 'pill',
          color: '#38bdf8',
        },
        slides: [
          quote(
            '“They understood what we needed before we did. Our bookings doubled in a season.”',
            'Giulia R.',
            'Owner, Casa sul Lago',
          ),
          quote(
            '“Clear, kind and always on time. We would choose them again tomorrow.”',
            'Marco T.',
            'Manager, Officina 21',
          ),
          quote(
            '“The best decision we made for the shop this year.”',
            'Sara L.',
            'Founder, Bottega Verde',
          ),
        ],
      });
    },
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    description: 'Projects side by side with their picture, for studios and freelancers.',
    swatch: ['#09090b', '#3f3f46'],
    build: () => {
      const project = (n: string, title: string, kind: string, from: string) =>
        slide(
          gradient('#09090b', from, 100),
          [
            layer('image', {
              pos: { x: 72, y: 50, w: 42, h: 0, anchor: 'c' },
              style: { radius: 12, shadow: true },
              enter: 'fade-left',
              delay: 200,
              name: 'Project picture',
              hide: { mobile: true },
            }),
            box({ anchor: 'l', x: 7, y: 50, w: 40 }, [
              para(n, { fontSize: 15, fontWeight: 700, letterSpacing: 0.2, color: '#a1a1aa' }, 0),
              heading(title, { fontSize: 54, fontWeight: 700 }),
              para(kind, { fontSize: 18, color: '#d4d4d8' }),
              button('View the project', NONE, {
                background: 'transparent',
                color: '#ffffff',
                borderWidth: 2,
                borderColor: '#ffffff',
                radius: 4,
              }),
            ]),
          ],
          { name: title },
        );
      return defaultSlider({
        transition: { effect: 'slide-left', duration: 900, easing: 'ease-out' },
        navigation: { ...defaultSlider().navigation, style: 'line', bullets: true },
        slides: [
          project('01', 'Harbour Hotel', 'Brand identity and website', '#1e3a8a'),
          project('02', 'Forno Antico', 'Packaging and labels', '#7c2d12'),
          project('03', 'Verde Studio', 'Interior photography', '#14532d'),
        ],
      });
    },
  },
  {
    id: 'event',
    name: 'Event',
    description: 'Date, place and tickets for a festival, a concert or a fair.',
    swatch: ['#2e1065', '#db2777'],
    build: () =>
      defaultSlider({
        type: 'hero',
        layout: 'fullwidth',
        size: { base: { height: 640, offset: 0 }, mobile: { height: 600 } },
        slides: [
          slide(gradient('#2e1065', '#db2777', 150), [
            layer('shape', {
              shape: 'circle',
              pos: { x: 90, y: 12, w: 18, h: 30 },
              style: { background: '#facc1533' },
              enter: 'zoom-in',
              name: 'Sun',
            }),
            box({ anchor: 'l', x: 8, y: 52, w: 62 }, [
              para('12–14 June 2027', { fontSize: 20, fontWeight: 700, color: '#facc15' }, 0),
              heading(
                'City Jazz Festival',
                { fontSize: 80, fontWeight: 900, lineHeight: 1, uppercase: true },
                150,
                'h1',
              ),
              para('Three nights, twenty bands, one square by the sea.', { fontSize: 21 }),
              button('Get your tickets', NONE, { background: '#facc15', color: '#2e1065' }),
            ]),
          ]),
        ],
      }),
  },
  {
    id: 'hotel',
    name: 'Hotel and B&B',
    description: 'Calm slides for rooms, breakfast and the view, with a booking button.',
    swatch: ['#0e7490', '#fde68a'],
    build: () =>
      defaultSlider({
        transition: { effect: 'fade', duration: 1200, easing: 'ease-in-out' },
        navigation: { ...defaultSlider().navigation, style: 'outline' },
        slides: [
          slide(
            gradient('#155e75', '#f59e0b', 170),
            [
              box({ anchor: 'b', x: 50, y: 86, w: 70 }, [
                layer('icon', { icon: 'bed', style: { fontSize: 40 }, enter: 'fade' }),
                heading('Wake up by the sea', {
                  fontFamily: 'serif',
                  fontSize: 66,
                  fontWeight: 500,
                }),
                para('Eight bright rooms, breakfast on the terrace, the beach two minutes away.', {
                  fontSize: 21,
                }),
                button('Check availability', NONE, { background: '#ffffff', color: '#155e75' }),
              ]),
            ],
            { kenBurns: 'zoom-in', name: 'Rooms' },
          ),
          slide(
            gradient('#164e63', '#0e7490', 200),
            [
              box({ anchor: 'b', x: 50, y: 86, w: 70 }, [
                heading('Breakfast with a view', {
                  fontFamily: 'serif',
                  fontSize: 62,
                  fontWeight: 500,
                }),
                para('Cakes baked every morning and fruit from our garden.', { fontSize: 21 }),
              ]),
            ],
            { kenBurns: 'pan', name: 'Breakfast' },
          ),
        ],
      }),
  },
  {
    id: 'agency',
    name: 'Studio and agency',
    description: 'A light, modern opening with geometric shapes and a clear offer.',
    swatch: ['#eef2ff', '#c7d2fe'],
    build: () =>
      defaultSlider({
        type: 'hero',
        layout: 'fullwidth',
        size: { base: { height: 620, offset: 0 }, mobile: { height: 580 } },
        navigation: { ...defaultSlider().navigation, color: '#111827' },
        slides: [
          slide(gradient('#f8fafc', '#e0e7ff', 135), [
            layer('shape', {
              shape: 'circle',
              pos: { x: 80, y: 46, w: 30, h: 64 },
              style: { background: '#6366f1' },
              enter: 'zoom-in',
              delay: 200,
              name: 'Circle',
              hide: { mobile: true },
            }),
            layer('shape', {
              shape: 'rect',
              pos: { x: 70, y: 70, w: 16, h: 30 },
              style: { background: '#f59e0b', radius: 18 },
              enter: 'fade-up',
              delay: 400,
              name: 'Square',
              hide: { mobile: true },
            }),
            layer('shape', {
              shape: 'blob',
              pos: { x: 90, y: 78, w: 12, h: 22 },
              style: { background: '#10b981' },
              enter: 'fade-left',
              delay: 600,
              name: 'Blob',
              hide: { mobile: true },
            }),
            box({ anchor: 'l', x: 7, y: 50, w: 52 }, [
              eyebrow('Design studio', '#4f46e5'),
              heading(
                'We design brands that grow with you',
                { fontSize: 62, fontWeight: 800, color: '#111827' },
                150,
                'h1',
              ),
              para('Strategy, identity and websites for small companies with big plans.', {
                fontSize: 21,
                color: '#374151',
              }),
              button('See our work', below, { background: '#111827', color: '#ffffff' }),
            ]),
          ]),
        ],
      }),
  },
  {
    id: 'fitness',
    name: 'Gym and fitness',
    description: 'Energetic slides with strong type for classes and trial weeks.',
    swatch: ['#0a0a0a', '#dc2626'],
    build: () =>
      defaultSlider({
        transition: { effect: 'slide-over', duration: 800, easing: 'ease-out' },
        navigation: {
          ...defaultSlider().navigation,
          style: 'square',
          color: '#ffffff',
          progress: true,
        },
        slides: [
          slide(
            gradient('#0a0a0a', '#b91c1c', 115),
            [
              box({ anchor: 'l', x: 7, y: 50, w: 60 }, [
                layer('icon', {
                  icon: 'bolt',
                  style: { fontSize: 44, color: '#fbbf24' },
                  enter: 'zoom-in',
                }),
                heading(
                  'Stronger every day',
                  {
                    fontSize: 84,
                    fontWeight: 900,
                    uppercase: true,
                    lineHeight: 0.95,
                    fontFamily: 'display',
                  },
                  100,
                  'h2',
                ),
                para('Classes from 7 am to 10 pm, coaches who know your name.', { fontSize: 21 }),
                button('Start your free week', NONE, {
                  background: '#dc2626',
                  color: '#ffffff',
                  radius: 4,
                  uppercase: true,
                }),
              ]),
            ],
            { name: 'Classes' },
          ),
          slide(
            gradient('#111827', '#4b5563', 160),
            [
              box({ anchor: 'c', x: 50, y: 50, w: 70 }, [
                heading('Personal training', {
                  fontSize: 76,
                  fontWeight: 900,
                  uppercase: true,
                  lineHeight: 0.95,
                  fontFamily: 'display',
                }),
                para('A plan made for you, and someone to keep you going.', { fontSize: 21 }),
                button('Book a session', NONE, {
                  background: '#ffffff',
                  color: '#111827',
                  radius: 4,
                  uppercase: true,
                }),
              ]),
            ],
            { name: 'Training' },
          ),
        ],
      }),
  },
  {
    id: 'latest-posts',
    name: 'Latest posts',
    description: 'Your newest blog posts as slides, with their featured image.',
    swatch: ['#111827', '#2563eb'],
    build: () =>
      defaultSlider({
        source: { kind: 'posts', count: 5, category: '', excerptLength: 140 },
        transition: { effect: 'slide-left', duration: 800, easing: 'ease-out' },
        slides: [
          slide(
            { ...gradient('#111827', '#1d4ed8', 135), featured: true },
            [
              box({ anchor: 'bl', x: 6, y: 88, w: 62 }, [
                eyebrow('{{category}} · {{date}}'),
                heading('{{title}}', { fontSize: 52, fontWeight: 800 }),
                para('{{excerpt}}', { fontSize: 19 }),
                button(
                  'Read more',
                  { kind: 'post', value: '' },
                  { background: '#ffffff', color: '#111827' },
                ),
              ]),
            ],
            { overlay: { color: '#000000', opacity: 0.45 } },
          ),
        ],
      }),
  },
];

/** A template's slider, with fresh ids. */
export function templateSlider(id: string): SliderData | null {
  const template = TEMPLATES.find((t) => t.id === id);
  return template ? normalizeSlider(template.build()) : null;
}

/** One slide of the fast path: a picture, and optionally a title, a text and a button. */
export interface QuickSlide {
  image: MediaRef;
  title?: string;
  text?: string;
  button?: string;
  link?: Link;
}

/** The slider of the fast path: one slide per picture, with its words over a gentle shade. */
export function quickSlider(items: QuickSlide[]): SliderData {
  const slides = items.map((item) => {
    const words = Boolean(item.title || item.text || item.button);
    return defaultSlide({
      background: {
        ...defaultSlide().background,
        kind: 'image',
        color: '#111827',
        image: item.image,
      },
      overlay: { color: '#000000', opacity: words ? 0.35 : 0 },
      kenBurns: 'zoom-in',
      link: !item.button && item.link ? item.link : { kind: 'none', value: '' },
      layers: words
        ? [
            contentBox(
              {
                ...(item.title ? { heading: item.title } : {}),
                ...(item.text ? { text: item.text } : {}),
                ...(item.button
                  ? { button: item.button, ...(item.link ? { link: item.link } : {}) }
                  : {}),
              },
              { anchor: 'bl', x: 7, y: 86 },
            ),
          ]
        : [],
    });
  });
  return normalizeSlider(defaultSlider({ slides }));
}
