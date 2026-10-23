/**
 * Components, as in Elementor 4: a tree of atomic elements saved once
 * (site-wide, in Fresco's storage) and shown by instances
 * (`fresco/component`, `attrs.component` = its id). Some settings of its
 * elements are "overridable": each instance may give them its own value
 * (`attrs.overrides`, by property key). Changing the component changes every
 * instance; detaching an instance turns it into a copy of the elements.
 *
 * An instance is drawn as the component's root element with the instance's
 * id (so the page's layout is the component's, with no wrapper), and the
 * other elements with ids prefixed by it (`<instance>-<element>`), unique on
 * the page however many instances there are.
 */
import type { FrescoNode } from './model.js';

export const COMPONENT_TYPE = 'fresco/component';

/** A setting of an element of the component that instances may change. */
export interface ComponentProp {
  /** Key of the override in the instances. */
  key: string;
  /** Its name in the instance's panel. */
  label: string;
  /** The element of the component it belongs to. */
  nodeId: string;
  /** The setting of that element. */
  setting: string;
}

export interface Component {
  id: string;
  title: string;
  /** The component's elements: one root element. */
  nodes: FrescoNode[];
  props: ComponentProp[];
  updatedAt?: string;
}

const ID = /^[a-z0-9-]{1,40}$/;
const NODE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SETTING = /^[A-Za-z_][\w@:-]{0,63}$/;
export const MAX_COMPONENTS = 300;
const MAX_NODES = 300;
const MAX_DEPTH = 4;

function countNodes(nodes: FrescoNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.children ?? []), 0);
}

function validTree(value: unknown, depth = 0): value is FrescoNode[] {
  if (!Array.isArray(value) || depth > 40) return false;
  return value.every(
    (n) =>
      n &&
      typeof n === 'object' &&
      typeof n.id === 'string' &&
      NODE_ID.test(n.id) &&
      typeof n.type === 'string' &&
      n.attrs &&
      typeof n.attrs === 'object' &&
      (n.children === undefined || validTree(n.children, depth + 1)),
  );
}

/** A component read from storage or sent by the editor; null when it is not one. */
export function normalizeComponent(value: unknown): Component | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<Component>;
  if (typeof v.id !== 'string' || !ID.test(v.id)) return null;
  if (!validTree(v.nodes) || v.nodes.length !== 1 || countNodes(v.nodes) > MAX_NODES) return null;
  const ids = new Set<string>();
  const collect = (nodes: FrescoNode[]) =>
    nodes.forEach((n) => {
      ids.add(n.id);
      collect(n.children ?? []);
    });
  collect(v.nodes);
  const keys = new Set<string>();
  const props = (Array.isArray(v.props) ? v.props : [])
    .filter(
      (p): p is ComponentProp =>
        Boolean(p) &&
        typeof p.key === 'string' &&
        ID.test(p.key) &&
        typeof p.nodeId === 'string' &&
        ids.has(p.nodeId) &&
        typeof p.setting === 'string' &&
        SETTING.test(p.setting) &&
        !p.setting.startsWith('_'),
    )
    .filter((p) => !keys.has(p.key) && Boolean(keys.add(p.key)))
    .slice(0, 50)
    .map((p) => ({
      key: p.key,
      label: typeof p.label === 'string' && p.label.trim() ? p.label.slice(0, 60) : p.setting,
      nodeId: p.nodeId,
      setting: p.setting,
    }));
  return {
    id: v.id,
    title: typeof v.title === 'string' && v.title.trim() ? v.title.slice(0, 80) : v.id,
    nodes: v.nodes,
    props,
    ...(typeof v.updatedAt === 'string' ? { updatedAt: v.updatedAt.slice(0, 40) } : {}),
  };
}

export function normalizeComponents(value: unknown): Component[] {
  const items = (value as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: Component[] = [];
  for (const raw of items) {
    const c = normalizeComponent(raw);
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      out.push(c);
    }
  }
  return out.slice(0, MAX_COMPONENTS);
}

/** The id of the component an instance shows, or null. */
export function componentIdOf(node: Pick<FrescoNode, 'type' | 'attrs'>): string | null {
  const id = node.type === COMPONENT_TYPE ? node.attrs.component : null;
  return typeof id === 'string' && ID.test(id) ? id : null;
}

