/**
 * Components in the editor, as in Elementor 4: "Create component" from an
 * atomic element, instances added from Globals → Components, the instance's
 * panel (its overridable properties, "Edit component", "Detach"), and the
 * component edited in place (the instance gives way to its elements until
 * saved or cancelled; saving changes every instance).
 */
import { api as coreApi, t as tr, useT } from '@cleitext/admin-sdk';
import { useState } from 'react';
import {
  COMPONENT_TYPE,
  OVERRIDABLE_CONTROLS,
  componentIdOf,
  expandInstance,
  overridesOf,
  setComponentSource,
  type Component,
  type ComponentProp,
} from '../core/components.js';
import { withDefaults } from '../core/css.js';
import { freeId } from '../core/design-system.js';
import { controlsOf } from '../core/extensions.js';
import { newId } from '../core/ids.js';
import type { Control, FrescoNode } from '../core/model.js';
import { getElement } from '../core/registry.js';
import { ControlField, Svg, type ControlEnv } from './controls.js';
import { askText, confirmAction, notify } from './dialogs.js';
import { useStore, type Store } from './store.js';
import { cloneWithNewIds, find, placeOf, walk } from './tree.js';

const PATH = '/ext/fresco/components';

/** Reads the site's components into the editor (and draws instances from them). */
export async function loadComponents(store: Store): Promise<void> {
  setComponentSource((id) => store.get().components.find((c) => c.id === id));
  const list = await coreApi<Component[]>('GET', PATH);
  store.actions.setComponents(Array.isArray(list) ? list : []);
}

async function saveComponent(store: Store, component: Component): Promise<Component> {
  const saved = await coreApi<Component>(
    'PUT',
    `${PATH}/${encodeURIComponent(component.id)}`,
    component,
  );
  const list = store.get().components;
  store.actions.setComponents(
    list.some((c) => c.id === saved.id)
      ? list.map((c) => (c.id === saved.id ? saved : c))
      : [...list, saved],
  );
  return saved;
}

/** Whether an element (with what it holds) may become a component: atomic elements only. */
export function canBeComponent(node: FrescoNode): boolean {
  let ok = true;
  walk([node], (n) => {
    if (n.type !== COMPONENT_TYPE && getElement(n.type)?.atomic !== true) ok = false;
  });
  return ok;
}

/** A new instance of a component. */
export function instanceNode(componentId: string): FrescoNode {
  return { id: newId(), type: COMPONENT_TYPE, v: 1, attrs: { component: componentId } };
}

/** "Create component": the element is saved as a component and becomes its first instance. */
export async function createComponent(store: Store, nodeId: string): Promise<void> {
  const node = find(store.get().blocks, nodeId);
  if (!node || !canBeComponent(node)) return;
  const title = await askText({
    title: tr('Create a component'),
    label: tr('Name'),
    value: getElement(node.type)?.title ?? 'Component',
  });
  if (!title) return;
  const id = freeId(
    title,
    store.get().components.map((c) => c.id),
    'component',
  );
  await saveComponent(store, { id, title, nodes: [structuredClone(node)], props: [] });
  const instance = instanceNode(id);
  const place = placeOf(store.get().blocks, nodeId);
  if (!place) return;
  store.actions.remove(nodeId);
  store.actions.insertNodes([instance], place);
  store.actions.select(instance.id);
  notify(tr('Component “{name}” created.', { name: title }), 'success');
}

/** "Detach": the instance becomes a copy of the component's elements, with its overrides. */
export function detachComponent(store: Store, nodeId: string): void {
  const node = find(store.get().blocks, nodeId);
  const expanded =
    node && expandInstance(node, (id) => store.get().components.find((c) => c.id === id));
  const place = placeOf(store.get().blocks, nodeId);
  if (!expanded || !place) return;
  const copy = cloneWithNewIds(expanded);
  store.actions.remove(nodeId);
  store.actions.insertNodes([copy], place);
  store.actions.select(copy.id);
}

/** "Edit component": its elements take the instance's place until saved or cancelled. */
export function editComponent(store: Store, nodeId: string): void {
  const node = find(store.get().blocks, nodeId);
  const id = node && componentIdOf(node);
  const component = id ? store.get().components.find((c) => c.id === id) : undefined;
  if (!node || !component?.nodes[0]) return;
  // New ids while edited (the page may already show these elements); the old ones come back.
  const ids: Record<string, string> = {};
  const fresh = (n: FrescoNode): FrescoNode => {
    const copy: FrescoNode = {
      ...n,
      id: newId(),
      attrs: structuredClone(n.attrs),
      ...(n.children ? { children: n.children.map(fresh) } : {}),
    };
    ids[copy.id] = n.id;
    return copy;
  };
  const content = fresh(component.nodes[0]);
  const back = Object.fromEntries(Object.entries(ids).map(([now, was]) => [was, now]));
  const props = component.props
    .filter((p) => back[p.nodeId])
    .map((p) => ({ ...p, nodeId: back[p.nodeId]! }));
  store.actions.beginGlobalEdit(
    nodeId,
    { id: component.id, title: component.title, component: { props, ids } },
    content,
  );
}

