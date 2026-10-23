/**
 * The Class manager and the Variables manager (Elementor 4's editor tools):
 * how much each global class and variable is used, and the changes they
 * make to the kit (order, duplicate, local style → class, the kit's global
 * colors and fonts → variables).
 */
import type { GlobalClass, StyleVariant, Variable } from './atomic.js';
import type { Kit } from './kit.js';

export interface DesignUsage {
  /** By class id: elements that have it, and in how many documents. */
  classes: Record<string, { elements: number; documents: number }>;
  /** By variable id: values that use it (in elements and classes), and documents. */
  variables: Record<string, { uses: number; documents: number }>;
  /** The documents looked at. */
  documents: number;
}

interface NodeLike {
  attrs?: Record<string, unknown>;
  children?: unknown;
}

const VAR = /var\(--fr-v-([a-z0-9-]{1,40})\)/g;

function countVariables(value: unknown, into: Map<string, number>): void {
  const text = JSON.stringify(value ?? null);
  for (const match of text.matchAll(VAR)) into.set(match[1]!, (into.get(match[1]!) ?? 0) + 1);
}

/**
 * Usage of the kit's classes and variables in some documents (pages,
 * templates, components); variables are also counted in the classes.
 */
export function designUsage(
  documents: { blocks?: unknown }[],
  kit: Pick<Kit, 'classes'>,
): DesignUsage {
  const usage: DesignUsage = { classes: {}, variables: {}, documents: 0 };
  for (const document of documents) {
    if (!Array.isArray(document.blocks)) continue;
    usage.documents++;
    const classes = new Map<string, number>();
    const variables = new Map<string, number>();
    const walk = (nodes: unknown[], depth: number) => {
      if (depth > 60) return;
      for (const raw of nodes) {
        const node = raw as NodeLike | null;
        if (!node || typeof node !== 'object') continue;
        const attrs = node.attrs ?? {};
        if (Array.isArray(attrs._classes)) {
          for (const id of attrs._classes)
            if (typeof id === 'string') classes.set(id, (classes.get(id) ?? 0) + 1);
        }
        countVariables(attrs, variables);
        if (Array.isArray(node.children)) walk(node.children, depth + 1);
      }
    };
    walk(document.blocks, 0);
    for (const [id, n] of classes) {
      const row = (usage.classes[id] ??= { elements: 0, documents: 0 });
      row.elements += n;
      row.documents++;
    }
    for (const [id, n] of variables) {
      const row = (usage.variables[id] ??= { uses: 0, documents: 0 });
      row.uses += n;
      row.documents++;
    }
  }
  const inClasses = new Map<string, number>();
  for (const c of kit.classes) countVariables(c.variants, inClasses);
  for (const [id, n] of inClasses) (usage.variables[id] ??= { uses: 0, documents: 0 }).uses += n;
  return usage;
}

/** A new id from a name, not used by any of `taken`. */
export function freeId(label: string, taken: Iterable<string>, prefix = 'c'): string {
  const used = new Set(taken);
  const base =
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 34) || prefix;
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * The classes as the Class manager lists them: the one with the highest
 * priority first. In the kit (and in the CSS) the last class wins, so the
 * list is the kit's order reversed.
 */
export function classesByPriority(classes: GlobalClass[]): GlobalClass[] {
  return [...classes].reverse();
}

/** Moves a class in the priority list (`from` and `to` are positions in that list). */
export function moveClass(classes: GlobalClass[], from: number, to: number): GlobalClass[] {
  const list = classesByPriority(classes);
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return classes;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item!);
  return classesByPriority(list);
}

/** A copy of a class right above it in priority, named "<label> copy". */
export function duplicateClass(
  classes: GlobalClass[],
  id: string,
  copyLabel: string,
): GlobalClass[] {
  const index = classes.findIndex((c) => c.id === id);
  if (index < 0) return classes;
  const source = classes[index]!;
  const copy: GlobalClass = {
    id: freeId(
      copyLabel,
      classes.map((c) => c.id),
    ),
    label: copyLabel.slice(0, 60),
    variants: structuredClone(source.variants),
  };
  return [...classes.slice(0, index + 1), copy, ...classes.slice(index + 1)];
}

/**
 * "Convert to class": the element's own style becomes a new class (the
 * highest priority), and the element gets it in place of its own style.
 */
export function localStyleToClass(
  kit: Pick<Kit, 'classes'>,
  attrs: Record<string, unknown>,
  label: string,
): { classes: GlobalClass[]; attrs: { _styles: undefined; _classes: string[] } } | null {
  const variants = Array.isArray(attrs._styles) ? (attrs._styles as StyleVariant[]) : [];
  if (variants.length === 0 || !label.trim()) return null;
  const id = freeId(
    label,
    kit.classes.map((c) => c.id),
  );
  const own = Array.isArray(attrs._classes) ? (attrs._classes as string[]) : [];
  return {
    classes: [...kit.classes, { id, label: label.trim().slice(0, 60), variants }],
    attrs: { _styles: undefined, _classes: [...own.filter((c) => c !== id), id] },
  };
}

/**
 * The kit's global colors and fonts as variables (Variables manager →
 * Import): one variable each, those already imported are left as they are.
 */
export function variablesFromKit(kit: Pick<Kit, 'colors' | 'fonts' | 'variables'>): Variable[] {
  const have = new Set(kit.variables.map((v) => v.id));
  const out: Variable[] = [];
  for (const c of kit.colors) {
    const id = `color-${c.id}`.slice(0, 40);
    if (!have.has(id)) out.push({ id, label: c.title, type: 'color', value: c.value });
  }
  for (const f of kit.fonts) {
    const id = `font-${f.id}`.slice(0, 40);
    if (!have.has(id) && f.family) out.push({ id, label: f.title, type: 'font', value: f.family });
  }
  return out;
}

/** Variables the style pickers offer: those not deleted, of one type. */
export function liveVariables(variables: Variable[], type: Variable['type']): Variable[] {
  return variables.filter((v) => v.type === type && !v.deleted);
}
