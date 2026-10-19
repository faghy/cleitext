import { texturizeHtml } from '@cleitext/blocks/html';
import { htmlToInline, type CxdBlock, type CxdInline } from '@cleitext/plugin-sdk';
import { BLOCKS } from './blocks';
import { rgba } from './lib/background';
import type { Attrs, SpectraImporter } from './lib/types';

/**
 * WordPress pages built with Spectra (`uagb/*` blocks) become Prisma blocks
 * on import (the `import.block` filter): the attributes keep their meaning,
 * so the pages look the same. The texts Spectra keeps in the saved HTML
 * (captions, headings) are read from it.
 */

/** Attributes of the editor only, or of features Prisma does not have. */
const DROPPED = new Set([
  'block_id',
  'classMigrate',
  'childMigrate',
  'isPreview',
  'variationSelected',
  'widthSetByUser',
  'globalBlockStyleName',
  'globalBlockStyleId',
  'readyToRender',
  'tempHeadingDesc',
  'dynamicContent',
]);

/** Spectra's extension attributes, under Prisma's names. */
const RENAMED: Record<string, string> = {
  UAGAnimationType: 'animationType',
  UAGAnimationTime: 'animationTime',
  UAGAnimationDelay: 'animationDelay',
  UAGAnimationEasing: 'animationEasing',
  UAGAnimationRepeat: 'animationRepeat',
  UAGAnimationDelayInterval: 'animationDelayInterval',
  UAGAnimationDoNotApplyToContainer: 'animationNotOnContainer',
  UAGHideDesktop: 'hideDesktop',
  UAGHideTab: 'hideTablet',
  UAGHideMob: 'hideMobile',
  UAGDisplayConditions: 'displayCondition',
  UAGUserRole: 'displayUserRole',
  UAGBrowser: 'displayBrowser',
  UAGSystem: 'displaySystem',
  UAGDay: 'displayDays',
  UAGLoggedIn: 'displayLoggedIn',
  UAGLoggedOut: 'displayLoggedOut',
  UAGResponsiveConditions: 'responsiveConditions',
  UAGPosition: 'stickyPosition',
  UAGStickyLocation: 'stickyLocation',
  UAGStickyRestricted: 'stickyRestricted',
  UAGStickyOffset: 'stickyOffset',
};

/** A media value kept small: its id and address (the import points them to the new files). */
function media(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const m = value as {
    id?: unknown;
    url?: unknown;
    alt?: unknown;
    width?: unknown;
    height?: unknown;
  };
  if (typeof m.url !== 'string') return value;
  return {
    ...(m.id !== undefined ? { id: m.id } : {}),
    url: m.url,
    ...(typeof m.alt === 'string' && m.alt ? { alt: m.alt } : {}),
    ...(typeof m.width === 'number' ? { width: m.width } : {}),
    ...(typeof m.height === 'number' ? { height: m.height } : {}),
  };
}

/**
 * Hiding by device of WordPress 6.9+ (`metadata.blockVisibility.viewport`,
 * e.g. `{ desktop: false }`), kept with WordPress's own breakpoints.
 */
export function viewportVisibility(attrs: Record<string, unknown>): Attrs {
  const viewport = (
    attrs.metadata as { blockVisibility?: { viewport?: Record<string, unknown> } } | undefined
  )?.blockVisibility?.viewport;
  if (!viewport || typeof viewport !== 'object') return {};
  const hidden = (['desktop', 'tablet', 'mobile'] as const).filter((d) => viewport[d] === false);
  return hidden.length ? { viewportHidden: hidden } : {};
}

/** Spectra's attributes under Prisma's names, media trimmed. */
export function convertAttrs(attrs: Record<string, unknown>): Attrs {
  const out: Attrs = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (DROPPED.has(key)) continue;
    out[RENAMED[key] ?? key] = media(value);
  }
  if (typeof attrs.block_id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(attrs.block_id)) {
    out.blockId = attrs.block_id;
  }
  Object.assign(out, viewportVisibility(attrs));
  return out;
}

