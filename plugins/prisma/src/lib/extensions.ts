import { numeric } from './emit';
import type { Attrs } from './types';

/** Entrance animations, by family. */
export const ANIMATIONS = [
  'fade',
  'fade-up',
  'fade-down',
  'fade-left',
  'fade-right',
  'flip-up',
  'flip-down',
  'flip-left',
  'flip-right',
  'slide-up',
  'slide-down',
  'slide-left',
  'slide-right',
  'zoom-in',
  'zoom-in-up',
  'zoom-in-down',
  'zoom-in-left',
  'zoom-in-right',
  'zoom-out',
  'zoom-out-up',
  'zoom-out-down',
  'zoom-out-left',
  'zoom-out-right',
];

const EASINGS = new Set(['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out']);

/**
 * What every block gets on the site from its extension settings:
 * - hidden on desktop (≥1025px), tablet (768–1024px) or mobile (≤767px);
 * - an entrance animation (`data-pr-animation`, run by animations.js).
 */
/** Google fonts a block uses (`<part>LoadGoogleFonts`), as `Family:weight` items. */
export function googleFonts(a: Attrs): string[] {
  const out: string[] = [];
  for (const [key, on] of Object.entries(a)) {
    if (on !== true || !/LoadGoogleFonts$|^loadGoogleFonts$/.test(key)) continue;
    const part = key === 'loadGoogleFonts' ? '' : key.slice(0, -'LoadGoogleFonts'.length);
    const family = a[part ? `${part}FontFamily` : 'fontFamily'];
    if (
      typeof family !== 'string' ||
      !/^[A-Za-z0-9][\w -]{0,59}$/.test(family) ||
      family === 'Default'
    )
      continue;
    const weight = String(a[part ? `${part}FontWeight` : 'fontWeight'] ?? '');
    out.push(/^\d{3}$/.test(weight) ? `${family}:${weight}` : family);
  }
  return out;
}

/** The stylesheet of the Google fonts a page uses, from its blocks' `data-pr-fonts`. */
export function googleFontsLink(html: string): string | null {
  const weights = new Map<string, Set<string>>();
  for (const match of html.matchAll(/data-pr-fonts="([^"]*)"/g)) {
    for (const item of match[1]!.split('|')) {
      const [family, weight] = item.split(':');
      if (!family || !/^[A-Za-z0-9][\w -]{0,59}$/.test(family)) continue;
      const set = weights.get(family) ?? new Set(['400', '700']);
      if (weight && /^\d{3}$/.test(weight)) set.add(weight);
      weights.set(family, set);
    }
  }
  if (weights.size === 0) return null;
  const query = [...weights]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([family, set]) => `family=${family.replace(/ /g, '+')}:wght@${[...set].sort().join(';')}`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

export function extensionProps(a: Attrs): { className: string; data: Record<string, string> } {
  // "Additional CSS class(es)" of the block, as typed (safe names only).
  const classes: string[] =
    typeof a.className === 'string'
      ? a.className.split(/\s+/).filter((c) => /^-?[A-Za-z_][\w-]{0,80}$/.test(c))
      : [];
  // Hidden by device in WordPress 6.9+, with its breakpoints (782px, 480px).
  if (Array.isArray(a.viewportHidden))
    for (const device of ['desktop', 'tablet', 'mobile'])
      if (a.viewportHidden.includes(device)) classes.push(`pr-viewport-hide-${device}`);
  if (a.responsiveConditions || a.displayCondition === 'responsiveVisibility') {
    if (a.hideDesktop) classes.push('pr-hide-desktop');
    if (a.hideTablet) classes.push('pr-hide-tablet');
    if (a.hideMobile) classes.push('pr-hide-mobile');
  }
  const data: Record<string, string> = {};
  const type = typeof a.animationType === 'string' ? a.animationType : '';
  if (ANIMATIONS.includes(type) && a.stickyPosition !== 'sticky') {
    data['data-pr-animation'] = type;
    const duration = numeric(a.animationTime) ?? 400;
    const delay = numeric(a.animationDelay) ?? 0;
    const easing = EASINGS.has(String(a.animationEasing)) ? String(a.animationEasing) : 'ease';
    data.style = `--pr-animation-duration:${duration}ms;--pr-animation-delay:${delay}ms;--pr-animation-easing:${easing}`;
    if (a.animationRepeat) data['data-pr-animation-repeat'] = '';
  }
  const fonts = googleFonts(a);
  if (fonts.length) data['data-pr-fonts'] = fonts.join('|');
  return { className: classes.join(' '), data };
}
