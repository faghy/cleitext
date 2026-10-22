/**
 * Texts edited in place in the canvas: which parts of an element's markup
 * are which of its settings, and how a text typed there becomes a change
 * of the settings.
 *
 * Elements mark their main text with `data-fr-inline="<setting>"` when they
 * render it; the others are described here, by element type, with CSS
 * selectors of their markup (a definition's own `inline` list wins). The
 * canvas marks the matching nodes after every render.
 */
import type { Control, ElementDefinition, FrescoNode, Settings } from '../core/model.js';

export interface InlineField {
  /** The text's node, inside the element (never inside an element nested in it). */
  selector: string;
  /**
   * The setting it shows:
   * - a control's name (`title`);
   * - `items[].text`: the field `text` of a repeater's items, the n-th node
   *   being the n-th item;
   * - `[]._title`: the `_title` of the element's n-th child (tabs,
   *   accordions), n from the node's `data-fr-tab`.
   */
  setting: string;
}

/** Texts of elements that do not mark them themselves. */
export const INLINE_FIELDS: Record<string, InlineField[]> = {
  'fresco/icon-box': [
    { selector: '.fr-box__title', setting: 'title' },
    { selector: '.fr-box__description', setting: 'description' },
  ],
  'fresco/image-box': [
    { selector: '.fr-box__title', setting: 'title' },
    { selector: '.fr-box__description', setting: 'description' },
  ],
  'fresco/icon-list': [{ selector: '.fr-list__text', setting: 'items[].text' }],
  'fresco/counter': [
    { selector: '.fr-counter__title', setting: 'title' },
    { selector: '.fr-counter__prefix', setting: 'prefix' },
    { selector: '.fr-counter__suffix', setting: 'suffix' },
  ],
  'fresco/progress': [
    { selector: '.fr-progress__title', setting: 'title' },
    { selector: '.fr-progress__inner', setting: 'inner' },
  ],
  'fresco/testimonial': [
    { selector: '.fr-quote__content', setting: 'content' },
    { selector: '.fr-quote__name', setting: 'name' },
    { selector: '.fr-quote__job', setting: 'job' },
  ],
  'fresco/alert': [
    { selector: '.fr-alert__title', setting: 'title' },
    { selector: '.fr-alert__description', setting: 'description' },
  ],
  'fresco/star-rating': [{ selector: '.fr-rating__title', setting: 'title' }],
  'fresco/tabs': [{ selector: '.fr-tabs__title, .fr-tabs__mobile-title', setting: '[]._title' }],
  'fresco/accordion': [{ selector: '.fr-acc__label', setting: '[]._title' }],
  'fresco/toggle': [{ selector: '.fr-acc__label', setting: '[]._title' }],
  // Fresco Pro's.
  'fresco-pro/call-to-action': [
    { selector: '.frp-cta__title', setting: 'title' },
    { selector: '.frp-cta__desc', setting: 'description' },
    { selector: '.frp-cta__ribbon', setting: 'ribbon_title' },
  ],
  'fresco-pro/flip-box': [
    { selector: '.frp-flip__front .frp-flip__title', setting: 'front_title' },
    { selector: '.frp-flip__front .frp-flip__text', setting: 'front_text' },
    { selector: '.frp-flip__back .frp-flip__title', setting: 'back_title' },
    { selector: '.frp-flip__back .frp-flip__text', setting: 'back_text' },
  ],
};

const TEXT_TYPES = new Set(['text', 'textarea', 'richtext']);

/** The texts of an element edited in place (besides those it marks itself). */
export function inlineFields(
  definition: ElementDefinition & { inline?: InlineField[] },
): InlineField[] {
  return definition.inline ?? INLINE_FIELDS[definition.type] ?? [];
}

/** What a `data-fr-inline` value stands for. */
export type InlineKey =
  | { kind: 'setting'; name: string }
  | { kind: 'item'; name: string; index: number; field: string }
  | { kind: 'child'; index: number; field: string };

/**
 * The `data-fr-inline` value of the n-th node matching a field (n counts the
 * matches of that field in the element), or null when the setting is not a
 * text of the element.
 */
export function inlineKey(
  definition: ElementDefinition,
  field: InlineField,
  index: number,
): string | null {
  const item = /^(\w+)\[\]\.(\w+)$/.exec(field.setting);
  if (item) {
    const control = definition.controls.find((c) => c.name === item[1]);
    const sub =
      control?.type === 'repeater' ? control.fields?.find((f) => f.name === item[2]) : null;
    return sub && TEXT_TYPES.has(sub.type) ? `${item[1]}.${index}.${item[2]}` : null;
  }
  const child = /^\[\]\.(\w+)$/.exec(field.setting);
  if (child) return `[${index}].${child[1]}`;
  const control = definition.controls.find((c) => c.name === field.setting);
  return control && TEXT_TYPES.has(control.type) ? field.setting : null;
}

