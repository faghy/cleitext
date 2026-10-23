/**
 * Elementor's atomic elements (`e-heading`, `e-flexbox`…): settings are
 * typed values `{ $$type, value }` and the look is a list of style variants
 * (breakpoint × state) of CSS properties. They become Fresco's atomic
 * elements (`fresco/a-*`) with the same variants (`_styles`) and global
 * classes (`_classes`).
 */
import type { CxdBlock } from '@cleitext/blocks';
import type { Converter, ElementorNode } from './elementor.js';
import {
  asSettings,
  DEVICE_NAMES,
  num,
  relativeUrl,
  str,
  type Settings,
} from './elementor-values.js';

const BOXES: Record<string, string> = {
  e_flexbox: 'flexbox',
  'e-flexbox': 'flexbox',
  'e-div-block': 'div',
  'e-grid': 'grid',
};

const WIDGETS: Record<string, string> = {
  'e-heading': 'a-heading',
  'e-paragraph': 'a-paragraph',
  'e-button': 'a-button',
  'e-image': 'a-image',
  'e-svg': 'a-svg',
  'e-divider': 'a-divider',
  'e-youtube': 'a-youtube',
  'e-self-hosted-video': 'a-video',
};

export function isAtomic(el: ElementorNode): boolean {
  return Boolean(
    BOXES[el.elType ?? ''] ||
    (el.elType === 'widget' &&
      (WIDGETS[el.widgetType ?? ''] || el.widgetType === COMPONENT_WIDGET)),
  );
}

/** Elementor 4's component instance. */
const COMPONENT_WIDGET = 'e-component';

/** Settings of Elementor's atomic widgets → those of Fresco's (for overridable properties). */
export const SETTING_NAMES: Record<string, Record<string, string>> = {
  'e-heading': { title: 'title', link: 'link', tag: 'tag' },
  'e-paragraph': { paragraph: 'content', link: 'link' },
  'e-button': { text: 'text', link: 'link' },
  'e-image': { image: 'image', link: 'link' },
  'e-svg': { svg: 'svg', link: 'link' },
  'e-youtube': { source: 'url' },
  'e-self-hosted-video': { source: 'file' },
  'e-div-block': { link: 'link' },
  'e-flexbox': { link: 'link' },
  'e-grid': { link: 'link' },
};

/** The Fresco component of an Elementor component (its post id). */
export const componentId = (post: number | string) => `el-${String(post).replace(/\D/g, '')}`;

/** An override key as Fresco keeps it. */
export const overrideKey = (key: string) =>
  key
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .slice(0, 40) || 'prop';

/** What instances need to know of a component: its overridable properties, by override key. */
export interface ComponentInfo {
  props: Record<string, { elType: string; widgetType: string; propKey: string }>;
}

/** Elementor 4's interactions of an element (`interactions`) → Fresco's `_interactions`. */
export function atomicInteractions(value: unknown): Settings[] {
  let data: unknown = value;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }
  const items = asSettings(data).items;
  if (!Array.isArray(items)) return [];
  const ms = (raw: unknown, fallback: number) => {
    const v = unwrap(raw);
    if (typeof v === 'number') return v;
    const s = asSettings(v);
    const size = num(s.size);
    if (size === null) return fallback;
    return str(s.unit) === 's' ? size * 1000 : size;
  };
  const out: Settings[] = [];
  for (const raw of items) {
    const item = asSettings(
      asSettings(raw).$$type === 'interaction-item' ? asSettings(raw).value : raw,
    );
    const trigger = str(unwrap(item.trigger)) || 'load';
    const animation = asSettings(unwrap(item.animation));
    // Older data: the whole animation in a name ("scrollIn-fade-in-left-600-0").
    const id = str(animation.animation_id);
    const [t, effect, type, direction, duration, delay] = id ? id.split('-') : [];
    const timing = asSettings(animation.timing_config);
    const config = asSettings(animation.config);
    const entry: Settings = {
      id: `i${out.length + 1}`,
      trigger: id ? t : trigger,
      effect: id ? effect : str(animation.effect) || 'fade',
      type: id ? type : str(animation.type) || 'in',
      direction: id ? (direction ?? '') : str(animation.direction),
      duration: id ? Number(duration) || 600 : ms(timing.duration, 600),
      delay: id ? Number(delay) || 0 : ms(timing.delay, 0),
      easing: str(config.easing) || 'easeIn',
    };
    // Only what Fresco plays: entrance and scroll triggers, fade, slide and scale.
    if (!['load', 'scrollIn'].includes(String(entry.trigger))) continue;
    if (!['fade', 'slide', 'scale'].includes(String(entry.effect))) continue;
    // Corner directions slide along one side (the first named).
    entry.direction = String(entry.direction).split('-')[0] ?? '';
    out.push(entry);
  }
  return out;
}

