/**
 * Divi's icons (`&#xe081;||divi||400`, `&#xf095;||fa||900`, or the bare
 * character of old layouts) → Fresco's (Font Awesome). Divi's own icon font
 * is matched to the Font Awesome icon that looks most alike; Font Awesome
 * icons keep their name. Icons without a match return undefined.
 */
import { FA_CODES } from './fa-codes.js';
import { str } from './values.js';

export interface IconValue {
  set: 'solid' | 'regular' | 'brands';
  name: string;
}

let faCodes: Map<string, string> | null = null;
function faByCode(): Map<string, string> {
  if (!faCodes) {
    faCodes = new Map();
    for (const chunk of FA_CODES) {
      for (const entry of chunk.split(',')) {
        const [code, name] = entry.split(' ');
        if (code && name) faCodes.set(code, name);
      }
    }
  }
  return faCodes;
}

/**
 * Divi's own icon font (its code point → a Font Awesome name, `r:` for the
 * regular style). Outlined Divi icons (`_alt`) take the regular style when
 * Font Awesome has one.
 */
const DIVI: Record<string, string> = {
  // Arrows.
  '21': 'arrow-up',
  '22': 'arrow-down',
  '23': 'arrow-left',
  '24': 'arrow-right',
  '25': 'arrow-up-long',
  '26': 'arrow-up-right-from-square',
  '27': 'arrow-down-long',
  '28': 'arrow-left-long',
  '29': 'arrows-up-down',
  '2a': 'arrows-up-down',
  '2b': 'arrows-left-right',
  '2c': 'arrows-left-right',
  '2d': 'up-right-and-down-left-from-center',
  '2e': 'up-right-and-down-left-from-center',
  '2f': 'down-left-and-up-right-to-center',
  '30': 'expand',
  '31': 'arrows-up-down-left-right',
  '32': 'angle-up',
  '33': 'angle-down',
  '34': 'angle-left',
  '35': 'angle-right',
  '36': 'angles-up',
  '37': 'angles-down',
  '38': 'angles-left',
  '39': 'angles-right',
  '3a': 'circle-chevron-up',
  '3b': 'circle-chevron-down',
  '3c': 'circle-chevron-left',
  '3d': 'circle-chevron-right',
  '3e': 'angles-up',
  '3f': 'angles-down',
  '40': 'angles-left',
  '41': 'angles-right',
  '42': 'caret-up',
  '43': 'caret-down',
  '44': 'caret-left',
  '45': 'caret-right',
  '46': 'circle-up',
  '47': 'circle-down',
  '48': 'circle-left',
  '49': 'circle-right',
  '4a': 'arrow-rotate-left',
  // Signs.
  '4b': 'minus',
  '4c': 'plus',
  '4d': 'xmark',
  '4e': 'check',
  '4f': 'circle-minus',
  '50': 'circle-plus',
  '51': 'r:circle-xmark',
  '52': 'r:circle-check',
  '53': 'magnifying-glass-minus',
  '54': 'magnifying-glass-plus',
  '55': 'magnifying-glass',
  '56': 'r:square',
  '57': 'r:square-check',
  '58': 'r:square-minus',
  '59': 'r:square-plus',
  '5a': 'r:square-check',
  '5b': 'r:circle',
  '5c': 'r:circle-dot',
  '5d': 'r:circle-stop',
  '5e': 'stop',
  '5f': 'r:circle-pause',
  '60': 'pause',
  '61': 'bars',
  '62': 'square',
  '63': 'circle',
  '64': 'list-ul',
  '65': 'list-ol',
  '66': 'sliders',
  '67': 'sliders',
  '68': 'r:file',
  '69': 'r:copy',
  '6a': 'pencil',
  '6b': 'r:pen-to-square',
  '6c': 'pen-to-square',
  '6d': 'r:folder',
  '6e': 'r:folder-open',
  '6f': 'folder-plus',
  '70': 'circle-info',
  '71': 'circle-exclamation',
  '72': 'circle-exclamation',
  '73': 'triangle-exclamation',
  '74': 'r:circle-question',
  '75': 'question',
  '76': 'r:comment',
  '77': 'r:comments',
  '78': 'volume-xmark',
  '79': 'volume-low',
  '7a': 'volume-high',
  '7b': 'quote-left',
  '7c': 'quote-left',
  '7d': 'r:clock',
  '7e': 'lock',
  // Outlined objects.
  e000: 'lock-open',
  e001: 'key',
  e002: 'cloud',
  e003: 'cloud-arrow-up',
  e004: 'cloud-arrow-down',
  e005: 'r:image',
  e006: 'r:images',
  e007: 'r:lightbulb',
  e008: 'gift',
  e009: 'house',
  e00a: 'gear',
  e00b: 'mobile-screen-button',
  e00c: 'tablet-screen-button',
  e00d: 'laptop',
  e00e: 'desktop',
  e00f: 'camera',
  e010: 'r:envelope',
  e011: 'ice-cream',
  e012: 'award',
  e013: 'bag-shopping',
  e014: 'r:credit-card',
  e015: 'cart-shopping',
  e016: 'paperclip',
  e017: 'tag',
  e018: 'tags',
  e019: 'r:trash-can',
  e01a: 'arrow-pointer',
  e01b: 'microphone',
  e01c: 'r:compass',
  e01d: 'location-dot',
  e01e: 'thumbtack',
  e01f: 'r:map',
  e020: 'inbox',
  e021: 'toolbox',
  e022: 'book',
  e023: 'r:calendar',
  e024: 'film',
  e025: 'table',
  e026: 'r:address-book',
  e027: 'headphones',
  e028: 'life-ring',
  e029: 'chart-pie',
  e02a: 'arrows-rotate',
  e02b: 'link',
  e02c: 'link',
  e02d: 'spinner',
  e02e: 'ban',
  e02f: 'box-archive',
  e030: 'r:heart',
  e031: 'r:star',
  e032: 'r:star-half-stroke',
  e033: 'star',
  e034: 'star-half',
  e035: 'screwdriver-wrench',
  e036: 'wrench',
  e037: 'gear',
  e038: 'gears',
  e039: 'r:circle-up',
  e03a: 'r:circle-down',
  e03b: 'r:circle-left',
  e03c: 'r:circle-right',
  e03d: 'circle-arrow-up',
  e03e: 'circle-arrow-right',
  e03f: 'circle-arrow-down',
  e040: 'circle-arrow-left',
  e041: 'compress',
  e042: 'expand',
  e043: 'circle-chevron-up',
  e044: 'circle-chevron-down',
  e045: 'circle-chevron-left',
  e046: 'circle-chevron-right',
  e047: 'angles-up',
  e048: 'angles-down',
  e049: 'angles-left',
  e04a: 'angles-right',
  e04b: 'square-caret-up',
  e04c: 'square-caret-down',
  e04d: 'square-caret-left',
  e04e: 'square-caret-right',
  // Filled objects.
  e04f: 'circle-minus',
  e050: 'circle-plus',
  e051: 'circle-xmark',
  e052: 'circle-check',
  e053: 'magnifying-glass-minus',
  e054: 'magnifying-glass-plus',
  e055: 'circle-stop',
  e056: 'square',
  e057: 'circle',
  e058: 'file',
  e059: 'copy',
  e05a: 'pencil',
  e05b: 'folder',
  e05c: 'folder-open',
  e05d: 'folder-plus',
  e05e: 'upload',
  e05f: 'download',
  e060: 'circle-info',
  e061: 'circle-exclamation',
  e062: 'circle-exclamation',
  e063: 'triangle-exclamation',
  e064: 'circle-question',
  e065: 'comment',
  e066: 'comments',
  e067: 'volume-xmark',
  e068: 'volume-low',
  e069: 'volume-high',
  e06a: 'quote-left',
  e06b: 'clock',
  e06c: 'lock',
  e06d: 'lock-open',
  e06e: 'key',
  e06f: 'cloud',
  e070: 'cloud-arrow-up',
  e071: 'cloud-arrow-down',
  e072: 'lightbulb',
  e073: 'gift',
  e074: 'house',
  e075: 'camera',
  e076: 'envelope',
  e077: 'ice-cream',
  e078: 'award',
  e079: 'bag-shopping',
  e07a: 'cart-shopping',
  e07b: 'tag',
  e07c: 'tags',
  e07d: 'trash-can',
  e07e: 'arrow-pointer',
  e07f: 'microphone',
  e080: 'compass',
  e081: 'location-dot',
  e082: 'thumbtack',
  e083: 'map',
  e084: 'inbox',
  e085: 'toolbox',
  e086: 'book',
  e087: 'address-book',
  e088: 'box-archive',
  e089: 'heart',
  e08a: 'user',
  e08b: 'users',
  e08c: 'table-cells-large',
  e08d: 'table-cells',
  e08e: 'music',
  e08f: 'circle-pause',
  e090: 'phone',
  e091: 'upload',
  e092: 'download',
  // Social networks.
  e093: 'b:facebook-f',
  e094: 'b:x-twitter',
  e095: 'b:pinterest-p',
  e096: 'b:google-plus-g',
  e097: 'b:tumblr',
  e098: 'b:stumbleupon',
  e099: 'b:wordpress',
  e09a: 'b:instagram',
  e09b: 'b:dribbble',
  e09c: 'b:vimeo-v',
  e09d: 'b:linkedin-in',
  e09e: 'rss',
  e09f: 'b:deviantart',
  e0a0: 'share-nodes',
  e0a2: 'b:skype',
  e0a3: 'b:youtube',
  e0a4: 'b:google',
  e0a5: 'b:google-drive',
  e0a6: 'b:flickr',
  e0a7: 'b:blogger-b',
  e0a8: 'b:spotify',
  e0a9: 'b:delicious',
};

