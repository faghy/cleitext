import type { CxdBlock, CxdDocument } from '@cleitext/blocks';
import type {
  AiContext,
  AiEditorDefinition,
  AiToolDefinition,
  AiValidation,
} from '@cleitext/plugin-sdk';
import { Logger } from '@nestjs/common';
import type { LoadedPlugin, PluginHost } from '../plugins/plugin-host.service.js';
import type { SettingsService } from '../settings/settings.service.js';
import { ToolError } from './errors.js';

/**
 * What the AI tools know of a site beyond its REST API (plugin API 1.40):
 * the editors of its active plugins (guides, conversions, validation), the
 * plugins' sections of the guide and their tools, and the editor new entries
 * of each content type open with.
 */

/** The block editor's id, also for documents without `editor`. */
export const BLOCK_EDITOR = 'blocks';

export interface AiEditorInfo {
  id: string;
  title: string;
  /** The plugin that adds it; null for the block editor. */
  plugin: string | null;
  types?: string[];
  /** Blocks and HTML can be sent: they are converted to it. */
  convertsBlocks: boolean;
  /** Documents in its own format can be sent (validated). */
  acceptsNative: boolean;
  /** Its documents can be read as blocks. */
  readsAsBlocks: boolean;
}

/** A tool added by a plugin, as the tools list shows it. */
export interface PluginTool {
  name: string;
  title: string;
  description: string;
  scope: 'read' | 'write';
  inputSchema: Record<string, unknown>;
  run(args: Record<string, unknown>): Promise<unknown>;
}

export interface SiteAi {
  /** The block editor, then those of the active plugins (for a content type when given). */
  editors(type?: string): Promise<AiEditorInfo[]>;
  /** The editor new entries of a type open with (Settings → Writing); `blocks` when unset. */
  defaultEditor(type: string): Promise<string>;
  /** The guide of a plugin editor; null for the block editor or an unknown one. */
  guide(editor: string, context: { locale: string; type?: string }): Promise<string | null>;
  /** Sections added to the guide by the active plugins. */
  sections(): Promise<{ plugin: string; title: string; markdown: string }[]>;
  fromBlocks(
    editor: string,
    blocks: CxdBlock[],
    context: { locale: string; type?: string },
  ): Promise<CxdDocument>;
  toBlocks(
    editor: string,
    document: CxdDocument,
    context: { locale: string; type?: string },
  ): Promise<CxdBlock[]>;
  validate(
    editor: string,
    document: CxdDocument,
    context: { locale: string; type?: string },
  ): Promise<CxdDocument>;
  /** Tools of the active plugins the person may use, named `<plugin>_<name>`. */
  tools(): Promise<PluginTool[]>;
}

export interface SiteAiInput {
  siteId: string;
  userId: string;
  capabilities: readonly string[];
  /** The REST API as the person, for plugin tools. */
  api(method: string, path: string, body?: unknown): Promise<{ status: number; data: unknown }>;
}

const logger = new Logger('AI');

/** A message from a plugin's error, short enough for an assistant. */
function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