/** The inner HTML of the first element with a class, or ''. */
function inner(html: string, tag: string, className: string): string {
  const match = new RegExp(
    `<${tag}\\b[^>]*class="(?:[^"]*\\s)?${className}(?:\\s[^"]*)?"[^>]*>([\\s\\S]*?)</${tag}>`,
    'i',
  ).exec(html);
  return match?.[1]?.trim() ?? '';
}

/** The inner HTML of the first element (any tag) with a class, or ''. */
function innerAny(html: string, className: string): string {
  const match = new RegExp(
    `<(h[1-6]|p|div|span|header)\\b[^>]*class="(?:[^"]*\\s)?${className}(?:\\s[^"]*)?"[^>]*>([\\s\\S]*?)</\\1>`,
    'i',
  ).exec(html);
  return match?.[2]?.trim() ?? '';
}

/** Rich text from saved HTML, as CXD inline nodes. */
// With WordPress's typography (curly quotes, dashes), as the page showed them.
const rich = (html: string): CxdInline[] => (html ? htmlToInline(texturizeHtml(html)) : []);

let counter = 0;
const newId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

/** The blocks' Spectra importers, by Spectra block name. */
const IMPORTERS = new Map<string, SpectraImporter>(
  BLOCKS.flatMap((b) => Object.entries(b.spectra ?? {})),
);

function block(name: string, attrs: Attrs, children?: CxdBlock[]): CxdBlock {
  // Text attributes given as HTML strings become rich text.
  for (const key of BLOCKS.find((b) => b.name === name)?.richAttributes ?? []) {
    if (typeof attrs[key] === 'string') attrs[key] = rich(attrs[key] as string);
  }
  return {
    id: newId(),
    type: `prisma/${name}`,
    v: 1,
    attrs,
    ...(children ? { children } : {}),
  };
}

/** The Prisma blocks of a Spectra block, or null when Prisma has none for it. */
export function fromSpectra(
  name: string,
  attrs: Record<string, unknown>,
  html: string,
  children: CxdBlock[],
): CxdBlock[] | null {
  const a = convertAttrs(attrs);
  switch (name) {
    case 'uagb/container':
      // Old sections and columns inside it are no longer roots.
      return [
        block(
          'container',
          a,
          children.map((child) =>
            child.type === 'prisma/container' && child.attrs.isBlockRootParent
              ? { ...child, attrs: { ...child.attrs, isBlockRootParent: false } }
              : child,
          ),
        ),
      ];
    case 'uagb/image': {
      // Texts and the image's own attributes, as saved.
      const caption = inner(html, 'figcaption', 'uagb-image-caption');
      const heading = /class="[^"]*\buagb-image-heading\b/.test(html)
        ? (/<(h[1-6]|p|div|span)\b[^>]*class="[^"]*\buagb-image-heading\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/i.exec(
            html,
          )?.[2] ?? '')
        : '';
      const img = /<img\b[^>]*>/i.exec(html)?.[0] ?? '';
      const attr = (n: string) => new RegExp(`\\s${n}="([^"]*)"`, 'i').exec(img)?.[1] ?? '';
      if (!a.url && attr('src')) a.url = attr('src');
      if (a.alt === undefined && attr('alt')) a.alt = attr('alt');
      // Copies for tablets and phones of the same picture are not needed: the import maps the original.
      for (const key of ['urlTablet', 'urlMobile']) {
        if (typeof a[key] === 'string' && sameImage(a[key] as string, String(a.url ?? '')))
          delete a[key];
      }
      return [
        block('image', {
          ...a,
          ...(caption ? { caption: rich(caption) } : {}),
          ...(heading.trim() ? { heading: rich(heading.trim()) } : {}),
        }),
      ];
    }
    case 'uagb/advanced-heading': {
      const title = innerAny(html, 'uagb-heading-text');
      const desc = inner(html, 'p', 'uagb-desc-text');
      return [
        block('heading', {
          ...a,
          ...(title ? { headingTitle: rich(title) } : {}),
          ...(desc ? { headingDesc: rich(desc) } : {}),
        }),
      ];
    }
    case 'uagb/info-box': {
      const prefix = innerAny(html, 'uagb-ifb-title-prefix');
      const title = innerAny(html, 'uagb-ifb-title');
      const desc = innerAny(html, 'uagb-ifb-desc');
      const cta = inner(html, 'span', 'uagb-inline-editing');
      const img = /<div class="uagb-ifb-image-content">\s*<img\b[^>]*\ssrc="([^"]*)"/i.exec(
        html,
      )?.[1];
      return [
        block('info-box', {
          ...a,
          ...(prefix ? { prefixTitle: rich(prefix) } : {}),
          ...(title ? { infoBoxTitle: rich(title) } : {}),
          ...(desc ? { headingDesc: rich(desc) } : {}),
          ...(cta ? { ctaText: rich(cta) } : {}),
          // The size shown on the page, when the saved object has another.
          ...(img && a.iconImage && typeof a.iconImage === 'object'
            ? { iconImage: { ...(a.iconImage as object), url: img } }
            : {}),
        }),
      ];
    }
    case 'uagb/image-gallery':
      return [block('gallery', a)];
    case 'uagb/buttons':
      return [block('buttons', a, children)];
    case 'uagb/buttons-child': {
      const label = innerAny(html, 'uagb-button__link');
      return [block('button', { ...a, ...(label ? { label: rich(label) } : {}) })];
    }
    default: {
      const importer = IMPORTERS.get(name);
      return importer
        ? importer(a, {
            html,
            children,
            block,
            rich,
            inner: (tag, className) => inner(html, tag, className),
            innerAny: (className) => innerAny(html, className),
          })
        : null;
    }
  }
}

