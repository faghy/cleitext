/**
 * Flags of the language switcher as small SVG drawings (20 × 15), not emoji:
 * Windows shows emoji flags as two letters. Simplified where the real flag
 * has a coat of arms or fine detail, which no one sees at this size.
 */

/** The country whose flag stands for a language written without one (`it`, not `it-IT`). */
const COUNTRIES: Record<string, string> = {
  ar: 'SA',
  bg: 'BG',
  ca: 'AD',
  cs: 'CZ',
  da: 'DK',
  de: 'DE',
  el: 'GR',
  en: 'GB',
  es: 'ES',
  et: 'EE',
  fi: 'FI',
  fr: 'FR',
  ga: 'IE',
  he: 'IL',
  hi: 'IN',
  hr: 'HR',
  hu: 'HU',
  id: 'ID',
  is: 'IS',
  it: 'IT',
  ja: 'JP',
  ko: 'KR',
  lt: 'LT',
  lv: 'LV',
  mt: 'MT',
  nb: 'NO',
  nl: 'NL',
  nn: 'NO',
  no: 'NO',
  pl: 'PL',
  pt: 'PT',
  ro: 'RO',
  ru: 'RU',
  sk: 'SK',
  sl: 'SI',
  sq: 'AL',
  sr: 'RS',
  sv: 'SE',
  th: 'TH',
  tr: 'TR',
  uk: 'UA',
  vi: 'VN',
  zh: 'CN',
};

const W = 20;
const H = 15;

const rect = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

/** Bands from top to bottom, with their relative heights. */
function horizontal(colors: string[], weights = colors.map(() => 1)): string {
  const total = weights.reduce((a, b) => a + b, 0);
  let y = 0;
  return colors
    .map((color, i) => {
      const h = (H * weights[i]!) / total;
      const out = rect(0, +y.toFixed(3), W, +h.toFixed(3), color);
      y += h;
      return out;
    })
    .join('');
}

/** Bands from left to right, with their relative widths. */
function vertical(colors: string[], weights = colors.map(() => 1)): string {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = 0;
  return colors
    .map((color, i) => {
      const w = (W * weights[i]!) / total;
      const out = rect(+x.toFixed(3), 0, +w.toFixed(3), H, color);
      x += w;
      return out;
    })
    .join('');
}

/** A Nordic cross, with an inner cross of another color when given. */
function nordic(field: string, cross: string, inner?: string): string {
  const out = [rect(0, 0, W, H, field), rect(5, 0, 3, H, cross), rect(0, 6, W, 3, cross)];
  if (inner) out.push(rect(5.75, 0, 1.5, H, inner), rect(0, 6.75, W, 1.5, inner));
  return out.join('');
}

/** A five-pointed star centred at (cx, cy) with outer radius r. */
function star(cx: number, cy: number, r: number, fill: string): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.4;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(
      `${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`,
    );
  }
  return `<polygon points="${points.join(' ')}" fill="${fill}"/>`;
}