/** A typed value `{ $$type, value }` → a plain one (sizes, colors, boxes, links…). */
export function unwrap(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unwrap);
  if (!value || typeof value !== 'object') return value;
  const v = value as Settings;
  if (typeof v.$$type !== 'string') {
    return Object.fromEntries(Object.entries(v).map(([key, item]) => [key, unwrap(item)]));
  }
  const inner = v.value;
  switch (v.$$type) {
    // A setting of a component's element that instances may override: its own value.
    case 'overridable':
      return unwrap(asSettings(inner).origin_value);
    case 'size': {
      const s = asSettings(inner);
      return num(s.size) === null ? undefined : { size: num(s.size), unit: str(s.unit) || 'px' };
    }
    case 'dimensions':
    case 'border-radius':
    case 'border-width': {
      const sides = asSettings(inner);
      const side = (...keys: string[]) => {
        for (const key of keys) {
          const s = unwrap(sides[key]) as { size?: number; unit?: string } | undefined;
          if (s && typeof s.size === 'number') return s;
        }
        return undefined;
      };
      const top = side('block-start', 'start-start', 'top');
      const right = side('inline-end', 'start-end', 'right');
      const bottom = side('block-end', 'end-end', 'bottom');
      const left = side('inline-start', 'end-start', 'left');
      const unit = (top ?? right ?? bottom ?? left)?.unit ?? 'px';
      return {
        top: top?.size ?? '',
        right: right?.size ?? '',
        bottom: bottom?.size ?? '',
        left: left?.size ?? '',
        unit,
        linked: false,
      };
    }
    default:
      // Global variables: Fresco's kit variables of the same id.
      if (/^global-.*variable$/.test(v.$$type) && typeof inner === 'string') {
        return `var(--fr-v-${variableId(inner)})`;
      }
      return unwrap(inner);
  }
}

/** A variable id as Fresco's kit keeps it. */
const variableId = (id: string) =>
  id
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .slice(0, 40);

/** CSS properties Fresco's style variants know (kebab-case → its keys). */
const PROPS: Record<string, string> = {
  display: 'display',
  'flex-direction': 'flexDirection',
  'justify-content': 'justifyContent',
  'align-items': 'alignItems',
  'flex-wrap': 'flexWrap',
  gap: 'gap',
  'align-self': 'alignSelf',
  'flex-grow': 'flexGrow',
  order: 'order',
  padding: 'padding',
  margin: 'margin',
  width: 'width',
  height: 'height',
  'min-width': 'minWidth',
  'min-height': 'minHeight',
  'max-width': 'maxWidth',
  'max-height': 'maxHeight',
  overflow: 'overflow',
  'object-fit': 'objectFit',
  'aspect-ratio': 'aspectRatio',
  position: 'position',
  top: 'top',
  right: 'right',
  bottom: 'bottom',
  left: 'left',
  'inset-block-start': 'top',
  'inset-inline-end': 'right',
  'inset-block-end': 'bottom',
  'inset-inline-start': 'left',
  'z-index': 'zIndex',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-weight': 'fontWeight',
  color: 'color',
  'text-align': 'textAlign',
  'line-height': 'lineHeight',
  'letter-spacing': 'letterSpacing',
  'text-transform': 'textTransform',
  'font-style': 'fontStyle',
  'text-decoration': 'textDecoration',
  'border-style': 'borderStyle',
  'border-width': 'borderWidth',
  'border-color': 'borderColor',
  'border-radius': 'borderRadius',
  opacity: 'opacity',
};