/** Two addresses of the same WordPress image (other sizes of it). */
function sameImage(a: string, b: string): boolean {
  const key = (u: string) =>
    u.replace(/[?#].*$/, '').replace(/-(?:\d+x\d+|scaled)(\.[a-z0-9]+)$/i, '$1');
  return key(a) === key(b);
}

// ---- WordPress covers ----------------------------------------------------------------------

const LENGTH = /^(-?\d*\.?\d+)(px|em|rem|%|vh|vw)?$/;

/** `"20px"`, `"0"`, `"1.5em"` → value and unit; presets and other forms are left out. */
function length(value: unknown): { n: number; unit: string } | null {
  const m =
    typeof value === 'string' || typeof value === 'number'
      ? LENGTH.exec(String(value).trim())
      : null;
  return m ? { n: Number(m[1]), unit: m[2] ?? 'px' } : null;
}

/** Paddings or margins of WordPress's block style, as the container's (one unit for all sides). */
function sides(value: unknown, kind: 'Padding' | 'Margin'): Attrs {
  if (!value || typeof value !== 'object') return {};
  const out: Attrs = {};
  let unit: string | null = null;
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const l = length((value as Record<string, unknown>)[side]);
    if (!l || (unit && l.unit !== unit && l.n !== 0)) continue;
    if (l.n !== 0) unit = l.unit;
    out[`${side}${kind}Desktop`] = l.n;
  }
  if (Object.keys(out).length)
    out[kind === 'Padding' ? 'paddingType' : 'marginType'] = unit ?? 'px';
  return out;
}

const VERTICAL: Record<string, string> = {
  top: 'flex-start',
  center: 'center',
  bottom: 'flex-end',
};
const HORIZONTAL: Record<string, string> = {
  left: 'flex-start',
  center: 'stretch',
  right: 'flex-end',
};

/**
 * A WordPress cover (`core/cover`): a full container with the image (or
 * video) as its background, the overlay with its color and strength, the
 * minimum height and the position of the content, which keeps its blocks.
 * `children` is the conversion the import would use otherwise: a group with
 * the image first, then the cover's blocks.
 */
export function fromCover(
  attrs: Record<string, unknown>,
  html: string,
  children: CxdBlock[],
): CxdBlock[] {
  const group = children.length === 1 && children[0]!.type === 'core/group' ? children[0]! : null;
  let inner = group?.children ?? children;
  if (inner[0]?.type === 'core/image' && attrs.url) inner = inner.slice(1);
  const a: Attrs = {
    isBlockRootParent: true,
    contentWidth: 'alignfull',
    innerContentWidth: 'alignfull',
  };
  if (attrs.align !== 'full' && attrs.align !== 'wide') a.contentWidth = 'default';
  // The overlay: its color (custom, from the palette, black) and strength.
  const dim = /\bhas-background-dim-(\d+)\b/.exec(html)?.[1];
  const ratio =
    dim !== undefined
      ? Number(dim)
      : /\bhas-background-dim\b/.test(html)
        ? 50
        : typeof attrs.dimRatio === 'number'
          ? attrs.dimRatio
          : 100;
  const color =
    typeof attrs.customOverlayColor === 'string'
      ? attrs.customOverlayColor
      : typeof attrs.overlayColor === 'string' && /^[a-z0-9-]+$/.test(attrs.overlayColor)
        ? `var(--wp--preset--color--${attrs.overlayColor})`
        : '#000000';
  const url = typeof attrs.url === 'string' ? attrs.url : '';
  if (url && attrs.backgroundType === 'video') {
    a.backgroundType = 'video';
    a.backgroundVideo = { url };
    a.backgroundVideoColor = rgbaOrColor(color, ratio);
  } else if (url) {
    a.backgroundType = 'image';
    a.backgroundImageDesktop = { ...(typeof attrs.id === 'number' ? { id: attrs.id } : {}), url };
    const focal = attrs.focalPoint as { x?: unknown; y?: unknown } | undefined;
    if (focal && typeof focal.x === 'number' && typeof focal.y === 'number')
      a.backgroundPositionDesktop = { x: focal.x, y: focal.y };
    if (attrs.hasParallax === true) a.backgroundAttachmentDesktop = 'fixed';
    if (attrs.isRepeated === true) {
      a.backgroundRepeatDesktop = 'repeat';
      a.backgroundSizeDesktop = 'auto';
    }
    if (typeof attrs.customGradient === 'string') {
      a.overlayType = 'gradient';
      a.selectGradient = 'basic';
      a.gradientValue = attrs.customGradient;
    } else {
      a.overlayType = 'color';
      a.backgroundImageColor = color;
    }
    a.overlayOpacity = ratio / 100;
  } else if (typeof attrs.customGradient === 'string') {
    a.backgroundType = 'gradient';
    a.selectGradient = 'basic';
    a.gradientValue = attrs.customGradient;
  } else {
    a.backgroundType = 'color';
    a.backgroundColor = rgbaOrColor(color, ratio);
  }
  // Height: WordPress's covers are at least 430px tall.
  const min = typeof attrs.minHeight === 'number' ? attrs.minHeight : 430;
  a.minHeightDesktop = min;
  a.minHeightType =
    typeof attrs.minHeightUnit === 'string' && /^(px|vh|vw|em|rem|%)$/.test(attrs.minHeightUnit)
      ? attrs.minHeightUnit
      : 'px';
  // Where the content sits: "top center", "bottom left"…
  const [v = 'center', h = 'center'] = String(attrs.contentPosition ?? 'center center').split(' ');
  a.directionDesktop = 'column';
  a.justifyContentDesktop = VERTICAL[v] ?? 'center';
  a.alignItemsDesktop = HORIZONTAL[h] ?? 'stretch';
  // Spacing set on the block, else WordPress's 1em around the content.
  const style = attrs.style as { spacing?: { padding?: unknown; margin?: unknown } } | undefined;
  const padding = sides(style?.spacing?.padding, 'Padding');
  Object.assign(
    a,
    Object.keys(padding).length
      ? padding
      : {
          topPaddingDesktop: 1,
          rightPaddingDesktop: 1,
          bottomPaddingDesktop: 1,
          leftPaddingDesktop: 1,
          paddingType: 'em',
        },
  );
  Object.assign(a, sides(style?.spacing?.margin, 'Margin'));
  // Light text on a dark cover, as WordPress shows it.
  const classes = [
    typeof attrs.className === 'string' ? attrs.className : '',
    attrs.isDark === false ? '' : 'pr-cover-dark',
  ]
    .filter(Boolean)
    .join(' ');
  if (classes) a.className = classes;
  if (typeof attrs.anchor === 'string') a.anchor = attrs.anchor;
  return [block('container', a, inner)];
}

/** A hex color at a strength (0–100) as rgba; other colors as they are. */
function rgbaOrColor(color: string, ratio: number): string {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? rgba(color, ratio) : color;
}
