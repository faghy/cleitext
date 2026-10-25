/**
 * Dashicon names as block icons (`icon: 'calendar'`, WordPress's way): the
 * admin does not load the Dashicons font, so Gutenberg would draw them
 * blank. Names are turned into the SVG icons of `@wordpress/icons` when
 * blocks and their variations are registered; unknown names get a generic
 * icon instead of an empty box.
 */
import { addFilter } from '@wordpress/hooks';
import * as icons from '@wordpress/icons';
import type { ReactElement } from 'react';

type IconName = Exclude<keyof typeof icons, 'Icon'>;

/** Dashicons whose name is not the icon's in `@wordpress/icons` (camelCase). */
export const DASHICONS: Record<string, IconName> = {
  'admin-appearance': 'brush',
  'admin-comments': 'comment',
  'admin-customizer': 'styles',
  'admin-generic': 'cog',
  'admin-home': 'home',
  'admin-links': 'link',
  'admin-media': 'media',
  'admin-network': 'key',
  'admin-page': 'page',
  'admin-plugins': 'plugins',
  'admin-post': 'post',
  'admin-settings': 'settings',
  'admin-site': 'globe',
  'admin-site-alt': 'globe',
  'admin-site-alt2': 'globe',
  'admin-site-alt3': 'globe',
  'admin-tools': 'tool',
  'admin-users': 'people',
  'align-center': 'alignCenter',
  'align-full-width': 'stretchFullWidth',
  'align-left': 'alignLeft',
  'align-none': 'alignNone',
  'align-right': 'alignRight',
  'align-wide': 'stretchWide',
  analytics: 'chartBar',
  'arrow-down': 'arrowDown',
  'arrow-down-alt': 'arrowDown',
  'arrow-down-alt2': 'chevronDown',
  'arrow-left': 'arrowLeft',
  'arrow-left-alt': 'arrowLeft',
  'arrow-left-alt2': 'chevronLeft',
  'arrow-right': 'arrowRight',
  'arrow-right-alt': 'arrowRight',
  'arrow-right-alt2': 'chevronRight',
  'arrow-up': 'arrowUp',
  'arrow-up-alt': 'arrowUp',
  'arrow-up-alt2': 'chevronUp',
  awards: 'starFilled',
  'block-default': 'blockDefault',
  book: 'pages',
  'book-alt': 'pages',
  building: 'institution',
  businessman: 'postAuthor',
  businessperson: 'postAuthor',
  businesswoman: 'postAuthor',
  'calendar-alt': 'calendar',
  camera: 'capturePhoto',
  'camera-alt': 'capturePhoto',
  cart: 'cart',
  'chart-area': 'chartBar',
  'chart-bar': 'chartBar',
  'chart-line': 'trendingUp',
  'chart-pie': 'chartBar',
  clipboard: 'copy',
  clock: 'scheduled',
  'cloud-saved': 'cloud',
  'cloud-upload': 'cloudUpload',
  'cover-image': 'cover',
  dashboard: 'dashboard',
  database: 'stack',
  desktop: 'desktop',
  dismiss: 'close',
  download: 'download',
  edit: 'pencil',
  'edit-large': 'pencil',
  'editor-code': 'code',
  'editor-help': 'help',
  'editor-ol': 'formatListNumbered',
  'editor-paragraph': 'paragraph',
  'editor-quote': 'quote',
  'editor-table': 'table',
  'editor-ul': 'formatListBullets',
  email: 'envelope',
  'email-alt': 'envelope',
  'email-alt2': 'envelope',
  'embed-generic': 'globe',
  'embed-photo': 'image',
  'embed-video': 'video',
  external: 'external',
  feedback: 'comment',
  filter: 'funnel',
  flag: 'pin',
  'format-aside': 'post',
  'format-audio': 'audio',
  'format-chat': 'comment',
  'format-gallery': 'gallery',
  'format-image': 'image',
  'format-quote': 'quote',
  'format-status': 'comment',
  'format-video': 'video',
  forms: 'postCommentsForm',
  'grid-view': 'grid',
  groups: 'people',
  heart: 'starFilled',
  hidden: 'unseen',
  html: 'html',
  id: 'postAuthor',
  'id-alt': 'postAuthor',
  'images-alt': 'gallery',
  'images-alt2': 'gallery',
  info: 'info',
  'info-outline': 'info',
  layout: 'layout',
  lightbulb: 'tip',
  'list-view': 'listView',
  location: 'mapMarker',
  'location-alt': 'mapMarker',
  lock: 'lock',
  'media-default': 'media',
  'media-document': 'file',
  'media-text': 'mediaAndText',
  megaphone: 'megaphone',
  menu: 'menu',
  'menu-alt': 'menu',
  money: 'payment',
  'money-alt': 'currencyEuro',
  move: 'moveTo',
  networking: 'connection',
  no: 'close',
  'no-alt': 'close',
  'page-break': 'pageBreak',
  paperclip: 'link',
  phone: 'mobile',
  portfolio: 'archive',
  'post-status': 'pin',
  products: 'store',
  randomize: 'shuffle',
  'rest-api': 'code',
  rss: 'rss',
  saved: 'check',
  schedule: 'scheduled',
  search: 'search',
  share: 'share',
  'share-alt': 'share',
  'share-alt2': 'share',
  shield: 'shield',
  'shield-alt': 'shield',
  shortcode: 'shortcode',
  slides: 'gallery',
  smartphone: 'mobile',
  smiley: 'reaction',
  sort: 'chevronUpDown',
  'star-empty': 'starEmpty',
  'star-filled': 'starFilled',
  'star-half': 'starHalf',
  sticky: 'pin',
  store: 'store',
  tablet: 'tablet',
  tag: 'tag',
  tagcloud: 'tag',
  testimonial: 'quote',
  text: 'paragraph',
  'text-page': 'page',
  'thumbs-down': 'thumbsDown',
  'thumbs-up': 'thumbsUp',
  tickets: 'receipt',
  'tickets-alt': 'receipt',
  translation: 'language',
  trash: 'trash',
  'controls-play': 'play',
  'controls-pause': 'pause',
  unlock: 'unlock',
  update: 'update',
  upload: 'upload',
  'video-alt': 'video',
  'video-alt2': 'video',
  'video-alt3': 'video',
  visibility: 'seen',
  warning: 'caution',
  welcome: 'home',
  'welcome-learn-more': 'institution',
  'welcome-widgets-menus': 'widget',
  'welcome-write-blog': 'pencil',
  wordpress: 'wordpress',
  'wordpress-alt': 'wordpress',
  yes: 'check',
  'yes-alt': 'check',
};