/** Saves the component edited in place, and shows its instance again. */
export async function saveComponentEdit(store: Store): Promise<void> {
  const edit = store.get().globalEdit;
  if (!edit?.component) return;
  const component = store.get().components.find((c) => c.id === edit.id);
  const content = find(store.get().blocks, edit.editId);
  if (!component || !content) {
    store.actions.endGlobalEdit();
    return;
  }
  if (!canBeComponent(content)) throw new Error(tr('A component holds atomic elements only.'));
  const { ids } = edit.component;
  const restore = (n: FrescoNode): FrescoNode => ({
    ...n,
    id: ids[n.id] ?? n.id,
    ...(n.children ? { children: n.children.map(restore) } : {}),
  });
  const present = new Set<string>();
  walk([content], (n) => present.add(n.id));
  await saveComponent(store, {
    ...component,
    nodes: [restore(content)],
    props: edit.component.props
      .filter((p) => present.has(p.nodeId))
      .map((p) => ({ ...p, nodeId: ids[p.nodeId] ?? p.nodeId })),
  });
  store.actions.endGlobalEdit();
}

/** Content settings of an element that instances may override. */
export function overridableControls(node: FrescoNode): Control[] {
  const definition = getElement(node.type);
  if (!definition?.atomic) return [];
  return controlsOf(definition).filter(
    (c) => c.tab === 'content' && OVERRIDABLE_CONTROLS.has(c.type) && !c.name.startsWith('_'),
  );
}

/**
 * While a component is edited in place, under the selected element of it:
 * which of its settings instances may change, and their names.
 */