const BOX_PROPS = new Set(['padding', 'margin', 'borderWidth', 'borderRadius']);

/** One variant's properties → Fresco's (unknown ones are counted). */
function styleProps(props: Settings, skipped: Set<string>): Settings {
  const out: Settings = {};
  for (const [css, raw] of Object.entries(props)) {
    let value = unwrap(raw);
    if (css === 'background') {
      const bg = asSettings(value);
      if (typeof bg.color === 'string') out.backgroundColor = bg.color;
      const layers = Array.isArray(bg['background-overlay']) ? bg['background-overlay'] : [];
      const image = asSettings(asSettings(asSettings(layers[0]).image).src);
      if (typeof image.url === 'string') out.backgroundImage = image.url;
      continue;
    }
    if (css === 'gap' && value && typeof value === 'object' && 'row' in value) {
      value = (value as { row?: unknown }).row;
    }
    const key = PROPS[css];
    if (!key || value === undefined || value === null || value === '') {
      if (value !== undefined && value !== null && value !== '') skipped.add(css);
      continue;
    }
    if (BOX_PROPS.has(key) && value && typeof value === 'object' && 'size' in value) {
      const s = value as { size: number; unit: string };
      value = {
        top: s.size,
        right: s.size,
        bottom: s.size,
        left: s.size,
        unit: s.unit,
        linked: true,
      };
    }
    if (
      key === 'lineHeight' &&
      value &&
      typeof value === 'object' &&
      (value as { unit?: string }).unit === 'custom'
    ) {
      value = { size: Number((value as { size?: unknown }).size) || 1, unit: '' };
    }
    out[key] = value;
  }
  return out;
}

/** Local style variants of an element (the styles its own classes name). */
function variants(el: ElementorNode, classes: string[], skipped: Set<string>): Settings[] {
  const styles = asSettings(el.styles);
  const out: Settings[] = [];
  for (const id of classes) {
    const style = asSettings(styles[id]);
    for (const raw of Array.isArray(style.variants) ? style.variants : []) {
      const variant = asSettings(raw);
      const meta = asSettings(variant.meta);
      const breakpoint = str(meta.breakpoint) || 'desktop';
      const state = str(meta.state);
      if (!DEVICE_NAMES.includes(breakpoint)) continue;
      const props = styleProps(asSettings(variant.props), skipped);
      if (Object.keys(props).length === 0) continue;
      out.push({
        device: breakpoint,
        state: ['hover', 'focus', 'active'].includes(state) ? state : '',
        props,
      });
    }
  }
  return out;
}

/** Global style classes (from the kit) and the element's own extra classes. */
export function atomicLink(value: unknown, origin?: string): Settings | undefined {
  const link = asSettings(unwrap(value));
  const destination = link.destination;
  const url = relativeUrl(
    typeof destination === 'string' ? destination : str(asSettings(destination).url),
    origin,
  );
  if (!url) return undefined;
  return { url, ...(link.isTargetBlank === true ? { newTab: true } : {}) };
}