const ICONS = icons as unknown as Record<string, ReactElement | undefined>;

/** The SVG for a Dashicon name: its own, a close one, or a generic block icon. */
export function dashiconSvg(name: string): ReactElement {
  const own = DASHICONS[name] ?? name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  return ICONS[own] ?? ICONS.blockDefault!;
}

/** A block's or variation's icon, with a Dashicon name turned into its SVG. */
export function svgIcon<T>(icon: T): T | ReactElement | { src: ReactElement } {
  if (typeof icon === 'string' && !icon.trim().startsWith('<')) return dashiconSvg(icon);
  if (icon && typeof icon === 'object' && 'src' in icon && typeof icon.src === 'string') {
    return { ...icon, src: dashiconSvg(icon.src) };
  }
  return icon;
}

interface WithIcon {
  icon?: unknown;
  variations?: WithIcon[];
}

/** A block type or variation with SVG icons (its variations' too). */
export function withSvgIcons<T extends WithIcon>(settings: T): T {
  return {
    ...settings,
    ...(settings.icon !== undefined ? { icon: svgIcon(settings.icon) } : {}),
    ...(Array.isArray(settings.variations)
      ? { variations: settings.variations.map((v) => withSvgIcons(v)) }
      : {}),
  };
}

let installed = false;

/** Every block registered from now on gets SVG icons (plugins' blocks included). */
export function installDashiconIcons(): void {
  if (installed) return;
  installed = true;
  addFilter('blocks.registerBlockType', 'cleitext/dashicon-svg', (settings: WithIcon) =>
    withSvgIcons(settings),
  );
}
