import type { FieldValues } from '@cleitext/shared';
import type { PluginBlockDefinition, PluginDefinition } from './context.js';

export * from './manifest.js';
export * from './hooks.js';
export * from './context.js';
export {
  fieldDefaults,
  fieldsValidator,
  labelText,
  type FieldDefinition,
  type FieldValues,
  type Label,
} from '@cleitext/shared';

/**
 * Declares a plugin (the default export of the server entry point).
 *
 * ```ts
 * export default definePlugin({
 *   setup(ctx) {
 *     ctx.hooks.on('entry.published', ({ entry }) => ctx.log.info(`Published ${entry.title}`));
 *   },
 * });
 * ```
 */
export function definePlugin(definition: PluginDefinition): PluginDefinition {
  return definition;
}

/** Declares a block, with typed attributes and loaded data. */
export function defineBlock<A extends object = FieldValues, D = undefined>(
  definition: PluginBlockDefinition<A, D>,
): PluginBlockDefinition<A, D> {
  return definition;
}