/** The instance's overrides (by property key). */
export function overridesOf(node: Pick<FrescoNode, 'attrs'>): Record<string, unknown> {
  const value = node.attrs.overrides;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Ids of the components a tree shows (its instances, not inside other components). */
export function instancesIn(nodes: FrescoNode[]): string[] {
  const out: string[] = [];
  const walk = (list: FrescoNode[]) => {
    for (const node of list) {
      const id = componentIdOf(node);
      if (id) out.push(id);
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/**
 * Whether saving `nodes` as the component `id` makes a component show
 * itself (directly or through others).
 */
export function makesCycle(
  id: string,
  nodes: FrescoNode[],
  lookup: (id: string) => Component | undefined,
): boolean {
  const seen = new Set<string>();
  const visit = (list: FrescoNode[], depth: number): boolean => {
    if (depth > 20) return true;
    for (const child of instancesIn(list)) {
      if (child === id) return true;
      if (seen.has(child)) continue;
      seen.add(child);
      const c = lookup(child);
      if (c && visit(c.nodes, depth + 1)) return true;
    }
    return false;
  };
  return visit(nodes, 0);
}

const prefixed = (prefix: string, id: string) =>
  `${prefix}-${id}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120);

/**
 * An instance drawn: the component's root element with the instance's id and
 * the instance's overrides, the other elements with prefixed ids. Instances
 * inside it are drawn too (up to a few levels, never a component inside
 * itself). Null when the component is not there.
 */
export function expandInstance(
  instance: FrescoNode,
  lookup: (id: string) => Component | undefined,
  trail: string[] = [],
): FrescoNode | null {
  const id = componentIdOf(instance);
  const component = id ? lookup(id) : undefined;
  if (!id || !component || trail.includes(id) || trail.length >= MAX_DEPTH) return null;
  const root = component.nodes[0];
  if (!root) return null;
  const overrides = overridesOf(instance);
  const changes = new Map<string, Record<string, unknown>>();
  for (const prop of component.props) {
    if (!(prop.key in overrides)) continue;
    const value = overrides[prop.key];
    if (value === undefined || value === null) continue;
    (changes.get(prop.nodeId) ?? changes.set(prop.nodeId, {}).get(prop.nodeId)!)[prop.setting] =
      value;
  }
  const copy = (node: FrescoNode, isRoot: boolean): FrescoNode | null => {
    const own = changes.get(node.id);
    const next: FrescoNode = {
      ...node,
      id: isRoot ? instance.id : prefixed(instance.id, node.id),
      attrs: own ? { ...node.attrs, ...own } : node.attrs,
      ...(node.children
        ? {
            children: node.children
              .map((child) => copy(child, false))
              .filter((child): child is FrescoNode => child !== null),
          }
        : {}),
    };
    if (componentIdOf(next)) return expandInstance(next, lookup, [...trail, id]);
    return next;
  };
  return copy(root, true);
}

/** A tree with its instances drawn (those of missing components are left out). */
export function expandTree(
  nodes: FrescoNode[],
  lookup: (id: string) => Component | undefined,
): FrescoNode[] {
  return nodes
    .map((node) => {
      if (componentIdOf(node)) return expandInstance(node, lookup);
      return node.children ? { ...node, children: expandTree(node.children, lookup) } : node;
    })
    .filter((node): node is FrescoNode => node !== null);
}

/** Whether a tree has instances. */
export function hasInstances(nodes: unknown): boolean {
  if (!Array.isArray(nodes)) return false;
  return nodes.some(
    (n) =>
      n &&
      typeof n === 'object' &&
      ((n as FrescoNode).type === COMPONENT_TYPE || hasInstances((n as FrescoNode).children)),
  );
}

/** Settings an instance may override: the content settings of atomic elements. */
export const OVERRIDABLE_CONTROLS = new Set(['text', 'textarea', 'richtext', 'media', 'url']);

// ---- Where the components come from (the server's cache, the editor's list) ----------

type Source = (id: string) => Component | undefined;
const KEY = Symbol.for('cleitext.fresco.components');

/** Sets where the components are read when drawing instances (editor: its list). */
export function setComponentSource(source: Source | null): void {
  (globalThis as unknown as Record<symbol, Source | null>)[KEY] = source;
}

export function componentSource(): Source {
  return (globalThis as unknown as Record<symbol, Source | null>)[KEY] ?? (() => undefined);
}