export function siteAi(host: PluginHost, settings: SettingsService, input: SiteAiInput): SiteAi {
  let active: Promise<LoadedPlugin[]> | null = null;
  // In a stable order: editors, sections and tools are listed by plugin.
  const plugins = () =>
    (active ??= host
      .activePlugins(input.siteId)
      .then((list) => [...list].sort((a, b) => a.slug.localeCompare(b.slug))));
  let siteLocale: Promise<string> | null = null;
  let defaults: Promise<Record<string, string>> | null = null;
  const defaultLocale = () =>
    (siteLocale ??= host.pluginServices
      .site(input.siteId)
      .then((site) => site.defaultLocale)
      .catch(() => 'en'));

  const context = (c: { locale: string; type?: string }): AiContext => ({
    siteId: input.siteId,
    userId: input.userId,
    locale: c.locale,
    ...(c.type ? { type: c.type } : {}),
  });

  async function find(
    editor: string,
  ): Promise<{ plugin: LoadedPlugin; definition: AiEditorDefinition } | null> {
    for (const plugin of await plugins()) {
      const definition = plugin.ai.editors.find((e) => e.id === editor);
      if (definition) return { plugin, definition };
    }
    return null;
  }

  async function required(editor: string) {
    const found = await find(editor);
    if (!found) {
      throw new ToolError(
        `The editor "${editor}" is not available to assistants on this site (its plugin is not active, or does not support AI). Use the block editor ("blocks") or one listed by get_site.`,
      );
    }
    return found;
  }

  /** Runs a plugin's function; its failures become messages for the assistant. */
  async function call<T>(plugin: LoadedPlugin, what: string, run: () => T | Promise<T>) {
    try {
      return await run();
    } catch (error) {
      logger.warn(`${plugin.slug}: ${what} failed: ${messageOf(error)}`);
      throw new ToolError(`${what} failed in the plugin ${plugin.slug}: ${messageOf(error)}`);
    }
  }

  return {
    async editors(type) {
      const list: AiEditorInfo[] = [
        {
          id: BLOCK_EDITOR,
          title: 'Block editor',
          plugin: null,
          convertsBlocks: true,
          acceptsNative: false,
          readsAsBlocks: true,
        },
      ];
      for (const plugin of await plugins()) {
        for (const editor of plugin.ai.editors) {
          if (type && editor.types && !editor.types.includes(type)) continue;
          list.push({
            id: editor.id,
            title: editor.title,
            plugin: plugin.slug,
            ...(editor.types ? { types: editor.types } : {}),
            convertsBlocks: typeof editor.fromBlocks === 'function',
            acceptsNative: typeof editor.validate === 'function',
            readsAsBlocks: typeof editor.toBlocks === 'function',
          });
        }
      }
      return list;
    },

    async defaultEditor(type) {
      const editors = await (defaults ??= settings
        .getCore(input.siteId)
        .then((core) => core.defaultEditors));
      return editors[type] ?? BLOCK_EDITOR;
    },

    async guide(editor, c) {
      const found = editor === BLOCK_EDITOR ? null : await find(editor);
      if (!found) return null;
      const { guide } = found.definition;
      return call(found.plugin, 'The guide', () =>
        typeof guide === 'function' ? guide(context(c)) : guide,
      );
    },

    async sections() {
      const out: { plugin: string; title: string; markdown: string }[] = [];
      const locale = await defaultLocale();
      for (const plugin of await plugins()) {
        for (const section of plugin.ai.sections) {
          try {
            const markdown =
              typeof section.markdown === 'function'
                ? await section.markdown({
                    siteId: input.siteId,
                    userId: input.userId,
                    locale,
                  })
                : section.markdown;
            if (markdown.trim()) out.push({ plugin: plugin.slug, title: section.title, markdown });
          } catch (error) {
            // One plugin's section never keeps the guide from the assistant.
            logger.warn(`${plugin.slug}: AI section failed: ${messageOf(error)}`);
          }
        }
      }
      return out;
    },

    async fromBlocks(editor, blocks, c) {
      const { plugin, definition } = await required(editor);
      if (!definition.fromBlocks) {
        throw new ToolError(
          `The editor "${editor}" cannot convert blocks or HTML: send the document in its own format (field "native"), as its guide shows (get_block_guide).`,
        );
      }
      const convert = definition.fromBlocks;
      const document = await call(plugin, 'Converting the blocks', () =>
        convert(blocks, context(c)),
      );
      return { ...document, editor: { ...document.editor, id: editor } };
    },

    async toBlocks(editor, document, c) {
      const { plugin, definition } = await required(editor);
      if (!definition.toBlocks) {
        throw new ToolError(`The editor "${editor}" cannot be read as blocks.`);
      }
      const convert = definition.toBlocks;
      return call(plugin, 'Reading as blocks', () => convert(document, context(c)));
    },

    async validate(editor, document, c) {
      const { plugin, definition } = await required(editor);
      if (!definition.validate) {
        throw new ToolError(
          `The editor "${editor}" does not accept documents in its own format from assistants: send "content" or "blocks", which are converted.`,
        );
      }
      const check = definition.validate;
      const result: AiValidation = await call(plugin, 'Checking the document', () =>
        check(document, context(c)),
      );
      if ('errors' in result) {
        throw new ToolError(
          `The ${definition.title} document is not valid:\n${result.errors
            .slice(0, 30)
            .map((e) => `- ${e}`)
            .join('\n')}`,
        );
      }
      return { ...result.document, editor: { ...result.document.editor, id: editor } };
    },

    async tools() {
      const out: PluginTool[] = [];
      for (const plugin of await plugins()) {
        for (const tool of plugin.ai.tools) {
          if (tool.capability && !input.capabilities.includes(tool.capability)) continue;
          out.push(pluginTool(plugin, tool, input, defaultLocale));
        }
      }
      return out;
    },
  };
}

function pluginTool(
  plugin: LoadedPlugin,
  tool: AiToolDefinition,
  input: SiteAiInput,
  locale: () => Promise<string>,
): PluginTool {
  return {
    name: `${plugin.slug.replace(/-/g, '_')}_${tool.name}`,
    title: tool.title,
    description: `${tool.description} (plugin ${plugin.manifest.name})`,
    scope: tool.scope,
    inputSchema: tool.inputSchema,
    async run(args) {
      try {
        return await tool.run(args, {
          siteId: input.siteId,
          userId: input.userId,
          locale: await locale(),
          api: input.api,
        });
      } catch (error) {
        if ((error as { expose?: unknown } | null)?.expose === true) {
          throw new ToolError(messageOf(error));
        }
        throw error;
      }
    },
  };
}
