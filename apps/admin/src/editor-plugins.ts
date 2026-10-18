import type { FieldBlockDefinition } from '@cleitext/editor-core';
import { labelText, type PluginAdminInfo, type PluginBlockView } from '@cleitext/shared';
import { api } from './api';

/**
 * What plugins add to the block editor: their blocks (generated forms, or
 * blocks of their own editor entries, plugin API 1.23) and the styles of
 * their blocks for the canvas. The editor entries run before the editor
 * mounts, so their blocks are registered when the document opens.
 */
export async function editorExtensions(
  locale: string,
): Promise<{ fieldBlocks: FieldBlockDefinition[]; styleUrls: string[] }> {
  const [infos, blocks, { loadPluginEditors }] = await Promise.all([
    api<PluginAdminInfo[]>('GET', '/plugins/admin').catch(() => [] as PluginAdminInfo[]),
    api<PluginBlockView[]>('GET', '/blocks').catch(() => [] as PluginBlockView[]),
    import('@cleitext/editor-gutenberg'),
  ]);
  await loadPluginEditors(infos.flatMap((info) => (info.editorUrl ? [info.editorUrl] : [])));
  return {
    fieldBlocks: blocks.map((block) => toFieldBlock(block, locale)),
    styleUrls: infos.flatMap((info) => info.editorStyles ?? []),
  };
}

function toFieldBlock(block: PluginBlockView, locale: string): FieldBlockDefinition {
  return {
    type: block.type,
    title: labelText(block.title, locale),
    ...(block.description ? { description: labelText(block.description, locale) } : {}),
    ...(block.icon ? { icon: block.icon } : {}),
    category: block.category,
    version: block.version,
    attributes: block.attributes,
    ...(block.native ? { native: true } : {}),
    ...(block.richAttributes ? { richAttributes: block.richAttributes } : {}),
    ...(block.container ? { container: true } : {}),
  };
}