/** An Elementor 4 component instance → Fresco's (`fresco/component`) with its overrides. */
function componentInstance(c: Converter, el: ElementorNode): CxdBlock[] {
  const settings = asSettings(el.settings);
  const instance = asSettings(asSettings(settings.component_instance).value);
  const post = num(unwrap(instance.component_id));
  if (post === null) return [];
  const info = c.ctx.components?.get(String(post));
  if (!info) {
    c.note('a component instance shows a component that is not in the export: it was left out');
    return [];
  }
  const overrides: Settings = {};
  const wrapped = asSettings(instance.overrides).value ?? instance.overrides;
  for (const raw of Array.isArray(wrapped) ? wrapped : []) {
    const item = asSettings(raw);
    // An override, or an overridable one (a component inside a component): its value.
    const override = asSettings(
      item.$$type === 'overridable'
        ? asSettings(asSettings(item.value).origin_value).value
        : item.value,
    );
    const key = str(override.override_key);
    const prop = info.props[key];
    if (!key || !prop) continue;
    const value = overrideValue(c, prop, override.override_value);
    if (value !== undefined) overrides[overrideKey(key)] = value;
  }
  return [
    c.node('component', {
      component: componentId(post),
      ...(Object.keys(overrides).length ? { overrides } : {}),
    }),
  ];
}

/** An override's value, converted as the element's own setting would be. */
function overrideValue(
  c: Converter,
  prop: ComponentInfo['props'][string],
  value: unknown,
): unknown {
  const setting = SETTING_NAMES[prop.widgetType]?.[prop.propKey];
  if (!setting) return undefined;
  const [node] = atomicElement(c, {
    elType: prop.elType,
    widgetType: prop.widgetType,
    settings: { [prop.propKey]: value },
  });
  return node?.attrs[setting];
}

export function atomicElement(c: Converter, el: ElementorNode): CxdBlock[] {
  if (el.elType === 'widget' && el.widgetType === COMPONENT_WIDGET) return componentInstance(c, el);
  const settings = asSettings(el.settings);
  const value = (key: string) => unwrap(settings[key]);
  const classes = Array.isArray(value('classes')) ? (value('classes') as unknown[]).map(str) : [];
  const local = classes.filter((id) => id in asSettings(el.styles));
  const skipped = new Set<string>();
  const attrs: Settings = {};
  const styles = variants(el, local, skipped);
  if (styles.length) attrs._styles = styles;
  const global = classes.filter((id) => !local.includes(id) && /^[a-z0-9-]{1,40}$/.test(id));
  if (global.length) attrs._classes = global;
  const extra = asSettings(value('attributes'));
  if (str(extra.id)) attrs._css_id = str(extra.id);
  const interactions = atomicInteractions(el.interactions);
  if (interactions.length) attrs._interactions = interactions;
  // Elements of a component: their Elementor id, to find its overridable properties.
  if (c.ctx.keepElementIds && el.id) attrs.__elementor_id = el.id;
  if (skipped.size)
    c.note(`atomic style properties ${[...skipped].sort().join(', ')} were left out`);
  const link = atomicLink(settings.link, c.ctx.origin);
  const media = (raw: unknown) => {
    const image = asSettings(unwrap(raw));
    const src = asSettings(image.src);
    const id = num(src.id);
    const url = str(src.url);
    if (!url && id === null) return undefined;
    return (
      c.media({ id, url: url || '' }) ??
      (id !== null ? { id: c.ctx.mediaRef(id) ?? null, url } : undefined)
    );
  };
  const box = BOXES[el.elType ?? ''];
  if (box) {
    const tag = str(value('tag'));
    if (tag && tag !== 'div') attrs.tag = tag;
    if (link) attrs.link = link;
    return [c.node(`a-${box}`, attrs, c.children(el))];
  }
  const type = WIDGETS[el.widgetType ?? '']!;
  switch (type) {
    case 'a-heading':
      attrs.title = str(value('title'))
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '');
      if (str(value('tag'))) attrs.tag = str(value('tag'));
      if (link) attrs.link = link;
      break;
    case 'a-paragraph': {
      const text = str(value('paragraph'));
      attrs.content = /^\s*<(p|ul|ol|h\d|div)\b/i.test(text) ? text : `<p>${text}</p>`;
      if (link) attrs.link = link;
      break;
    }
    case 'a-button':
      attrs.text = str(value('text')).replace(/<[^>]+>/g, '');
      if (link) attrs.link = link;
      break;
    case 'a-image': {
      const image = media(settings.image);
      if (image) attrs.image = image;
      const size = str(asSettings(unwrap(settings.image)).size);
      if (size)
        attrs.image_size =
          size === 'thumbnail'
            ? 'thumb'
            : ['medium', 'large', 'full'].includes(size)
              ? size
              : 'large';
      if (link) attrs.link = link;
      break;
    }
    case 'a-svg': {
      const svg = asSettings(unwrap(settings.svg));
      const file = c.media({ id: num(svg.id), url: str(svg.url) });
      if (file) attrs.svg = file;
      if (link) attrs.link = link;
      break;
    }
    case 'a-youtube':
      attrs.url = str(value('source'));
      for (const key of ['autoplay', 'mute', 'loop']) if (value(key) === true) attrs[key] = true;
      break;
    case 'a-video': {
      const source = asSettings(unwrap(settings.source));
      const url = str(source.url) || str(asSettings(source.src).url);
      if (url) attrs.file = c.media({ id: num(source.id), url }) ?? { id: null, url };
      for (const key of ['autoplay', 'mute', 'loop']) if (value(key) === true) attrs[key] = true;
      if (value('controls') === false) attrs.controls = false;
      break;
    }
    default:
      break;
  }
  return [c.node(type, attrs)];
}