/** The code point of an icon value: `&#xe081;`, `&#57473;`, `%%42%%`, or the character itself. */
function codeOf(text: string): string | undefined {
  const hex = /&#x([0-9a-f]{1,6});/i.exec(text);
  if (hex) return hex[1]!.toLowerCase();
  const dec = /&#(\d{1,7});/.exec(text);
  if (dec) return Number(dec[1]).toString(16);
  // Old layouts: `%%42%%` is the index of an icon in Divi's list.
  if (/^%%\d+%%$/.test(text)) return undefined;
  const char = text.codePointAt(0);
  return char !== undefined && text.length <= 2 ? char.toString(16) : undefined;
}

/**
 * A Divi icon setting → Fresco icon. `fa` icons keep their Font Awesome
 * name (weight 400: the regular style when there is one); Divi's own icons
 * take the closest Font Awesome icon.
 */
export function diviIcon(value: unknown): IconValue | undefined {
  const [glyph = '', family = 'divi', weight = ''] = str(value).split('||');
  const code = codeOf(glyph.trim());
  if (!code) return undefined;
  if (family === 'fa') {
    const entry = faByCode().get(code);
    if (!entry) return undefined;
    const name = entry.replace(/[*+]$/, '');
    if (entry.endsWith('*')) return { set: 'brands', name };
    return { set: weight === '400' && entry.endsWith('+') ? 'regular' : 'solid', name };
  }
  const entry = DIVI[code];
  if (!entry) return undefined;
  if (entry.startsWith('r:')) return { set: 'regular', name: entry.slice(2) };
  if (entry.startsWith('b:')) return { set: 'brands', name: entry.slice(2) };
  return { set: 'solid', name: entry };
}
