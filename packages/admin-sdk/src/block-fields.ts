import {
  mayMatchBlock,
  type FieldDefinition,
  type FieldGroupView,
  type FieldScreenView,
} from '@cleitext/shared';
import { useEffect, useState } from 'react';
import { api } from './api.js';

/** The fields of a plugin block (plugin API 1.49): its groups' fields, in order. */
export interface BlockFields {
  fields: FieldDefinition[];
  groups: FieldGroupView[];
}

let screen: Promise<FieldGroupView[]> | null = null;

/** Every group of the `block` screen, asked once per page load (`refresh` asks again). */
function blockGroups(refresh = false): Promise<FieldGroupView[]> {
  if (refresh || !screen) {
    screen = api<FieldScreenView>('GET', '/field-screens/block').then(
      (view) => view.groups ?? [],
      (error: unknown) => {
        screen = null;
        throw error;
      },
    );
  }
  return screen;
}

/** The groups whose `block` rule names a block, and their fields (the first of a name wins). */
export function fieldsOfBlock(groups: readonly FieldGroupView[], name: string): BlockFields {
  const matching = groups.filter((group) => mayMatchBlock(group.location ?? [], name));
  const seen = new Set<string>();
  const fields: FieldDefinition[] = [];
  for (const group of matching) {
    for (const field of group.fields) {
      if (seen.has(field.name)) continue;
      seen.add(field.name);
      fields.push(field);
    }
  }
  return { fields, groups: matching };
}

/**
 * The fields of a plugin block (plugin API 1.49): those of the field groups
 * whose `block` rule names it (e.g. `myplugin/hero`). `refresh` reads the
 * groups again (after they changed).
 */
export async function blockFields(
  name: string,
  options: { refresh?: boolean } = {},
): Promise<BlockFields> {
  return fieldsOfBlock(await blockGroups(options.refresh), name);
}

/**
 * The fields of a plugin block for its editor (plugin API 1.49), e.g. in the
 * block's sidebar with `FieldsForm`; empty while loading or when the groups
 * cannot be read.
 */
export function useBlockFields(name: string): BlockFields & { loading: boolean } {
  const [state, setState] = useState<{ name: string; value: BlockFields } | null>(null);
  useEffect(() => {
    let live = true;
    blockFields(name).then(
      (value) => live && setState({ name, value }),
      () => live && setState({ name, value: { fields: [], groups: [] } }),
    );
    return () => {
      live = false;
    };
  }, [name]);
  if (state?.name !== name) return { fields: [], groups: [], loading: true };
  return { ...state.value, loading: false };
}
