/**
 * The instance of a component (`fresco/component`). On pages the server
 * replaces it with the component's elements before rendering (`render.blocks`
 * in server.tsx); where it cannot (templates of other plugins) its `load`
 * reads the component and it draws the elements itself, with their CSS. In
 * the editor it shows the component from the editor's list; the elements
 * inside are not selectable one by one: "Edit component" opens them.
 */
import { Fragment, type ReactNode } from 'react';
import {
  componentSource,
  expandInstance,
  COMPONENT_TYPE,
  type Component,
} from '../core/components.js';

import { documentCss, withDefaults } from '../core/css.js';
import type { Breakpoints, ElementDefinition, FrescoNode, RenderContext } from '../core/model.js';
import { getElement } from '../core/registry.js';

/** What the instance's `load` gives on the server: the components it shows, and the breakpoints. */
export interface ComponentData {
  components: Record<string, Component>;
  breakpoints: Breakpoints;
}

/** A tree drawn by the elements' own render (no `load`: atomic elements need none). */
export function renderNodes(nodes: FrescoNode[], context: RenderContext): ReactNode {
  return nodes.map((node) => {
    const definition = getElement(node.type);
    if (!definition) return null;
    const items = node.children?.map((child) => (
      <Fragment key={child.id}>{renderNodes([child], context)}</Fragment>
    ));
    return (
      <Fragment key={node.id}>
        {definition.render({
          node,
          settings: withDefaults(definition, node.attrs),
          context,
          ...(items ? { children: items, items } : {}),
        })}
      </Fragment>
    );
  });
}

/** The root element of an expanded instance: it carries the instance's id; the others are plain. */
function renderExpanded(root: FrescoNode, context: RenderContext): ReactNode {
  const definition = getElement(root.type);
  if (!definition) return null;
  const inner = { ...context, editing: false };
  const items = root.children?.map((child) => (
    <Fragment key={child.id}>{renderNodes([child], inner)}</Fragment>
  ));
  return definition.render({
    node: root,
    settings: withDefaults(definition, root.attrs),
    context,
    ...(items ? { children: items, items } : {}),
  });
}

export const componentInstance: ElementDefinition = {
  type: COMPONENT_TYPE,
  title: 'Component',
  icon: 'M12 2l9 5v10l-9 5-9-5V7z M12 12l9-5 M12 12v10 M12 12L3 7',
  category: 'atomic',
  keywords: ['component', 'reusable', 'symbol'],
  // Placed from the Globals tab (Components), not from the elements.
  hidden: true,
  controls: [],
  render({ node, context, data }) {
    // On the server (templates): the components `load` read, by id.
    const loaded = data as ComponentData | null | undefined;
    const expanded = expandInstance(
      node,
      loaded ? (id) => loaded.components[id] : componentSource(),
    );
    if (!expanded) {
      return context.editing ? (
        <div className="fr-e fre-unknown" data-fr-id={node.id}>
          This component is not there any more.
        </div>
      ) : null;
    }
    return (
      <>
        {loaded ? <style>{documentCss([expanded], getElement, loaded.breakpoints)}</style> : null}
        {renderExpanded(expanded, context)}
      </>
    );
  },
};