const FLAGS: Record<string, string> = {
  AD: vertical(['#10069F', '#FEDF00', '#D50032']),
  AL: rect(0, 0, W, H, '#E41E20') + star(10, 7.5, 4, '#000'),
  AT: horizontal(['#ED2939', '#FFF', '#ED2939']),
  BE: vertical(['#000', '#FDDA24', '#EF3340']),
  BG: horizontal(['#FFF', '#00966E', '#D62612']),
  BR:
    rect(0, 0, W, H, '#009C3B') +
    '<polygon points="10,1.8 18.2,7.5 10,13.2 1.8,7.5" fill="#FFDF00"/>' +
    '<circle cx="10" cy="7.5" r="3.4" fill="#002776"/>',
  CA:
    vertical(['#D52B1E', '#FFF', '#D52B1E'], [1, 2, 1]) +
    '<polygon points="10,3.5 11.2,6 12.8,5.4 12.2,8.6 10.6,8.6 10.6,11 9.4,11 9.4,8.6 7.8,8.6 7.2,5.4 8.8,6" fill="#D52B1E"/>',
  CH: rect(0, 0, W, H, '#D52B1E') + rect(8.5, 3.5, 3, 8, '#FFF') + rect(6, 6, 8, 3, '#FFF'),
  CN:
    rect(0, 0, W, H, '#DE2910') +
    star(4, 4, 2.6, '#FFDE00') +
    star(7.6, 1.8, 0.8, '#FFDE00') +
    star(8.8, 3.4, 0.8, '#FFDE00') +
    star(8.8, 5.6, 0.8, '#FFDE00') +
    star(7.6, 7.2, 0.8, '#FFDE00'),
  CZ: horizontal(['#FFF', '#D7141A']) + '<polygon points="0,0 10,7.5 0,15" fill="#11457E"/>',
  DE: horizontal(['#000', '#DD0000', '#FFCE00']),
  DK: nordic('#C8102E', '#FFF'),
  EE: horizontal(['#0072CE', '#000', '#FFF']),
  ES: horizontal(['#AA151B', '#F1BF00', '#AA151B'], [1, 2, 1]),
  FI: nordic('#FFF', '#002F6C'),
  FR: vertical(['#0055A4', '#FFF', '#EF4135']),
  GB:
    rect(0, 0, W, H, '#012169') +
    '<path d="M0,0L20,15M20,0L0,15" stroke="#FFF" stroke-width="3"/>' +
    '<path d="M0,0L20,15M20,0L0,15" stroke="#C8102E" stroke-width="1"/>' +
    '<path d="M10,0V15M0,7.5H20" stroke="#FFF" stroke-width="5"/>' +
    '<path d="M10,0V15M0,7.5H20" stroke="#C8102E" stroke-width="3"/>',
  GR:
    horizontal(Array.from({ length: 9 }, (_, i) => (i % 2 === 0 ? '#0D5EAF' : '#FFF'))) +
    rect(0, 0, 8.33, 8.33, '#0D5EAF') +
    rect(3.33, 0, 1.67, 8.33, '#FFF') +
    rect(0, 3.33, 8.33, 1.67, '#FFF'),
  HR: horizontal(['#FF0000', '#FFF', '#171796']) + rect(8, 4, 4, 5, '#FF0000'),
  HU: horizontal(['#CE2939', '#FFF', '#477050']),
  ID: horizontal(['#CE1126', '#FFF']),
  IE: vertical(['#169B62', '#FFF', '#FF883E']),
  IL:
    rect(0, 0, W, H, '#FFF') +
    rect(0, 1.5, W, 2, '#0038B8') +
    rect(0, 11.5, W, 2, '#0038B8') +
    '<path d="M10,4.6L12.5,8.9H7.5ZM10,10.4L7.5,6.1H12.5Z" fill="none" stroke="#0038B8" stroke-width="0.7"/>',
  IN:
    horizontal(['#FF9933', '#FFF', '#138808']) +
    '<circle cx="10" cy="7.5" r="1.9" fill="none" stroke="#000080" stroke-width="0.6"/>',
  IS: nordic('#02529C', '#FFF', '#DC1E35'),
  IT: vertical(['#009246', '#FFF', '#CE2B37']),
  JP: rect(0, 0, W, H, '#FFF') + '<circle cx="10" cy="7.5" r="4.5" fill="#BC002D"/>',
  KR:
    rect(0, 0, W, H, '#FFF') +
    '<path d="M6.5,7.5A3.5,3.5 0 0 1 13.5,7.5Z" fill="#CD2E3A"/>' +
    '<path d="M6.5,7.5A3.5,3.5 0 0 0 13.5,7.5Z" fill="#0047A0"/>',
  LT: horizontal(['#FDB913', '#006A44', '#C1272D']),
  LV: horizontal(['#9E3039', '#FFF', '#9E3039'], [2, 1, 2]),
  MT: vertical(['#FFF', '#CF142B']) + rect(1.5, 1.5, 2.5, 2.5, '#A0A0A0'),
  MX:
    vertical(['#006847', '#FFF', '#CE1126']) + '<circle cx="10" cy="7.5" r="1.8" fill="#8C6A2C"/>',
  NL: horizontal(['#AE1C28', '#FFF', '#21468B']),
  NO: nordic('#BA0C2F', '#FFF', '#00205B'),
  PL: horizontal(['#FFF', '#DC143C']),
  PT:
    vertical(['#006600', '#FF0000'], [2, 3]) +
    '<circle cx="8" cy="7.5" r="3" fill="#FFCC00"/><circle cx="8" cy="7.5" r="1.8" fill="#FFF" stroke="#FF0000" stroke-width="0.6"/>',
  RO: vertical(['#002B7F', '#FCD116', '#CE1126']),
  RS: horizontal(['#C6363C', '#0C4076', '#FFF']),
  RU: horizontal(['#FFF', '#0039A6', '#D52B1E']),
  SA: rect(0, 0, W, H, '#006C35') + rect(4, 9.5, 12, 0.8, '#FFF') + rect(5, 5, 10, 2, '#FFF'),
  SE: nordic('#006AA7', '#FECC00'),
  SI: horizontal(['#FFF', '#005DA4', '#ED1C24']) + rect(4, 3, 3, 4, '#005DA4'),
  SK: horizontal(['#FFF', '#0B4EA2', '#EE1C25']) + rect(4, 3, 4, 7, '#EE1C25'),
  TH: horizontal(['#A51931', '#F4F5F8', '#2D2A4A', '#F4F5F8', '#A51931'], [1, 1, 2, 1, 1]),
  TR:
    rect(0, 0, W, H, '#E30A17') +
    '<circle cx="7.5" cy="7.5" r="3.8" fill="#FFF"/><circle cx="8.5" cy="7.5" r="3" fill="#E30A17"/>' +
    star(12.4, 7.5, 1.6, '#FFF'),
  UA: horizontal(['#0057B7', '#FFD700']),
  US:
    horizontal(Array.from({ length: 13 }, (_, i) => (i % 2 === 0 ? '#B22234' : '#FFF'))) +
    rect(0, 0, 8, 8.08, '#3C3B6E'),
  VN: rect(0, 0, W, H, '#DA251D') + star(10, 7.8, 4, '#FFFF00'),
};

/** The country of a language's flag (`pt-BR` → `BR`, `it` → `IT`), or null. */
export function flagCountry(code: string): string | null {
  const [lang = '', region] = code.split(/[-_]/);
  if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
  return COUNTRIES[lang.toLowerCase()] ?? null;
}

/** The inside of the flag's `<svg viewBox="0 0 20 15">`, or null when there is none. */
export function flagSvg(code: string): string | null {
  const country = flagCountry(code);
  return (country && FLAGS[country]) || null;
}
