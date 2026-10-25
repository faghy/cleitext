import type { FieldValues } from '@cleitext/shared';
import type { PluginBlockDefinition, PluginDefinition } from './context.js';

export * from './manifest.js';
export * from './hooks.js';
export * from './context.js';
/** PHP's serialized values, read (plugin API 1.48): WordPress meta in imports. */
export { phpMetaValue, phpUnserialize, type PhpValue } from './php.js';
/** Rich text of block documents (CXD), e.g. to translate or index it. */
export {
  htmlToInline,
  inlineToHtml,
  type CxdBlock,
  type CxdDocument,
  type CxdInline,
} from '@cleitext/blocks';
export {
  fieldDefaults,
  fieldsValidator,
  labelText,
  type FieldDefinition,
  type FieldValues,
  type Label,
  type MenuItemField,
} from '@cleitext/shared';
/** Custom fields (plugin API 1.47): types, conditions, groups and their rules. */
export {
  ensureRowIds,
  fieldVisible,
  isEmptyValue,
  matchesLocation,
  typesLocation,
  type CustomField,
  type FieldCondition,
  type FieldFormatContext,
  type FieldGroupInput,
  type FieldGroupView,
  type FieldObject,
  type FieldTransferRefs,
  type FieldTypeDefinition,
  type FieldValueKind,
  type FormattedEntry,
  type FormattedMedia,
  type FormattedTerm,
  type FormattedUser,
  type LinkValue,
  type LocationRule,
  type LocationRules,
  type LocationScreen,
} from '@cleitext/shared';
/** Options pages (plugin API 1.48) and rich text of `richtext` fields. */
export {
  fieldValueKind,
  mayMatchOptionsPage,
  richTextToPlain,
  sanitizeRichText,
  translatableField,
  type OptionsPageInput,
  type OptionsPageView,
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
export type { TransferDocumentInput, TransferMenuItem } from '@cleitext/blocks/transfer';
/** The admin's address and links to its screens (plugin API 1.16). */
export { ADMIN_PATH, adminUrl } from '@cleitext/shared';
