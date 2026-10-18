import type { Sheet } from '@cleitext/design';
import { blockClass } from '../../lib/css';
import { DEVICES, emit, numeric, px } from '../../lib/emit';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';

const DEFAULT_ADDRESS = 'Colosseum, Rome';

const DEFAULTS: Attrs = {
  address: DEFAULT_ADDRESS,
  zoom: 12,
  language: 'en',
  enableSatelliteView: false,
  height: 300,
  heightTablet: 300,
  heightMobile: 300,
};

/** The languages Google Maps shows its labels in (the map's `hl`). */
export const MAP_LANGUAGES: [string, string][] = [
  ['af', 'Afrikaans'],
  ['sq', 'Albanian'],
  ['am', 'Amharic'],
  ['ar', 'Arabic'],
  ['hy', 'Armenian'],
  ['az', 'Azerbaijani'],
  ['eu', 'Basque'],
  ['be', 'Belarusian'],
  ['bn', 'Bengali'],
  ['bs', 'Bosnian'],
  ['bg', 'Bulgarian'],
  ['my', 'Burmese'],
  ['ca', 'Catalan'],
  ['zh', 'Chinese'],
  ['hr', 'Croatian'],
  ['cs', 'Czech'],
  ['da', 'Danish'],
  ['nl', 'Dutch'],
  ['en', 'English'],
  ['et', 'Estonian'],
  ['fa', 'Farsi'],
  ['fi', 'Finnish'],
  ['fr', 'French'],
  ['gl', 'Galician'],
  ['ka', 'Georgian'],
  ['de', 'German'],
  ['el', 'Greek'],
  ['gu', 'Gujarati'],
  ['iw', 'Hebrew'],
  ['hi', 'Hindi'],
  ['hu', 'Hungarian'],
  ['is', 'Icelandic'],
  ['id', 'Indonesian'],
  ['it', 'Italian'],
  ['ja', 'Japanese'],
  ['kn', 'Kannada'],
  ['kk', 'Kazakh'],
  ['km', 'Khmer'],
  ['ko', 'Korean'],
  ['ky', 'Kyrgyz'],
  ['lo', 'Lao'],
  ['lv', 'Latvian'],
  ['lt', 'Lithuanian'],
  ['mk', 'Macedonian'],
  ['ms', 'Malay'],
  ['ml', 'Malayalam'],
  ['mr', 'Marathi'],
  ['mn', 'Mongolian'],
  ['ne', 'Nepali'],
  ['no', 'Norwegian'],
  ['pl', 'Polish'],
  ['pt', 'Portuguese'],
  ['pa', 'Punjabi'],
  ['ro', 'Romanian'],
  ['ru', 'Russian'],
  ['sr', 'Serbian'],
  ['si', 'Sinhalese'],
  ['sk', 'Slovak'],
  ['sl', 'Slovenian'],
  ['es', 'Spanish'],
  ['sw', 'Swahili'],
  ['sv', 'Swedish'],
  ['ta', 'Tamil'],
  ['te', 'Telugu'],
  ['th', 'Thai'],
  ['tr', 'Turkish'],
  ['uk', 'Ukrainian'],
  ['ur', 'Urdu'],
  ['uz', 'Uzbek'],
  ['vi', 'Vietnamese'],
  ['zu', 'Zulu'],
];

function css(a: Attrs, B: string, sheet: Sheet): void {
  for (const device of DEVICES) {
    const height =
      device === 'desktop' ? a.height : device === 'tablet' ? a.heightTablet : a.heightMobile;
    emit(sheet, device, `${B} .pr-google-map__frame`, { height: px(height) });
  }
}

/** The address shown: the block's, else the default one (an empty address shows no place). */
const addressOf = (a: Attrs): string =>
  typeof a.address === 'string' && a.address.trim() ? a.address.trim() : DEFAULT_ADDRESS;

/**
 * The embedded map's address: Google's keyless embed of a place search,
 * with zoom, language and map type (`k` satellite, `m` roads).
 */
export function mapUrl(a: Attrs): string {
  const zoom = numeric(a.zoom);
  const language =
    typeof a.language === 'string' && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(a.language)
      ? a.language
      : 'en';
  const query = new URLSearchParams({
    q: addressOf(a),
    z: String(zoom !== null && zoom > 0 ? Math.min(Math.round(zoom), 22) : 12),
    hl: language,
    t: a.enableSatelliteView ? 'k' : 'm',
    output: 'embed',
    iwloc: 'near',
  });
  return `https://maps.google.com/maps?${query.toString().replace(/\+/g, '%20')}`;
}

function View({ attrs: a, id, root }: ViewProps) {
  const height = numeric(a.height);
  return root(
    'div',
    { className: ['wp-block-prisma-google-map', 'pr-google-map', blockClass(id)].join(' ') },
    <iframe
      className="pr-google-map__frame"
      title={`Google Map for ${addressOf(a)}`}
      src={mapUrl(a)}
      width="640"
      height={String(height !== null && height > 0 ? height : 300)}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
    />,
  );
}

export const googleMap: PrismaBlock = {
  name: 'google-map',
  title: 'Google Map',
  description: 'A Google map of an address, with zoom, language and height by device.',
  keywords: ['map', 'google map', 'location', 'address', 'directions'],
  defaults: DEFAULTS,
  css,
  View,
  spectra: {
    'uagb/google-map': (a, src) => [src.block('google-map', a)],
  },
};
