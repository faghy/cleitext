import type { CustomField, FieldValues } from '@cleitext/shared';
import { createContext, useSyncExternalStore, type ComponentType } from 'react';

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