/**
 * Global classes of the kit (`_elementor_global_classes`) → Fresco's kit
 * classes, with their variants converted the same way.
 */
export function atomicClasses(value: unknown): Settings[] {
  const data = asSettings(value);
  const items = asSettings(data.items);
  const listed = Array.isArray(data.order)
    ? data.order.map((id) => str(asSettings(id).id || id))
    : [];
  // Elementor lists the class with the highest priority first; in Fresco the last one wins.
  const order = [
    ...listed.filter((id) => id in items),
    ...Object.keys(items).filter((id) => !listed.includes(id)),
  ].reverse();
  const skipped = new Set<string>();
  const out: Settings[] = [];
  for (const id of order) {
    const item = asSettings(items[id]);
    if (!/^[a-z0-9-]{1,40}$/.test(id)) continue;
    const el: ElementorNode = { styles: { [id]: item } };
    out.push({ id, label: str(item.label) || id, variants: variants(el, [id], skipped) });
  }
  return out;
}

/** Global variables of the kit (`_elementor_global_variables`) → Fresco's kit variables. */
export function atomicVariables(value: unknown): Settings[] {
  const data = asSettings(asSettings(value).data);
  const out: Settings[] = [];
  const rows = Object.entries(data).sort(
    ([, a], [, b]) => (num(asSettings(a).order) ?? 0) - (num(asSettings(b).order) ?? 0),
  );
  for (const [id, raw] of rows) {
    const variable = asSettings(raw);
    // Deleted ones still style the elements that use them (Elementor keeps them too).
    const deleted = Boolean(variable.deleted || variable.deleted_at);
    // Format 2: typed values (`{ $$type: 'color', value }`, sizes as `{ size, unit }`).
    let plain = variable.value;
    if (plain && typeof plain === 'object') {
      const inner = asSettings(plain).value;
      const size = asSettings(inner);
      plain =
        typeof inner === 'string'
          ? inner
          : size.unit === 'custom'
            ? str(size.size)
            : num(size.size) !== null
              ? `${num(size.size)}${str(size.unit) || 'px'}`
              : undefined;
    }
    const kind = str(variable.type);
    const type = kind.includes('color')
      ? 'color'
      : kind.includes('font')
        ? 'font'
        : kind.includes('size')
          ? 'size'
          : '';
    const own = variableId(id);
    if (!type || !own || typeof plain !== 'string' || !plain) continue;
    out.push({
      id: own,
      label: str(variable.label) || own,
      type,
      value: plain,
      ...(deleted ? { deleted: true } : {}),
    });
  }
  return out;
}
