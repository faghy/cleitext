/**
 * Child themes (core 0.79), like WordPress's: a theme whose `theme.json`
 * names a `parent` inherits everything from it and gives only what changes.
 * The core builds one theme definition from the two, under the child's
 * slug, so the rest of Cleitext sees an ordinary theme.
 */
import type { FieldDefinition } from '@cleitext/shared';
import type { ChildThemeDefinition, ChildThemeModule, ThemeDefinition } from '@cleitext/theme-sdk';

export interface ChildThemeMeta {
  slug: string;
  name: string;
  version: string;
  description?: string;
}

/** Items of `extra` added after `base`, those with a key already there replacing it. */
function byKey<T>(
  base: readonly T[] | undefined,
  extra: readonly T[] | undefined,
  key: (item: T) => string,
): T[] {
  const list = [...(base ?? [])];
  for (const item of extra ?? []) {
    const at = list.findIndex((x) => key(x) === key(item));
    if (at === -1) list.push(item);
    else list[at] = item;
  }
  return list;
}

/** The child's definition, from what its bundle exports (an object or a function of the parent). */
export function childDefinition(
  exported: ChildThemeModule | undefined | null,
  parent: ThemeDefinition,
): ChildThemeDefinition {
  if (!exported) return {};
  const child = typeof exported === 'function' ? exported(parent) : exported;
  if (!child || typeof child !== 'object') {
    throw new Error('The bundle must export defineChildTheme({ … }) as default');
  }
  return child;
}

/**
 * The theme a site sees for a child: the parent's definition with the
 * child's templates, settings and additions over it. CSS is not joined here:
 * the core prints the child's after the parent's page (see `childCss`).
 */
export function mergeChildTheme(
  parent: ThemeDefinition,
  child: ChildThemeDefinition,
  meta: ChildThemeMeta,
): ThemeDefinition {
  if (child.slug && child.slug !== meta.slug) {
    throw new Error('The bundle slug does not match theme.json');
  }
  const defaults = child.settingsDefaults ?? {};
  const settings = byKey<FieldDefinition>(parent.settings, child.settings, (f) => f.name).map(
    (field) =>
      field.name in defaults
        ? ({ ...field, default: defaults[field.name] } as FieldDefinition)
        : field,
  );
  const templates = { ...parent.templates } as ThemeDefinition['templates'];
  for (const [name, template] of Object.entries(child.templates ?? {})) {
    if (typeof template === 'function' || (template && typeof template === 'object')) {
      templates[name] = template;
    }
  }
  const parentEditor = parent.editorCss;
  const childEditor = child.editorCss;
  const editorCss: ThemeDefinition['editorCss'] =
    childEditor === undefined
      ? parentEditor
      : typeof parentEditor === 'function' || typeof childEditor === 'function'
        ? (values) =>
            [parentEditor, childEditor]
              .map((part) => (typeof part === 'function' ? part(values) : (part ?? '')))
              .filter(Boolean)
              .join('\n')
        : [parentEditor ?? '', childEditor].filter(Boolean).join('\n');
  const entryFields =
    child.entryFields && parent.entryFields
      ? {
          ...(parent.entryFields.types || child.entryFields.types
            ? {
                types: [
                  ...new Set([
                    ...(parent.entryFields.types ?? []),
                    ...(child.entryFields.types ?? []),
                  ]),
                ],
              }
            : {}),
          fields: byKey(parent.entryFields.fields, child.entryFields.fields, (f) => f.name),
        }
      : (child.entryFields ?? parent.entryFields);
  const theme: ThemeDefinition = {
    ...parent,
    slug: meta.slug,
    name: meta.name,
    version: meta.version,
    ...(meta.description !== undefined
      ? { description: meta.description }
      : parent.description !== undefined
        ? { description: parent.description }
        : {}),
    parent: parent.slug,
    templates,
    Layout: child.Layout ?? parent.Layout,
    settings,
    settingsSections: byKey(parent.settingsSections, child.settingsSections, (s) => s.id),
    presets: byKey(parent.presets, child.presets, (p) => p.id),
    menuLocations: { ...parent.menuLocations, ...(child.menuLocations ?? {}) },
    menuItemFields: byKey(parent.menuItemFields, child.menuItemFields, (m) => m.field.name),
    areas: { ...(parent.areas ?? {}), ...(child.areas ?? {}) },
    areaDefaults: { ...(parent.areaDefaults ?? {}), ...(child.areaDefaults ?? {}) },
    pageTemplates: byKey(parent.pageTemplates, child.pageTemplates, (p) => p.name),
    optionsPages: byKey(parent.optionsPages, child.optionsPages, (p) => p.slug),
  };
  if (editorCss !== undefined) theme.editorCss = editorCss;
  if (entryFields) theme.entryFields = entryFields;
  for (const key of ['relatedEntries', 'listTerms', 'adjacentEntries', 'comments'] as const) {
    if (child[key] !== undefined) (theme as unknown as Record<string, unknown>)[key] = child[key];
  }
  if (child.importSettings) theme.importSettings = child.importSettings.bind(child);
  if (child.aiGuide) {
    theme.aiGuide = [parent.aiGuide, child.aiGuide].filter(Boolean).join('\n\n');
  }
  // Empty lists the parent did not have stay missing, as in a theme of its own.
  for (const key of [
    'settingsSections',
    'presets',
    'menuItemFields',
    'pageTemplates',
    'optionsPages',
  ] as const) {
    if ((theme[key] as unknown[]).length === 0 && parent[key] === undefined) delete theme[key];
  }
  if (settings.length === 0 && parent.settings === undefined) delete theme.settings;
  return theme;
}