export function parseInlineKey(key: string): InlineKey | null {
  const child = /^\[(\d+)\]\.(\w+)$/.exec(key);
  if (child) return { kind: 'child', index: Number(child[1]), field: child[2]! };
  const item = /^(\w+)\.(\d+)\.(\w+)$/.exec(key);
  if (item) return { kind: 'item', name: item[1]!, index: Number(item[2]), field: item[3]! };
  return /^\w+$/.test(key) ? { kind: 'setting', name: key } : null;
}

/** The control behind a text edited in place (its type says plain or rich). */
export function inlineControl(definition: ElementDefinition, key: InlineKey): Control | null {
  if (key.kind === 'child') return { name: key.field, type: 'text', label: 'Title' } as Control;
  const control = definition.controls.find((c) => c.name === key.name);
  if (!control) return null;
  if (key.kind === 'setting') return TEXT_TYPES.has(control.type) ? control : null;
  const sub =
    control.type === 'repeater' ? control.fields?.find((f) => f.name === key.field) : null;
  return sub && TEXT_TYPES.has(sub.type) ? (sub as Control) : null;
}

/**
 * The change a text typed in place makes: on which element (the element, or
 * one of its children for the titles of tabs) and which settings, or null
 * when it cannot be applied. `settings` are the element's with defaults.
 */
export function inlineChange(
  node: FrescoNode,
  settings: Settings,
  key: InlineKey,
  value: string,
): { id: string; changes: Settings } | null {
  if (key.kind === 'setting') return { id: node.id, changes: { [key.name]: value } };
  if (key.kind === 'child') {
    const child = node.children?.[key.index];
    return child ? { id: child.id, changes: { [key.field]: value } } : null;
  }
  const list = settings[key.name];
  if (!Array.isArray(list) || !list[key.index]) return null;
  const items = (list as Settings[]).map((item, i) =>
    i === key.index ? { ...item, [key.field]: value } : item,
  );
  return { id: node.id, changes: { [key.name]: items } };
}

/** The current value of a text edited in place. */
export function inlineValue(node: FrescoNode, settings: Settings, key: InlineKey): unknown {
  if (key.kind === 'setting') return settings[key.name];
  if (key.kind === 'child') return node.children?.[key.index]?.attrs[key.field];
  const list = settings[key.name];
  return Array.isArray(list) ? (list[key.index] as Settings | undefined)?.[key.field] : undefined;
}

/**
 * Marks the texts of the elements under `root` with `data-fr-inline`, from
 * their definitions. Texts being edited and texts the element marked itself
 * are left alone.
 */
export function markInlineFields(
  root: Element,
  definitionOf: (type: string) => ElementDefinition | undefined,
  typeOf: (id: string) => string | undefined,
): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-fr-id]')) {
    const type = typeOf(element.dataset.frId!);
    const definition = type ? definitionOf(type) : undefined;
    if (!definition) continue;
    for (const field of inlineFields(definition)) {
      const own = [...element.querySelectorAll<HTMLElement>(field.selector)].filter(
        (node) => node.closest('[data-fr-id]') === element,
      );
      own.forEach((node, n) => {
        if (node.isContentEditable || node.querySelector('[data-fr-inline]')) return;
        const tab = node.closest<HTMLElement>('[data-fr-tab]');
        const index = field.setting.startsWith('[]') && tab ? Number(tab.dataset.frTab) : n;
        const key = inlineKey(definition, field, index);
        if (key && node.dataset.frInline !== key) node.dataset.frInline = key;
      });
    }
  }
}

/**
 * The text typed in a plain inline field, as written: `innerText` keeps the
 * line breaks but applies `text-transform`, so a heading shown in capitals
 * (Site settings → Typography, or its own style) would be saved in capitals.
 */
export function typedText(field: HTMLElement): string {
  const doc = field.ownerDocument;
  const style = doc.createElement('style');
  style.textContent = '[data-fre-reading],[data-fre-reading] *{text-transform:none!important}';
  doc.head.append(style);
  field.setAttribute('data-fre-reading', '');
  try {
    return field.innerText;
  } finally {
    field.removeAttribute('data-fre-reading');
    style.remove();
  }
}
