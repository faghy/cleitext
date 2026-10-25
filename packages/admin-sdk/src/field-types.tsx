import type { CustomField, FieldDefinition, FieldValues } from '@cleitext/shared';
import { createContext, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';

/** What the editor component of a plugin's field type gets (plugin API 1.47). */
export interface FieldControlProps<V = unknown> {
  field: CustomField;
  value: V | undefined;
  onChange: (value: V | null) => void;
  /** The control's id: the field's label points to it. */
  id: string;
  locale: string;
  disabled: boolean;
  /** The message under the field, when its value is not valid. */
  error?: string;
  /** The values of the whole form (e.g. for a field that depends on another). */
  form: FieldValues;
  /**
   * Layout fields only (`layout: true`, plugin API 1.49): the form around
   * the field and the fields it groups, for tabs and accordions.
   */
  layout?: LayoutProps;
}

/** What a layout field gets from its form (plugin API 1.49). */
export interface LayoutProps {
  /** The fields of the form that are shown, in order (this one among them). */
  siblings: FieldDefinition[];
  /** Its position in `siblings`. */
  index: number;
  /** The values of the whole form. */
  values: FieldValues;
  /** The fields after it that it groups (see `groups`): the form does not draw them. */
  fields: FieldDefinition[];
  /** Draws fields as the form does (labels, errors, changes), e.g. those of the open tab. */
  render(fields: readonly FieldDefinition[]): ReactNode;
}

/**
 * The admin side of a plugin's field type (`defineAdminPlugin({ fieldTypes })`,
 * plugin API 1.47): the control drawn wherever a form has such a field
 * (entries, terms, users, settings, blocks, list rows). The label, help and
 * error message are drawn around it.
 */
export interface AdminFieldTypeDefinition {
  /** `<plugin>/<name>`, as registered on the server with `ctx.fields.registerType`. */
  type: string;
  component: ComponentType<FieldControlProps>;
  /**
   * A layout field (plugin API 1.49), such as a tab or an accordion: it holds
   * no value, the form draws no label, help or error around it, and passes
   * it `layout`.
   */
  layout?: boolean;
  /**
   * Layout fields: how many of the shown fields after it it groups (default
   * 0). The form leaves them to the field, which draws them with
   * `layout.render`.
   */
  groups?(field: CustomField, following: readonly FieldDefinition[]): number;
}

const types = new Map<string, AdminFieldTypeDefinition>();
const listeners = new Set<() => void>();
let version = 0;

/** Adds the editor of a field type (the admin does it for active plugins). */
export function registerAdminFieldType(definition: AdminFieldTypeDefinition): void {
  types.set(definition.type, definition);
  version++;
  for (const listener of listeners) listener();
}

/** The editor of a field type, or undefined, outside React (plugin API 1.49). */
export function adminFieldType(type: string): AdminFieldTypeDefinition | undefined {
  return types.get(type);
}

/** Re-renders when field types are added; the registry's version (plugin API 1.49). */
export function useAdminFieldTypes(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
}

/** The editor of a field type, or undefined; components re-render when types are added. */
export function useAdminFieldType(type: string): AdminFieldTypeDefinition | undefined {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
  return types.get(type);
}

/** Options of a form that its nested forms (list rows) share. */
export interface FormOptions {
  /** New list rows get a stable `_id` (entries, terms and users: plugin API 1.47). */
  rowIds: boolean;
  /** `left`: labels beside the controls. */
  labelPlacement: 'top' | 'left';
}

export const FormOptionsContext = createContext<FormOptions>({
  rowIds: false,
  labelPlacement: 'top',
});
