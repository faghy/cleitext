import type { FieldDefinition } from '@cleitext/shared';
import type { ThemeExtension } from '@cleitext/plugin-sdk';
import type { ThemeDefinition } from '@cleitext/theme-sdk';

/** A plugin's extension of a theme (`ctx.themes.extend`, plugin API 1.32). */
export interface PluginThemeExtension {
  plugin: string;
  extension: ThemeExtension;
}

/**
 * Setting names of a site's theme that belong to extensions of plugins not
 * active there: their stored values are kept but not given to the theme.
 */
const hidden = new WeakMap<ThemeDefinition, ReadonlySet<string>>();

export function hiddenSettings(theme: ThemeDefinition): ReadonlySet<string> {
  return hidden.get(theme) ?? new Set();
}

/**
 * The theme as a site sees it: the base theme plus the extensions of the
 * plugins active there (`active`), in order. Settings, sections and presets
 * are appended, zone items go to the zones field they name, areas are
 * merged. Names and ids the theme (or an earlier extension) already uses
 * are skipped with a warning. `inactive` are the extensions of the other
 * plugins, whose settings are hidden.
 */
export function extendTheme(
  base: ThemeDefinition,
  active: PluginThemeExtension[],
  inactive: PluginThemeExtension[],
  warn: (message: string) => void = () => {},
): ThemeDefinition {
  if (active.length === 0 && inactive.length === 0) return base;
  const settings: FieldDefinition[] = [...(base.settings ?? [])];
  const sections = [...(base.settingsSections ?? [])];
  const presets = [...(base.presets ?? [])];
  const areas = { ...(base.areas ?? {}) };
  const areaDefaults = { ...(base.areaDefaults ?? {}) };
  const fieldNames = new Set(settings.map((f) => f.name));
  const sectionIds = new Set(sections.map((s) => s.id));
  const presetIds = new Set(presets.map((p) => p.id));

  for (const { plugin, extension } of active) {
    const skip = (what: string) =>
      warn(`Plugin ${plugin}: ${what} already exists in theme ${base.slug}, ignored`);
    for (const field of extension.settings ?? []) {
      if (fieldNames.has(field.name)) skip(`setting "${field.name}"`);
      else {
        fieldNames.add(field.name);
        settings.push(field);
      }
    }
    for (const section of extension.settingsSections ?? []) {
      if (sectionIds.has(section.id)) skip(`section "${section.id}"`);
      else {
        sectionIds.add(section.id);
        sections.push(section);
      }
    }
    for (const preset of extension.presets ?? []) {
      if (presetIds.has(preset.id)) skip(`preset "${preset.id}"`);
      else {
        presetIds.add(preset.id);
        presets.push(preset);
      }
    }
    for (const [fieldName, items] of Object.entries(extension.zoneItems ?? {})) {
      const index = settings.findIndex((f) => f.name === fieldName && f.type === 'zones');
      const field = settings[index];
      if (!field || field.type !== 'zones') continue;
      const known = new Set(field.items.map((i) => i.name));
      const added = [];
      for (const item of items) {
        if (known.has(item.name)) skip(`element "${item.name}" of "${fieldName}"`);
        else {
          known.add(item.name);
          added.push(item);
        }
      }
      // A copy: the theme's own definition is shared by every site.
      settings[index] = { ...field, items: [...field.items, ...added] };
    }
    for (const [name, label] of Object.entries(extension.areas ?? {})) {
      if (name in areas) skip(`area "${name}"`);
      else {
        areas[name] = label;
        const initial = extension.areaDefaults?.[name];
        if (initial) areaDefaults[name] = initial;
      }
    }
  }

  const theme: ThemeDefinition = {
    ...base,
    settings,
    settingsSections: sections,
    presets,
    areas,
    areaDefaults,
  };
  const hide = new Set(
    inactive
      .flatMap(({ extension }) => extension.settings ?? [])
      .map((f) => f.name)
      .filter((name) => !fieldNames.has(name)),
  );
  if (hide.size > 0) hidden.set(theme, hide);
  return theme;
}
