/**
 * Elementor 4 components (`elementor_component` posts): a tree of atomic
 * elements (`_elementor_data`) and the settings instances may override
 * (`_elementor_component_overridable_props`). They become Fresco components
 * (Fresco's plugin data `components`); instances (`e-component`) become
 * `fresco/component` elements (elementor-atomic.ts).
 */
import type { CxdBlock } from '@cleitext/blocks';
import { newBlockId } from '@cleitext/blocks';
import { convertElements, type ElementorContext, type ElementorNode } from './elementor.js';
import { SETTING_NAMES, componentId, overrideKey, type ComponentInfo } from './elementor-atomic.js';
import { asSettings, str, type Settings } from './elementor-values.js';

/** The overridable properties of a component, by override key. */
export function componentInfo(meta: unknown): ComponentInfo {
  const props: ComponentInfo['props'] = {};
  for (const [key, raw] of Object.entries(asSettings(asSettings(meta).props))) {
    const p = asSettings(raw);
    const widgetType = str(p.widgetType) || str(p.elType);
    if (!widgetType || !str(p.propKey)) continue;
    props[str(p.overrideKey) || key] = {
      elType: str(p.elType) || 'widget',
      widgetType,
      propKey: str(p.propKey),
    };
  }
  return { props };
}

export interface FrescoComponentInput {
  id: string;
  title: string;
  nodes: CxdBlock[];
  props: { key: string; label: string; nodeId: string; setting: string }[];
}

/** One Elementor component → a Fresco component, or null when it has nothing Fresco shows. */
export function convertComponent(
  post: { id: number; title: string; data: string; props: unknown },
  ctx: ElementorContext,
): FrescoComponentInput | null {
  let elements: unknown;
  try {
    elements = JSON.parse(post.data);
  } catch {
    ctx.warn('its Elementor data could not be read: it was not imported.');
    return null;
  }
  if (!Array.isArray(elements)) return null;
  const blocks = convertElements(elements as ElementorNode[], { ...ctx, keepElementIds: true });
  if (blocks.length === 0) return null;
  // One root element, as Fresco's components have.
  const root: CxdBlock =
    blocks.length === 1
      ? blocks[0]!
      : { id: newBlockId(), type: 'fresco/a-div', v: 1, attrs: {}, children: blocks };
  const ids = new Map<string, string>();
  const walk = (block: CxdBlock) => {
    const source = block.attrs.__elementor_id;
    if (typeof source === 'string') ids.set(source, block.id);
    delete block.attrs.__elementor_id;
    block.children?.forEach(walk);
  };
  walk(root);
  const props: FrescoComponentInput['props'] = [];
  const meta = asSettings(asSettings(post.props).props);
  for (const [key, raw] of Object.entries(meta)) {
    const p = asSettings(raw) as Settings;
    const nodeId = ids.get(str(p.elementId));
    const setting = SETTING_NAMES[str(p.widgetType) || str(p.elType)]?.[str(p.propKey)];
    if (!nodeId || !setting) {
      ctx.warn(`the overridable property "${str(p.label) || key}" has no counterpart in Fresco.`);
      continue;
    }
    props.push({
      key: overrideKey(str(p.overrideKey) || key),
      label: str(p.label) || setting,
      nodeId,
      setting,
    });
  }
  return {
    id: componentId(post.id),
    title: post.title || `Component ${post.id}`,
    nodes: [root],
    props,
  };
}