export function ComponentPropsEditor({ store, node }: { store: Store; node: FrescoNode }) {
  const { t } = useT();
  const edit = useStore(store, (s) => s.globalEdit);
  const blocks = useStore(store, (s) => s.blocks);
  const inside = edit?.component && find(blocks, edit.editId);
  if (!edit?.component || !inside || !find([inside], node.id)) return null;
  const controls = overridableControls(node);
  if (controls.length === 0) return null;
  const props = edit.component.props;
  const set = (next: ComponentProp[]) => store.actions.setComponentProps(next);
  return (
    <section className="fre-section is-open fre-compprops">
      <div className="fre-section__head">
        <span>{t('Component properties')}</span>
      </div>
      <div className="fre-section__body">
        <p className="fre-help">
          {t('Overridable settings: each instance of the component may give them its own value.')}
        </p>
        {controls.map((control) => {
          const prop = props.find((p) => p.nodeId === node.id && p.setting === control.name);
          return (
            <div key={control.name} className="fre-kitrow">
              <label className="fre-check">
                <input
                  type="checkbox"
                  checked={Boolean(prop)}
                  aria-label={t('Overridable: {control}', { control: t(control.label) })}
                  onChange={(e) =>
                    set(
                      e.target.checked
                        ? [
                            ...props,
                            {
                              key: freeId(
                                `${control.label}`,
                                props.map((p) => p.key),
                                'prop',
                              ),
                              label: t(control.label),
                              nodeId: node.id,
                              setting: control.name,
                            },
                          ]
                        : props.filter((p) => p !== prop),
                    )
                  }
                />
                <span>{t(control.label)}</span>
              </label>
              {prop && (
                <input
                  className="fre-input"
                  value={prop.label}
                  aria-label={t('Property name')}
                  onChange={(e) =>
                    set(props.map((p) => (p === prop ? { ...p, label: e.target.value } : p)))
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** The panel of an instance: its overridable properties, edit and detach. */
export function ComponentInstancePanel({
  store,
  node,
  env,
}: {
  store: Store;
  node: FrescoNode;
  env: Pick<ControlEnv, 'device' | 'kit' | 'media' | 'readOnly' | 'setDevice'>;
}) {
  const { t } = useT();
  const components = useStore(store, (s) => s.components);
  const busy = useStore(store, (s) => s.globalEdit !== null);
  const id = componentIdOf(node);
  const component = components.find((c) => c.id === id);
  if (!component) {
    return <p className="fre-empty-note">{t('This component is not there any more.')}</p>;
  }
  const overrides = overridesOf(node);
  const setOverride = (key: string, value: unknown) => {
    const next = { ...overrides };
    if (value === undefined || value === null || value === '') delete next[key];
    else next[key] = value;
    store.actions.setSettings(
      node.id,
      { overrides: Object.keys(next).length ? next : undefined },
      `override:${key}`,
    );
  };
  return (
    <div className="fre-component-panel">
      <p className="fre-component-panel__title">
        <Svg path="M12 2l9 5v10l-9 5-9-5V7z M12 12l9-5 M12 12v10 M12 12L3 7" size={16} />
        <strong>{component.title}</strong>
      </p>
      {component.props.length === 0 ? (
        <p className="fre-help">
          {t(
            'This component has no overridable properties: edit the component and choose them in its elements.',
          )}
        </p>
      ) : (
        component.props.map((prop) => {
          let target: FrescoNode | null = null;
          walk(component.nodes, (n) => {
            if (n.id === prop.nodeId) target = n;
          });
          const element = target as FrescoNode | null;
          const definition = element ? getElement(element.type) : undefined;
          const control = definition
            ? controlsOf(definition).find((c) => c.name === prop.setting)
            : undefined;
          if (!element || !definition || !control) return null;
          const has = overrides[prop.key] !== undefined;
          const attrs = has ? { [control.name]: overrides[prop.key] } : {};
          const fieldEnv: ControlEnv = {
            ...env,
            hover: false,
            attrs,
            settings: withDefaults(definition, { ...element.attrs, ...attrs }),
            set: (changes) => {
              if (control.name in changes) setOverride(prop.key, changes[control.name]);
            },
          };
          return (
            <ControlField
              key={prop.key}
              control={{ ...control, label: prop.label, responsive: false } as Control}
              env={fieldEnv}
            />
          );
        })
      )}
      <div className="fre-library__save">
        <button
          type="button"
          className="fre-button fre-button--primary"
          disabled={env.readOnly || busy}
          onClick={() => editComponent(store, node.id)}
        >
          {t('Edit component')}
        </button>
        <button
          type="button"
          className="fre-button"
          disabled={env.readOnly}
          onClick={() => detachComponent(store, node.id)}
        >
          {t('Detach')}
        </button>
      </div>
    </div>
  );
}

/** Globals → Components: the site's components, to click or drag onto the page. */
export function ComponentsList({
  store,
  onDragNode,
  canManage,
}: {
  store: Store;
  onDragNode?: (event: React.PointerEvent, make: () => FrescoNode, label: string) => void;
  canManage: boolean;
}) {
  const { t } = useT();
  const components = useStore(store, (s) => s.components);
  const readOnly = useStore(store, (s) => s.readOnly || s.contentOnly);
  const [search, setSearch] = useState('');
  const add = (id: string) => {
    const state = store.get();
    const node = instanceNode(id);
    const selected = state.selected ? find(state.blocks, state.selected) : null;
    if (selected && getElement(selected.type)?.container) {
      store.actions.addNode(node, { parent: selected.id, index: selected.children?.length ?? 0 });
    } else {
      store.actions.addNode(node, { parent: null, index: state.blocks.length });
    }
  };
  const remove = async (component: Component) => {
    const ok = await confirmAction({
      title: tr('Delete the component “{name}”?', { name: component.title }),
      text: tr('Its instances on the pages show nothing any more. This cannot be undone.'),
      action: tr('Delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await coreApi('DELETE', `${PATH}/${encodeURIComponent(component.id)}`);
      store.actions.setComponents(store.get().components.filter((c) => c.id !== component.id));
    } catch (error) {
      notify(String(error instanceof Error ? error.message : error), 'error');
    }
  };
  const q = search.trim().toLowerCase();
  const shown = components.filter((c) => !q || c.title.toLowerCase().includes(q));
  return (
    <div className="fre-componentslist">
      <h4 className="fre-subheading">{t('Components')}</h4>
      {components.length > 4 && (
        <div className="fre-searchbox">
          <Svg path="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3" size={14} />
          <input
            placeholder={t('Search components…')}
            aria-label={t('Search components')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}
      {components.length === 0 ? (
        <p className="fre-empty-note">
          {t('No components yet: right-click an atomic element and choose “Create component”.')}
        </p>
      ) : (
        <div className="fre-tiles">
          {shown.map((c) => (
            <span key={c.id} className="fre-tilewrap">
              <button
                type="button"
                className="fre-tile fre-tile--component"
                disabled={readOnly}
                title={t('{element}: drag it onto the page, or click to add it', {
                  element: c.title,
                })}
                onPointerDown={(e) => onDragNode?.(e, () => instanceNode(c.id), c.title)}
                onClick={() => add(c.id)}
              >
                <Svg path="M12 2l9 5v10l-9 5-9-5V7z M12 12l9-5 M12 12v10 M12 12L3 7" size={28} />
                <span>{c.title}</span>
              </button>
              {canManage && !readOnly && (
                <button
                  type="button"
                  className="fre-iconbtn fre-tile__delete"
                  aria-label={t('Delete the component {name}', { name: c.title })}
                  onClick={() => void remove(c)}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
